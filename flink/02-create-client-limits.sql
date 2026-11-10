-- The limit per client. Upsert, because a limit is a current fact, not an event.
CREATE TABLE client_limits (
  client_id STRING NOT NULL,
  limit_usd DOUBLE NOT NULL,
  PRIMARY KEY (client_id) NOT ENFORCED
) DISTRIBUTED BY HASH(client_id) INTO 2 BUCKETS
WITH (
  'changelog.mode' = 'upsert',
  'key.format' = 'avro-registry',
  'value.format' = 'avro-registry'
);
