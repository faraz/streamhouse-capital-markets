# Flink materialized tables, streaming agents and once-per-crossing alerts

Read 2026-11-10. Reading only: Confluent docs (fetched as HTML and read in full, not through a summariser), the quickstart repo (shallow clone at `04cd65e`, 2026-11-03), and this repo's `research/`, `docs/` and `flink/`. Nothing was created, run or submitted in Confluent Cloud. No SQL below has been run. "Unconfirmed" means no primary source says so.

Already established elsewhere, not repeated here: no `FRESHNESS` clause and the once-a-minute exactly-once commit (`research/confluent-cloud-demo-platform-2026-11.md` §3.5 and §3.6); the model families and the `anthropic.claude-sonnet-4-6` id (`research/confluent-cloud-capabilities-2026-11.md` §3.5); Streaming Agents GA on 2026-05-19, plus the `CREATE TOOL` and `CREATE AGENT` options (same file §3.6); Terraform cannot create an `mcp_server` connection (`research/confluent-cloud-demo-platform-2026-11.md` §3.7).

Quickstart paths below are relative to https://github.com/confluentinc/quickstart-streamhouse/tree/04cd65e81bc21980679a8e7abf6d20c57496fb4e. Docs paths are relative to `https://docs.confluent.io/cloud/current/`.

---

## 1. Materialized tables

**Status.** GA. The release note dated 2026-05-11 says: "Materialized tables in Confluent Cloud for Apache Flink are now generally available" (`release-notes/index.html`). Adopting an existing topic arrived on 2026-09-15 (same page).

**Syntax** (`flink/reference/statements/create-materialized-table.html`, verbatim):

```
CREATE MATERIALIZED TABLE [IF NOT EXISTS] [catalog_name.][db_name.]table_name
  [( { <physical_column_definition> | <metadata_column_definition> | <computed_column_definition> }[ , ...n]
    [ <watermark_definition> ] [ <table_constraint> ][ , ...n] )]
  [COMMENT table_comment]
  [DISTRIBUTED BY (column_name1, column_name2, ...) INTO n BUCKETS]
  [WITH (key1=value1, key2=value2, ...)]
  [START_MODE = <start_mode_value>]
  AS <select_query>
```

- **There is no freshness clause and no refresh mode.** It is always a continuous query.
- **WITH options** are those of `CREATE TABLE`. The page lists `changelog.mode`, `kafka.cleanup-policy`, `key.format`, `value.format`, `key.fields-prefix`, `value.fields-include`, `scan.startup.mode`, the error-handling options and others. `kafka.consumer.isolation-level` is not in that list, but the quickstart sets it with a query hint instead (`terraform/airline-demo/sql/25-serving-flight-impact.sql` L32).
- **Primary key and Kafka key.** From `flink/reference/statements/create-table.html`: "the PRIMARY KEY constraint distributes the table implicitly by the key column. ... Either an implicit DISTRIBUTED BY or an explicit DISTRIBUTED BY clause defines the Kafka message key." Also: "For upsert mode, the bucket key must be equal to primary key." And for `kafka.cleanup-policy`: "Default: compact for upsert tables". So **the key is the primary key**. With `'key.format' = 'avro-registry'` the key schema holds `client_id`.
- **Explicit schema is recommended.** Inferred nullability, precision and length "form a data contract" and lock future evolutions (`create-materialized-table.html`).
- **START_MODE** values: `FROM_BEGINNING`, `FROM_NOW`, `FROM_TIMESTAMP(...)`, `FROM_NOW(INTERVAL ...)`, and the `RESUME_OR_*` forms. The default is `RESUME_OR_FROM_BEGINNING` (`flink/reference/statements/create-or-alter-materialized-table.html`).
- **The grammar shows `DISTRIBUTED BY (col)`, not `DISTRIBUTED BY HASH(col)`.** That is how the quickstart writes it (`DISTRIBUTED BY (\`key\`) INTO 1 BUCKETS`, `sql/24` L13). Whether `HASH(...)` is accepted in a materialized table is unconfirmed.

**Lifecycle.**

- **Create.** "Flink creates the backing topic, registers the schema, and starts the continuous query" (`flink/concepts/materialized-tables.html`).
- **Evolve.** `CREATE OR ALTER` stops the query and starts a new one "writing to the same output topic". "All existing Flink processing state ... is discarded", so a `GROUP BY` "is recalculated by reprocessing the source data" (`create-or-alter-materialized-table.html`).
- **Three traps** on the same page:
  - Re-running an unchanged definition that has `DISTRIBUTED BY` "can fail with the error `Changing distribution of materialized table is not supported`".
  - "Concurrent evolutions are rejected."
  - "No automatic rollback": a failing new version leaves the table FAILED.
- **Suspend.** Use `ALTER MATERIALIZED TABLE ... SUSPEND`. Resuming is done "only" through the REST API or the Terraform `stopped` attribute (`flink/reference/statements/alter-materialized-table.html`).
- **Drop.** `DROP MATERIALIZED TABLE [IF EXISTS] name` "Deletes the backing Apache Kafka® topic and its data permanently" and "Deletes the associated schema versions from Schema Registry" (`flink/reference/statements/drop-materialized-table.html`). That would take the Lightning Table with it.
- **Adopt in place (the relevant path for this repo).** "If a regular table already exists, Flink adopts it as a materialized table in place." "The topic and its data stay." The new schema must be compatible with the registered one. Declare the columns, primary key and watermark from `SHOW CREATE TABLE`. "Processing starts fresh": `RESUME_OR_*` modes fall back to their plain start point. Adoption "does not take over whatever is currently writing into that topic". The recommended approach is to "stop the statement that writes to the topic first", or else expect "Wrong results on an upsert table" (`create-or-alter-materialized-table.html`).
- **Other limits.** "You can't use materialized tables within statement sets", and there is "No automatic change detection" of upstream schemas (`flink/concepts/materialized-tables.html`).

**Does it consume CFUs like an INSERT?** In effect yes, but no page states it outright for materialized tables.

- Its query "goes through the same lifecycle states as a statement" (`flink/concepts/materialized-tables.html`).
- Billing is per statement: "Each Flink statement consumes a minimum of 1 CFU-minute" (`billing/dimensions/flink.html`).
- The quickstart refers to its materialized table as "Running statement `airport-materialize-passenger-state`" (`docs/flight-disruptions/demo-script-screens.md` L110).
- The CFU billing of a materialized table specifically: unconfirmed, but inferred.

**Can it be a GROUP BY over a regular join of an append table and an upsert table?** Probably yes. No limitation forbids it, and the documented pieces fit:

- The reference has a JOIN example (`create-materialized-table.html`).
- The adoption example is a `GROUP BY ... SUM` (`create-or-alter-materialized-table.html`).
- The quickstart's `flight_impact` is a materialized table that LEFT JOINs a `GROUP BY` over the upsert `passenger_state` (`sql/25`).
- `passenger_state` itself joins an upsert table (`sql/24` L35 to L37).
- The exact shape of `flink/20-aggregate-exposure.sql` as a materialized table: unconfirmed.

Two points that are unconfirmed and would show up at plan time:

- The aggregation key is `(client_id, limit_usd)` while the primary key is `client_id`.
- With an explicit `NOT NULL` schema, `SUM(...)` and the division may be inferred nullable and rejected. Fall back to `COALESCE`/`CAST`, or a nullable column.

**Lightning Table on its backing topic.** Supported. This is the documented pattern: "A materialized table writes to a backing topic, and you enable a Lightning Table and Tableflow on that topic. To serve the table this way, give it a primary key. The backing topic of a table with a primary key is compacted by default, so the Lightning Table uses upsert mode and keeps the latest row for each key" (`streamhouse/query-surface.html`).

- The quickstart enables Lightning on its materialized tables `passenger_state` and `flight_impact` (`docs/flight-disruptions/workshop.md` L332 to L345).
- **Topic name = table name** ("In Confluent Cloud every Kafka topic already appears in Flink as a table", `create-or-alter-materialized-table.html`). The quickstart's materialized table `passenger_state` is the topic `passenger_state` (`workshop.md` L332).
- The Lightning Table "doesn't support changes to the key schema" (`lightning-tables/limitations.html`). So any conversion must leave the key schema byte-identical.

---

## 2. What quickstart-streamhouse does

- **Materialized tables: four, all `CREATE OR ALTER`.** Two hold serving state, two are staging tables for the agent.
  - `sql/24` `passenger_state` and `sql/25` `flight_impact` are upsert, written as:
    ```sql
    CREATE OR ALTER MATERIALIZED TABLE passenger_state ( `key` STRING NOT NULL, ..., PRIMARY KEY (`key`) NOT ENFORCED
    ) DISTRIBUTED BY (`key`) INTO 1 BUCKETS
    WITH ('changelog.mode' = 'upsert', 'key.format' = 'raw', 'kafka.cleanup-policy' = 'compact', 'value.format' = 'avro-registry')
    START_MODE = FROM_BEGINNING
    AS SELECT ... FROM passenger_itineraries p JOIN flight_status inbound ON ... LEFT JOIN flight_status onward ON ...;
    ```
  - `sql/26` `passenger_state_changes` and `sql/27` `impacted_passengers` are append (`'changelog.mode' = 'append'`, `INTO 4 BUCKETS`).
- **Lightning Tables.** Enabled in the Console on all six topics (`workshop.md` L336 to L345), or through `confluent rtce rtce-topic create` (`scripts/setup_rtce.py` L502 to L560).
- **CREATE MODEL** (`sql/32`):
  ```sql
  CREATE MODEL IF NOT EXISTS passenger_recovery_model INPUT (prompt STRING) OUTPUT (response STRING)
  WITH ('provider' = 'confluent', 'task' = 'text_generation', 'confluent.model' = 'anthropic.claude-sonnet-4-6',
        'confluent.input_format' = 'confluent-chat', 'confluent.params.max_tokens' = '1024');
  ```
  The pit lab uses the same model id (`terraform/agentic-pit-decisions/sql/04-model-llm-textgen.sql`).
- **CREATE TOOL** (`sql/29`): `CREATE TOOL IF NOT EXISTS hotel_inventory_live_context USING CONNECTION \`rtce-connection\` WITH ('type' = 'mcp', 'allowed_tools' = 'getMetadata,queryData', 'request_timeout' = '30');`. The connection is made with the CLI, not SQL.
- **CREATE AGENT** (`sql/30`): `CREATE AGENT IF NOT EXISTS passenger_recovery_agent USING MODEL passenger_recovery_model USING PROMPT '...' USING TOOLS hotel_inventory_live_context WITH ('max_iterations' = '15', 'handle_exception' = 'continue');`.
  - Its comment: "IF NOT EXISTS keeps an existing agent as is: DROP AGENT before re-applying an edit."
  - `handle_exception` is not in the documented option list (`flink/reference/statements/create-agent.html` lists only `max_consecutive_failures` and `max_iterations`).
- **AI_RUN_AGENT** (`sql/31`). A `CREATE TABLE` plus an `INSERT`, because "AI_RUN_AGENT can't run inside a materialized table" (L8):
  ```sql
  FROM new_groups g, LATERAL TABLE(AI_RUN_AGENT('passenger_recovery_agent', CONCAT(...), g.group_key)) AS r(agent_status, response)
  ```
- **Its rules for agents, stated by the repo.** None of these is in the docs (unconfirmed there):
  - "`AI_RUN_AGENT` reads only append-only input".
  - "A Flink statement can hold only one `TO_CHANGELOG`" (`AGENTS.md` L18).
- **How it limits model calls (its once-only pattern).** In order:
  1. `sql/26` turns the upsert table into an append stream: `TO_CHANGELOG(input => TABLE passenger_state PARTITION BY \`key\`, op_mapping => MAP['INSERT, UPDATE_AFTER', 'UPSERT'])`.
  2. `sql/27` keeps "the first time their connection turns HIGH". It filters `WHERE risk = 'HIGH'`, groups by key with `MIN($rowtime)`, then forwards only INSERTs: `TO_CHANGELOG(input => TABLE first_high PARTITION BY \`key\`, op_mapping => MAP['INSERT', 'FIRST_HIGH'])`.
  3. `sql/31` repeats that per group, so "the agent runs once per inbound flight and destination".

  This fires once **ever** per key, not once per crossing.
- **The pit lab is the opposite.** It calls the agent "on every row of `car_state`" (`docs/agentic-pit-decisions/walkthrough.md` L157 to L194).

---

## 3. Streaming agents: models, connections, syntax, filtering, cost

**Confluent-hosted Claude (no key):** `'provider' = 'confluent'` runs on "Amazon Bedrock on AWS ... You don't need an endpoint or API keys" (`ai/managed-model.html`).

- AWS families: "Anthropic Claude Opus, Sonnet, and Haiku". "In some regions, the available models vary".
- Exact ids come from `SHOW MODELS`.
- Ids that appear literally in the docs: `anthropic.claude-sonnet-4-6` (in `CREATE MODEL`), and `system.anthropic.claude-opus-4-8` (a direct `AI_COMPLETE` example).
- A Haiku id, and whether each id exists in us-east-1: unconfirmed. Run `SHOW MODELS` yourself.
- Sonnet 4.6 ran on Confluent Cloud in the quickstart workshop on 2026-10-28 (`demo-script-screens.md` L88). Its default region is us-east-1 (`docs/flight-disruptions/walkthrough.md` L89, per `research/confluent-quickstart-streamhouse.md`).
- Managed Model Inference is listed for AWS us-east-1 (`research/confluent-cloud-capabilities-2026-11.md` §3.1).

**Bring your own Anthropic key:** documented (`ai/ai-model-inference.html`):

```sql
CREATE CONNECTION `anthropic-connection` WITH ('type' = 'anthropic', 'endpoint' = 'https://api.anthropic.com/v1/messages', 'api-key' = '<your-claude-api-key>');
CREATE MODEL `anthropic-model` INPUT (`text` VARCHAR(2147483647)) OUTPUT (`output` VARCHAR(2147483647))
WITH ('provider' = 'anthropic', 'anthropic.connection' = 'anthropic-connection', 'anthropic.params.max_tokens' = '2048', 'task' = 'text_generation');
```

- The CLI also takes `--type "anthropic"` (`confluent-cli/current/command-reference/flink/connection/confluent_flink_connection_create.html`).
- The SQL `CREATE CONNECTION` page does not list `anthropic` among its types (`flink/reference/statements/create-connection.html`). This is a docs inconsistency. The how-to page and the 2026-03-03 release note support it.

**Syntax** (`flink/reference/statements/create-agent.html`, `flink/reference/functions/model-inference-functions.html`):

- `CREATE AGENT [IF NOT EXISTS] name USING MODEL m USING PROMPT '...' [USING TOOLS t1, t2] [COMMENT '...'] WITH (...)`. **Tools are optional.**
- `AI_RUN_AGENT(agent_name, prompt [, request_id] [, system_table] [, invocation_config])` returns `ROW<status, response>`, with status `SUCCESS` or `FAILED`.
- `ML_PREDICT(\`model\`, col [, MAP['async_enabled', .., 'client_timeout', 30, 'max_parallelism', .., 'retry_count', 2]])`.
- `AI_COMPLETE(model_name, input_prompt [, invocation_config])`. This also accepts `` `system.anthropic.<model>` `` with no `CREATE MODEL` (`ai/managed-model.html`).
- All are called as `LATERAL TABLE(...)`.

**Status.**

- Streaming Agents went GA on 2026-05-19 (`release-notes/index.html`).
- Reflection workflows and system log tables were Open Preview as of 2026-04-20 (same page).
- `AI_TOOL_INVOKE` "is available for preview" (`model-inference-functions.html`).
- The functions above have no status label.
- `TO_CHANGELOG` went GA on 2026-08-17 (`release-notes/index.html`).

**Cost.**

- The statement bills CFUs ("minimum of 1 CFU-minute", `billing/dimensions/flink.html`).
- The pool rejects new statements past `MAX_CFU` (same page).
- **No published per-token or per-call price was found** for Managed Model Inference or Streaming Agents. The docs, the pricing page and a web search turned up none. Unconfirmed.
- With your own key, Anthropic bills you directly.
- The quickstart observed "about 40 s per flight and destination, one after another" per agent run (`demo-script-screens.md` L103).

**Run only on rows past a threshold?** Yes, by filtering before the `LATERAL TABLE`.

- A row that never reaches the lateral call is never sent to the model.
- The docs do not say this in words; it is standard correlated-join semantics.
- The quickstart depends on it: `sql/27` filters `WHERE risk = 'HIGH'` upstream, so `sql/31` calls the agent only for those rows.
- Put the filter in a CTE or subquery that feeds the lateral call.

---

## 4. Detecting a crossing once per crossing

All three standard tools need **append-only input**:

- "An OVER aggregation requires an append-only table as input" (`flink/reference/queries/over-aggregation.html`). `LAG` is an OVER function.
- "MATCH_RECOGNIZE requires an append-only table as input" (`flink/reference/queries/match_recognize.html`).
- In streaming mode, both must order by an ascending time attribute.

`client_exposure` is upsert, so none applies to it directly. **The supported route is `TO_CHANGELOG` first, then `LAG`.**

- `TO_CHANGELOG` "turns an updating table into an append-only stream" (`flink/reference/functions/changelog-conversion.html`).
- Materialise its output as an append table, as the quickstart does in `sql/26`.
- Then compare each change with the previous one per client, ordered by the staging table's `$rowtime`.

Sketch (not run):

```sql
-- stage: one append row per change in client_exposure
CREATE OR ALTER MATERIALIZED TABLE exposure_changes (
  client_id STRING NOT NULL, limit_util_pct DOUBLE, exposure_usd DOUBLE, limit_usd DOUBLE, as_of TIMESTAMP(3)
) DISTRIBUTED BY (client_id) INTO 2 BUCKETS
WITH ('changelog.mode' = 'append', 'key.format' = 'avro-registry', 'value.format' = 'avro-registry')
START_MODE = FROM_NOW
AS SELECT client_id, limit_util_pct, exposure_usd, limit_usd, as_of
FROM TO_CHANGELOG(input => TABLE client_exposure PARTITION BY client_id,
                  op_mapping => MAP['INSERT, UPDATE_AFTER', 'UPSERT']);

-- escalate: upward crossings only, then the agent (CREATE TABLE client_escalations first; append)
INSERT INTO client_escalations
WITH crossings AS (
  SELECT client_id, limit_util_pct, as_of FROM (
    SELECT client_id, limit_util_pct, as_of,
           LAG(limit_util_pct) OVER (PARTITION BY client_id ORDER BY $rowtime) AS prev_pct
    FROM exposure_changes)
  WHERE limit_util_pct >= 90 AND (prev_pct IS NULL OR prev_pct < 90)
)
SELECT c.client_id, c.limit_util_pct, c.as_of, r.response
FROM crossings c,
LATERAL TABLE(AI_RUN_AGENT('exposure_escalation_agent',
  CONCAT('client ', c.client_id, ' is at ', CAST(c.limit_util_pct AS STRING), '% of limit'), c.client_id)) AS r(agent_status, response);
```

What is unconfirmed in this sketch:

- **`ORDER BY $rowtime`** relies on the default `SOURCE_WATERMARK()` on `$rowtime` (release note 2026-03-02).
- **The output waits for the watermark.** That note gives a 180 ms out-of-orderness tolerance and a 10 s idle timeout. Expect seconds of extra delay on a quiet bucket, and rehearse it.
- **`LAG` and `AI_RUN_AGENT` in one statement** is unconfirmed. The quickstart splits work across statements.

The alternatives:

- **MATCH_RECOGNIZE.** It runs on the same append stage: `PATTERN (B A) DEFINE B AS limit_util_pct < 90, A AS limit_util_pct >= 90`. It is supported, with known limits: event time only, no greedy last variable, no `PREV`/`NEXT` offsets (`match_recognize.html`; `research/confluent-agent-skills/flink-ref-sql-patterns-cc.md` L192). A client already above the line at start never matches `B`. It is more SQL for the same result.
- **The quickstart pattern** (filter, `GROUP BY` key with `MIN($rowtime)`, then `TO_CHANGELOG` keeping `INSERT` only). It is proven on Confluent Cloud, but it fires once per client **ever**. That meets issue 16 only if each client crosses at most once per run.
- **A process table function with state and timers.** PTFs went GA on 2026-06-25 (`release-notes/index.html`). This needs a UDF artifact, which is too much for two days.

---

## 5. Risks two days out

1. **Converting `client_exposure` touches the one table everything reads.** The Worker, the MCP agent and the Lightning Table all read it.
   - Adoption keeps the topic. But the `INSERT` must be stopped first, or two writers corrupt the upsert rows (`create-or-alter-materialized-table.html`).
   - State restarts from empty. `FROM_BEGINNING` rebuilds the sums by replaying `positions`.
   - During that catch-up, committed rows can show partial running totals. This is inferred: commits happen about once a minute while the replay runs.
   - The rebuild is complete only if `positions` retention still holds the seeded opening rows.
   - A key schema change would break the Lightning Table (`lightning-tables/limitations.html`).
   - `DROP MATERIALIZED TABLE` deletes the topic.
   - A failed evolution does not roll back.
2. **A rebuild upstream re-fires escalations.** Any replay of `client_exposure` (an evolution or `FROM_BEGINNING`) produces old values again in `exposure_changes`. `LAG` then sees fresh crossings and the agent runs again on history.
   - Start the stage and the agent statement `FROM_NOW`.
   - Never rebuild upstream after the agent is running.
   - The quickstart guards the same way with a time filter (`sql/27` L34).
3. **Latency stacks per hop.** Each Flink hop that a read-committed consumer reads adds up to about a minute, about 30 s on average (`research/confluent-cloud-demo-platform-2026-11.md` §3.6). The escalation path is the exposure write, the stage, the escalation write, then Lightning or the screen: about three hops plus model time. Expect one to three minutes from crossing to screen.
   - `'kafka.consumer.isolation-level' = 'read-uncommitted'` hints cut this, as `sql/25` does. They risk duplicates.
   - A duplicate change row gives `prev_pct = limit_util_pct`, so it does not create a false crossing. A duplicate escalation row is still possible. That reasoning is inferred.
4. **Agent edits need `DROP AGENT`.** `CREATE AGENT IF NOT EXISTS` keeps the old definition (`sql/30` L6). The agent statement has to be restarted after any edit.
5. **Ids and price are not verifiable from docs.** Run `SHOW MODELS` in us-east-1 before relying on an id. There is no rate card, so cost per call is unknown.
6. **The MCP tool path is CLI-only.** No Terraform for `mcp_server` connections (prior research). An escalation agent can skip tools entirely: put the row in the prompt.
7. **Statement budget.** Every materialized table and every INSERT is a running statement. The plan adds two or three to a pool capped at 30 CFU, so there is headroom (`billing/dimensions/flink.html`).
8. **No region gap for this stack.** Lightning, Flink and Managed Model Inference are all in AWS us-east-1 (`research/confluent-cloud-capabilities-2026-11.md` §3.1).

---

## Implications for the demo

- **Leave `03` + `20` running.** A materialized table gives the same topic, key and Lightning Table. Its benefit is evolvability, which a talk does not exercise.
  - If the slide should show the materialized table form, show `CREATE OR ALTER MATERIALIZED TABLE client_exposure (...) AS SELECT ...` as the idiomatic equivalent, and say it is the same topic.
  - Adopt it for real only if there is a full rehearsal window today. The steps: stop `20`, run `SHOW CREATE TABLE client_exposure`, paste the exact schema and distribution, `START_MODE = FROM_BEGINNING`, wait for catch-up, then verify a Lightning query.
- **For issue 16, copy the quickstart's proven pieces.**
  - Hosted `anthropic.claude-sonnet-4-6` through `'provider' = 'confluent'`: no key and no connection.
  - `CREATE AGENT` with no tools.
  - A `TO_CHANGELOG` append stage.
  - A `LAG` crossing filter feeding `AI_RUN_AGENT` in a `CREATE TABLE` + `INSERT`, all started `FROM_NOW`.
- **Build the narrative around the latency.** The escalation lands roughly one to three minutes after the crossing, not instantly.
- **Keep the server-side substitute** as the outcome issue 16 already allows, if `SHOW MODELS`, the crossing statement or rehearsal timing fails.
