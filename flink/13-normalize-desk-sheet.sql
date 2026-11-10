-- A spreadsheet: every field arrives as text, because a person typed it into a cell.
INSERT INTO positions
SELECT
  account AS client_id,
  symbol,
  CAST(quantity AS INT) AS quantity,
  CAST(price AS DOUBLE) AS price,
  CAST(quantity AS DOUBLE) * CAST(price AS DOUBLE) AS notional_usd,
  CAST($rowtime AS TIMESTAMP(3)) AS event_time,
  'desk_sheet' AS source,
  CAST(11400000 AS BIGINT) AS ingest_lag_ms
FROM raw_desk_sheet
WHERE ABS(CAST(quantity AS INT)) <= 50000;
