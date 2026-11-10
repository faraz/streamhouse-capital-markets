# Spike 02: direct Lightning Table querying on this account

Run 2026-11-09 against org `Faraz`, environment `env-53k1pn` (Capital-Markets), cluster
`lkc-v7wpq15` (`brokerage_0`, Standard, AWS us-east-1). Throwaway topic `lt_spike`,
created, queried and removed.

## Verdict: it works. There is no Early Access gate on this account.

A Global API key owned by a service account authenticated successfully, the documented
request shape was accepted, and a sorted top-N returned correct rows:

```
CLIENT_ID  EXPOSURE_USD  LIMIT_UTIL_PCT
2286       1.128E8       94.0
4417       3.6430064E8   80.96
7405       6.16E7        77.0
9021       3.71E8        74.2
```

The first two attempts failed with **HTTP 500 `MT_INITIALIZATION_ERROR`**, not 403. That
distinction is the whole finding: authentication and the request shape were fine, and the
Early Access note on the RTCE billing page did not apply. Treat that note as stale.

## Five things that will bite whoever writes the live adapter

1. **Response column names come back UPPERCASE.** The Avro schema declared `client_id`,
   `exposure_usd`, `limit_util_pct`; the response names them `CLIENT_ID`, `EXPOSURE_USD`,
   `LIMIT_UTIL_PCT`. The predicate `WHERE client_id = '4417'` was accepted in lowercase,
   so matching looks case-insensitive, but the **response keys are not**. An adapter
   reading lowercase keys finds nothing and reports it as empty rather than as an error.
2. **Numbers arrive as strings in scientific notation**: `"3.6430064E8"`, not
   `364300640`. `parseFloat` handles it; assuming a column is already numeric does not.
3. **`ACTIVE` does not mean queryable.** The phase read `ACTIVE` after 15 seconds and
   queries still failed for roughly another 20. A readiness check must be **a successful
   query**, not a phase check. Good news for rehearsals: ready in well under a minute,
   not the "several minutes" the docs warn about.
4. **A sorted top-N works directly**, confirmed live: `ORDER BY limit_util_pct DESC
   LIMIT 5` returned correctly ordered rows. Flink does not need to maintain a ranked
   topic.
5. **The documented request shape is right**: `POST /query/v1` with `catalog_name` set to
   the environment id, `database_name` to the cluster id, and `query` holding the SQL.
   HTTP Basic with the Global key.

## Two corrections to earlier research

- **`DeveloperRead` cannot be granted at bare cluster scope.** The API refuses it with
  "Resources must be specified for role DeveloperRead", and Schema Registry has no
  cluster-level `DeveloperRead` at all ("No role DeveloperRead for resource type
  SchemaRegistry"). The reader needs patterns ending `topic=*` and `subject=*`, which is
  what Confluent's own quickstart grants. The claim that one cluster-scope binding covers
  both was wrong.
- **`confluent api-key create --resource global` exists and works**, previously
  UNCONFIRMED. A service-account-owned Global key is the right credential for the
  server-side proxy.

## One Terraform trap

The provider claims `CONFLUENT_ENVIRONMENT_ID` as one of its own provider-block
attributes, which belong to an all-or-nothing group of seven. Setting it in a `.env` that
gets sourced makes every plan fail with "All 7 flink_api_key, flink_api_secret, ...
attributes should be set or not set in the provider block at the same time". The demo's
own ids therefore use a `DEMO_` prefix.
