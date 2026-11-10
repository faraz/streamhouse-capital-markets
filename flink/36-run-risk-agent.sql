-- The agent at work: each crossing, handed to risk_agent, and its note written down.
--
-- Read uncommitted, so the crossing reaches the agent as soon as it is written rather than at
-- the next commit; client_exposure itself stays exactly-once, so the figure on screen is
-- never one that is later taken back. From the latest offset, and created last by
-- regenerate.sh, so no crossing from before it started ever reaches the model.
INSERT INTO client_escalations
SELECT
  c.client_id,
  c.crossed_at,
  c.limit_util_pct,
  c.prev_limit_util_pct,
  c.limit_usd,
  r.agent_status,
  r.note
FROM exposure_crossings /*+ OPTIONS('kafka.consumer.isolation-level' = 'read-uncommitted', 'scan.startup.mode' = 'latest-offset') */ AS c,
LATERAL TABLE(AI_RUN_AGENT(
  'risk_agent',
  CONCAT(
    'Client ', c.client_id,
    ' crossed 85% of its limit at ', DATE_FORMAT(c.crossed_at, 'HH:mm:ss'), ' UTC',
    ', from ', CAST(ROUND(c.prev_limit_util_pct, 1) AS STRING), '%',
    ' to ', CAST(ROUND(c.limit_util_pct, 1) AS STRING), '%.',
    ' The record that pushed it over: ', CAST(c.last_quantity AS STRING), ' lots of ', c.last_symbol,
    ', source ', c.last_source,
    ', notional ', CAST(CAST(c.last_notional_usd AS BIGINT) AS STRING), ' USD.',
    ' Its limit is ', CAST(CAST(c.limit_usd AS BIGINT) AS STRING), ' USD.'
  ),
  CONCAT(c.client_id, '@', CAST(c.crossed_at AS STRING))
)) AS r(agent_status, note);
