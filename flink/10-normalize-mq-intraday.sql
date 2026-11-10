-- Connect's work, done in Flink: whatever arrived becomes one fact with a key, a time
-- and a record of where it came from.
--
-- The quantity bound is here from the start so that ticket 07 only has to add the
-- opposite branch writing to positions_dlq, rather than restructure this statement.
--
-- The source sends 'ts' as 'YYYY-MM-DD HH:MM:SS' deliberately: TO_TIMESTAMP handles that
-- directly, whereas casting an ISO-8601 string with a T separator fails in every Flink
-- dialect.
INSERT INTO positions
SELECT
  acct AS client_id,
  sym AS symbol,
  qty AS quantity,
  px AS price,
  CAST(qty AS DOUBLE) * px AS notional_usd,
  TO_TIMESTAMP(ts) AS event_time,
  'mq_intraday' AS source,
  CAST(0 AS BIGINT) AS ingest_lag_ms
FROM raw_mq_intraday
WHERE ABS(qty) <= 50000;
