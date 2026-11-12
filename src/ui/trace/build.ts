import type { ClientExposure, Position, RawEvent } from '../../data/types';
import { SOURCES } from '../../data/sources';
import { BY_SOURCE, GUARD, MATERIALIZE, type Statement } from './specs';

export type Value = string | number;

export interface TraceModel {
  id: string;
  kind: 'fill' | 'fat-finger' | 'record';
  statement: Statement;
  /** What the audience calls this record: "fill", "custodial file" and so on. */
  label: string;
  /** The record as it sits in the raw topic. Null marks a field the statement does not keep. */
  raw: Record<string, Value | null>;
  /** True when these are the exact bytes written; false when rebuilt from the record. */
  exact: boolean;
  /** What the statement writes, when that can be known without waiting. */
  out: Record<string, Value> | null;
  /** The materialized row as it was when the trace began, to show what moved. */
  before: ClientExposure | null;
  /** True when no rejection was showing as the order was sent, so the next one seen is its own. */
  rejectClear?: boolean;
  clientId: string;
  /** When the record entered Kafka, ms since the epoch. */
  sentAt: number;
}

/** Flink's own timestamp text, UTC. */
export const flinkTime = (ms: number) => new Date(ms).toISOString().replace('T', ' ').replace('Z', '').slice(0, 23);
const fromFlink = (ts: string) => Date.parse(`${ts.replace(' ', 'T')}Z`);

/** A constant the statement itself writes, read out of its SQL. */
function constant(st: Statement, pattern: RegExp): Value | undefined {
  const m = st.sql.match(pattern);
  return m?.[1];
}

export function fromEvent(ev: RawEvent, before: ClientExposure): TraceModel {
  const isFill = ev.kind === 'fill';
  const statement = isFill ? MATERIALIZE : GUARD;
  const raw: Record<string, Value> = { ...ev };
  const out: Record<string, Value> | null = isFill
    ? null
    : {
        client_id: ev.acct,
        symbol: ev.sym,
        quantity: ev.qty,
        price: ev.px,
        event_time: ev.ts,
        source: ev.kind,
        reject_reason: constant(GUARD, /'([^']+)' AS reject_reason/) ?? 'rejected by the Flink guard',
      };
  return {
    id: `${ev.kind}-${ev.ts}`,
    kind: isFill ? 'fill' : 'fat-finger',
    label: isFill ? 'fill' : 'fat finger',
    statement,
    raw,
    exact: true,
    out,
    before,
    clientId: ev.acct,
    sentAt: fromFlink(ev.ts),
  };
}

/**
 * The raw record a governed one came from, in its topic's own field names and types. The
 * raw topics are not served, so this is the inverse of the statement applied to the values
 * the record carries: the shape is the schema's, the values are the record's.
 */
function rawFor(source: string, p: Position): Record<string, Value | null> {
  const ts = flinkTime(p.eventTime);
  // What the record carries, which is not always quantity times price: a clearing statement
  // is a total with neither.
  const notional = p.notionalUsd ?? p.quantity * p.price;
  switch (source) {
    case 'trade':
      return { acct: Number(p.clientId), sym: p.symbol, qty: p.quantity, px: p.price };
    case 'mq_intraday':
      return { acct: p.clientId, sym: p.symbol, qty: p.quantity, px: p.price, ts };
    case 'venue':
      return { acct: p.clientId, sym: p.symbol, q: p.quantity, p: p.price };
    case 'desk_sheet':
      return { account: p.clientId, symbol: p.symbol, quantity: String(p.quantity), price: String(p.price) };
    case 'custodial':
      return { acct_no: p.clientId, instrument: p.symbol, units: p.quantity, value_cents: Math.round(notional * 100) };
    case 'clearing':
      // The statement date is read by nothing downstream, so the governed record cannot say
      // what it was. Shown as dropped rather than guessed.
      return { acct: p.clientId, total_due_cents: Math.round(notional * 100), statement_date: null };
    case 'book_of_record':
      return {
        client: p.clientId, sym: p.symbol, qty: Math.abs(p.quantity), px: p.price,
        change_type: p.quantity < 0 ? 'DELETE' : 'INSERT', changed_at: ts,
      };
    default:
      return { acct: p.clientId, sym: p.symbol, qty: p.quantity, px: p.price, ts, kind: source };
  }
}

const LABELS: Record<string, string> = {
  ...Object.fromEntries(SOURCES.map((x) => [x.id, x.name.toLowerCase()])),
  book_of_record: 'book of record',
  trade: 'trade',
  fill: 'fill',
};

export function fromPosition(p: Position, before: ClientExposure | null): TraceModel | null {
  const statement = BY_SOURCE[p.source];
  if (!statement) return null;
  const lag = constant(statement, /CAST\((\d+) AS BIGINT\) AS ingest_lag_ms/);
  return {
    id: `record-${p.source}-${p.clientId}-${p.eventTime}-${p.quantity}`,
    kind: 'record',
    label: LABELS[p.source] ?? p.source.replace(/_/g, ' '),
    statement,
    raw: rawFor(p.source, p),
    exact: false,
    out: {
      client_id: p.clientId,
      symbol: p.symbol,
      quantity: p.quantity,
      price: p.price,
      notional_usd: Math.round((p.notionalUsd ?? p.quantity * p.price) * 100) / 100,
      event_time: flinkTime(p.eventTime),
      source: p.source,
      ingest_lag_ms: p.ingestLagMs ?? (lag !== undefined ? Number(lag) : 0),
    },
    before,
    clientId: p.clientId,
    sentAt: p.eventTime,
  };
}
