-- What the risk agent wrote, one row per crossing, served as a Lightning Table so the screen
-- reads the agent's own words. Append, so it needs no key. A duplicate row is possible, since
-- the agent reads its crossings uncommitted; the Worker shows one per client and crossing.
CREATE TABLE client_escalations (
  client_id STRING NOT NULL,
  crossed_at TIMESTAMP(3) NOT NULL,
  limit_util_pct DOUBLE NOT NULL,
  prev_limit_util_pct DOUBLE NOT NULL,
  limit_usd DOUBLE NOT NULL,
  agent_status STRING,
  note STRING
) WITH (
  'changelog.mode' = 'append',
  'value.format' = 'avro-registry'
);
