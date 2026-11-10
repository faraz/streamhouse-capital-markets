-- One shape out. Append-only: every record is a fact that happened.
--
-- No key is declared. Append tables do not need one, and a Lightning Table only requires
-- a record key in upsert mode. 'value.format' must be a registry format on Confluent
-- Cloud: plain 'json' is not supported.
--
-- CREATE TABLE here creates the physical Kafka topic and its Schema Registry subjects,
-- and DROP TABLE would delete the topic and its data, so never drop one casually.
CREATE TABLE positions (
  client_id STRING NOT NULL,
  symbol STRING NOT NULL,
  quantity INT NOT NULL,
  price DOUBLE NOT NULL,
  notional_usd DOUBLE NOT NULL,
  event_time TIMESTAMP(3) NOT NULL,
  source STRING NOT NULL,
  ingest_lag_ms BIGINT NOT NULL
) WITH (
  'changelog.mode' = 'append',
  'value.format' = 'avro-registry'
);
