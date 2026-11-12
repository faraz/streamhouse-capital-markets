import mqIntraday from '../../../flink/10-normalize-mq-intraday.sql?raw';
import venue from '../../../flink/12-normalize-venue.sql?raw';
import deskSheet from '../../../flink/13-normalize-desk-sheet.sql?raw';
import custodial from '../../../flink/14-normalize-custodial.sql?raw';
import clearing from '../../../flink/15-normalize-clearing.sql?raw';
import bookOfRecord from '../../../flink/16-normalize-book-of-record.sql?raw';
import events from '../../../flink/17-normalize-events.sql?raw';
import guardEvents from '../../../flink/18-guard-events.sql?raw';
import trades from '../../../flink/19-normalize-trades.sql?raw';
import exposure from '../../../flink/20-materialize-client-exposure.sql?raw';

/**
 * What each Flink statement does to a record, wired to its own SQL. The SQL shown on screen
 * is the statement file itself, comments removed; a wire names the exact text of the line
 * that does the work, so if a statement changes and the text no longer matches, that wire
 * simply is not drawn rather than drawing something the statement does not do.
 */

export type Op = 'rename' | 'cast' | 'derive' | 'const' | 'time' | 'sign' | 'aggregate' | 'join';

export interface Wire {
  /** Raw fields this line reads. Empty for a constant or an aggregate over the stream. */
  from: string[];
  /** The output column it writes. Null when the line feeds a later step, not a column. */
  to: string | null;
  /** Text that appears verbatim on the SQL line doing the work. */
  match: string;
  op: Op;
}

export interface Field {
  key: string;
  type: string;
}

export interface Statement {
  file: string;
  /** What it runs as: a Flink statement, by the label its name carries, or a materialized table. */
  run: { statement: string } | { materialized: string };
  sql: string;
  /** Lines of the statement to show; all of them unless this is an excerpt. */
  excerpt?: string[];
  source: { topic: string; schema: string; format: 'Avro' | 'JSON Schema'; fields: Field[] };
  target: { topic: string; kind: 'append' | 'materialized'; fields: Field[] };
  wires: Wire[];
  /** The WHERE clause that decides whether a record gets through. */
  guard?: string;
}

const POSITIONS: Field[] = [
  { key: 'client_id', type: 'STRING' },
  { key: 'symbol', type: 'STRING' },
  { key: 'quantity', type: 'INT' },
  { key: 'price', type: 'DOUBLE' },
  { key: 'notional_usd', type: 'DOUBLE' },
  { key: 'event_time', type: 'TIMESTAMP(3)' },
  { key: 'source', type: 'STRING' },
  { key: 'ingest_lag_ms', type: 'BIGINT' },
];

const DLQ: Field[] = [
  { key: 'client_id', type: 'STRING' },
  { key: 'symbol', type: 'STRING' },
  { key: 'quantity', type: 'INT' },
  { key: 'price', type: 'DOUBLE' },
  { key: 'event_time', type: 'TIMESTAMP(3)' },
  { key: 'source', type: 'STRING' },
  { key: 'reject_reason', type: 'STRING' },
];

const EXPOSURE: Field[] = [
  { key: 'client_id', type: 'STRING' },
  { key: 'exposure_usd', type: 'DOUBLE' },
  { key: 'limit_usd', type: 'DOUBLE' },
  { key: 'limit_util_pct', type: 'DOUBLE' },
  { key: 'as_of', type: 'TIMESTAMP(3)' },
];

const EVENT_FIELDS: Field[] = [
  { key: 'acct', type: 'string' },
  { key: 'sym', type: 'string' },
  { key: 'qty', type: 'integer' },
  { key: 'px', type: 'number' },
  { key: 'ts', type: 'string' },
  { key: 'kind', type: 'string' },
];

const lag = (match: string): Wire => ({ from: [], to: 'ingest_lag_ms', match, op: 'const' });
const src = (match: string): Wire => ({ from: [], to: 'source', match, op: 'const' });
const rowtime: Wire = { from: [], to: 'event_time', match: 'CAST($rowtime AS TIMESTAMP(3)) AS event_time', op: 'time' };

/** The six feeds and the presenter's events, each by the `source` it stamps on positions. */
export const BY_SOURCE: Record<string, Statement> = {
  trade: {
    file: '19-normalize-trades.sql',
    run: { statement: 'n-trd' },
    sql: trades,
    source: { topic: 'raw_trades', schema: 'raw.trades.avsc', format: 'Avro', fields: [
      { key: 'acct', type: 'int' }, { key: 'sym', type: 'string' }, { key: 'qty', type: 'int' }, { key: 'px', type: 'double' },
    ] },
    target: { topic: 'positions', kind: 'append', fields: POSITIONS },
    wires: [
      { from: ['acct'], to: 'client_id', match: 'CAST(acct AS STRING) AS client_id', op: 'cast' },
      { from: ['sym'], to: 'symbol', match: 'sym AS symbol', op: 'rename' },
      { from: ['qty'], to: 'quantity', match: 'qty AS quantity', op: 'rename' },
      { from: ['px'], to: 'price', match: 'px AS price', op: 'rename' },
      { from: ['qty', 'px'], to: 'notional_usd', match: 'CAST(qty AS DOUBLE) * px AS notional_usd', op: 'derive' },
      rowtime,
      src("'trade' AS source"),
      lag('CAST(0 AS BIGINT) AS ingest_lag_ms'),
    ],
    guard: 'WHERE ABS(qty) <= 50000',
  },
  mq_intraday: {
    file: '10-normalize-mq-intraday.sql',
    run: { statement: 'n-mq' },
    sql: mqIntraday,
    source: { topic: 'raw_mq_intraday', schema: 'raw.mq_intraday.avsc', format: 'Avro', fields: [
      { key: 'acct', type: 'string' }, { key: 'sym', type: 'string' }, { key: 'qty', type: 'int' }, { key: 'px', type: 'double' }, { key: 'ts', type: 'string' },
    ] },
    target: { topic: 'positions', kind: 'append', fields: POSITIONS },
    wires: [
      { from: ['acct'], to: 'client_id', match: 'acct AS client_id', op: 'rename' },
      { from: ['sym'], to: 'symbol', match: 'sym AS symbol', op: 'rename' },
      { from: ['qty'], to: 'quantity', match: 'qty AS quantity', op: 'rename' },
      { from: ['px'], to: 'price', match: 'px AS price', op: 'rename' },
      { from: ['qty', 'px'], to: 'notional_usd', match: 'CAST(qty AS DOUBLE) * px AS notional_usd', op: 'derive' },
      { from: ['ts'], to: 'event_time', match: 'TO_TIMESTAMP(ts) AS event_time', op: 'cast' },
      src("'mq_intraday' AS source"),
      lag('CAST(0 AS BIGINT) AS ingest_lag_ms'),
    ],
    guard: 'WHERE ABS(qty) <= 50000',
  },
  venue: {
    file: '12-normalize-venue.sql',
    run: { statement: 'n-ven' },
    sql: venue,
    source: { topic: 'raw_venue', schema: 'raw.venue.avsc', format: 'Avro', fields: [
      { key: 'acct', type: 'string' }, { key: 'sym', type: 'string' }, { key: 'q', type: 'int' }, { key: 'p', type: 'double' },
    ] },
    target: { topic: 'positions', kind: 'append', fields: POSITIONS },
    wires: [
      { from: ['acct'], to: 'client_id', match: 'acct AS client_id', op: 'rename' },
      { from: ['sym'], to: 'symbol', match: 'sym AS symbol', op: 'rename' },
      { from: ['q'], to: 'quantity', match: 'q AS quantity', op: 'rename' },
      { from: ['p'], to: 'price', match: 'p AS price', op: 'rename' },
      { from: ['q', 'p'], to: 'notional_usd', match: 'CAST(q AS DOUBLE) * p AS notional_usd', op: 'derive' },
      rowtime,
      src("'venue' AS source"),
      lag('CAST(7560000 AS BIGINT) AS ingest_lag_ms'),
    ],
    guard: 'WHERE ABS(q) <= 50000',
  },
  desk_sheet: {
    file: '13-normalize-desk-sheet.sql',
    run: { statement: 'n-dsk' },
    sql: deskSheet,
    source: { topic: 'raw_desk_sheet', schema: 'raw.desk_sheet.avsc', format: 'Avro', fields: [
      { key: 'account', type: 'string' }, { key: 'symbol', type: 'string' }, { key: 'quantity', type: 'string' }, { key: 'price', type: 'string' },
    ] },
    target: { topic: 'positions', kind: 'append', fields: POSITIONS },
    wires: [
      { from: ['account'], to: 'client_id', match: 'account AS client_id', op: 'rename' },
      { from: ['symbol'], to: 'symbol', match: '  symbol,', op: 'rename' },
      { from: ['quantity'], to: 'quantity', match: 'CAST(quantity AS INT) AS quantity', op: 'cast' },
      { from: ['price'], to: 'price', match: 'CAST(price AS DOUBLE) AS price', op: 'cast' },
      { from: ['quantity', 'price'], to: 'notional_usd', match: 'AS notional_usd', op: 'derive' },
      rowtime,
      src("'desk_sheet' AS source"),
      lag('CAST(11400000 AS BIGINT) AS ingest_lag_ms'),
    ],
    guard: 'WHERE ABS(CAST(quantity AS INT)) <= 50000',
  },
  custodial: {
    file: '14-normalize-custodial.sql',
    run: { statement: 'n-cus' },
    sql: custodial,
    source: { topic: 'raw_custodial', schema: 'raw.custodial.avsc', format: 'Avro', fields: [
      { key: 'acct_no', type: 'string' }, { key: 'instrument', type: 'string' }, { key: 'units', type: 'int' }, { key: 'value_cents', type: 'long' },
    ] },
    target: { topic: 'positions', kind: 'append', fields: POSITIONS },
    wires: [
      { from: ['acct_no'], to: 'client_id', match: 'acct_no AS client_id', op: 'rename' },
      { from: ['instrument'], to: 'symbol', match: 'instrument AS symbol', op: 'rename' },
      { from: ['units'], to: 'quantity', match: 'units AS quantity', op: 'rename' },
      { from: ['value_cents', 'units'], to: 'price', match: 'AS price', op: 'derive' },
      { from: ['value_cents'], to: 'notional_usd', match: 'CAST(value_cents AS DOUBLE) / 100.0 AS notional_usd', op: 'derive' },
      rowtime,
      src("'custodial' AS source"),
      lag('CAST(29160000 AS BIGINT) AS ingest_lag_ms'),
    ],
    guard: 'WHERE ABS(units) <= 50000',
  },
  clearing: {
    file: '15-normalize-clearing.sql',
    run: { statement: 'n-clr' },
    sql: clearing,
    source: { topic: 'raw_clearing', schema: 'raw.clearing.avsc', format: 'Avro', fields: [
      { key: 'acct', type: 'string' }, { key: 'total_due_cents', type: 'long' }, { key: 'statement_date', type: 'string' },
    ] },
    target: { topic: 'positions', kind: 'append', fields: POSITIONS },
    wires: [
      { from: ['acct'], to: 'client_id', match: 'acct AS client_id', op: 'rename' },
      { from: [], to: 'symbol', match: "'CLEARING' AS symbol", op: 'const' },
      { from: [], to: 'quantity', match: '0 AS quantity', op: 'const' },
      { from: [], to: 'price', match: '0.0 AS price', op: 'const' },
      { from: ['total_due_cents'], to: 'notional_usd', match: 'CAST(total_due_cents AS DOUBLE) / 100.0 AS notional_usd', op: 'derive' },
      rowtime,
      src("'clearing' AS source"),
      lag('CAST(93600000 AS BIGINT) AS ingest_lag_ms'),
    ],
  },
  book_of_record: {
    file: '16-normalize-book-of-record.sql',
    run: { statement: 'n-bor' },
    sql: bookOfRecord,
    source: { topic: 'raw_book_of_record', schema: 'raw.book_of_record.avsc', format: 'Avro', fields: [
      { key: 'client', type: 'string' }, { key: 'sym', type: 'string' }, { key: 'qty', type: 'int' }, { key: 'px', type: 'double' },
      { key: 'change_type', type: 'string' }, { key: 'changed_at', type: 'string' },
    ] },
    target: { topic: 'positions', kind: 'append', fields: POSITIONS },
    wires: [
      { from: ['client'], to: 'client_id', match: 'client AS client_id', op: 'rename' },
      { from: ['sym'], to: 'symbol', match: 'sym AS symbol', op: 'rename' },
      { from: ['qty', 'change_type'], to: 'quantity', match: "THEN -qty ELSE qty END AS quantity", op: 'sign' },
      { from: ['px'], to: 'price', match: 'px AS price', op: 'rename' },
      { from: ['change_type', 'qty', 'px'], to: 'notional_usd', match: 'AS notional_usd', op: 'sign' },
      { from: ['changed_at'], to: 'event_time', match: 'TO_TIMESTAMP(changed_at) AS event_time', op: 'cast' },
      src("'book_of_record' AS source"),
      lag('CAST(3000 AS BIGINT) AS ingest_lag_ms'),
    ],
    guard: 'WHERE ABS(qty) <= 50000',
  },
};

/** The presenter's events reach positions through their own statement. */
export const EVENTS: Statement = {
  file: '17-normalize-events.sql',
  run: { statement: 'n-evt' },
  sql: events,
  source: { topic: 'raw_events', schema: 'raw_events JSON Schema', format: 'JSON Schema', fields: EVENT_FIELDS },
  target: { topic: 'positions', kind: 'append', fields: POSITIONS },
  wires: [
    { from: ['acct'], to: 'client_id', match: 'acct AS client_id', op: 'rename' },
    { from: ['sym'], to: 'symbol', match: 'sym AS symbol', op: 'rename' },
    { from: ['qty'], to: 'quantity', match: 'CAST(qty AS INT) AS quantity', op: 'cast' },
    { from: ['px'], to: 'price', match: 'px AS price', op: 'rename' },
    { from: ['qty', 'px'], to: 'notional_usd', match: 'CAST(qty AS DOUBLE) * px AS notional_usd', op: 'derive' },
    { from: ['ts'], to: 'event_time', match: 'TO_TIMESTAMP(ts) AS event_time', op: 'cast' },
    { from: ['kind'], to: 'source', match: 'kind AS source', op: 'rename' },
    lag('CAST(0 AS BIGINT) AS ingest_lag_ms'),
  ],
  guard: 'WHERE ABS(CAST(qty AS INT)) <= 50000',
};
for (const s of ['fill', 'reset', 'verify', 'setup']) BY_SOURCE[s] = EVENTS;

/** A fat finger: the guard's own statement, which is the only one that takes it. */
export const GUARD: Statement = {
  file: '18-guard-events.sql',
  run: { statement: 'g-evt' },
  sql: guardEvents,
  source: EVENTS.source,
  target: { topic: 'positions_dlq', kind: 'append', fields: DLQ },
  wires: [
    { from: ['acct'], to: 'client_id', match: 'acct AS client_id', op: 'rename' },
    { from: ['sym'], to: 'symbol', match: 'sym AS symbol', op: 'rename' },
    { from: ['qty'], to: 'quantity', match: 'CAST(qty AS INT) AS quantity', op: 'cast' },
    { from: ['px'], to: 'price', match: 'px AS price', op: 'rename' },
    { from: ['ts'], to: 'event_time', match: 'TO_TIMESTAMP(ts) AS event_time', op: 'cast' },
    { from: ['kind'], to: 'source', match: 'kind AS source', op: 'rename' },
    { from: [], to: 'reject_reason', match: 'AS reject_reason', op: 'const' },
  ],
  guard: 'WHERE ABS(CAST(qty AS INT)) > 50000',
};

/**
 * A fill skips positions and goes straight into the materialized table, in one commit:
 * client_exposure reads raw_events itself and sums it in. Shown as an excerpt of that
 * statement, the branch that reads the event and the aggregate that folds it in.
 */
export const MATERIALIZE: Statement = {
  file: '20-materialize-client-exposure.sql',
  run: { materialized: 'client_exposure' },
  sql: exposure,
  excerpt: [
    'CREATE MATERIALIZED TABLE client_exposure (',
    'AS SELECT',
    'SUM(p.notional_usd) AS exposure_usd,',
    '(SUM(p.notional_usd) / l.limit_usd) * 100 AS limit_util_pct,',
    'MAX(p.event_time) AS as_of',
    'SELECT acct, CAST(qty AS DOUBLE) * px',
    'FROM raw_events',
    'WHERE ABS(CAST(qty AS INT)) <= 50000 AND',
    'JOIN client_limits l ON p.client_id = l.client_id',
    'GROUP BY p.client_id, l.limit_usd;',
  ],
  source: EVENTS.source,
  target: { topic: 'client_exposure', kind: 'materialized', fields: EXPOSURE },
  wires: [
    { from: ['acct', 'qty', 'px', 'ts', 'sym', 'kind'], to: null, match: 'SELECT acct, CAST(qty AS DOUBLE) * px', op: 'derive' },
    { from: [], to: 'client_id', match: 'GROUP BY p.client_id', op: 'aggregate' },
    { from: [], to: 'exposure_usd', match: 'SUM(p.notional_usd) AS exposure_usd', op: 'aggregate' },
    { from: [], to: 'limit_usd', match: 'JOIN client_limits', op: 'join' },
    { from: [], to: 'limit_util_pct', match: 'AS limit_util_pct', op: 'aggregate' },
    { from: [], to: 'as_of', match: 'MAX(p.event_time) AS as_of', op: 'aggregate' },
  ],
  guard: 'WHERE ABS(CAST(qty AS INT)) <= 50000 AND',
};

export interface SqlLine {
  text: string;
  /** Its line in the statement file, or null for an elision mark. */
  n: number | null;
}

/** The statement's lines as shown: comments and blank lines removed, or the excerpt. */
export function sqlLines(st: Statement): SqlLine[] {
  const all = st.sql.split('\n').map((text, i) => ({ text, n: i + 1 })).filter((l) => l.text.trim() && !l.text.trim().startsWith('--'));
  if (!st.excerpt) return all;
  const keep: SqlLine[] = [];
  let last = -1;
  all.forEach((l, i) => {
    if (st.excerpt!.some((m) => l.text.includes(m))) {
      if (last >= 0 && i > last + 1) keep.push({ text: '  …', n: null });
      keep.push(l);
      last = i;
    }
  });
  return keep;
}

/** Which shown line a wire's text sits on, or -1 if the statement no longer says it. */
export function lineOf(lines: SqlLine[], match: string): number {
  return lines.findIndex((l) => l.text.includes(match));
}
