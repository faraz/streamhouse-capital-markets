-- The presenter's own events: the fill that lands on cue, and the fat finger.
--
-- Produced by the Worker over the Kafka REST API, which has no Schema Registry support,
-- so the Worker frames the bytes itself. JSON Schema's wire format makes that a few
-- lines; Avro's would have meant implementing Avro binary encoding in a Worker.
--
-- The quantity bound is the same one the six feeds get. A fat finger is just a narrative
-- event that happens to breach it, which is the point: nothing about the guard is
-- special-cased for the demo.
INSERT INTO positions
SELECT
  acct AS client_id,
  sym AS symbol,
  CAST(qty AS INT) AS quantity,
  px AS price,
  CAST(qty AS DOUBLE) * px AS notional_usd,
  TO_TIMESTAMP(ts) AS event_time,
  kind AS source,
  CAST(0 AS BIGINT) AS ingest_lag_ms
FROM raw_events
WHERE ABS(CAST(qty AS INT)) <= 50000;
