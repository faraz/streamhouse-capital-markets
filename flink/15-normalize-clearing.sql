-- A clearing statement carries a printed total and nothing else: no symbol, no quantity,
-- no price. It is still a fact about what the client owes, so it becomes a record like
-- any other, with the fields it cannot supply named honestly rather than invented.
INSERT INTO positions
SELECT
  acct AS client_id,
  'CLEARING' AS symbol,
  0 AS quantity,
  0.0 AS price,
  CAST(total_due_cents AS DOUBLE) / 100.0 AS notional_usd,
  CAST($rowtime AS TIMESTAMP(3)) AS event_time,
  'clearing' AS source,
  CAST(93600000 AS BIGINT) AS ingest_lag_ms
FROM raw_clearing;
