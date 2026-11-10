-- Fixed-width columns from a custodian, counting money in integer cents. Everything
-- downstream deals in currency, so the conversion happens once, here.
INSERT INTO positions
SELECT
  acct_no AS client_id,
  instrument AS symbol,
  units AS quantity,
  CAST(value_cents AS DOUBLE) / 100.0 / NULLIF(CAST(units AS DOUBLE), 0) AS price,
  CAST(value_cents AS DOUBLE) / 100.0 AS notional_usd,
  CAST($rowtime AS TIMESTAMP(3)) AS event_time,
  'custodial' AS source,
  CAST(29160000 AS BIGINT) AS ingest_lag_ms
FROM raw_custodial
WHERE ABS(units) <= 50000;
