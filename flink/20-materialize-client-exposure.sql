-- The served table, and the query that keeps it, as one object: a materialized table.
--
-- Process, inverted: the number is kept continuously rather than assembled when asked. That
-- is what a materialized table is, so in the console it shows under Materialized tables as
-- client_exposure, its own query beside it, rather than a table and a separately named job.
--
-- Stateful by client. Each arriving record is a delta applied to what is already there;
-- nothing is ever re-summed from the start. The opening position seeded for each client is
-- what carries the book's existing exposure, so the sum is a genuine running total. It reads
-- positions from the beginning, so it is created after the seeds have landed.
--
-- The presenter's events (a fill, a reset, verify's probe) are read straight off raw_events
-- rather than through positions. Each Flink hop a reader waits on costs up to one commit, so
-- through positions a fill took two, about a minute on average and two at worst; read here it
-- takes one, still exactly once. 17 goes on writing them to positions for the record and for
-- reset, so those copies are left out of the positions branch; the guard's bound is applied
-- here as it is there, so a fat finger is no more counted than it was. A new kind of event
-- has to join the list below, or it would be counted twice: verify's convergence check, which
-- expects its own fill counted once to the dollar, is what would catch it.
--
-- The join against client_limits is a regular join rather than a lookup, which keeps the
-- limits table in state. With eight thousand small rows that is cheap.
--
-- The schema is declared rather than inferred, because what is inferred becomes the data
-- contract. The key is client_id alone, in Avro, exactly as the table it replaced: a
-- Lightning Table cannot take a change to its key schema. GROUP BY carries limit_usd only so
-- it can be selected; it is one value per client.
--
-- limit_util_pct and as_of are STORED columns, not expressions evaluated at query time: a
-- Lightning Table sorts and filters on columns, and arithmetic in a projection is not
-- documented as supported. The whole book query depends on limit_util_pct being a column.
--
-- as_of comes from the data, not the wall clock. CURRENT_TIMESTAMP is rejected as
-- non-deterministic in a query that produces updates, and an exposure figure's as-of time is
-- properly the time of the latest record that went into it anyway.
--
-- It also carries the change that last moved it: the record's symbol, quantity, source and
-- notional, and the utilisation before it. LAST_VALUE is the record that produced this
-- update, so these describe exactly the step from the previous row to this one. That is what
-- lets a crossing be found without ordering anything (33), and lets the risk agent and the
-- analyst say what just changed from the figure itself, rather than from positions, which
-- another statement writes on its own commit and may not have yet.
--
-- Deleting it (clear.sh does, with confluent flink materialized-table delete) deletes the
-- topic and its schemas with it. That is what clear.sh wants and nothing else does.
CREATE MATERIALIZED TABLE client_exposure (
  client_id STRING NOT NULL,
  exposure_usd DOUBLE NOT NULL,
  limit_usd DOUBLE NOT NULL,
  limit_util_pct DOUBLE NOT NULL,
  prev_limit_util_pct DOUBLE NOT NULL,
  last_symbol STRING NOT NULL,
  last_quantity INT NOT NULL,
  last_source STRING NOT NULL,
  last_notional_usd DOUBLE NOT NULL,
  as_of TIMESTAMP(3) NOT NULL,
  PRIMARY KEY (client_id) NOT ENFORCED
)
DISTRIBUTED BY (client_id) INTO 2 BUCKETS
WITH (
  'changelog.mode' = 'upsert',
  'key.format' = 'avro-registry',
  'value.format' = 'avro-registry'
)
AS SELECT
  p.client_id,
  SUM(p.notional_usd) AS exposure_usd,
  l.limit_usd,
  (SUM(p.notional_usd) / l.limit_usd) * 100 AS limit_util_pct,
  ((SUM(p.notional_usd) - COALESCE(LAST_VALUE(p.notional_usd), 0)) / l.limit_usd) * 100 AS prev_limit_util_pct,
  COALESCE(LAST_VALUE(p.symbol), '') AS last_symbol,
  COALESCE(LAST_VALUE(p.quantity), 0) AS last_quantity,
  COALESCE(LAST_VALUE(p.source), '') AS last_source,
  COALESCE(LAST_VALUE(p.notional_usd), 0) AS last_notional_usd,
  MAX(p.event_time) AS as_of
FROM (
  SELECT client_id, notional_usd, event_time, symbol, quantity, source
  FROM positions
  WHERE source NOT IN ('fill', 'fat_finger', 'reset', 'verify', 'setup')
  UNION ALL
  -- TO_TIMESTAMP is nullable and the declared schema is not, so the type is pinned with a
  -- COALESCE whose fallback the filter makes unreachable.
  SELECT acct, CAST(qty AS DOUBLE) * px, COALESCE(TO_TIMESTAMP(ts), TIMESTAMP '1970-01-01 00:00:00'), sym, CAST(qty AS INT), kind
  FROM raw_events
  WHERE ABS(CAST(qty AS INT)) <= 50000 AND TO_TIMESTAMP(ts) IS NOT NULL
) p
JOIN client_limits l ON p.client_id = l.client_id
GROUP BY p.client_id, l.limit_usd;
