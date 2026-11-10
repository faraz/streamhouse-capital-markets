/**
 * Talking to the Lightning Tables query endpoint. Server-side only: no CORS is
 * documented, and the Global API key has cluster-wide read scope, so it must never
 * reach a browser.
 */

export interface QueryConfig {
  endpoint: string;   // https://sql.<region>.<cloud>.confluent.cloud/query/v1
  catalog: string;    // the environment id
  database: string;   // the cluster id
  key: string;        // a GLOBAL api key: cloud keys manage, global keys query
  secret: string;
}

export interface QueryResult {
  columns: string[];
  rows: string[][];
}

const MAX_ROWS = 200; // the OpenAPI caps max_result_rows at 200, and MCP enforces it too

/**
 * Column names come back UPPERCASE regardless of how the Avro schema declares them, and
 * every value arrives as a string, numbers in scientific notation ("3.6430064E8").
 * Both were verified live; assuming otherwise fails silently rather than loudly.
 */
export function rowsToObjects(result: QueryResult): Array<Record<string, string>> {
  return result.rows.map((row) => {
    const out: Record<string, string> = {};
    result.columns.forEach((col, i) => {
      out[col.toUpperCase()] = row[i] ?? '';
    });
    return out;
  });
}

export function num(v: string | undefined): number {
  if (v === undefined || v === '') return 0;
  const n = Number.parseFloat(v); // handles "3.6430064E8"
  return Number.isFinite(n) ? n : 0;
}

export class QueryError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = 'QueryError';
  }
}

/**
 * A query returns 200 with its rows inline only when it finishes under 10 seconds and
 * 4 MiB. Otherwise it returns 202 and the rows have to be polled for and then fetched
 * from a presigned URL, and the docs say you cannot predict which you will get. So both
 * branches have to exist even though every query here is a small top-N.
 *
 * The presigned result URL must be fetched WITHOUT an Authorization header: cloud
 * storage rejects the request if one is present.
 */
export async function runQuery(cfg: QueryConfig, sql: string): Promise<QueryResult> {
  const auth = `Basic ${btoa(`${cfg.key}:${cfg.secret}`)}`;
  const res = await fetch(cfg.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({
      catalog_name: cfg.catalog,
      database_name: cfg.database,
      query: sql,
      max_result_rows: MAX_ROWS,
    }),
  });

  const body = (await res.json()) as any;

  if (res.status === 200) return shape(body);

  if (res.status === 202) {
    const statusUrl: string | undefined = body?.status_url ?? body?.metadata?.status_url;
    if (!statusUrl) throw new QueryError('deferred query returned no status url', 202);
    return await awaitDeferred(auth, statusUrl);
  }

  const err = body?.errors?.[0];
  throw new QueryError(
    err?.detail ?? err?.title ?? `query failed with ${res.status}`,
    res.status,
    err?.code,
  );
}

async function awaitDeferred(auth: string, statusUrl: string): Promise<QueryResult> {
  for (let i = 0; i < 20; i++) {
    const s = await fetch(statusUrl, { headers: { Authorization: auth } });
    const j = (await s.json()) as any;
    const phase: string = j?.status?.phase ?? j?.phase ?? 'UNKNOWN';
    if (phase === 'SUCCEEDED') {
      const url: string | undefined = j?.result_urls?.[0] ?? j?.status?.result_urls?.[0];
      if (!url) throw new QueryError('succeeded with no result url', 200);
      // No Authorization here: object storage refuses the request if one is sent.
      const r = await fetch(url);
      return shape(await r.json());
    }
    if (phase === 'FAILED') throw new QueryError(j?.status?.detail ?? 'deferred query failed', 500);
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new QueryError('deferred query did not finish in time', 504);
}

function shape(body: any): QueryResult {
  const columns: string[] = (body?.result?.schema?.columns ?? []).map((c: any) => String(c.name));
  const rows: string[][] = (body?.result?.data ?? []).map((r: any) =>
    (Array.isArray(r) ? r : [r]).map((v: any) => (v === null ? '' : String(v))),
  );
  return { columns, rows };
}
