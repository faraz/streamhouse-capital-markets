-- The served table, and the query that keeps it, as one object: a materialized table.
--
-- Process, inverted: the number is kept continuously rather than assembled when asked. That
-- is what a materialized table is, so in the console it shows under Materialized tables as
-- client_exposure, its own query beside it, rather than a table and a separately named job.
--
-- Stateful by client. Each arriving record is a delta applied to what is already there;
-- nothing is ever re-summed from the start. The opening position seeded for each client is
-- what carries the book's existing exposure, so the sum is a genuine running total. It reads
-- positions from the beginning, so it is created after the seeds have landed.
--
-- The join against client_limits is a regular join rather than a lookup, which keeps the
-- limits table in state. With eight thousand small rows that is cheap.
--
-- The schema is declared rather than inferred, because what is inferred becomes the data
-- contract. The key is client_id alone, in Avro, exactly as the table it replaced: a
-- Lightning Table cannot take a change to its key schema. GROUP BY carries limit_usd only so
-- it can be selected; it is one value per client.
--
-- limit_util_pct and as_of are STORED columns, not expressions evaluated at query time: a
-- Lightning Table sorts and filters on columns, and arithmetic in a projection is not
-- documented as supported. The whole book query depends on limit_util_pct being a column.
--
-- as_of comes from the data, not the wall clock. CURRENT_TIMESTAMP is rejected as
-- non-deterministic in a query that produces updates, and an exposure figure's as-of time is
-- properly the time of the latest record that went into it anyway.
--
-- Deleting it (clear.sh does, with confluent flink materialized-table delete) deletes the
-- topic and its schemas with it. That is what clear.sh wants and nothing else does.
CREATE MATERIALIZED TABLE client_exposure (
  client_id STRING NOT NULL,
  exposure_usd DOUBLE NOT NULL,
  limit_usd DOUBLE NOT NULL,
  limit_util_pct DOUBLE NOT NULL,
  as_of TIMESTAMP(3) NOT NULL,
  PRIMARY KEY (client_id) NOT ENFORCED
)
DISTRIBUTED BY (client_id) INTO 2 BUCKETS
WITH (
  'changelog.mode' = 'upsert',
  'key.format' = 'avro-registry',
  'value.format' = 'avro-registry'
)
AS SELECT
  p.client_id,
  SUM(p.notional_usd) AS exposure_usd,
  l.limit_usd,
  (SUM(p.notional_usd) / l.limit_usd) * 100 AS limit_util_pct,
  MAX(p.event_time) AS as_of
FROM positions p
JOIN client_limits l ON p.client_id = l.client_id
GROUP BY p.client_id, l.limit_usd;
