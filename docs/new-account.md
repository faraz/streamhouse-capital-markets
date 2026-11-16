# Moving the demo to another Confluent Cloud account

Nothing is migrated. Every record in the stack is synthetic and rebuilt from this repo, so
a move is: adopt an environment in the new account, rebuild the data, point the Worker at
it.

## The two rules (2026-11-15)

- **The first account is left alone.** Org `Faraz`, `env-53k1pn` / `lkc-v7wpq15`. No clear,
  no destroy, no deletes. Its `.env` and `.dev.vars` are kept in the main checkout as
  `.env.first-account` and `.env.first-account.dev-vars`, beside its Terraform state.
- **In the new account only `financial-services` (`env-53ky8g`) is ours.** The organization
  is shared and the CLI login there is an OrganizationAdmin, so nothing stops a wrong
  command but the scripts. Every one of them names the environment, and the cluster where a
  command takes one, on each call. Keep it that way.

## What is where

| What | New account | Made by |
|---|---|---|
| Environment, cluster, Schema Registry | `env-53ky8g`, `fs_01` (`lkc-gq3qnvr`), `lsrc-pgxgrzm`: all there before us | not us |
| The one principal | service account `fsm-master` (`sa-j823xp8`), the environment's admin | not us |
| Flink pool, Kafka key, Schema Registry key | `streamhouse-cm-pool`, and two keys owned by `fsm-master` | `scripts/bootstrap.sh` |
| Global key (queries, MCP) | `fsm-master`'s own; the secret has to be put in `.env` by hand | not us |
| Topics, schemas, statements, materialized tables, Lightning Tables, feeds, the risk agent | none yet | `scripts/regenerate.sh` |
| `RAW_EVENTS_SCHEMA_ID` | | `scripts/regenerate.sh` |
| The Worker's copy of all of the above | Cloudflare, unchanged URL | `scripts/deploy.sh` |

`terraform/` is not used in the new account. What it made in the first one (three service
accounts, their role bindings and keys) lives at organization level. Here one service
account does what those three did, so the Worker's key is no longer read-only: it belongs
to the environment's admin.

## The steps

1. `confluent login`, to the new organization.
2. `.env` holds `DEMO_ENVIRONMENT_ID=env-53ky8g`, and `CONFLUENT_GLOBAL_KEY` and
   `CONFLUENT_GLOBAL_SECRET` for `fsm-master`.
3. `scripts/bootstrap.sh --check`, then `scripts/bootstrap.sh --from <the old .env>`. Safe
   to run again; it reuses the pool and the keys already in `.env`.
4. `scripts/regenerate.sh`, then `scripts/verify.sh`.
5. Look at it locally (`npm run build && npx wrangler dev --port 8787 --local`, then
   `scripts/shoot.sh`), then `scripts/deploy.sh` to move the deployed Worker over.

`scripts/clear.sh` deletes every topic and connector on `fs_01` and every materialized table
on it. That is right only while the demo is the cluster's sole tenant.

## What a new account has to prove again

These held in the first account and are per-account or per-region, so they are the places a
rebuild would stop:

- **`POST /query/v1` answering 200.** The billing page still calls direct querying Early
  Access. `verify.sh` fails at "Queryability" if the account is not enabled.
- **The Confluent-hosted Claude model.** `flink/30-create-risk-model.sql` names
  `anthropic.claude-opus-4-8`; `regenerate.sh` fails at `risk-model` if `SHOW MODELS` does
  not list it there. The screen then escalates with the threshold check, and says so.
- **Flink quota.** The pool asks for 30 CFU and the rebuild needs 14.
- **Cost.** The first account billed about $93 a day with everything up (2026-11-11 to
  11-13, from `confluent billing cost list`): Flink $65.50, Kafka $18, Lightning Tables $7
  to $9, connectors $1.70. `scripts/clear.sh` after a session stops everything but the
  cluster, which was there before us.
