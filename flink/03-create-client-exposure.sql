-- The served table. One row per client, kept continuously.
--
-- limit_util_pct and as_of are STORED columns, not expressions evaluated at query time:
-- a Lightning Table sorts and filters on columns, and arithmetic in a projection is not
-- documented as supported. The whole book query depends on limit_util_pct being a column.
--
-- as_of comes from the data, not the wall clock. CURRENT_TIMESTAMP is rejected as
-- non-deterministic in a query that produces updates, and an exposure figure's as-of time
-- is properly the time of the latest record that went into it anyway.
CREATE TABLE client_exposure (
  client_id STRING NOT NULL,
  exposure_usd DOUBLE NOT NULL,
  limit_usd DOUBLE NOT NULL,
  limit_util_pct DOUBLE NOT NULL,
  as_of TIMESTAMP(3) NOT NULL,
  PRIMARY KEY (client_id) NOT ENFORCED
) DISTRIBUTED BY HASH(client_id) INTO 2 BUCKETS
WITH (
  'changelog.mode' = 'upsert',
  'key.format' = 'avro-registry',
  'value.format' = 'avro-registry'
);
