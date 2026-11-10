-- The live market. Unlike the six shape sources, which exist to show six systems
-- disagreeing, this feed exists to keep the book moving, so that at any moment there is
-- a client who traded seconds ago and whose answer is seconds old.
--
-- No time arrives on the record: the moment it landed is its event time, read from
-- $rowtime, which is honest for a live feed.
INSERT INTO positions
SELECT
  CAST(acct AS STRING) AS client_id,
  sym AS symbol,
  qty AS quantity,
  px AS price,
  CAST(qty AS DOUBLE) * px AS notional_usd,
  CAST($rowtime AS TIMESTAMP(3)) AS event_time,
  'trade' AS source,
  CAST(0 AS BIGINT) AS ingest_lag_ms
FROM raw_trades
WHERE ABS(qty) <= 50000;
