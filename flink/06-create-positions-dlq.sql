-- Where a well-formed but wrong record goes. Append-only, and it carries why it was
-- rejected, so the beat is inspectable rather than asserted.
--
-- Stream Governance Essentials has no data quality rules, so Flink does this work. It is
-- called a guard and never a quality rule: that is the Advanced product feature, and
-- naming it that on screen would claim something this account does not have.
CREATE TABLE positions_dlq (
  client_id STRING NOT NULL,
  symbol STRING NOT NULL,
  quantity INT NOT NULL,
  price DOUBLE NOT NULL,
  event_time TIMESTAMP(3) NOT NULL,
  source STRING NOT NULL,
  reject_reason STRING NOT NULL
) WITH (
  'changelog.mode' = 'append',
  'value.format' = 'avro-registry'
);
