-- The opposite branch of the normalizing statement. A fat finger, one zero too many,
-- lands here instead of in positions, so the exposure figure never moves.
--
-- The bound is the desk's, not the schema's: 2,400,000 lots is a perfectly valid integer
-- and a perfectly wrong trade. That is the distinction the beat exists to show.
INSERT INTO positions_dlq
SELECT
  acct AS client_id,
  sym AS symbol,
  qty AS quantity,
  px AS price,
  TO_TIMESTAMP(ts) AS event_time,
  'mq_intraday' AS source,
  'Quantity exceeds the desk bound of 50,000 lots' AS reject_reason
FROM raw_mq_intraday
WHERE ABS(qty) > 50000;
