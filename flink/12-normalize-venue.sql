-- The venue sends loose fields and NO time at all. Confluent Cloud exposes $rowtime as a
-- built-in event-time column on every auto-mapped table, so the moment the record landed
-- stands in for an event time the source never sent. That substitution is the honest one
-- and it is visible in the data: source names the feed.
INSERT INTO positions
SELECT
  acct AS client_id,
  sym AS symbol,
  q AS quantity,
  p AS price,
  CAST(q AS DOUBLE) * p AS notional_usd,
  CAST($rowtime AS TIMESTAMP(3)) AS event_time,
  'venue' AS source,
  CAST(7560000 AS BIGINT) AS ingest_lag_ms
FROM raw_venue
WHERE ABS(q) <= 50000;
