-- The book of record's own changes, read at source rather than waiting for tonight's
-- extract. This is the source whose age collapses from a night to seconds, and it is the
-- move the whole Connect beat turns on.
--
-- A DELETE reverses the position rather than adding to it, so the running total stays
-- correct when a trade is cancelled.
INSERT INTO positions
SELECT
  client AS client_id,
  sym AS symbol,
  CASE WHEN change_type = 'DELETE' THEN -qty ELSE qty END AS quantity,
  px AS price,
  CASE WHEN change_type = 'DELETE' THEN -1.0 ELSE 1.0 END * CAST(qty AS DOUBLE) * px AS notional_usd,
  TO_TIMESTAMP(changed_at) AS event_time,
  'book_of_record' AS source,
  CAST(3000 AS BIGINT) AS ingest_lag_ms
FROM raw_book_of_record
WHERE ABS(qty) <= 50000;
