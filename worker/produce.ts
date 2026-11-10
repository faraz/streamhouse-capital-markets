/**
 * Producing the presenter's narrative events.
 *
 * The Kafka REST API has no Schema Registry integration: it accepts BINARY, JSON or
 * STRING and will not frame a payload for you. So this frames it: Confluent's wire format
 * is a zero magic byte, the schema id as four big-endian bytes, then the encoded payload.
 *
 * That is why the events topic carries a JSON Schema rather than Avro. JSON Schema's
 * payload is the JSON text itself, so framing it is a handful of lines. Framing Avro
 * would have meant implementing Avro binary encoding inside a Worker.
 */

export interface ProduceConfig {
  restEndpoint: string;
  clusterId: string;
  key: string;
  secret: string;
  schemaId: number;
}

export interface DemoEvent {
  acct: string;
  sym: string;
  qty: number;
  px: number;
  ts: string;
  kind: string;
}

/** Confluent's wire format, base64 encoded for the REST API's BINARY type. */
function frame(schemaId: number, payload: unknown): string {
  const body = new TextEncoder().encode(JSON.stringify(payload));
  const out = new Uint8Array(5 + body.length);
  out[0] = 0; // magic byte
  out[1] = (schemaId >>> 24) & 0xff;
  out[2] = (schemaId >>> 16) & 0xff;
  out[3] = (schemaId >>> 8) & 0xff;
  out[4] = schemaId & 0xff;
  out.set(body, 5);

  let s = '';
  for (const b of out) s += String.fromCharCode(b);
  return btoa(s);
}

/** Flink's TO_TIMESTAMP wants a space separator; an ISO-8601 'T' fails to cast. */
export function flinkTimestamp(d = new Date()): string {
  return d.toISOString().replace('T', ' ').replace('Z', '').slice(0, 23);
}

export async function produceEvent(cfg: ProduceConfig, event: DemoEvent): Promise<void> {
  const url = `${cfg.restEndpoint}/kafka/v3/clusters/${cfg.clusterId}/topics/raw_events/records`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${btoa(`${cfg.key}:${cfg.secret}`)}`,
    },
    body: JSON.stringify({
      key: { type: 'STRING', data: event.acct },
      value: { type: 'BINARY', data: frame(cfg.schemaId, event) },
    }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`produce failed: ${res.status} ${text.slice(0, 300)}`);

  // The v3 produce API answers 200 even when an individual record was refused, so the
  // per-record error code has to be checked rather than trusting the status.
  try {
    const body = JSON.parse(text);
    if (body?.error_code && body.error_code >= 400) {
      throw new Error(`produce refused: ${body.error_code} ${body.message ?? ''}`);
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('produce refused')) throw e;
  }
}

/** The price every presenter fill is struck at, so a reset can offset it exactly. */
export const FILL_PX = 5414.0;

/** A fill large enough to cross the escalation threshold from anywhere in the band. */
export function fillEvent(clientId: string, lots: number): DemoEvent {
  return { acct: clientId, sym: 'ESU6', qty: lots, px: FILL_PX, ts: flinkTimestamp(), kind: 'fill' };
}

/** Well formed, and perfectly wrong: one zero too many. */
export function fatFingerEvent(clientId: string): DemoEvent {
  return { acct: clientId, sym: 'ESU6', qty: 2_400_000, px: 5412.25, ts: flinkTimestamp(), kind: 'fat_finger' };
}
