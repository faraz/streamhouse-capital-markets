-- Flink notices: one row each time a client goes from below 85% of its limit to 85% or
-- above. The risk agent (36) runs on these rows and on nothing else, so the model thinks only
-- when something has crossed, never on the eighty-odd changes a minute the feeds make.
--
-- No ordering is needed, so no watermark is waited on: client_exposure carries the
-- utilisation before its latest change, and a crossing is a filter on each change. An
-- earlier version compared each change with the last through LAG over event time, and its
-- output sat behind a watermark that did not move.
--
-- Started from now, and created by regenerate.sh only once the book is right, so the replay
-- that follows a rebuild, whose partial totals step through the line, is never taken for a
-- crossing. Changes made by an opening balance are left out as well: every false crossing in
-- that replay was one. Dropping back below and crossing again makes a second row.
CREATE MATERIALIZED TABLE exposure_crossings (
  client_id STRING NOT NULL,
  crossed_at TIMESTAMP(3) NOT NULL,
  limit_util_pct DOUBLE NOT NULL,
  prev_limit_util_pct DOUBLE NOT NULL,
  limit_usd DOUBLE NOT NULL,
  exposure_usd DOUBLE NOT NULL,
  last_symbol STRING NOT NULL,
  last_quantity INT NOT NULL,
  last_source STRING NOT NULL,
  last_notional_usd DOUBLE NOT NULL
)
DISTRIBUTED BY (client_id) INTO 2 BUCKETS
WITH (
  'changelog.mode' = 'append',
  'value.format' = 'avro-registry'
)
START_MODE = FROM_NOW
AS SELECT
  client_id,
  as_of AS crossed_at,
  limit_util_pct,
  prev_limit_util_pct,
  limit_usd,
  exposure_usd,
  last_symbol,
  last_quantity,
  last_source,
  last_notional_usd
FROM TO_CHANGELOG(
  input => TABLE client_exposure PARTITION BY client_id,
  op_mapping => MAP['INSERT, UPDATE_AFTER', 'UPSERT']
)
WHERE prev_limit_util_pct < 85
  AND limit_util_pct >= 85
  AND last_source <> 'opening_balance';
