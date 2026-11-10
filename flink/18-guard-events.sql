-- The same guard, on the same bound, for the presenter's events. A 2,400,000 lot
-- "trade" lands here and the exposure figure never moves.
INSERT INTO positions_dlq
SELECT
  acct AS client_id,
  sym AS symbol,
  CAST(qty AS INT) AS quantity,
  px AS price,
  TO_TIMESTAMP(ts) AS event_time,
  kind AS source,
  'Quantity exceeds the desk bound of 50,000 lots' AS reject_reason
FROM raw_events
WHERE ABS(CAST(qty AS INT)) > 50000;
