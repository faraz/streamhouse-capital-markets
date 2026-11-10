/**
 * The server side of the screen. Holds every credential, fans the screen's state out
 * into Lightning Table queries, and returns it in one response.
 *
 * One route rather than several because the free tier allows 100,000 requests a day and
 * the screen polls while it is visible. One combined snapshot keeps that comfortable.
 *
 * CPU is capped at 10ms per request on the free plan, but time waiting on the network
 * does not count, so the queries run concurrently and almost nothing is computed here.
 */
import { num, rowsToObjects, runQuery, type QueryConfig } from '../src/data/query';
import { ask } from './agent';
import { fatFingerEvent, fillEvent, produceEvent, type ProduceConfig } from './produce';

export interface Env {
  CONFLUENT_SQL_ENDPOINT: string;
  CONFLUENT_GLOBAL_KEY: string;
  CONFLUENT_GLOBAL_SECRET: string;
  DEMO_ENVIRONMENT_ID: string;
  DEMO_CLUSTER_ID: string;
  DEMO_GATE?: string;
  RTCE_MCP_URL?: string;
  ANTHROPIC_API_KEY?: string;
  CONFLUENT_REST_ENDPOINT?: string;
  CONFLUENT_KAFKA_KEY?: string;
  CONFLUENT_KAFKA_SECRET?: string;
  RAW_EVENTS_SCHEMA_ID?: string;
  ASSETS: { fetch(req: Request): Promise<Response> };
}

/** Where the agent escalates. Kept identical to the simulator's threshold. */
const ESCALATE_PCT = 85;
const BOOK_ROWS = 200;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

function cfg(env: Env): QueryConfig {
  return {
    endpoint: env.CONFLUENT_SQL_ENDPOINT,
    catalog: env.DEMO_ENVIRONMENT_ID,
    database: env.DEMO_CLUSTER_ID,
    key: env.CONFLUENT_GLOBAL_KEY,
    secret: env.CONFLUENT_GLOBAL_SECRET,
  };
}

/** Timestamps come back as 'YYYY-MM-DD HH:MM:SS[.sss]', which Date cannot parse as-is. */
function tsToMs(v: string | undefined): number {
  if (!v) return 0;
  const ms = Date.parse(v.replace(' ', 'T') + (v.includes('Z') ? '' : 'Z'));
  return Number.isFinite(ms) ? ms : 0;
}

const esc = (s: string) => s.replace(/'/g, "''");

async function snapshot(env: Env, clientId: string): Promise<Response> {
  const c = cfg(env);
  const id = esc(clientId);

  // Concurrent: the waiting is network, which the CPU budget does not count.
  const [servedQ, bookQ, recentQ, dlqQ, srcQ, activeQ] = await Promise.all([
    runQuery(c, `SELECT client_id, exposure_usd, limit_usd, limit_util_pct, as_of FROM client_exposure WHERE client_id = '${id}' LIMIT 1`),
    runQuery(c, `SELECT client_id, exposure_usd, limit_usd, limit_util_pct, as_of FROM client_exposure ORDER BY limit_util_pct DESC LIMIT ${BOOK_ROWS}`),
    runQuery(c, `SELECT client_id, symbol, quantity, price, event_time, source FROM positions WHERE client_id = '${id}' ORDER BY event_time DESC LIMIT 5`),
    runQuery(c, `SELECT client_id, quantity, reject_reason, event_time FROM positions_dlq WHERE client_id = '${id}' ORDER BY event_time DESC LIMIT 1`).catch(() => ({ columns: [], rows: [] })),
    // Which feeds have actually produced anything. No GROUP BY on a Lightning Table, so
    // this reads the recent tail and collects the distinct sources from it.
    runQuery(c, `SELECT source FROM positions ORDER BY event_time DESC LIMIT 60`),
    // Whoever traded most recently. Sorting a Lightning Table on a stored timestamp is the
    // same operation as sorting the book on limit_util_pct.
    runQuery(c, `SELECT client_id, exposure_usd, limit_usd, limit_util_pct, as_of FROM client_exposure ORDER BY as_of DESC LIMIT 8`),
  ]);

  const servedRow = rowsToObjects(servedQ)[0];
  if (!servedRow) return json({ error: `no exposure row for client ${clientId}` }, 404);

  const asOfMs = tsToMs(servedRow['AS_OF']);
  const served = {
    exposureUsd: num(servedRow['EXPOSURE_USD']),
    limitUsd: num(servedRow['LIMIT_USD']),
    limitUtilPct: num(servedRow['LIMIT_UTIL_PCT']),
    asOfMs,
  };

  const book = rowsToObjects(bookQ).map((r) => ({
    clientId: r['CLIENT_ID'] ?? '',
    exposureUsd: num(r['EXPOSURE_USD']),
    limitUsd: num(r['LIMIT_USD']),
    limitUtilPct: num(r['LIMIT_UTIL_PCT']),
    asOfMs: tsToMs(r['AS_OF']),
  }));

  const active = rowsToObjects(activeQ).map((r) => ({
    clientId: r['CLIENT_ID'] ?? '',
    exposureUsd: num(r['EXPOSURE_USD']),
    limitUsd: num(r['LIMIT_USD']),
    limitUtilPct: num(r['LIMIT_UTIL_PCT']),
    asOfMs: tsToMs(r['AS_OF']),
  }));

  const recent = rowsToObjects(recentQ).map((r) => ({
    clientId: r['CLIENT_ID'] ?? '',
    symbol: r['SYMBOL'] ?? '',
    quantity: Math.round(num(r['QUANTITY'])),
    price: num(r['PRICE']),
    eventTimeMs: tsToMs(r['EVENT_TIME']),
    source: r['SOURCE'] ?? '',
  }));

  const dlqRow = rowsToObjects(dlqQ)[0];
  const rejected = dlqRow
    ? {
        raw: `MSG|ACCT=${dlqRow['CLIENT_ID']}|QTY=${Math.round(num(dlqRow['QUANTITY']))}`,
        reason: dlqRow['REJECT_REASON'] ?? 'rejected by the Flink guard',
      }
    : null;

  const activeSources = [...new Set(rowsToObjects(srcQ).map((r) => r['SOURCE'] ?? ''))].filter(Boolean);

  // Stands in until a Flink streaming agent writes these to a topic of its own. Identical
  // on screen; the substitution is recorded rather than hidden.
  const escalations = book
    .filter((b) => b.limitUtilPct >= ESCALATE_PCT)
    .slice(0, 5)
    .map((b) => ({
      atMs: b.asOfMs,
      who: 'Escalated to the risk officer',
      what: `Client ${b.clientId} at ${b.limitUtilPct.toFixed(1)}% of limit.`,
      tone: 'warn' as const,
    }));

  const newest = recent[0];
  const normalized = newest
    ? {
        clientId: newest.clientId,
        symbol: newest.symbol,
        quantity: newest.quantity,
        price: newest.price,
        notionalUsd: newest.quantity * newest.price,
        eventTime: newest.eventTimeMs,
        source: newest.source,
        ageMs: 0,
      }
    : null;

  return json({
    served,
    // In the streamhouse there is no gap between what is served and what is true. That
    // absence is the point, so this is not padded to invent one.
    trueExposureUsd: served.exposureUsd,
    book,
    active,
    recent,
    rejected,
    escalations,
    activeSources,
    normalized,
    servedAgeMs: Math.max(0, Date.now() - asOfMs),
    openTableAgeMs: 0, // no open table until Tableflow is enabled
    pendingFill: null, // the screen tracks its own pending fills
  });
}

function produceConfig(env: Env): ProduceConfig | null {
  const { CONFLUENT_REST_ENDPOINT, CONFLUENT_KAFKA_KEY, CONFLUENT_KAFKA_SECRET, RAW_EVENTS_SCHEMA_ID } = env;
  if (!CONFLUENT_REST_ENDPOINT || !CONFLUENT_KAFKA_KEY || !CONFLUENT_KAFKA_SECRET || !RAW_EVENTS_SCHEMA_ID) {
    return null;
  }
  return {
    restEndpoint: CONFLUENT_REST_ENDPOINT,
    clusterId: env.DEMO_CLUSTER_ID,
    key: CONFLUENT_KAFKA_KEY,
    secret: CONFLUENT_KAFKA_SECRET,
    schemaId: Number(RAW_EVENTS_SCHEMA_ID),
  };
}

/**
 * The agent's steps, streamed as they happen, so the screen renders it working rather
 * than a finished transcript. One event per step, newline-delimited JSON over SSE.
 */
function streamSteps(question: string, env: Env): Response {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();

  (async () => {
    try {
      for await (const step of ask(question, {
        anthropicKey: env.ANTHROPIC_API_KEY!,
        mcpUrl: env.RTCE_MCP_URL!,
        confluentKey: env.CONFLUENT_GLOBAL_KEY,
        confluentSecret: env.CONFLUENT_GLOBAL_SECRET,
      })) {
        await writer.write(enc.encode(`data: ${JSON.stringify(step)}\n\n`));
      }
    } catch (e) {
      const body = e instanceof Error ? e.message : 'the agent failed';
      await writer.write(enc.encode(`data: ${JSON.stringify({ kind: 'error', tag: 'Failed', body })}\n\n`));
    } finally {
      await writer.write(enc.encode('data: [DONE]\n\n'));
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    },
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);

    if (env.DEMO_GATE && req.headers.get('x-demo-gate') !== env.DEMO_GATE) {
      return json({ error: 'forbidden' }, 403);
    }

    try {
      if (url.pathname === '/api/snapshot') {
        return await snapshot(env, url.searchParams.get('client') ?? '4417');
      }
      if (url.pathname === '/api/ask' && req.method === 'POST') {
        if (!env.ANTHROPIC_API_KEY || !env.RTCE_MCP_URL) {
          return json({ error: 'the agent needs ANTHROPIC_API_KEY and RTCE_MCP_URL' }, 503);
        }
        const { question } = (await req.json()) as { question?: string };
        if (!question?.trim()) return json({ error: 'no question' }, 400);
        return streamSteps(question.trim(), env);
      }
      if ((url.pathname === '/api/fill' || url.pathname === '/api/fat-finger') && req.method === 'POST') {
        const cfg = produceConfig(env);
        if (!cfg) return json({ error: 'producing needs the cluster REST endpoint, a Kafka key and the events schema id' }, 503);
        const body = (await req.json().catch(() => ({}))) as { clientId?: string; lots?: number };
        const clientId = body.clientId ?? '4417';
        const event =
          url.pathname === '/api/fill'
            ? fillEvent(clientId, body.lots ?? 1200)
            : fatFingerEvent(clientId);
        await produceEvent(cfg, event);
        return json({ produced: event });
      }
      return json({ error: 'not found' }, 404);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'query failed' }, 502);
    }
  },
};
