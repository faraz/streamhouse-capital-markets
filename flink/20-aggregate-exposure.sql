-- Process, inverted: the number is kept continuously rather than assembled when asked.
--
-- Stateful by client. Each arriving record is a delta applied to what is already there;
-- nothing is ever re-summed from the start. The opening position seeded for each client
-- is what carries the book's existing exposure, so the sum is a genuine running total.
--
-- The join against client_limits is a regular join rather than a lookup, which keeps the
-- limits table in state. With four thousand small rows that is cheap, and Confluent Cloud
-- infers upsert semantics from the compacted topic.
INSERT INTO client_exposure
SELECT
  p.client_id,
  SUM(p.notional_usd) AS exposure_usd,
  l.limit_usd,
  (SUM(p.notional_usd) / l.limit_usd) * 100 AS limit_util_pct,
  MAX(p.event_time) AS as_of
FROM positions p
JOIN client_limits l ON p.client_id = l.client_id
GROUP BY p.client_id, l.limit_usd;
