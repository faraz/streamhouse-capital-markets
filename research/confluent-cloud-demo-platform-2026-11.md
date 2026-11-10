# Confluent Cloud as a Streamhouse Demo Platform — Primary-Source Research

Researched 2026-11-09. Sources are restricted to `docs.confluent.io`, `confluent.io` official pricing pages, the official Confluent CLI command reference, the Confluent Cloud release notes, and `github.com/confluentinc` (Terraform provider docs and CHANGELOG). Blog posts, Medium articles and third-party tutorials were deliberately excluded, which is why several dollar figures below are marked UNCONFIRMED even though numbers for them circulate widely.

Nothing here was executed against a live account. Every statement is what a primary document says, not what was observed.

Where a claim could not be sourced, it is labelled **UNCONFIRMED**. Where two primary Confluent pages disagree, both are quoted and the conflict is flagged rather than resolved.

---

## Bottom line for the demo

**The demo is buildable today on a personal account, on a Basic cluster, on AWS. But the freshness ladder is not the one in the brief, and one design assumption has to change.**

### What is confirmed buildable

| Pillar | Mechanism | Confirmed |
|---|---|---|
| Connect | Fully managed Datagen Source connector, or a plain producer | Yes |
| Stream | Kafka topics on a Basic cluster | Yes |
| Process | Confluent Cloud for Apache Flink, materialized tables | Yes, Basic cluster eligible |
| Govern | Schema Registry + Stream Governance (Essentials free, Advanced ~$1/hr) | Yes |
| Query | Lightning Tables (SQL/REST/CLI/JDBC/MCP) **and** Tableflow → Iceberg | Yes, both on Basic, both in AWS us-east-1 |

**Lightning Tables are real, documented, GA and self-serve.** There is no entitlement, allowlist or sales gate on enabling one. ([manage](https://docs.confluent.io/cloud/current/lightning-tables/manage.html), [limitations](https://docs.confluent.io/cloud/current/lightning-tables/limitations.html), [query-surface](https://docs.confluent.io/cloud/current/streamhouse/query-surface.html)). This is the single most important finding and it is **positive** — the brief's worry was unfounded. One caveat survives, on one page only: the RTCE billing page carries an Early Access note on *direct API querying without an agent* (§1.2).

### Three corrections that change the build

**1. The brief's "Lightning Table, ~60s refresh" is wrong in both directions.** The docs say the opposite:

> "Confluent Cloud updates the Lightning Table within **100 milliseconds** of new data arriving in the topic."
> — [lightning-tables/overview](https://docs.confluent.io/cloud/current/lightning-tables/overview.html)

There is **no documented 60-second refresh interval for Lightning Tables, and no documented refresh interval of any kind.** The minute comes from somewhere else entirely:

> "Flink statements write to Kafka by using transactions. Flink commits transactions **approximately every minute**." … "each statement whose output a consumer reads typically adds up to roughly one minute of latency"
> — [flink/concepts/delivery-guarantees](https://docs.confluent.io/cloud/current/flink/concepts/delivery-guarantees.html)

So the honest middle rung is: **a Lightning Table over a Flink-computed topic is ~1 minute behind the source events (Flink's exactly-once commit) and answers in under a second.** Time-to-answer and age-of-answer are two different numbers, and the deck/demo should say both. Confluent's own Streamhouse quick start observes this: "Within about a minute, both connecting passengers are at risk." ([streamhouse/quick-start](https://docs.confluent.io/cloud/current/streamhouse/quick-start.html))

That minute is reducible to **below 100 ms** at the cost of exactly-once, with a documented table option: `'kafka.consumer.isolation-level' = 'read-uncommitted'` (§3.6). That is a genuinely demo-able lever: flip it live and the clock changes.

**2. Lightning Tables cannot compute the aggregate.** A Lightning Table query is single-topic, read-only, and rejects joins, aggregates and GROUP BY:

> "A Lightning Table query runs read-only SQL on **a single Lightning Table**." … "It doesn't support the following operations: Aggregate functions (COUNT, SUM, AVG, MIN, MAX) / GROUP BY clauses / Joins / Subqueries / Set operators / DDL statements / DML statements"
> — [query/sql-reference](https://docs.confluent.io/cloud/current/lightning-tables/query/sql-reference.html)

So the client's aggregate exposure across several source topics **must be computed by Flink** into a single output topic, and the Lightning Table is enabled on *that* topic. `WHERE`, `ORDER BY` and `LIMIT` are supported, so a point lookup by client and a "worst N clients" scan both work.

**3. The "age stamp" must be a column Flink writes.** Lightning cannot compute it. Carry `MAX($rowtime)` (or similar) as an explicit column in the Flink statement. `$rowtime` is a system column, is "exactly the Kafka record timestamp", and is **not returned by `SELECT *`** ([create-table, System columns](https://docs.confluent.io/cloud/current/flink/reference/statements/create-table.html)).

### The real freshness ladder, as documented

| Rung | Documented number | Source |
|---|---|---|
| Kafka consumer in a backend | no published figure; native protocol | — |
| Flink → Kafka, exactly-once (default) | "approximately every minute"; "about 30 seconds on average" per hop | [delivery-guarantees](https://docs.confluent.io/cloud/current/flink/concepts/delivery-guarantees.html) |
| Flink → Kafka, `read-uncommitted` | "below 100 ms", at-least-once | same |
| Lightning Table materialization | "within 100 milliseconds of new data arriving in the topic" | [lightning-tables/overview](https://docs.confluent.io/cloud/current/lightning-tables/overview.html) |
| Lightning Table query response | "sub-second"; "a result in less than a second" | [query/overview](https://docs.confluent.io/cloud/current/lightning-tables/query/overview.html) |
| Tableflow → Iceberg | "approximately every 5 minutes" | [tableflow/overview](https://docs.confluent.io/cloud/current/topics/tableflow/overview.html) |

### What is not buildable, or needs care

- **The browser cannot read Kafka, and the Kafka REST API cannot help.** The Confluent Cloud Kafka REST API v3 **cannot consume records** — this is stated as an `Important` admonition in the docs (§4). A backend service is mandatory.
- **CORS on the Lightning Tables SQL endpoint is UNCONFIRMED** — no Confluent page says anything either way. Independent of CORS, the endpoint authenticates with a **Global API key in an HTTP Basic header**, which must never reach browser JS. A serverless route holding the credential is the only safe pattern.
- **CSFLE requires Stream Governance Advanced** (~$1/hour, which is ~$24/day standing cost — the largest confirmed recurring charge in the whole footprint).
- **Flink CFU, Tableflow and Stream Governance per-schema/per-rule dollar rates are not published on any primary source.** Only Lightning Tables publishes exact rates. Budget from the Console, not from docs.
- **Three things cannot be done in Terraform**: a Flink `mcp_server` connection, a Global API key, and inline schema authoring during Console enablement of a Lightning Table (§6).

---

## Deltas from the official quickstart

Confluent publishes a reference implementation, `confluentinc/quickstart-streamhouse` (Apache-2.0), read locally at commit `04cd65e`. Where its approach and the current official docs disagree:

| # | Quickstart says / does | Current docs say | Verdict |
|---|---|---|---|
| D1 | SQL endpoint is `https://sql.{region}.{cloud}.confluent.cloud/query/**v1alpha1**` | The documented path is **`/query/v1`**. The string `v1alpha` appears nowhere in the Lightning Tables doc set. ([query/api](https://docs.confluent.io/cloud/current/lightning-tables/query/api.html)) | **Quickstart is stale.** Use `/query/v1`. |
| D2 | Cluster type is **Standard** SINGLE_ZONE (Dedicated optional) | **Basic qualifies** for Lightning Tables, Tableflow and Flink. "Lightning Tables are available on the following cluster types on AWS: Basic / Standard / Enterprise / Dedicated" ([limitations](https://docs.confluent.io/cloud/current/lightning-tables/limitations.html)); Tableflow and Flink are Yes for all five cluster types ([regions](https://docs.confluent.io/cloud/current/get-started/regions.html)) | **Standard is not the floor.** Basic is cheaper and sufficient. |
| D3 | "AWS-only by design (RTCE + Flink Native Inference are AWS-only)" | **Half right.** Lightning Tables / RTCE **are** AWS-only, 10 regions. But Managed Model Inference is **not** AWS-only: "Confluent Cloud for Apache Flink now supports managed AI models in compute pools that run on AWS, Azure, and Google Cloud." (release note 2026-10-23) | AWS-only constraint is driven by Lightning Tables alone. |
| D4 | Calls the hosted-model feature **"Flink Native Inference"** | That name **does not exist** in Confluent's docs. The documented feature is **"Managed Model Inference"** ([ai/managed-model](https://docs.confluent.io/cloud/current/ai/managed-model.html)) | **Quickstart coins a name.** Use Confluent's. |
| D5 | Tableflow lands Iceberg in a **customer-owned S3 bucket** (`byob_aws`) with a Glue catalog integration | A **Confluent Managed Storage** option exists and needs no bucket and no IAM at all: "There are no additional configurations required to use Confluent Managed Storage with Tableflow." ([configure-storage](https://docs.confluent.io/cloud/current/topics/tableflow/how-to-guides/configure-storage.html)) | **A whole AWS account requirement is avoidable.** Trade-off: managed storage is Iceberg-only and does not sync to external catalogs. |
| D6 | "Flink commits … **once a minute**" | Docs say "**approximately** every minute". No documented 60-second constant, and no user-settable commit interval (the SET options table has none). | Reword; do not quote 60s as a constant. |
| D7 | `passenger_state` is "read uncommitted" | The mechanism is real but the **option name matters**: `'kafka.consumer.isolation-level' = 'read-uncommitted'`. There is no `scan.isolation-level`; setting it fails with `Unsupported options found`. Cannot be set via `SET` for a session — per table, per `ALTER`, or per query hint. | **Would break as written** if the wrong key is used. |
| D8 | Lightning query limits: "at most 200 rows … OFFSET, COUNT, GROUP BY rejected" | The **200-row and 20-second limits are MCP-only**. "A Lightning Table query that you run through the API has no row limit." The CLI defaults to 100 rows in `-o human`. | Quickstart over-generalises an MCP limit. |
| D9 | Stream Governance package **ADVANCED** on the environment | Advanced is needed only for data rules, CSFLE, business metadata, the GraphQL API and 7-day lineage. **Tags and Data Portal are in Essentials.** Advanced is "starting at $1/hour" and **cannot be downgraded** — the only exit is deleting the environment. | **Do not enable Advanced unless CSFLE or data rules are actually demoed.** |
| D10 | Flink compute pool `max_cfu = 20` | Valid values are `5, 10, 20, 30, 40, 50`; CLI default is `5`. Billing is on CFUs consumed by running statements, not pool size — "you're charged only for the minutes when your statements are running." One primary page (the Flink FAQ) contradicts this (§3.3). | `max_cfu = 5` is enough for a small demo; pool size is a ceiling, not a reservation. |
| D11 | RTCE exposes three generic MCP tools | **Confirmed exactly**: `listTopics`, `getMetadata`, `queryData`. "The Real-Time Context Engine is the Model Context Protocol (MCP) server for Lightning Tables." No per-question custom tools. | Confirmed. Tool set is fixed. |
| D12 | Lightning Table changes show "within seconds"; Flink output lags a minute | Confirmed in substance, with better numbers: 100 ms for Lightning materialization, ~1 min for the Flink hop. | Confirmed, sharpen the numbers. |
| D13 | Terraform in `terraform/core/`, plus CLI for the Global API key and for enabling Lightning Tables | **The provider does cover Lightning Tables** — as `confluent_rtce_topic` (GA, added in provider 2.73.0). Searching the provider for "lightning" finds nothing. The Global API key genuinely has no Terraform resource. | **Provider gap is narrower than the quickstart implies.** |
| D14 | `CREATE MODEL / CREATE TOOL / CREATE AGENT / AI_RUN_AGENT` with `'confluent.model' = 'anthropic.claude-sonnet-4-6'` | All four statements exist in the official Flink SQL reference. **Streaming Agents are GA as of 2026-05-19.** The model id is confirmed verbatim in the docs. But a full id catalogue is not published — "Run `SHOW MODELS` to see the available models." | Confirmed. |
| D15 | No CDC anywhere; one Webhooks source connector | Eleven fully managed CDC source connectors exist; three V1 Debezium ones are **End of Life**. Postgres CDC V2 is one task max and its task-hour price is **"Contact us"**. | Quickstart gap is real; see §7. |

---

## 1. Lightning Tables

### 1.1 They exist, are documented, and are self-serve

The feature has a full documentation tree under `docs.confluent.io/cloud/current/lightning-tables/`. Prerequisites to enable one, verbatim from [manage](https://docs.confluent.io/cloud/current/lightning-tables/manage.html):

> - A Basic, Standard, Enterprise, or Dedicated cluster on AWS in a supported region.
> - An Apache Kafka® topic.
> - A schema for the topic (Avro, Protobuf, or JSON Schema)…
> - At minimum, the CloudClusterAdmin role or the ResourceOwner role on the topic.
> - A Cloud API key for CLI access.
> - A Cloud API key or Global API key for Terraform access.

That is a role check and a schema. **No entitlement, no allowlist, no preview enrolment, no "contact your account team", and no phased-rollout language appears anywhere in the Lightning Tables doc set.** This was checked by grep across all the Lightning Tables, Streamhouse, RTCE and billing pages for `phased`, `rollout`, `allowlist`, `entitle`, `enroll`, `contact your account team` — zero hits. For contrast, the same release-notes entry that announces Lightning Tables *does* say "To request access, contact your Confluent account team" about a different feature (Cluster Linking Automatic Failover), so Confluent does use that language when it applies.

Corroborating evidence that this is a public, priced, self-serve product: it has published list prices in its own billing docs (§8), a GA-badged Terraform resource, GA-badged OpenAPI metadata, and a CLI command group.

### 1.2 The one surviving gate

[billing/dimensions/rtce](https://docs.confluent.io/cloud/current/billing/dimensions/rtce.html) (last updated 2026-11-03) carries:

> **Note** — Direct API access, issuing a lightning query yourself without an AI agent, is an Early Access Program feature in Confluent Cloud.

…with standard EA boilerplate and a link to a sign-up form at `events.confluent.io/early-access-flink-features`.

**This note is contradicted by two other primary sources**: the API page itself ([query/api](https://docs.confluent.io/cloud/current/lightning-tables/query/api.html), same date) carries no EA banner, and the 2026-11-04 release note announces API querying with no caveat at all. Assessment: the note is probably stale, left over from the 2026-08-18 Early Access milestone. **Treat it as a thing to verify in the Console** — it is the only documented reason the SQL API might not work on a fresh account.

### 1.3 GA status and dates

The brief's "GA 2026-11-04" is approximately right but the history matters. All quotes from [release notes](https://docs.confluent.io/cloud/current/release-notes/index.html):

- **2025-10-29** — "The Real-Time Context Engine with Confluent Intelligence is available for **early access**."
- **2026-05-19** — "The Real-Time Context Engine is now **generally available**. … You enable the Real-Time Context Engine on a topic, and your agents can immediately query the most current data."
- **2026-08-18** — "You can now query the same data the Real-Time Context Engine queries for AI agents directly through an API, without an agent, as an **Early Access Program** feature. … you issue a *lightning query*…"
- **2026-10-19** — OAuth sign-in to managed MCP servers including the RTCE server.
- **2026-11-04** — "With Lightning Tables, you can query the data in an Apache Kafka® topic with SQL and get sub-second response times. Query a Lightning Table from the Confluent Cloud Console, the Confluent CLI, an API, a JDBC client, or an AI agent over the Model Context Protocol (MCP)."

The 2026-11-04 entry carries **no lifecycle qualifier**, while sibling bullets in the same dated entry explicitly say "now available as a Limited Availability feature". In Confluent's house style that omission means GA.

Independent confirmation of GA: [streamhouse/query-surface](https://docs.confluent.io/cloud/current/streamhouse/query-surface.html) has an **Availability** column reading `Generally available` for the Lightning Tables row and for the "MCP and the Real-Time Context Engine" row.

**Reconciliation:** Lightning Tables is the rename and productisation of the RTCE "rtce-topic". All the machinery still says `rtce` — CLI `confluent rtce rtce-topic`, Terraform `confluent_rtce_topic`, REST `rtce/v1/rtce-topics`, metrics `io.confluent.rtce/*` — and old doc URLs 301-redirect to the new tree. The feature GA'd as RTCE on **2026-05-19**; the whole surface was renamed and extended with Console + CLI + JDBC on **2026-11-04**.

### 1.4 Clouds, regions, cluster types

**AWS only.** [limitations](https://docs.confluent.io/cloud/current/lightning-tables/limitations.html):

> Lightning Tables are available on the following cluster types on AWS:
> - Basic
> - Standard
> - Enterprise
> - Dedicated

**Basic qualifies.** [access-control](https://docs.confluent.io/cloud/current/lightning-tables/access-control.html) reinforces it: "It works on all supported cluster types, including Basic and Standard clusters." Freight is not listed.

[get-started/regions](https://docs.confluent.io/cloud/current/get-started/regions.html) has rows for both `Lightning Tables` and `Real-Time Context Engine`, and they are identical. Rows appear only under the AWS region table — no row in the Azure, Google Cloud, AWS GovCloud or Jio Cloud tables. `Yes` in **10 regions**:

`us-east-1`, `us-east-2`, `us-west-2`, `ap-northeast-2`, `ap-southeast-2`, `ap-south-1`, `ap-southeast-1`, `eu-central-1`, `eu-west-1`, `eu-west-2`.

**`us-east-1` is supported.** No Middle East or Africa region is.

### 1.5 How one is created

Four paths, all from [manage](https://docs.confluent.io/cloud/current/lightning-tables/manage.html):

**Console** — three entry points, all opening the same dialog: the Lightning Tables page (`Add Lightning Table`), the Topics page (`+ Enable` in the Lightning Tables column), or topic → Settings → `Enable Lightning Table`.

**CLI** (requires CLI 4.82.0+ for querying; the create command landed in 4.62.0):
```
confluent rtce rtce-topic create \
  --cloud aws --region us-east-1 \
  --topic-name <topic> --description "<description>"
```
All four flags are marked REQUIRED in the [command reference](https://docs.confluent.io/confluent-cli/current/command-reference/rtce/rtce-topic/confluent_rtce_rtce-topic_create.html); `--cloud` accepts only `aws`. Note `create` takes no positional argument — the topic comes from `--topic-name`. Optional `--wait` and `--timeout` (default `1h0m0s`).

**REST** — confirmed as the brief guessed: `POST https://api.confluent.cloud/rtce/v1/rtce-topics`, HTTP Basic, body `{"spec": {cloud, description, environment.id, kafka_cluster.id, region, topic_name}}`, returns 202. Also `GET`, `DELETE`, and `PATCH` (description only). OpenAPI metadata: `x-lifecycle-stage: General Availability`.

**Terraform** — `confluent_rtce_topic`, badged General Availability, added in provider **2.73.0 (2026-05-14)**: "Added the `confluent_rtce_topic` resource and data-source to support the Real Time Context Engine feature on AWS." All six arguments are Required: `cloud`, `description`, `environment{id}`, `kafka_cluster{id}`, `region`, `topic_name`. Import ID `<env>/<lkc>/<topic_name>`. ([resource doc](https://github.com/confluentinc/terraform-provider-confluent/blob/master/docs/resources/confluent_rtce_topic.md))

**SQL DDL: none.** There is no `CREATE LIGHTNING TABLE`; the SQL surface explicitly rejects DDL.

**Two Console-only edges**: enabling a Lightning Table for a topic that has *no* schema (the Console prompts you to author and register one inline — no CLI/API equivalent is documented), and conversely a table **description cannot be edited in the Console** ("You can't edit a table description in the Cloud Console") — that needs PATCH, CLI or Terraform.

### 1.6 Prerequisites and provisioning

- **Schema required.** "To enable a Lightning Table for a topic, the topic must have a registered schema in Avro, Protobuf, or JSON Schema format."
- **Unsupported types block enablement entirely**: `INTERVAL YEAR TO MONTH`, `INTERVAL DAY TO SECOND`, `MULTISET`, `TIMESTAMP WITH TIME ZONE`, `RAW`. "If your topic schema uses an unsupported data type, you can't enable a Lightning Table for that topic." Also `TIME` precision 0 only, `TIMESTAMP`/`TIMESTAMP_LTZ` precision 0–6.
- **Upsert vs append is automatic, not configurable**: "The topic's `cleanup.policy` must include `compact`. Topics with the default `delete` policy use append mode."
- **Upsert needs a record key**: "The topic must have a Kafka record key, which the Lightning Table uses as the primary key for deduplication." Key schema changes are unsupported. Tombstones delete a key; last-write-wins.
- **Provisioning**: "Enabling a Lightning Table takes several minutes." Statuses `Pending` → `Provisioning` → `Active`, plus `Unavailable`, `Failed`, `Deleting`. "You can query a Lightning Table only when its status is Active."
- **Retention is decoupled** — useful for a demo: "The Lightning Table persists independently of the topic's retention policy. As a result, a Lightning Table query can return data that has already aged out of the topic."
- **Topic size / partition ceilings: UNCONFIRMED.** None documented.

### 1.7 Refresh interval

Covered in the Bottom line. To restate the two facts that matter:

- **100 ms, verbatim, on two pages**: "Confluent Cloud updates the Lightning Table within 100 milliseconds of new data arriving in the topic." ([overview](https://docs.confluent.io/cloud/current/lightning-tables/overview.html), [query/overview](https://docs.confluent.io/cloud/current/lightning-tables/query/overview.html))
- **There is no documented 60-second refresh interval.** Exhaustive grep for `60 second`, `refresh interval`, `every minute`, `commit interval`, `checkpoint` across the Lightning Tables, Streamhouse, RTCE and billing pages returns only the 100 ms / sub-second statements, plus one `Table freshness` link that belongs to Tableflow.
- **Whether a Lightning Table reads its backing topic `read_committed` or `read_uncommitted` is UNCONFIRMED** — no page states it. So "~1 minute for a Flink-computed topic" is a sound inference from two separate doc sets, but it is **not a quotable Confluent claim**. Treat it as the observed behaviour the quickstart reports, backed by the Flink commit-interval doc.

### 1.8 Single-topic only

Confirmed. "A Lightning Table query runs read-only SQL on **a single Lightning Table**." No joins, no subqueries, no set operators.

**Supported**: key lookups; `WHERE` with `=`, `!=`, `>`, `<`, `>=`, `<=`, `IN`, `NOT IN`, `IS NULL`, `IS NOT NULL`, `LIKE`, `NOT LIKE`, `BETWEEN`; `AND`/`OR`; column selection; `ORDER BY` asc/desc; `LIMIT`. Plus `SHOW TABLES` and `DESCRIBE <topic>` through the same endpoint.

**Rejected** (verbatim): aggregate functions (COUNT, SUM, AVG, MIN, MAX); GROUP BY; joins; subqueries; set operators (UNION, EXCEPT, INTERSECT); DDL; DML. "Confluent Cloud rejects an unsupported query without running it."

Topic naming: non-alphanumeric names need backticks (`` SELECT * FROM `web-orders` LIMIT 10; ``). "Quoted names are case sensitive, but unquoted names aren't." Unquoted column names come back uppercase.

### 1.9 Query interfaces

| Interface | Endpoint | Auth |
|---|---|---|
| Console | Lightning Tables page → `Query data` → **Preview Lightning Table** pane, tabs SQL / API / MCP | Console session. **Not available over private networking.** |
| **HTTP API** | **`https://sql.<region>.<cloud>.confluent.cloud/query/v1`** — e.g. `https://sql.us-east-1.aws.confluent.cloud/query/v1`. Single `POST`. Async status at `GET /query/v1/jobs/<env>/<lkc>/<topic>/<statement_id>/status` | "Requests to this endpoint use HTTP Basic authentication with a **Global API key**." Requires `DeveloperRead` on **both** the Kafka topic and the Schema Registry cluster. |
| CLI | `confluent lightning query --sql "…"` / `--file`, `--max-rows`, `-o human\|json\|yaml`. **Requires CLI 4.82.0+** | User account only: `confluent login`. "**It doesn't support signing in with an API key.**" Public endpoint only. |
| JDBC | `jdbc:confluent:lightning://`, host `sql.<region>.<cloud>.confluent.cloud`, driver class `io.confluent.jdbc.avatica.ConfluentJdbcDriver`, **Java 17+**. Same driver as for Flink JDBC | Global API key as user, secret as password. Flink-only properties such as `compute-pool-id` make the connection fail. |
| MCP (RTCE) | `https://mcp.<region>.aws.confluent.cloud/mcp/v1/context-engine/organizations/<org>/environments/<env>/kafka-clusters/<lkc>`, streamable HTTP | Global API key + Basic; or Confluent Cloud account OAuth browser flow; or OAuth 2.0 client credentials with an external IdP + identity pool via a `Confluent-Identity-Pool-Id` header. |

**Note the API path is `/query/v1`, not `/query/v1alpha1`.** The quickstart's `v1alpha1` does not appear anywhere in the current docs.

Response shape: "If the query resolves in under **10 seconds** and returns less than **4 MiB**, the response will be an inline HTTP 200 OK. Otherwise, a **202 Accepted** response redirects the client to retrieve results from a separate streamed data location." ([execute-query-v-1-statement](https://docs.confluent.io/cloud/current/ccloud/execute-query-v-1-statement/)). The presigned download takes **no** `Authorization` header — "If you include one, cloud storage rejects the request." Every response carries `X-Request-Id`. Error codes 400/401/403/404 (table not yet queryable — retry)/429/500.

### 1.10 Documented limits by interface

| Limit | Value | Scope |
|---|---|---|
| Max rows returned | **200** | MCP only |
| Query timeout | **20 s** | MCP only |
| Row limit | **none** | API: "A Lightning Table query that you run through the API has no row limit." |
| Sync → async switchover | 10 s or 4 MiB | API |
| Max result size | exists, value not published | **UNCONFIRMED** numerically |
| CLI wait | 2 minutes incl. retries, then fails; no async fallback | CLI |
| CLI default print | first 100 rows in `-o human`; `--max-rows 0` = no limit | CLI |
| CLI statement size | "up to about 1 MB" | CLI |
| Rate limits | **numbers UNPUBLISHED — UNCONFIRMED.** "Lightning Table queries through the API share a rate limit with the Real-Time Context Engine MCP tools… Requests from either count toward that limit." Exceed → MCP `RATE_LIMIT_EXCEEDED`, API `429`. Job-status requests don't count. | both |

JDBC: autocommit only, no batch execution, forward-only read-only result sets.

Monitoring metrics, filterable by `metric.topic`, need `MetricsViewer` ([monitor](https://docs.confluent.io/cloud/current/lightning-tables/monitor.html)): `io.confluent.rtce/compute_utilization/ccu_minutes`, `io.confluent.rtce/compute_utilization/dp_scanned_bytes`, `io.confluent.rtce/storage_utilization/storage_bytes`.

---

## 2. Tableflow

### 2.1 GA status

From [release notes](https://docs.confluent.io/cloud/current/release-notes/index.html):

| Milestone | Date | Wording |
|---|---|---|
| Iceberg, AWS | **2025-03-19** | "Tableflow for Apache Iceberg™ is now generally available in Confluent Cloud with AWS." |
| Upsert tables | 2025-10-02 | "Upsert tables for Tableflow are generally available." |
| Delta Lake | 2025-10-21 | "Delta Lake support for Tableflow is generally available." |
| Azure | **2026-01-21** | "Tableflow is now generally available on Azure." |
| Google Cloud | **2026-09-24** | "Tableflow is now generally available on Google Cloud." |

Not GA: client-side field-level encryption for Tableflow (Limited Availability, 2026-06-26), data TTL (LA, 2026-03-19), RecordName/TopicRecordName single-table materialisation (LA, 2026-09-10).

### 2.2 Clouds, regions, cluster types

[get-started/regions](https://docs.confluent.io/cloud/current/get-started/regions.html): the Tableflow row is **Yes for all five cluster types — Basic, Standard, Enterprise, Freight, Dedicated.** **Basic qualifies.** `us-east-1` is Yes.

Tableflow regions include AWS us-east-1, us-east-2, us-west-2, ca-central-1, sa-east-1, ap-east-1, ap-northeast-1/2, ap-southeast-1/2/3, ap-south-1, eu-central-1, eu-north-1, eu-south-1, eu-west-1/2/3, me-south-1, af-south-1, plus most Azure and Google Cloud regions. Not available on AWS GovCloud or Jio Cloud, and not available for self-managed Confluent Platform.

Networking caveat: "Privately networked clusters do not support Tableflow-enabled topics using Confluent-managed storage" ([overview](https://docs.confluent.io/cloud/current/topics/tableflow/overview.html)) — BYOS only in that case. Azure Private Endpoint to storage requires Enterprise or Dedicated. BYOK + Tableflow is narrower still (AWS Dedicated/Enterprise, Azure Dedicated only, nothing on GCP).

### 2.3 What the user must supply

**Confluent Managed Storage — nothing.** [configure-storage](https://docs.confluent.io/cloud/current/topics/tableflow/how-to-guides/configure-storage.html): "There are no additional configurations required to use Confluent Managed Storage with Tableflow." No bucket, no IAM, no AWS account. Constraints: Iceberg only (Delta requires BYOS), and "Iceberg data in Confluent Managed Storage can only be accessed with credentials vended by the Tableflow Iceberg REST Catalog." Managed storage **does not sync to external catalogs** — that is BYOS-only.

**AWS S3 (BYOS)** — your own empty bucket plus a Confluent **provider integration** backed by an IAM role. Documented minimum permissions: `s3:GetBucketLocation`, `s3:ListBucketMultipartUploads`, `s3:ListBucket` on the bucket; `s3:PutObject`, `s3:PutObjectTagging`, `s3:GetObject`, `s3:DeleteObject`, `s3:AbortMultipartUpload`, `s3:ListMultipartUploadParts` on objects. Cross-account buckets need a bucket policy; cross-account KMS needs `kms:Decrypt/Encrypt/ReEncrypt*/GenerateDataKey*/DescribeKey`. "Tableflow exclusively uses Amazon S3 Gateway endpoints." The bucket must be in the same region as the Kafka cluster.

**GCS** — empty bucket in the same region as the cluster (dual-region OK if it includes that region; multi-region unsupported), uniform bucket-level access, GCP provider integration with `storage.objects.get/list/create/delete` + `storage.folders.create` (or `roles/storage.objectUser`).

**Azure ADLS Gen2** — storage account with hierarchical namespace, empty container, provider integration, roles `Storage Blob Data Contributor` + `Reader`.

**Catalogs** — the built-in **Tableflow Iceberg REST Catalog** needs no setup. Optional catalog integrations: AWS Glue, Snowflake Open Catalog / Horizon, Databricks Unity Catalog, Apache Polaris. Glue additionally needs `ProviderIntegrationResourceOwner` or `ProviderIntegrationAssigner`.

**Schema Registry is mandatory.** [overview](https://docs.confluent.io/cloud/current/topics/tableflow/overview.html): Schema Registry is "the source of truth for table schemas"; Avro, Protobuf and JSON Schema supported; **both key and value must have a schema; schemaless topics are not supported.** Auto-handled evolution: add column, remove column, widen type (int→long).

### 2.4 Commit / freshness interval

> "Tableflow publishes new data to a table **approximately every 5 minutes**."
> — [tableflow/overview](https://docs.confluent.io/cloud/current/topics/tableflow/overview.html), restated on [streamhouse/query-surface](https://docs.confluent.io/cloud/current/streamhouse/query-surface.html)

Higher-throughput topics can commit sooner because Tableflow also commits when enough data accumulates. Snapshots: minimum 10, maximum 100 retained, **not user-configurable**. A snapshot is created "every time it commits a change to your table," including during maintenance such as compaction. Data TTL waits "up to 24 hours after at least one row in a Parquet file expires".

**No documented compaction interval and no documented end-to-end query latency figure.** The ~5 minute commit cadence is the only hard number. There is no Terraform or CLI setting to change it.

### 2.5 Minimum steps and permissions

Quick start prerequisites, verbatim ([quick-start-managed-storage](https://docs.confluent.io/cloud/current/topics/tableflow/get-started/quick-start-managed-storage.html)):

> - "DeveloperRead access on all schema subjects"
> - "CloudClusterAdmin access on your Kafka cluster"
> - "Assigner access on all provider integrations"

Steps: create topic → produce with a schema (Datagen, Avro) → enable Tableflow, choose Confluent storage → copy the REST Catalog endpoint and create a Tableflow-scoped API key → query.

Full RBAC matrix at [tableflow-rbac](https://docs.confluent.io/cloud/current/topics/tableflow/operate/tableflow-rbac.html). Enable on a topic: `ResourceOwner` on the topic + `DeveloperRead` on all schema subjects; or `CloudClusterAdmin` + `DeveloperRead` on schema subjects. Read table data: any of `OrganizationAdmin`, `EnvironmentAdmin`, `CloudClusterAdmin`, `ResourceOwner`, or cluster-scoped `DeveloperRead`.

CLI: `confluent tableflow topic enable <name> --storage-type MANAGED --table-formats ICEBERG` ([command reference](https://docs.confluent.io/confluent-cli/current/command-reference/tableflow/topic/confluent_tableflow_topic_enable.html)). `--storage-type` defaults to `MANAGED`; `--table-formats` defaults to `ICEBERG`; also `--error-handling` (SUSPEND/SKIP/LOG), `--log-target`, `--retention-ms` (default `604800000`). There is **no `--managed-storage` flag.**

Terraform: `confluent_tableflow_topic` with `table_formats = ["ICEBERG","DELTA"]` and one of `managed_storage {}`, `byob_aws { bucket_name, provider_integration_id }`, or `azure_data_lake_storage_gen_2 {...}`. Plus `confluent_provider_integration` (AWS only — "Currently only `aws` config is supported", so the GCP/Azure Terraform path is **UNCONFIRMED**) and `confluent_catalog_integration` (`aws_glue` or `snowflake`).

### 2.6 Querying without standing up an engine

Three answers, in order of friction:

**1. Flink snapshot queries — no external engine.** [query-with-flink](https://docs.confluent.io/cloud/current/topics/tableflow/how-to-guides/query-engines/query-with-flink.html): "Confluent Cloud for Apache Flink can read Tableflow tables only by using **snapshot queries**. Streaming queries can't read Tableflow tables." Prepend `SET 'sql.snapshot.mode' = 'now';` or use the Snapshot mode dropdown in the workspace. The query **unions** materialised Tableflow data with live Kafka data: "If Tableflow is enabled on a topic, the query reads the historical data that Tableflow has materialized into tables, unioned with the live streaming data in Kafka. This is true for both Confluent Managed Storage and custom storage (BYOS)." Only `AS OF NOW()` — no arbitrary point in the past. SQL hints are ignored in snapshot mode. Temporal joins (`FOR SYSTEM_TIME AS OF`) are rejected in batch/snapshot mode. You still need a Flink compute pool, but no third-party engine.

**2. DuckDB against the built-in REST catalog — lightest external client.** [query-with-duckdb](https://docs.confluent.io/cloud/current/topics/tableflow/how-to-guides/query-engines/query-with-duckdb.html). Works against Confluent Managed Storage. Needs `httpfs` + `iceberg` extensions, `CREATE SECRET … TYPE ICEBERG` with client id/secret/endpoint and `OAUTH2_SCOPE 'catalog'`, then `ATTACH 'warehouse' AS iceberg_catalog (TYPE iceberg, SECRET iceberg_secret, ENDPOINT '<url>');` and `SELECT * FROM iceberg_catalog."lkc-abc123"."test-topic-123" LIMIT 10;`. **Documented live-demo hazards**: the DuckDB Iceberg extension is "experimental"; ENDPOINT must be given twice; and **after ~30 minutes queries fail with HTTP 401** and you must restart the session, recreate the secret and re-attach.

**3. Built-in Iceberg REST catalog endpoint.** Format: `https://tableflow.<cloud_region>.aws.confluent.cloud/iceberg/catalog/organizations/<org_id>/environments/<env_id>` (substitute `gcp` for `aws` on Google Cloud). OAuth token URI is that endpoint + `/v1/oauth/tokens`. Needs endpoint + API key + secret.

**Documented engine integrations** ([overview](https://docs.confluent.io/cloud/current/topics/tableflow/how-to-guides/query-engines/overview.html)): AWS Athena (Trino SQL via `AwsDataCatalog`), Athena for Spark, Redshift, EMR — all via **Glue**, which means **BYOS**, so Athena is not available on managed storage. Also Snowflake, Trino, DuckDB, Databricks via Unity Catalog (Delta). Tables are exposed read-only. **BigQuery and standalone Spark are named in prose but have no dedicated how-to page — UNCONFIRMED as first-class integrations.**

Gotcha worth knowing: the metadata column naming setting "doesn't rename user-defined columns," so engines that reject `$` or `-` in column names still cannot query those tables.

### 2.7 Pricing

Two dimensions, **no published rates** ([billing/dimensions/tableflow](https://docs.confluent.io/cloud/current/billing/dimensions/tableflow.html)):

- **Topic-hours** — "assessed for each topic and each hour that you have Tableflow enabled." Enabling both Iceberg and Delta on one topic is one charge.
- **GB-processed** — GB read by Tableflow, "including the data processed for the initial materialization and for compaction." Upsert mode adds recurring index charges that grow with index size.

Line items: `TABLEFLOW_NUM_TOPICS`, `TABLEFLOW_DATA_PROCESSED`, `TABLEFLOW_INDEX_DATA_PROCESSED`. Confluent Managed Storage is billed separately on stored data, read/write request counts and transfer (same-region transfer is free).

The docs say "For current prices, see the Confluent Cloud pricing page." The pricing page says only "use of Tableflow is billed based on number of topics ($/hr) and data processed ($/GB)" and defers to the Cost Estimator. **UNCONFIRMED: no Tableflow dollar rate exists on any primary source.**

**Demo-relevant shape:** the topic-hour component accrues for every hour Tableflow is enabled, **even with no data flowing.** Disable it after the demo.

---

## 3. Flink on Confluent Cloud

### 3.1 Creating a compute pool

[create-compute-pool](https://docs.confluent.io/cloud/current/flink/operate-and-deploy/create-compute-pool.html)

- **UI**: Environments → environment → Flink → Compute pools → Create compute pool → region → name + Max CFUs.
- **CLI**: `confluent flink compute-pool create <name> --cloud aws --region us-east-1 [--max-cfu 5] [--environment env-xxx]`. `--cloud` and `--region` are REQUIRED; **`--max-cfu` defaults to 5**. ([command reference](https://docs.confluent.io/confluent-cli/current/command-reference/flink/compute-pool/confluent_flink_compute-pool_create.html))
- **REST**: `POST https://api.confluent.cloud/fcpm/v2/compute-pools`, **Cloud API key** (not a Flink key), Basic auth. Body: `spec.display_name`, `spec.cloud`, `spec.region`, `spec.max_cfu`, `spec.environment.id`.
- **Terraform**: `confluent_flink_compute_pool` (GA). `max_cfu` accepted values are exactly `5, 10, 20, 30, 40, 50`. ID format `lfcp-abc123`.

RBAC: `OrganizationAdmin`, `EnvironmentAdmin` or `FlinkAdmin` to create a pool; `FlinkDeveloper` suffices to run statements in an existing one.

You can raise Max CFUs later but **"you can't decrease Max CFUs."**

You may not need a pool at all: "If you don't create one, Flink automatically uses a default pool in your environment and region." ([flink/overview](https://docs.confluent.io/cloud/current/flink/overview.html))

### 3.2 Regions and the same-region rule

**Flink must be in the same cloud and region as the Kafka cluster.** [compute-pools](https://docs.confluent.io/cloud/current/flink/concepts/compute-pools.html): "A compute pool is provisioned in a specific region" and "The statements using a compute pool can only read and write Apache Kafka® topics in the same region as the compute pool." [flink/overview](https://docs.confluent.io/cloud/current/flink/overview.html): Flink "is a regional service"; Confluent Cloud "doesn't allow you to query across regions."

Flink is available on AWS, Azure and Google Cloud, Yes for all five cluster types. AWS regions where it is **not** available: ca-west-1, ap-northeast-3, ap-southeast-4, ap-south-2, ap-southeast-5, eu-central-2, eu-south-2, me-central-1, il-central-1. **`us-east-1` is supported.**

### 3.3 Cost at idle — the docs contradict themselves

**The billing dimensions page says usage-based** ([billing/dimensions/flink](https://docs.confluent.io/cloud/current/billing/dimensions/flink.html)): usage is measured per minute, reported in CFU-hours. "Each Flink statement consumes a minimum of 1 CFU-minute but can consume more depending on the needs of the workload." Billed "on actual CFU usage per minute, not provisioned capacity", and **"you're charged only for the minutes when your statements are running."** One exception: **"A statement with a Baseline CFU is billed for at least that many CFUs even when it's idle."** Also "Confluent charges you for the CFUs your statements consume while they run, not for the size of the pool."

**The FAQ page says provisioned-capacity** ([flink-faq](https://docs.confluent.io/cloud/current/flink/flink-faq.html)): "Billing is based on the number of CFUs provisioned in your compute pools and the duration for which they are running."

**Reconciliation**: [compute-pools](https://docs.confluent.io/cloud/current/flink/concepts/compute-pools.html) says "A compute pool without any running statements scales down to zero," which supports the billing-dimensions reading. **Assessment: an idle pool with zero statements and no baseline CFUs costs nothing, and the FAQ sentence is loose wording.** But the FAQ is a primary source saying otherwise, so treat "idle pool is free" as **documented-but-contradicted** and verify on the first bill.

**The CFU dollar price is UNCONFIRMED.** The billing page says only "For current CFU prices, see the Confluent Cloud pricing page" and notes prices vary by region; the pricing page says Flink "is calculated based on CFUs ($/minute)" with no amount and defers to the Cost Estimator. The only published rate anywhere in the Flink docs is **external data transfer for external tables at $0.025/GB inbound and $0.025/GB outbound.** (A figure of "$0.21/CFU-hour" circulates; it was not on the page it is attributed to when fetched directly, so it is not reported here as fact.)

**Note for a continuously-running demo**: a materialized table or an `INSERT INTO` runs continuously and therefore bills continuously. "Idle pool is free" does not mean "a running pipeline is free."

### 3.4 Terraform, REST and CLI for statements

**Terraform: `confluent_flink_statement`** (GA). ([resource doc](https://github.com/confluentinc/terraform-provider-confluent/blob/master/docs/resources/confluent_flink_statement.md)) Args: `statement` (required), plus optional `organization{id}`, `environment{id}`, `compute_pool{id}`, `principal{id}`, `statement_name`, `rest_endpoint`, `credentials{key,secret}`, `properties` (e.g. `sql.current-catalog` = environment display name, `sql.current-database` = Kafka cluster display name), `stopped`.

Caveats that matter for a reproducible build:
- A **Flink API key is region-specific.**
- "To stop a running statement, no other argument can be updated except `stopped`."
- "Currently, only 3 Flink statements support the resume feature, namely: `CREATE TABLE AS`, `INSERT INTO`, and `EXECUTE STATEMENT SET`."
- `latest_offsets` / `latest_offsets_timestamp` are populated **only for stopped statements**.
- "Terraform doesn't encrypt the sensitive `credentials` value"; provider-level `flink_principal_id` silently takes precedence over the `principal` block.

**REST**: base `https://flink.<region>.<cloud>.confluent.cloud`; `POST|GET /sql/v1/organizations/<org>/environments/<env>/statements`, `DELETE .../statements/<name>`. Flink API key (Basic) or OAuth bearer. ([flink-rest-api](https://docs.confluent.io/cloud/current/flink/operate-and-deploy/flink-rest-api.html))

**CLI**: `confluent flink statement create [name] --sql "<SQL>" [--compute-pool lfcp-xxx] [--database <cluster id>] [--wait]`. `--sql` is REQUIRED. Subcommands: `create`, `delete`, `describe`, `exception`, `list`, `rescale`, `resume`, `stop`, `update`, `web-ui-forward`. ([command reference](https://docs.confluent.io/confluent-cli/current/command-reference/flink/statement/confluent_flink_statement_create.html))

Also available: `confluent_flink_compute_pool_config`, `confluent_flink_connection`, `confluent_flink_artifact`, and **`confluent_flink_materialized_table`** (GA, added in provider 2.71.0, 2026-04-30).

### 3.5 Stateful aggregation and joins

**Materialized tables** ([concepts](https://docs.confluent.io/cloud/current/flink/concepts/materialized-tables.html)) are the recommended shape for the demo's exposure pipeline: "a persistent, declarative object that combines a table definition, a continuous query, and the ability to evolve the pipeline over time." GA 2026-05-11. DDL: `CREATE MATERIALIZED TABLE`, `CREATE OR ALTER MATERIALIZED TABLE`, `ALTER`, `DROP`. Backed by a Kafka topic plus a Schema Registry subject. Since 2026-09-15 one "can now run on a Apache Kafka® topic that already exists".

**There is no `FRESHNESS` or refresh-interval clause in Confluent Cloud.** Zero hits for "freshness" across the materialized-table DDL pages. The grammar is:
```
CREATE MATERIALIZED TABLE [IF NOT EXISTS] [catalog.][db.]name
[( columns, watermark, constraints )]
[COMMENT c] [DISTRIBUTED BY (...) INTO n BUCKETS] [WITH (...)]
[START_MODE = <value>] AS <select_query>
```
`START_MODE` controls **reprocessing**, not freshness (default `RESUME_OR_FROM_BEGINNING`). Apache Flink upstream *does* have `FRESHNESS = INTERVAL '...'`; Confluent Cloud does not, and the Confluent dbt adapter explicitly fails on `freshness_interval`, `refresh_mode` and `partition_by`. **Do not use `FRESHNESS` on stage.**

**Joins** ([reference/queries/joins](https://docs.confluent.io/cloud/current/flink/reference/queries/joins.html)):
- **Regular streaming joins**: supported, INNER + LEFT/RIGHT/FULL OUTER, **equi-only** — "Only equi-joins are supported… Arbitrary cross or theta joins aren't supported." State grows without bound: "it requires keeping both sides of the join input in state forever."
- **Join order is not optimised**: "Tables are joined in the order in which they are specified in the FROM clause." A bad order yields a cross join and the query fails.
- **Interval joins**: supported; require append-only on both sides; produce append-only.
- **Temporal joins** (`FOR SYSTEM_TIME AS OF`): supported, **streaming mode only** — rejected in batch mode, which includes snapshot queries. Right side must be an updating table with a primary key.
- **`LATERAL SNAPSHOT` join**: the newer path for Kafka reference data. Only `JOIN` and `LEFT JOIN`; needs ≥1 equality in `ON`; outer table must be append-only; "Flink keeps the whole reference table in state". Set `load_completed_idle_timeout` for slow-changing reference data or the join can wait and accumulate state indefinitely.
- **Lookup joins**: against **external** tables only, via `LATERAL TABLE(KEY_SEARCH_AGG(...))` etc. Not a Kafka-topic lookup join.
- **`MULTI_JOIN` hint** exists but "Only `INNER JOIN` and `LEFT OUTER JOIN` are currently supported", all joins must share a common key, and "Queries that don't meet the criteria silently fall back to binary joins — always verify with EXPLAIN."
- **`JOIN ... USING (col)`: UNCONFIRMED.** It appears exactly once, in the Calcite BNF, which is self-declared as "the **superset** of supported SQL features". Zero worked examples anywhere. **Use `ON`.**
- **SEMI / ANTI joins outside a window: UNCONFIRMED** — documented only for window joins.

**Limits relevant to a small demo** ([statements](https://docs.confluent.io/cloud/current/flink/concepts/statements.html), [service-quotas](https://docs.confluent.io/cloud/current/quotas/service-quotas.html)):
- State per statement: soft limit **500 GB**, hard limit **1,000 GB**, both fixed and not scaling with CFUs. Irrelevant at demo scale. (The same page also calls 500 GB "the absolute global limit" — an internal contradiction; don't quote a single threshold.)
- Flink statements per cloud region: **10,000**. Compute pools per environment: **50**.
- Max CFUs per pool: **50**; practical maximum for a single statement is also 50.
- Admission is CFU-based: "If the size of the workload in a pool exceeds MAX_CFU, Confluent Cloud for Apache Flink rejects new statements." [Autopilot](https://docs.confluent.io/cloud/current/flink/concepts/autopilot.html) says "The maximum number of statements equals the CFU limit on the compute pool" — so on a `max_cfu = 5` pool expect roughly 5 concurrent statements. The concept pages don't repeat this, so treat the exact number as soft; **set `max_cfu = 10` if the demo runs more than a handful of statements.**
- **Foreground statements are STOPPED after 5 minutes with no consumer** — "If there is no consumer for the results of a foreground statement for five minutes or longer, Confluent Cloud moves the statement to the STOPPED state." This *will* bite a live demo where you run a `SELECT` then talk. Background statements (writing to a topic) are unaffected.
- Query text limit **4 MB**; statement name ≤ 100 chars, lowercase letters/digits/hyphens.
- Terminal-state statements retained 30 days.
- "Flink runs all queries in streaming execution mode, whether the sources are bounded or unbounded." There is no separate batch mode; batch-style work is snapshot processing.

### 3.6 The freshness lever

[delivery-guarantees](https://docs.confluent.io/cloud/current/flink/concepts/delivery-guarantees.html), verbatim:

> "Confluent Cloud for Apache Flink® provides exactly-once semantics end-to-end by default… Flink statements write to Kafka by using transactions. Flink commits transactions periodically, **approximately every minute**."
> "**Exactly-Once**: … each statement whose output a consumer reads typically adds up to roughly one minute of latency."
> "**At-Least-Once**: … set the Flink table option `'kafka.consumer.isolation-level' = 'read-uncommitted'`. With this configuration, depending on the logic of your query, you can **achieve an end-to-end latency below 100 ms**, but you can see some output messages twice."
> "each hop in the chain typically adds between zero and one commit interval of latency, **or about 30 seconds on average**."
> "Confluent is actively working on reducing the latency under exactly-once semantics."

The option is `kafka.consumer.isolation-level`, default `read-committed`. **It cannot be set for a session with `SET`** — only `CREATE TABLE … WITH (...)`, `ALTER TABLE … SET (...)`, or a query hint `/*+ OPTIONS('kafka.consumer.isolation-level' = 'read-uncommitted') */`. Hints are **ignored in snapshot mode**. "Statements that are already running keep the isolation level that they started with."

Documented hazards: "A hop that aggregates an append-only input, for example with `SUM` or `COUNT`, doesn't tolerate duplicates"; and duplicates leak — "A stateless hop that reads with `read-uncommitted` writes any duplicates to its output table, where they become committed messages that downstream statements read even with `read-committed`."

**No user-settable checkpoint or commit interval exists.** The complete [SET options table](https://docs.confluent.io/cloud/current/flink/reference/statements/set.html) has no checkpoint option. `sink.delivery-guarantee`, `sink.semantic` and `sink.transactional-id-prefix` are explicitly rejected: "Streaming writes are always transactional."

### 3.7 AI and agents (relevant to the risk agent)

- **Managed Model Inference** is the documented name; "Flink Native Inference" appears nowhere in Confluent's docs. "Managed Model Inference runs models on the cloud provider that hosts your compute pool: Amazon Bedrock on AWS, Vertex AI on Google Cloud, and Azure OpenAI on Azure… You don't need an endpoint or API keys." ([ai/managed-model](https://docs.confluent.io/cloud/current/ai/managed-model.html)) Supported on AWS, Azure and Google Cloud since the 2026-10-23 release note.
- Model families on AWS: Amazon Nova, Amazon Titan Text Embeddings, Anthropic Claude Opus / Sonnet / Haiku, OpenAI GPT-OSS Safeguard. **A complete id catalogue is not published** — "Run `SHOW MODELS` to see the available models, and use the name without the `system.` prefix as the `confluent.model` value." The id `anthropic.claude-sonnet-4-6` is confirmed verbatim in the `CREATE MODEL` reference. Models can also be called directly as `system.<provider>.<model>` with no `CREATE MODEL`.
- `CREATE MODEL`, `CREATE TOOL`, `CREATE AGENT`, `AI_RUN_AGENT`, `SHOW AGENTS` all exist in the official Flink SQL reference, none with a lifecycle banner. **Streaming Agents are GA as of 2026-05-19**: "Streaming Agents in Confluent Intelligence are now generally available." Supported models: "Anthropic / Gemini / OpenAI".
- `CREATE TOOL` options: `type` ('function' | 'mcp' | 'a2a', required), `allowed_tools` (MCP only, required), `request_timeout` (default '30').
- `CREATE AGENT` options: `max_consecutive_failures` (default 3), `max_iterations` (default 20); reflection workflows via `TYPE = 'REFLECTION'`.
- `AI_RUN_AGENT(agent_name, prompt [, request_id] [, system_table] [, invocation_config])` returns `ROW<String status, String response>`, used as a table function via `LATERAL TABLE(...)`.
- `ML_DETECT_ANOMALIES` / `ML_FORECAST` are **GA** (ARIMA-based, 2025-08-19). `AI_DETECT_ANOMALIES`, `AI_FORECAST`, `AI_DETECT_PII` are **Early Access Program** features, stated on their own pages. `AI_FORECAST` defaults to IBM Granite TTM (`'model' VALUE 'ttm'`) and also supports `timesfm-2.5`, `flowstate`, `patchtstfm`.
- **MCP connections**: `CREATE CONNECTION … WITH ('type' = 'mcp_server', 'endpoint' = '…', 'transport-type' = 'STREAMABLE_HTTP')` in Flink SQL, or `confluent flink connection create --type mcp_server --transport-type STREAMABLE_HTTP`. **`--transport-type` defaults to SSE**, so STREAMABLE_HTTP must be passed explicitly. **Terraform cannot do this**: `confluent_flink_connection` accepts only `OPENAI, AZUREML, AZUREOPENAI, BEDROCK, SAGEMAKER, GOOGLEAI, VERTEXAI, MONGODB, PINECONE, ELASTIC, COUCHBASE` — no `mcp_server`.
- `$rowtime`: "Currently, `$rowtime TIMESTAMP_LTZ(3) NOT NULL` is provided as a system column… `$rowtime` is exactly the Kafka record timestamp." **Not returned by `SELECT *`, not shown by `DESCRIBE`** — only by `DESCRIBE EXTENDED`. Qualification by table name with backticks is documented (`` orders.`$rowtime` ``); qualification by **alias is UNCONFIRMED**.

---

## 4. Reaching Kafka from a browser

### 4.1 The Kafka REST API v3 is available everywhere

> "The Kafka REST API (v3) is compatible with the Kafka REST Proxy v3 APIs and is **available by default on all Basic, Standard, Enterprise, Dedicated, and Freight Kafka clusters**."
> — [kafka-rest-cc](https://docs.confluent.io/cloud/current/kafka-rest/kafka-rest-cc.html)

Endpoint: `https://<REST-endpoint>/kafka/v3/clusters/<cluster-id>/...`.

### 4.2 It cannot consume records

This is stated as an `Important` admonition at the top of the page, verbatim:

> "The Kafka REST API for Confluent Cloud **can't currently consume records**. To consume records, use the Confluent Cloud Console Messages tab, the Confluent CLI, or a native Kafka client."

What it *can* do, verbatim: "The API lets you produce records to topics, create and configure topics, manage ACLs, and configure Cluster Linking."

Admin surface: list cluster info; list/create/delete topics; list/modify cluster and topic configuration; list/create/delete ACLs; "Listing information on consumer groups, consumers, and consumer lag **(for dedicated cluster only)**"; list partitions; manage Cluster Linking.

API reference confirmation: the Cloud **Records (v3)** reference contains exactly **one** operation, "Produce Records" ([records-v-3](https://docs.confluent.io/cloud/current/ccloud/records-v-3/)). The **Consumer Group (v3)** reference contains 7 operations, all metadata/lag, none returning records, and three are badged "Available in dedicated clusters only" ([consumer-group-v-3](https://docs.confluent.io/cloud/current/ccloud/consumer-group-v-3/)).

**Precision point worth getting right**: self-managed REST Proxy **v3 has no consume endpoint either** — consuming is the **v2** consumer-instance API (`GET /consumers/{group}/instances/{instance}/records`, [platform kafka-rest/api](https://docs.confluent.io/platform/current/kafka-rest/api.html)). Confluent Cloud exposes no v2 surface at all. So the accurate statement is: *Cloud v3 matches self-managed v3 for records (produce only); what Cloud lacks is the entire REST Proxy v2 surface, which is where consumption lives.*

**No long-poll.** "Streaming mode" in v3 is chunked HTTP POST (`Transfer-Encoding: chunked`) for **producing**, not a bidirectional or long-poll read.

### 4.3 Rate and size limits

Verbatim table, "Kafka REST Produce v3":

| Dimension | Basic | Standard | Enterprise | Dedicated | Freight |
|---|---|---|---|---|---|
| Max connection requests/sec | 25 | 25 | 25 | 75,600 † | 25 |
| Max streamed requests/sec | 1000 | 1000 | 1000 | 756,000 † | 1000 |
| Max message size (MB) | 8 | 8 | 8 | 20 | 8 |

† at 252 CKUs; scales linearly with CKUs. "Connection request limits are enforced per cluster and IP address for elastic cluster types."

Other documented behaviour: HTTP 429 can occur "even though the limit has not been exceeded" — documented mitigation is a `Connection: close` header. Compression is rejected: "you cannot transmit compressed records from clients to the Kafka REST Produce API… `Content-Encoding: gzip` is not supported." Streaming mode returns 200 once the connection is established, so you must check per-record `error_code`.

### 4.4 CORS — UNCONFIRMED

No Confluent primary source states anything about CORS, `Access-Control-Allow-Origin`, or browser use of the Confluent **Cloud** REST endpoint. Greps across the Cloud REST page for `cors`, `cross-origin`, `browser`, `javascript`, `websocket`, `proxy`: zero hits. The same is true of the Lightning Tables SQL endpoint docs.

What exists and is **not** Cloud: self-managed REST Proxy has an `access.control.allow.origin` config (Confluent Platform only, [rest-proxy/config](https://docs.confluent.io/platform/current/kafka-rest/production-deployment/rest-proxy/config.html)).

**Label: UNCONFIRMED.** Confluent neither documents CORS support nor documents its absence for Cloud endpoints. Treat browser-direct as unsupported-by-silence. A second, independent blocker applies regardless of CORS: both the Kafka REST API and the Lightning Tables SQL API authenticate with HTTP Basic over a long-lived API key (a **Global** API key for Lightning), which must not reach client-side JavaScript.

### 4.5 The sanctioned pattern

Confluent documents **no** official WebSocket or SSE path for Kafka, and **no** browser/BFF guidance. The documented use cases for the REST API are explicitly server-side: "serverless functions, CI/CD pipelines, shell scripts, or restricted environments where only HTTPS is permitted."

**That sentence is the closest thing to an endorsement of the Vercel serverless-route pattern**, and it is a good one: a serverless function is literally the first documented use case. The build should therefore be:

- A server-side route (Vercel function, or a small Node/Python service) holds the Global API key and the Kafka credentials.
- For the **stream face**, that service runs a native Kafka consumer and pushes to the browser over WebSocket or SSE. There is no documented alternative — the REST API cannot consume.
- For the **Lightning Table face**, the same route proxies `POST https://sql.<region>.aws.confluent.cloud/query/v1` with HTTP Basic.
- For the **Iceberg face**, the route runs a Flink snapshot query or a DuckDB/Athena query.

Two documented read-over-HTTP paths exist and are worth knowing, though neither replaces a consumer:
- Managed MCP regional server tool `consume_kafka_messages` — "Read one to ten sample messages from a topic." ([managed-mcp-server](https://docs.confluent.io/cloud/current/ai/ai-tools/managed-mcp-server.html)) Sampling only.
- Lightning Tables read-only SQL over HTTP.

Proxies that *are* documented are TCP/Kafka-protocol proxies for private networking (NGINX/HAProxy/Envoy relay, [ccloud-console-access](https://docs.confluent.io/cloud/current/networking/ccloud-console-access.html); Confluent Gateway, [gateway/overview](https://docs.confluent.io/platform/current/gateway/overview.html)) — not browser CORS proxies.

---

## 5. Governance

### 5.1 The official package matrix

Verbatim rows from [stream-governance/packages](https://docs.confluent.io/cloud/current/stream-governance/packages.html):

| Feature | Essentials | Advanced |
|---|---|---|
| Schema Registry | Yes | Yes |
| Schema Registry SLA | 99.5% | 99.99% |
| Schema Registry calls/sec | Read 75 / Write 25 | Read 75 / Write 25 |
| **Data rules** | **No** | **Yes** |
| Number of schemas included | **100** | **20,000** |
| Number of exporters included | 10 | 100 |
| Stream catalog tags | Yes | Yes |
| Stream catalog business metadata | No | Yes |
| Stream catalog REST API | Yes | Yes |
| Stream catalog GraphQL API | No | Yes |
| Data portal | Yes | Yes |
| Stream lineage (last 10 minutes) | Yes | Yes |
| **Stream lineage (point in time: last 7 days)** | **No** | **Yes** |
| AsyncAPI export/import | Yes | Yes |

Footnotes: schema counts "include all schema versions created by users and Confluent components like Kafka Connect and Apache Flink®. If a schema version is soft-deleted but not hard-deleted, it counts." And "Schemas created above this free limit are charged."

**The matrix has one "Data rules" row** — it does **not** break out data quality rules, migration rules, CSFLE or "data contracts" separately. Mapping those needed other pages:

- **CSFLE → Advanced only.** "CSFLE is only available with the Stream Governance Advanced package." ([csfle/overview](https://docs.confluent.io/cloud/current/security/encrypt/csfle/overview.html)) CSFLE does not appear in the packages comparison table at all.
- **All schema rules (data quality + migration) → Advanced only.** "Schema rules are only available on Confluent Enterprise and Confluent Cloud with the Stream Governance Advanced package." ([data-contracts](https://docs.confluent.io/cloud/current/sr/fundamentals/data-contracts.html))
- **Lineage retention, verbatim**: "The Essentials package only allow users to visualize the flow of data from the past 10 minutes, but with point-in-time feature, only available on Advanced package, a user can choose to see last 10 minutes, 30 minutes, 1 hour, 4 hours, 8 hours, 12 hours, 24 hours and 1 hour window on any of the last 7 days." ([stream-lineage](https://docs.confluent.io/cloud/current/stream-governance/stream-lineage.html))
- **Business metadata → Advanced only.** "Business metadata is only available in the Advanced package for Stream Governance." ([stream-catalog](https://docs.confluent.io/cloud/current/stream-governance/stream-catalog.html))

**Correction worth noting: tags and the Data Portal are in Essentials.** Only business metadata, data rules, the GraphQL API and 7-day lineage need Advanced.

### 5.2 Cost

Dimensions ([billing/dimensions/stream-governance](https://docs.confluent.io/cloud/current/billing/dimensions/stream-governance.html)):

| Dimension | Unit |
|---|---|
| Stream Governance base | Cost per hour |
| Schema Registry schema | Cost per schema per hour |
| Stream Governance rule | Cost per rule per hour |

- "**Essentials has no base charge.**" / "**Advanced includes an hourly base charge.**"
- "Schemas created beyond your package's included count are billed per schema, per hour."
- "Data quality rules are billed per rule, per hour. For example, if you apply multiple Client-Side Field Level Encryption encryption rules to the same schema, each rule is billed separately."

**The only dollar figure on any primary source** is the Console upgrade label, quoted on the packages page: **"Upgrade to Stream Governance Advanced starting at $1/hour"** — which is roughly **$24/day** and is the largest confirmed standing charge in the whole demo footprint.

**Exact per-schema-hour and per-rule-hour rates: UNCONFIRMED.** Both official pricing URLs that the docs link to render their rate tables client-side and serve no governance numbers; they defer to the Cost Estimator.

**Essentials is the default and is free**: "The Essentials package is automatically attached to your environment by default." Three distinct schema numbers govern capacity: *included count* (100 / 20,000), *default cap* ("For Advanced, the default cap matches the included count of 20,000. **Essentials doesn't enforce a cap.**"), and *effective limit* (a per-cluster override Confluent can approve). Over the effective limit, "schema registration returns an HTTP **422** error with the message **Schema Limit Exceeded**."

**One-way door**: "You can upgrade to an Advanced governance package, but it is not possible to downgrade from Advanced to Essentials. The only option is to delete the environment, and start over." **Do not enable Advanced casually.**

### 5.3 How each feature is actually configured

**Data quality rules / data contracts** — a rule has `name`, `doc`, `kind` (CONDITION | TRANSFORM), `type`, `mode`, `tags`, `params`, `expr`, `onSuccess`, `onFailure`. Built-in types: `CEL` (data quality, Google Common Expression Language, e.g. `"expr": "size(message.ssn) == 9"`), `CEL_FIELD` (field transforms; primitives only, no enums), `JSONATA` (migration rules). Modes: "Domain rules run during serialization (WRITE), deserialization (READ), or both (WRITEREAD)"; "Migration rules run in UPGRADE mode, DOWNGRADE mode, or both (UPDOWN)". In JSON they sit under `ruleSet.domainRules` and `ruleSet.migrationRules`. Every documented example is a REST call: `POST .../subjects/<subject>/versions` with a `"ruleSet"` body.

**Console authoring of CEL data quality rules: UNCONFIRMED, and the evidence points to "no".** The only documented Console rule flow is for encryption ([manage-csfle](https://docs.confluent.io/cloud/current/security/encrypt/csfle/manage-csfle.html)): "Select a schema from the list, click **Evolve**, then click **Rules** > **Add rules**… Open the **Category** dropdown list and select **Data encryption rule**." No Confluent doc names a "data quality rule" category. **Plan on REST registration**, or the CLI `--ruleset` flag (below).

**Three documented limitations that matter**: "The non-Java clients (.NET, go, Python, JavaScript) don't yet support the DLQ action"; "**Flink SQL and ksqlDB don't support rules execution** in either Confluent Platform or Confluent Cloud"; "**Kafka Connect on Confluent Cloud doesn't support rules execution.**" Also "Schema rules are only executed for the root schema, not referenced schemas." So a data-quality-rule demo must run through a **client serializer**, not Flink or Connect.

**CSFLE** — Advanced only. Supported clients, verbatim ([client-side](https://docs.confluent.io/cloud/current/security/encrypt/csfle/client-side.html)): Java client (CP 7.4.5+/7.5.4+/7.6.1+), **Go 2.5.0+**, **.NET 2.5.0+**, **JavaScript 0.2.1+** (CEL data quality rules from 1.3.2), **Python 2.8.0+**. **CSFLE is not Java-only** — Node and Python are both supported, which matters for the backend. But the DLQ *rule action* is Java-only.

KMS options, verbatim: AWS KMS, Azure Key Vault, Google Cloud KMS, HashiCorp Vault Transit Secrets Engine ("Applies only when the KEK is not shared with Confluent"), Local key (testing only). The Console add-key flow is narrower: "Supported key management options include AWS, Azure, and Google Cloud" — no Vault.

Constraints: "Encryption is only supported for fields of type string or bytes." Tag definitions must exist in Stream Catalog first. "For a schema with inline tags, catalog tags can't be applied. The request returns a 4xx error." "You are billed for each encryption rule."

**Flink + CSFLE is Limited Availability**: "Client-side field level encryption (CSFLE) and client-side payload encryption (CSPE) with Flink is a Limited Availability feature… If you would like to participate in the Limited Availability Program, contact your Confluent account team." ([flink-integration](https://docs.confluent.io/cloud/current/security/encrypt/csfle/flink-integration.html)) Two modes: transparent decryption (requires sharing KEKs with Confluent) and deterministic encryption (equality, grouping, joins on ciphertext). LA limitations: no schema evolution for running statements; encryption-rule changes are **silently** ignored by running statements; DEKs refresh every five minutes. **"If the KEK is not shared: Stream processing on decrypted data in Confluent Cloud using Flink is not possible."** Tableflow can materialise CSFLE topics, decrypting or preserving ciphertext depending on key sharing.

**Dead letter queues — three products, one vocabulary.** This is more capable than expected:
- **Connect**: auto-created, always on, **sink only**. "In Confluent Cloud, the connector does not stop when serde errors occur. Instead, the connector continues processing records and sends the errors to a Dead Letter Queue (DLQ)." Topic is named `dlq-<connector-ID>`. "Dead Letter Queues (DLQs) are only applicable for sink connectors." **Source connectors have no DLQ.** Cloud catch: the `errors.*` properties are "Configurable through the Confluent REST API and Confluent CLI only, not the Confluent Cloud Console."
- **Flink**: `error-handling.mode` on a table, default **`fail`**, values `fail | ignore | log`, plus `error-handling.log.target` (default `error_log`). "DLQ error handling applies only to deserialization errors at the source. Errors in user-defined functions (UDFs), serialization, or windowed aggregations are not routed to the DLQ." Only table-level overrides; no per-statement. Metric `io.confluent.flink/num_records_in_errors`. Gotcha: if DLQ creation fails, the `CREATE TABLE` does **not** fail — it surfaces later on the first deserialization error.
- **Tableflow**: "three modes for handling per-record materialization failures: `suspend`, `skip`, and `log`. The default mode is `suspend`." `log` sends failures to a DLQ topic in the same cluster — **"available only for topics that are configured with Avro or Protobuf schemas."** CLI flag `--error-handling SUSPEND|SKIP|LOG` and `--log-target`. "Tableflow uses the same `error-handling.mode` and `error-handling.log.target` table properties and the same DLQ schema" as Flink.

**Stream lineage** — six documented node types: Topic, Custom application, **Flink statement**, Kafka Streams app, **Kafka Connector**, CLI node. Producers and consumers are "automatically grouped… a single node that expands upon drilldown." Schemas are an attribute of the topic node. 24 or more like nodes collapse into a node group; edge thickness is throughput. **The real gate is RBAC on the viewer**: "Developer roles do not grant access to Stream Lineage." Full access needs OrganizationAdmin, EnvironmentAdmin, CloudClusterAdmin, Operator, DataDiscovery or DataSteward. **"Lineage requires no configuration" is UNCONFIRMED as a quotable docs claim** — what is quotable is that it is derived from observed activity and that Essentials is attached by default.

**Tags / business metadata / Data Portal** — tag creation **is** possible in the Console: "Select an environment and click **Add tags to this cluster**… Click **Create tag**." Taggable entities: "schemas, data records, data fields, topics, and connectors" — plus `flink_compute_pool` in the REST entity list, but **Flink *statements* are not taggable**. Limits: up to 100 tags per resource, 12,000 characters across all tags, 1,000 tag definitions per environment. Gotchas: "You cannot edit the name of an existing tag, only its description"; "Only inline tags show up as the tags of a field in the Cloud Console. External tags do not display in the console"; "You must switch to the tree view of the schema to see record and field level tags." Data Portal needs at least the `DataDiscovery` role, and **"The topic access request workflow is not available for topics on Basic clusters."**

### 5.4 What is visually demonstrable

All three headline surfaces are Console features and work on **Essentials**:

- **Stream Lineage** — "an interactive graph, from a high-level overview down to individual streams." Nodes carry live metrics. On Essentials the window is fixed at 10 minutes; the time-travel picker is the Advanced gate.
- **Stream Catalog** — searchable inventory with Console tag create/apply. "Prefix, substring, fuzzy, and wildcard search are available in the Confluent Cloud Console" (REST gets prefix only).
- **Data Portal** — "a self-service interface for discovering, exploring, and accessing Apache Kafka® topics", in both packages, with a discover → request access → approve → use flow.
- **Nice demo beat**: "Features that specifically require the Advanced Stream Governance package provide an upgrade option when you hover over the feature on the right panel."

Not demonstrable in the Console: the Stream Catalog GraphQL API (API-only, Advanced), and Lightning Table descriptions (PATCH only).

---

## 6. Automation and reproducibility

### 6.1 The Terraform provider

**Latest: v2.94.0, published 2026-11-06** — confirmed from the GitHub releases API, the Terraform Registry API, and the CHANGELOG heading `## 2.94.0 (November 6th, 2026)`. Release cadence is roughly weekly. 617M+ downloads.

Note: the HTML registry pages are JS-rendered and return no text to a fetcher. Read `github.com/confluentinc/terraform-provider-confluent/blob/master/docs/resources/*.md` instead.

**Resource types, verbatim names** (from `docs/resources` on `master`):

| Piece | Resource |
|---|---|
| Environment | `confluent_environment` |
| Kafka cluster | `confluent_kafka_cluster` |
| Kafka topic | `confluent_kafka_topic` (also `confluent_kafka_mirror_topic`, `confluent_kafka_cluster_config`) |
| API key | `confluent_api_key` |
| Service account | `confluent_service_account` |
| ACL | `confluent_kafka_acl` |
| Role binding | `confluent_role_binding` |
| Schema | `confluent_schema` |
| SR config | `confluent_schema_registry_cluster_config`, `confluent_schema_registry_cluster_mode`, `confluent_subject_config`, `confluent_subject_mode` |
| Tags / business metadata | `confluent_tag`, `confluent_tag_binding`, `confluent_business_metadata`, `confluent_business_metadata_binding`, `confluent_catalog_entity_attributes` |
| Flink compute pool | `confluent_flink_compute_pool`, `confluent_flink_compute_pool_config` |
| Flink statement | `confluent_flink_statement` |
| Flink materialized table | `confluent_flink_materialized_table` |
| Flink connection / artifact | `confluent_flink_connection`, `confluent_flink_artifact` |
| Tableflow topic | `confluent_tableflow_topic` |
| Tableflow catalog integration | `confluent_catalog_integration` — **no `tableflow_` prefix** |
| Provider integration (IAM role) | `confluent_provider_integration`, `confluent_provider_integration_authorization`, `confluent_provider_integration_setup` |
| Connector | `confluent_connector`, `confluent_custom_connector_plugin`, `confluent_custom_connector_plugin_version`, `confluent_connect_artifact` |
| **Lightning Table** | **`confluent_rtce_topic`** (GA) |
| Schema Registry cluster | **no resource** — `confluent_schema_registry_cluster` is a **data source only** |

Also present: `confluent_schema_registry_dek`, `confluent_schema_registry_kek`, `confluent_schema_exporter`, `confluent_kafka_client_quota`, `confluent_ksql_cluster`, `confluent_byok_key`, `confluent_identity_pool`, `confluent_identity_provider`, `confluent_tf_importer`.

**On "is there a Lightning Table resource?" — yes, but you will never find it by searching for "lightning."** Zero hits for `lightning` in the CHANGELOG or in any resource filename. The resource is `confluent_rtce_topic`, after the internal product name Real Time Context Engine, added in **2.73.0 (2026-05-14)**: "Added the `confluent_rtce_topic` resource and data-source to support the Real Time Context Engine feature on AWS." Confluent's own Lightning Tables [manage](https://docs.confluent.io/cloud/current/lightning-tables/manage.html) page documents Terraform as a supported path and names `confluent_rtce_topic` as the resource. **Anyone grepping the provider for the obvious name will wrongly conclude the feature is UI-only.**

**Provider gaps and UI/CLI-only steps:**

- **No Terraform resource for a Global API key.** `confluent_api_key` exists, but a Global key is created with `confluent api-key create --resource global`. Since the Lightning Tables HTTP API and JDBC paths both require a Global key, **a Lightning demo needs one CLI call.** (Whether `confluent_api_key` can express `global` is **UNCONFIRMED** — the resource doc describes managed-resource and cloud scopes.)
- **No Terraform path for a Flink `mcp_server` connection.** `confluent_flink_connection` accepts only `OPENAI, AZUREML, AZUREOPENAI, BEDROCK, SAGEMAKER, GOOGLEAI, VERTEXAI, MONGODB, PINECONE, ELASTIC, COUCHBASE`. Use Flink SQL `CREATE CONNECTION` or `confluent flink connection create`.
- **Schema Registry cluster cannot be created** — it is "provisioned automatically" with the environment's Stream Governance package.
- **`confluent_provider_integration` documents only `aws`** — "Currently only `aws` config is supported", despite GCP and Azure provider integrations existing in the Tableflow docs. GCP/Azure Terraform path **UNCONFIRMED**.
- **OAuth does not cover four resource types**, which still need `cloud_api_key`/`cloud_api_secret`: `confluent_catalog_integration`, `confluent_custom_connector_plugin`, `confluent_flink_artifact`, `confluent_tableflow_topic`. Also "An Identity Provider must be set up first on Confluent Cloud before using the OAuth credentials for Terraform Provider."
- **Lightning Tables: two Console-only edges** — authoring a schema inline during enablement for a topic that has none, and editing a table description (which is PATCH/CLI/Terraform-only, i.e. *not* Console).
- **Stream Governance cannot be downgraded** in Terraform or anywhere else.
- Operational: "Terraform version `1.6.0` is not supported." `max_retries` must be ≥ 4. Large plans hit HTTP 429 — lower `-parallelism` or raise `max_retries`.

### 6.2 The CLI

**v4.82.0, released 2026-11-03.** Its one new feature: `confluent lightning query`.

Top-level command groups, from the [command reference index](https://docs.confluent.io/confluent-cli/current/command-reference/) — 42 entries: `ai`, `api-key`, `asyncapi`, `audit-log`, `billing`, `budget`, `byok`, `ccpm`, `cloud-signup`, `cluster`, `completion`, `configuration`, `configurationcontrol`, `connect`, `context`, `endpoint`, `environment`, `feedback`, `flink`, `iam`, `kafka`, `ksql`, **`lightning`**, `local`, `login`, `logout`, `network`, `organization`, `plugin`, `prompt`, `provider-integration`, **`rtce`**, `schema-registry`, `secret`, `service-quota`, `shell`, `stream-share`, `switchover`, **`tableflow`**, `update`, `usm`, `version`.

**`confluent tableflow` exists** — "Manage Tableflow", with `catalog-integration` (create/delete/describe/list/update) and `topic` (describe/disable/enable/list/update).

**`confluent flink statement` exists** — create/delete/describe/exception/list/rescale/resume/stop/update/web-ui-forward. `confluent flink` also has `materialized-table` and `query` ("Run a bounded Flink SQL query and print its results").

**Lightning is split across two groups, which is a real trap:**
- **`confluent lightning`** — "Manage Lightning Tables." Despite "Manage", it has exactly one subcommand: `confluent lightning query`. **No create/enable/delete here.**
- **`confluent rtce`** — "Manage Real Time Context Engine." Lifecycle lives here: `confluent rtce region` and `confluent rtce rtce-topic` (create/delete/describe/list/update).

`rtce` commands landed in **v4.62.0 (2026-05-14)** — the same day as provider 2.73.0 — while the `lightning query` front door arrived only in **v4.82.0 (2026-11-03)**.

### 6.3 Verified command syntax for a setup script

All flags below are copied from the official command reference. **REQUIRED** markers are the docs' own.

**Non-interactive login.** `confluent login` has no credential flags. From the [login reference](https://docs.confluent.io/confluent-cli/current/command-reference/confluent_login.html): "Email and password login can be accomplished non-interactively using the `CONFLUENT_CLOUD_EMAIL` and `CONFLUENT_CLOUD_PASSWORD` environment variables." Also `CONFLUENT_CLOUD_ORGANIZATION_ID`. "SSO login can be accomplished headlessly using the `--no-browser` flag, but **non-interactive login is not natively supported**." Tokens last 8 hours.

> **`CONFLUENT_CLOUD_API_KEY` / `CONFLUENT_CLOUD_API_SECRET` are UNCONFIRMED** — these names appear nowhere in the CLI documentation (grepped across the login, install, connect, FAQ, troubleshoot and API-key pages: zero hits). **You cannot `confluent login` with an API key.** The reference offers email+password, SSO, or mTLS (`--certificate-only`) only. API keys are supplied per-resource instead, via `confluent api-key store <key> <secret> --resource <id>` + `confluent api-key use <key>`, or directly on produce/consume with `--bootstrap --api-key --api-secret`.

> **`confluent context create` has been removed** from the current CLI — the URL redirects to the `context` index; only `delete|describe|list|update|use` remain. A script written against v3 docs will break on v4.82.

```sh
# 1. Log in (email/password via env vars)
export CONFLUENT_CLOUD_EMAIL=... CONFLUENT_CLOUD_PASSWORD=...
confluent login

# 2. Environments
confluent environment list [-o json]
confluent environment create <name> [--governance-package essentials|advanced]
confluent environment use <env-id>
```
`--governance-package`, verbatim: "Specify the Stream Governance package as "essentials" or "advanced". On create, if not specified, the "essentials" package is used. Downgrading the package from "advanced" to "essentials" is not allowed once the Schema Registry cluster is provisioned."

```sh
# 3. Clusters
confluent kafka cluster list [--all] [--environment env-xxx] [-o json]
confluent kafka cluster create <name> --cloud aws --region us-east-1 \
  [--type basic] [--availability single-zone] [--max-ecku N] [--deletion-protection]
confluent kafka cluster describe [lkc-xxx]
confluent kafka cluster use <lkc-xxx>
```
`--cloud` and `--region` are REQUIRED. `--type` defaults to **`basic`** and accepts `basic | standard | enterprise | freight | dedicated`. `--availability` defaults to **`single-zone`**. `--cku` is required only for `dedicated`. Note: "You cannot use this command to create a cluster that is configured with AWS PrivateLink."

```sh
# 4. Topics
confluent kafka topic create <topic> [--partitions N] [--config key=value,key=value] \
  [--cluster lkc-xxx] [--dry-run] [--if-not-exists]
```
**`--replication-factor` is on-premises only** — it is absent from the Cloud flag list.

```sh
# 5. API keys  (--resource is REQUIRED on create)
confluent api-key create --resource cloud                      # Cloud / control-plane
confluent api-key create --resource lkc-123456                 # Kafka cluster
confluent api-key create --resource lsrc-123456                # Schema Registry
confluent api-key create --resource flink --cloud aws --region us-east-1   # Flink region
confluent api-key create --resource tableflow                  # Tableflow
confluent api-key create --resource global                     # GLOBAL  <- needed for Lightning API/JDBC
confluent api-key list [--resource ...] [--current-user] [-o json]
confluent api-key delete <key> [--force]
confluent api-key use <key>
confluent api-key store <key> <secret> --resource <id>
```
Verbatim from the [create reference](https://docs.confluent.io/confluent-cli/current/command-reference/api-key/confluent_api-key_create.html): "**To create a Global API key that can be used across all supported Confluent Cloud resources, specify "global".**" A global key is a `--resource` value, not a separate flag. Other flags: `--description`, `--cloud`, `--region`, `--use`, `--environment`, `--service-account`.

```sh
# 6. Schema Registry
confluent schema-registry cluster describe [--environment env-xxx] [-o json]
confluent schema-registry endpoint list [--environment env-xxx]
confluent schema-registry schema create --subject <subject> --schema <file> --type avro \
  [--references f] [--metadata f] [--ruleset f] [--normalize]
```
Note the docs' own warning on `cluster describe`: "The "Private Endpoint URL" output field is deprecated. Please use the "Private Regional Endpoint URLs" field instead." And the operational caveat that `cluster describe` "returns only the PrivateLink Attachment private endpoints, whereas `confluent schema-registry endpoint list` lists all endpoints". Output field lists for both commands are **UNCONFIRMED** — neither page shows sample output.

`--ruleset` ("The path to schema ruleset file") is the **one CLI route to a data contract rule**, though no doc narrates it. The quick start names the flag `--refs`; the command reference says `--references` — **trust the reference**.

```sh
# 7. Lightning Tables
confluent rtce rtce-topic create --cloud aws --region us-east-1 \
  --topic-name <topic> --description "<text>" \
  [--environment env-xxx] [--cluster lkc-xxx] [--wait] [--timeout 30m]
confluent rtce rtce-topic list [--cloud aws] [--region us-east-1] [--environment env-xxx]
confluent rtce rtce-topic describe <topic-name>
confluent rtce rtce-topic update <topic-name> [--description "<text>"]
confluent rtce rtce-topic delete <topic-name> [--force]
confluent rtce region list

confluent lightning query --sql "SELECT * FROM my_topic LIMIT 10" \
  [--cluster lkc-xxx] [--environment env-xxx] [--max-rows N] [-o json]
```
All four of `--cloud`, `--description`, `--region`, `--topic-name` are **REQUIRED** on create; `--cloud` accepts only `aws`; `create` takes no positional argument. `--timeout` defaults to `1h0m0s`.
`confluent lightning query` requires **CLI 4.82.0+**, uses the logged-in user account (**not** an API key), works on the public endpoint only, and defaults to 100 rows in `-o human` (`--max-rows 0` = no limit; `-o json`/`-o yaml` fetch every row).

```sh
# 8. Flink
confluent flink compute-pool create <name> --cloud aws --region us-east-1 \
  [--max-cfu 5] [--environment env-xxx] [--default-pool] [--wait]
confluent flink statement create [name] --sql "<SQL>" \
  [--compute-pool lfcp-xxx] [--database <cluster id>] [--service-account sa-xxx] \
  [--property key=value] [--cloud aws] [--region us-east-1] [--wait]
confluent flink connection create <name> --cloud aws --region us-east-1 \
  --type mcp_server --endpoint <url> --transport-type STREAMABLE_HTTP [--api-key ...]
```
`--max-cfu` defaults to **5**. For `statement create`, `--sql` is REQUIRED. For `connection create`, `--cloud`, `--region`, `--type` and `--endpoint` are all REQUIRED, and **`--transport-type` defaults to SSE**.

```sh
# 9. Tableflow
confluent tableflow topic enable <name> [--cluster lkc-xxx] \
  [--storage-type MANAGED|BYOS|AzureDataLakeStorageGen2|GoogleCloudStorage] \
  [--table-formats ICEBERG|DELTA] [--retention-ms 604800000] \
  [--error-handling SUSPEND|SKIP|LOG] [--log-target <topic>] \
  [--provider-integration <id>] [--bucket-name <bucket>]
confluent tableflow topic disable <name>
```
`--storage-type` defaults to **`MANAGED`**; `--table-formats` defaults to **`ICEBERG`** and is singular-valued despite the plural name. **There is no `--managed-storage` flag.** `--error-handling` has no documented default on the CLI page (the Tableflow docs say the product default is `suspend`).

```sh
# 10. IAM
confluent iam service-account create <name> [--description "<text>"] [--resource-owner <id>]
confluent iam rbac role-binding create --role <Role> --principal User:u-xxx \
  [--environment env-xxx] [--cloud-cluster lkc-xxx] [--kafka-cluster lkc-xxx] \
  [--schema-registry-cluster lsrc-xxx] [--flink-region aws.us-east-1] \
  [--resource "Topic:my-topic"] [--prefix]
```
`--role` and `--principal` are REQUIRED; principal uses "Prefix:ID" format.

```sh
# 11. Connectors
confluent connect cluster create --config-file config.json [--cluster lkc-xxx]
```
`--config-file` is **REQUIRED**: "JSON connector configuration file." Shape: `{ "name": ..., "config": { "connector.class": ..., ... } }`.

### 6.4 How close is one-command, idempotent, destroyable?

**Close.** Everything structural is Terraform-able: environment, cluster, topics, schemas, service accounts, role bindings, API keys, Flink pool, Flink statements, Flink materialized tables, Tableflow topics, catalog integrations, provider integrations, connectors, **and Lightning Tables via `confluent_rtce_topic`**.

What remains outside Terraform, and must be a CLI call or a Console click:

1. **Global API key** — `confluent api-key create --resource global`. Needed for the Lightning Tables HTTP API and JDBC. Not environment-scoped, so **it also does not get destroyed with the environment** (§8).
2. **Flink `mcp_server` connection** — Flink SQL `CREATE CONNECTION` or `confluent flink connection create`. Only needed if a Flink-internal agent calls RTCE.
3. **Inline schema authoring during Lightning Table enablement** for a topic with no schema — Console only. Avoidable: register the schema first with `confluent_schema` or `confluent schema-registry schema create`.
4. **Lightning Table status check** (`Provisioning` → `Active`) — Console, or `confluent rtce rtce-topic describe`, or `--wait` on create. Terraform's own readiness semantics for `confluent_rtce_topic` are **UNCONFIRMED**.
5. **Stream Governance package** is a Terraform argument on `confluent_environment`, but **upgrade is one-way** — if you set `advanced` you cannot `terraform apply` your way back to `essentials`.

Verdict: a one-command setup is achievable as `terraform apply` plus **two** shell lines (global API key; optional MCP connection). A one-command teardown is `terraform destroy` plus **one** shell line (`confluent api-key delete`). That is genuinely good — much better than the quickstart's structure implies.

---

## 7. Connectors

### 7.1 Synthetic data: the Datagen Source connector

[cc-datagen-source](https://docs.confluent.io/cloud/current/connectors/cc-datagen-source.html)

- **Fully managed: yes.** "The fully managed Datagen Source connector for Confluent Cloud generates mock data for development and testing." Carries an explicit warning: "This connector is not suitable for production use." No GA/Preview lifecycle badge.
- **Price: $0.017 – $0.0347 per task-hour, $0.025/GB** ([connect-pricing](https://www.confluent.io/confluent-cloud/connect-pricing/)). This is the lowest published task band on the page. **It is billed, not free.** At one task, that is roughly **$0.41 – $0.83 per day**.
- **Custom Avro schemas: supported.** `schema.string` — "Provide a custom JSON-encoded Avro schema. **The length of the schema string cannot exceed 10000 characters.** This option cannot be used with the quickstart property." Also: "**The regex annotation type is not supported**" and "The options annotation type object file variant is not supported. The JSON array variant is supported."
- `quickstart` — 38 built-in specs, mutually exclusive with `schema.string`: CLICKSTREAM_CODES, CLICKSTREAM, CLICKSTREAM_USERS, ORDERS, RATINGS, USERS, USERS_ARRAY, PAGEVIEWS, STOCK_TRADES, INVENTORY, PRODUCT, PURCHASES, TRANSACTIONS, STORES, CREDIT_CARDS, CAMPAIGN_FINANCE, FLEET_MGMT_DESCRIPTION, FLEET_MGMT_LOCATION, FLEET_MGMT_SENSORS, PIZZA_ORDERS, PIZZA_ORDERS_COMPLETED, PIZZA_ORDERS_CANCELLED, INSURANCE_OFFERS, INSURANCE_CUSTOMERS, INSURANCE_CUSTOMER_ACTIVITY, GAMING_GAMES, GAMING_PLAYERS, GAMING_PLAYER_ACTIVITY, PAYROLL_EMPLOYEE, PAYROLL_EMPLOYEE_LOCATION, PAYROLL_BONUS, SYSLOG_LOGS, DEVICE_INFORMATION, SIEM_LOGS, SHOES, SHOE_CUSTOMERS, SHOE_ORDERS, SHOE_CLICKSTREAM. (`STOCK_TRADES` and `CREDIT_CARDS` are the obvious fits for an exposure demo.)
- `schema.keyfield` — "Name of the field to use as message key", optional with `quickstart`. **Set this**: an upsert Lightning Table needs a record key.
- **Default `output.data.format` is `JSON`** (schemaless). Valid: AVRO, JSON_SR, PROTOBUF, JSON. **This is a trap**: Lightning Tables and Tableflow both require a registered schema, so you must override the default to **AVRO** (or JSON_SR / PROTOBUF). The first three require Schema Registry.
- `tasks.max` "Valid Values: [1,…]" — not capped at one, unlike CDC V2.
- Fastest path: "Start the Launch Sample Data quick start tutorial from the Datagen Source connector tile." Caveat: "the tutorials are available only if your user account has OrganizationAdmin RBAC role privileges."

### 7.2 CDC source connectors

Eleven fully managed CDC source connectors exist. **No connector carries a "GA", "Preview" or "Early Access" label** — the only labels Confluent prints in the catalog are `[Deprecated]` and `[End of Life]`. So "GA" is **UNCONFIRMED as a printed label**; the evidence of current status is the absence of a deprecation marker.

| Name | Label |
|---|---|
| PostgreSQL CDC Source V2 (Debezium) | none |
| MySQL CDC Source V2 (Debezium) | none |
| Microsoft SQL Server CDC Source V2 (Debezium) | none |
| Oracle CDC Source | none |
| Oracle XStream CDC Source | none |
| MariaDB CDC Source (Debezium) | none |
| MongoDB CDC Source (Debezium) | none |
| MongoDB Atlas Source | none |
| Amazon DynamoDB CDC Source | none |
| Google Cloud Spanner CDC Source (Debezium) | none |
| Salesforce CDC Source | none |
| PostgreSQL CDC Source (Debezium) — V1 | **[End of Life]** |
| MySQL CDC Source (Debezium) — V1 | **[End of Life]** |
| Microsoft SQL Server CDC Source (Debezium) — V1 | **[End of Life]** |

**Pricing is the blocker for a demo.** From [connect-pricing](https://www.confluent.io/confluent-cloud/connect-pricing/):

| Connector | $/task/hour | $/GB |
|---|---|---|
| PostgreSQL CDC V2 (Debezium) | **"Contact us"** | $0.025 |
| MySQL CDC V2 (Debezium) | "Contact us" | $0.025 |
| Microsoft SQL Server CDC V2 (Debezium) | "Contact us" | $0.025 |
| Oracle CDC Premium | "Contact us" | $0.025 |
| Oracle XStream CDC Premium | "Contact us" | $0.025 |
| MongoDB Atlas | $0.150 – $0.30 | $0.025 |
| Datagen (development & testing) | $0.017 – $0.0347 | $0.025 |

**Every Postgres and Oracle CDC connector is "Contact us" / Premium.** The per-task-hour figure is **UNCONFIRMED** — Confluent does not publish it. MongoDB Atlas Source at $0.150–$0.30/task-hour is the cheapest published CDC-ish option.

Postgres CDC V2 operational facts worth knowing: **one task only** ("Valid Values: [1,…,1]"; "This connector supports a single task only"). Prerequisites include "**Public access may be required for your database**" and, on RDS, "**A parameter group with the property `rds.logical_replication=1` is required**… Once created, you must reboot the database." (`wal_level=logical` is **UNCONFIRMED on the Cloud V2 page** — it appears only on the self-managed Platform page.) `publication.autocreate.mode` defaults to `all_tables` and "The connector user must have superuser permissions to create this publication, so it is usually preferable to create the publication before starting the connector." `slot.name` defaults to `debezium`; each connector instance needs its own replication slot; `slot.drop.on.stop` defaults to `false` with "WARNING: Do not set this to true for connectors in production."

**Non-public databases need private egress, which needs a cluster type you won't have.** The decisive row in [internet-resource](https://docs.confluent.io/cloud/current/connectors/networking/internet-resource.html): **Public Endpoint → Private IP connectivity: "No".** Egress PrivateLink Endpoints are "only available for use with **Dedicated** clusters inside a "PrivateLink Access" type network" or, in the ESKU variant, "**Enterprise** clusters". PNI "is available for **Enterprise and Freight** clusters." Basic and Standard are never listed as eligible (whether they are explicitly barred is **UNCONFIRMED** — they are simply absent). **A demo on a Basic cluster must use a publicly reachable database, or no CDC at all.**

Public egress IP allowlisting is possible but caveated: "Public egress IP addresses are **not guaranteed to be static**" and "are **not exclusive** to specific Confluent Cloud accounts."

### 7.3 Free allowance

**There is no documented free connector allowance** — no free connector-hours, no free tasks, no exempt connector. The one genuine waiver: "If you use a Basic or Standard Kafka cluster, your connector runs in multitenant Kafka Connect clusters. For the connectors running on a multitenant Connect cluster, there is no Connect capacity (CONNECT_CAPACITY) charge." Task and throughput charges remain.

**Pausing does not stop the bill**, verbatim: "If you pause a managed connector, its tasks also pause… The connector is still active and hourly base costs for tasks assigned to the connector continue to build up. **To stop your Connect connectors from accumulating billed usage, you can delete them.**" Throughput billing is on **decompressed** data.

**Recommendation for this demo: use Datagen, or skip connectors entirely and produce from a script.** A plain producer costs nothing beyond cluster ingress.

---

## 8. Cost and teardown

### 8.1 Confirmed price components

From [confluent.io/confluent-cloud/pricing](https://www.confluent.io/confluent-cloud/pricing/):

| Component | Published figure |
|---|---|
| **Basic** eCKU | "First eCKU free, then $0.14" per eCKU-hour |
| Basic data in/out | $0.05/GB |
| Basic storage | $0.08/GB-month |
| **Standard** eCKU | $0.75/eCKU-hour |
| Standard data in/out | $0.035 – $0.050/GB |
| Standard storage | $0.08/GB-month |

"Prices shown are pre-replication" and "Prices vary by cloud region."

**Flag: "First eCKU free" appears on both confluent.io pricing pages but is not corroborated anywhere in `docs.confluent.io`'s billing-dimensions pages.** Treat it as pricing-page-only and verify on the first bill.

Billing mechanics ([billing-dimensions](https://docs.confluent.io/cloud/current/billing/billing-dimensions.html)):
- Basic and Standard bill in **eCKU** for organizations created on or after 2024-04-16; earlier orgs keep the legacy model.
- "For each hour, you are billed for the maximum number of eCKUs used." / "If the capacity you use is less than the minimum, you pay the minimum." / "**If your cluster is at zero consumption across all dimensions, you pay nothing.**"
- "**Confluent Cloud doesn't charge for partitions on any type of Kafka cluster.**" Partitions do influence eCKU consumption.
- Capacity limits: Basic 1–50 eCKU; Standard 1 eCKU (99.9% SLA) or 2 (99.99%) up to 10.

**Lightning Tables / RTCE — the only component with published list prices** ([billing/dimensions/rtce](https://docs.confluent.io/cloud/current/billing/dimensions/rtce.html)):

> **Storage** — "$0.029 per GB-month, billed hourly, based on the average monthly bytes of materialized data stored."
> **Compute** — "measured in CCUs. The price is **$0.105 per CCU-hour**, which is **$0.00175 per CCU-minute**. Usage is metered every minute and rolled up into hourly billing increments."

One CCU, verbatim:
> - "**Hot memory size:** Compute for a hot memory size supporting roughly 40 GB of base storage."
> - "**Query scan:** Up to 80 GB scanned by your queries per hour, whether that's one large query or many small ones."
> - "**Ingest throughput:** Up to 10 MBps of sustained data streaming in."
> "You pay for whichever meter is highest in a given minute. A CCU isn't "40 GB and 80 GB and 10 MBps" all at once. It's whichever single threshold your workload reaches."

**Idle behaviour — read this carefully, it has a sharp edge:**
> "If a table has no new data coming in and no queries running against it, you're **not charged any CCUs**; you pay only for storage on whatever's already materialized."
> "If data is streaming in but no queries have run yet, you're **still charged for the compute** required to keep the table materialized and current. This continues for as long as the topic stays actively streaming, even without any queries running against it."
> "If both throughput and queries stop, CCUs scale down to zero… Charges resume as soon as either data starts streaming in or queries start running again."

Also: "You're charged for the total amount of data scanned in a minute, not the number of queries that produced it."

Terminology trap Confluent itself flags twice: Confluent **Compute** Unit ≠ Confluent **Consumption** Unit (marketplace billing).

**Stream Governance**: Essentials has no base charge; Advanced is "**starting at $1/hour**". Per-schema-hour and per-rule-hour rates **UNCONFIRMED**.

**Connectors**: Datagen $0.017–$0.0347/task-hour + $0.025/GB. CDC connectors "Contact us".

**Flink**: CFU rate **UNCONFIRMED**. External data transfer $0.025/GB in and out. Idle pool with no statements: free per the billing page, contradicted by the FAQ.

**Tableflow**: topic-hour and GB-processed rates both **UNCONFIRMED**.

### 8.2 Realistic standing cost per day

Honest assessment, with the confirmed and unconfirmed parts separated.

| Item | Per day | Basis |
|---|---|---|
| Basic cluster at 1 eCKU | **$0.00** | "First eCKU free" (pricing-page-only claim) |
| Kafka storage, a few GB | **~$0.01** | $0.08/GB-month |
| Stream Governance **Essentials** | **$0.00** | "Essentials has no base charge" |
| Stream Governance **Advanced** | **~$24.00** | "starting at $1/hour" |
| Lightning Table, topic actively streaming | **up to ~$2.52 per CCU** | $0.105/CCU-hour × 24 |
| Lightning Table storage, <1 GB | **~$0.001** | $0.029/GB-month |
| Datagen connector, 1 task | **$0.41 – $0.83** | $0.017–$0.0347/task-hour × 24 |
| Flink compute pool, idle, no statements | **$0.00** | billing page; FAQ disagrees |
| Flink, one continuously-running materialized table | **UNCONFIRMED** | no published CFU rate; ≥1 CFU-minute per statement |
| Tableflow on 1–2 topics | **UNCONFIRMED** | no published topic-hour or GB rate |

**The three things that actually cost money if left running:** Stream Governance Advanced (~$24/day — by far the largest confirmed charge), the Flink statements (rate unknown but continuous), and Tableflow's per-topic-hour charge (rate unknown, accrues even with no data).

**Whether a trickle of demo data bills a fraction of a CCU or rounds up to a whole one is UNCONFIRMED** — the docs describe per-minute metering of "whichever meter is highest" without stating a rounding rule. Worst case for a Lightning Table on a continuously-streaming topic is ~$2.52/day; best case is near zero.

**Rough all-in**: on Essentials with a Basic cluster, one Datagen task, one Lightning Table and one Flink statement, expect **single-digit dollars per day**, plus an unknown Flink and Tableflow component. On Advanced, add ~$24/day. The $400 trial credit comfortably covers weeks of this; it will not survive a month of Advanced plus a forgotten Dedicated cluster.

### 8.3 Free trial credits

> "When you sign up for Confluent Cloud, your organization receives **$400 USD in credit**." … "The free trial ends after **30 days** or after you use your $400 USD credit, whichever happens first."
> — [billing-faq](https://docs.confluent.io/cloud/current/billing/billing-faq.html)

- **A payment method is required up front**: "A payment method is required to create any resources in Confluent Cloud." But "your payment method isn't charged until your free trial ends."
- The trial cannot be paused; extensions must be requested from Confluent sales.
- [free-trial](https://docs.confluent.io/cloud/current/get-started/free-trial.html) states the 30-day expiry but **no longer names a dollar amount** — only "a dollar amount Confluent credits to your billing account." On trial end the organization is **suspended** and its data becomes inaccessible; if no payment method or promo code is added within 30 days of suspension, Confluent **deletes resources** but keeps the organization and users. Only `OrganizationAdmin` can add a payment method or claim a promo code.
- **Always-free allowances are largely UNCONFIRMED.** The only three sourceable items: Basic's "First eCKU free" (pricing page only); Stream Governance Essentials' free base + 100 free schemas; and "If your cluster is at zero consumption across all dimensions, you pay nothing."
- **No documented free allowance for Flink, Tableflow or Lightning Tables.**
- Marketplace and event promotions ($1,000 Azure/GCP credits, re:Invent bonuses) appear on confluent.io partner pages but are time-limited with terms I could not confirm — **UNCONFIRMED**.

**Note for an existing personal account**: the credit "only applies to new signups", so an account with an existing cluster has probably already consumed or expired it. Verify the current balance in the Console.

### 8.4 Teardown — exactly what to delete

The authoritative teardown is in Confluent's own Streamhouse quick start ([quick-start](https://docs.confluent.io/cloud/current/streamhouse/quick-start.html)), and it is pleasingly short:

> "In Confluent Cloud Console, delete the `river-air` environment." … "**Deleting the environment deletes its cluster, compute pool, topics, Lightning Tables, Tableflow tables, and Flink statements.**"
> "Delete the global API key that you created in Step 6: `confluent api-key delete <api_key>`"

So:

**Deleting the environment cascades to**: Kafka cluster, Flink compute pool, topics, Lightning Tables, Tableflow tables, Flink statements, Schema Registry cluster and its schemas, and the Stream Governance package.

**Does not cascade — delete separately:**

1. **Global API keys.** Organization-scoped, not environment-scoped. The Lightning Tables HTTP API and JDBC paths both require one, so a Lightning demo will have created one. `confluent api-key delete <key>`.
2. **Any other org-scoped API key** (Cloud/control-plane, Tableflow).
3. **Your own S3 bucket and IAM role**, if you chose BYOS Tableflow. Confluent cannot delete those.

**Things that keep billing until explicitly stopped, if you do *not* delete the environment:**

- **Connectors — pausing is not enough.** "hourly base costs for tasks assigned to the connector continue to build up." **Delete, don't pause.**
- **Tableflow bills per topic-hour for every hour it is enabled**, with or without data. `confluent tableflow topic disable <topic>`.
- **Lightning Tables** bill compute while the topic streams and storage while materialized. `confluent rtce rtce-topic delete <topic>`.
- **Flink statements.** An idle pool is free (per the billing page) but a running statement is not, and a statement with a **Baseline CFU** bills even while idle. Stop or delete statements.
- **Kafka storage** is billed per GB independently of eCKU, so topics with retained data cost money on an otherwise idle cluster.
- **Stream Governance Advanced** cannot be downgraded. "The only option is to delete the environment, and start over." **If you enabled Advanced, deleting the environment is the only self-service way to stop that ~$1/hour charge.**
- The **minimum-charge rule**: any usage in an hour bills at the highest eCKU level reached in that hour.

**Recommended structure**: put everything in **one dedicated environment**, so teardown is `terraform destroy` (or delete the environment in the Console) plus `confluent api-key delete` for the global key. That is a genuinely clean destroy.

---

## 9. MCP / agent access

There are **three distinct things** here, and conflating them is the most common error.

| | Open-source MCP server | Managed MCP servers | Real-Time Context Engine |
|---|---|---|---|
| Who runs it | You, locally | Confluent | Confluent |
| Repo / endpoint | `confluentinc/mcp-confluent` | `api.confluent.cloud/mcp/v1` + regional | `mcp.<region>.aws.confluent.cloud/.../context-engine/...` |
| Support | "community-supported" | Confluent-hosted | **GA** |
| Tools | 50+, read and write | ~30, "most read-only" | **exactly 3** |
| Scope | Kafka, Flink, SR, connectors, Tableflow, metrics, billing | Discovery, topics, schemas, Flink, connectors, metrics | SQL over Lightning Tables |

### 9.1 The one that matters for this demo: the Real-Time Context Engine

> "**The Real-Time Context Engine is the Model Context Protocol (MCP) server for Lightning Tables.**"
> — [lightning-tables/query/mcp](https://docs.confluent.io/cloud/current/lightning-tables/query/mcp.html)

**Status: GA.** The 2026-05-19 release note: "The Real-Time Context Engine is now generally available." The 2026-11-04 note confirms a Lightning Table can be queried "from the Console, CLI, an API, a JDBC client, or an AI agent over MCP."

**Endpoint**: `https://mcp.<region>.aws.confluent.cloud/mcp/v1/context-engine/organizations/<org_id>/environments/<env_id>/kafka-clusters/<lkc_id>`, streamable HTTP transport.

**Exactly three tools, and the set is fixed — there is no mechanism for custom per-question tools:**
- `listTopics` — topics that have a Lightning Table and are visible to the agent; takes no arguments.
- `getMetadata` — column names, data types, primary key info for one topic.
- `queryData` — runs a read-only SQL query against a topic. Arguments `topic_name`, `query`, `max_result_rows`.

"The docs advise calling `getMetadata` before `queryData` to avoid column and type errors."

**Hard limits**: max **200 rows**; **20-second** timeout; `max_result_rows` is **required on every call** (0 or omitted → error); "The SQL `LIMIT` clause can further reduce the result set but can't exceed the `max_result_rows` cap." Rate limits return `RATE_LIMIT_EXCEEDED` and are **shared with the HTTP API** — numeric values **UNCONFIRMED**.

**Authentication — three options:**
1. Global API key + HTTP Basic.
2. Confluent Cloud account sign-in via OAuth browser flow (`claude mcp add --transport http --client-id claude-cli …`, no `Authorization` header) — "queries run with your own roles". Added 2026-10-19.
3. OAuth 2.0 client credentials with an external IdP + identity pool, via a `Confluent-Identity-Pool-Id` header, 401 + `WWW-Authenticate` discovery, then a bearer token. Needs `DeveloperRead` on both the Kafka and Schema Registry clusters granted to the pool.

**Permissions**: MCP operations are `listTopics`, `queryData`, `getMetadata`, gated by role; "Queries are limited to topics the user can already read in Kafka." ([access-control](https://docs.confluent.io/cloud/current/lightning-tables/access-control.html))

**Prerequisites**: the Lightning Table must be **Active**. A table **description** helps agents understand the data, and descriptions are set via **PATCH, not the Console**.

**Security caveat worth repeating**: "With private networking enabled, Lightning Tables that you query with MCP might be accessible **across environments and private network boundaries within your organization**." ([private-networking](https://docs.confluent.io/cloud/current/lightning-tables/private-networking.html))

### 9.2 The open-source MCP server

- Repo: [confluentinc/mcp-confluent](https://github.com/confluentinc/mcp-confluent) — created 2025-01-16, latest release **v1.6.1 (2026-10-26)**, not archived, **MIT** licensed (confirmed via the GitHub API; the docs page does not name a license).
- npm: `@confluentinc/mcp-confluent`. Docs page: [open-source-mcp-server](https://docs.confluent.io/cloud/current/ai/ai-tools/open-source-mcp-server.html).
- **Status: explicitly NOT GA-supported.** Verbatim: it is "a community-supported project" and Confluent "doesn't provide dedicated support for it" — best-effort, **no service level commitments**. The docs page never uses the words GA, preview or early access. *(A confluent.io blog claims GA; per the source rules it is not used here, and docs.confluent.io says the opposite.)*
- **50+ tools**, including `produce-message`, `consume-messages` (can target a partition and start from offset/timestamp/earliest/latest), the full Flink statement lifecycle plus diagnostics, connector management, Schema Registry, catalog/tags, Tableflow topics and catalog integrations, metrics and billing. Discover the set with `npx -y @confluentinc/mcp-confluent --list-tools`.
- Install: `npx @confluentinc/mcp-confluent --init-config` then `--config ./config.yaml`. **Requires Node.js 22+.** **Docker is not a documented way to run the server** — the README's only compose file is a local Confluent Platform test stack. UNCONFIRMED.
- Telemetry is collected; disable with `DO_NOT_TRACK`.

### 9.3 The managed MCP servers

[managed-mcp-server](https://docs.confluent.io/cloud/current/ai/ai-tools/managed-mcp-server.html). **GA as of the 2026-05-19 release note** ("managed MCP servers" are listed among that date's GA items), though the page itself carries no lifecycle label.

- **Global**: `https://api.confluent.cloud/mcp/v1` — `list_environments`, `list_clusters`, connector tools, `list_metrics`, `query_metrics`, `get_flink_statement_metrics`.
- **Regional**: `https://mcp.<region>.<cloud>.confluent.cloud/mcp/v1/organizations/<org_id>` — `list_kafka_topics`, `describe_kafka_topic`, **`consume_kafka_messages`** ("Read one to ten sample messages from a topic"), schema tools, and the Flink statement lifecycle plus `validate_flink_sql`, health/issues/exceptions/profile.
- **Private regional**: `https://mcp.<region>.<cloud>.private.confluent.cloud/mcp/v1/organizations/<org_id>`.
- Write-capable tools are enumerated: `restart_connector`, `update_connector_config`, `create_flink_statement`, `delete_flink_statement`. "Most tools are read-only, so you can explore your Confluent resources without risk of modifying them." The page warns to check your client's auto-approval settings.
- Auth: OAuth sign-in with a Confluent-registered client ID (documented examples `claude-cli`, `vscode-desktop`, `cursor-desktop`), or API key via HTTP Basic (Global key works with both servers; Cloud key is global-server-only; Flink key is regional-only and scoped to a cloud and region).
- "Access is governed by your existing Confluent Cloud permissions, so each server returns only the data your credentials can access."

**For the demo's risk agent**: the RTCE server is the right one. It is GA, purpose-built for Lightning Tables, and its three-tool surface is exactly the "ask the live state in SQL" shape the demo wants. The trade-off is that you cannot define a `get_client_exposure` tool — the agent must send SQL through `queryData`, which is arguably a better teaching point anyway: the agent asks the same question as the desk, in the same SQL, wrapped in MCP.

---

## Open questions / must verify in the console

Things only someone logged into the account can confirm.

### Blocking — verify before committing to the build

1. **Is `Enable Lightning Table` actually present in the Console for this account?** The docs show no gate, but the RTCE billing page's Early Access note on *direct API querying* is the one unresolved contradiction. Check: Topics page → is there a "Lightning Tables" column with `+ Enable`? And separately, does `POST https://sql.us-east-1.aws.confluent.cloud/query/v1` return 200 or 403?
2. **What cloud and region is the existing cluster in?** Lightning Tables are **AWS-only, 10 regions**. If the cluster is on Azure or GCP, or in an AWS region outside the ten, **the cluster must be rebuilt**. `us-east-1` is supported.
3. **What cluster type is it?** Basic is eligible for Lightning Tables, Tableflow and Flink, so Basic is fine — but confirm it is not a legacy configuration.
4. **Is the organization on the eCKU billing model** (created on or after 2024-04-16) or the legacy base-and-partitions model? This changes every cluster cost number.
5. **What trial credit remains?** The $400/30-day credit applies to new signups; an account with an existing cluster may have none left. Check Billing & payment.
6. **Does `confluent lightning query` work?** It needs CLI **4.82.0+** and a *user* login — it explicitly "doesn't support signing in with an API key", which matters for a CI or script context.

### Important — numbers no primary source publishes

7. **The Flink CFU dollar rate.** Read it off the Console or the Cost Estimator before running a continuous statement.
8. **The Tableflow $/topic-hour and $/GB-processed rates.** Same.
9. **The Stream Governance Advanced base rate** beyond "starting at $1/hour", and the per-schema-hour and per-rule-hour rates.
10. **Whether an idle Flink compute pool with zero statements shows a charge.** Two primary Confluent pages disagree. The first bill settles it.
11. **Whether a trickle of demo data bills a fraction of a CCU or rounds to a whole one** on a Lightning Table. Worst case ~$2.52/day, best case near zero.
12. **The Lightning Tables / RTCE rate limit numbers.** Documented as existing, never quantified. Relevant if the frontend polls.
13. **The Lightning Tables maximum query result size.** Stated to exist, value unpublished.

### Behavioural — only observable on a live account

14. **CORS on `sql.us-east-1.aws.confluent.cloud/query/v1`.** No Confluent page says anything either way. Send a preflight `OPTIONS` and look at the response headers. Do this *regardless* — even if CORS allows it, the Global API key must not go to the browser, so the serverless-route pattern stands.
15. **Whether a Lightning Table over a Flink output topic reads `read_committed`.** This decides whether the middle rung of the freshness ladder is ~1 minute or ~100 ms. The docs never state it. Test: produce → observe the Flink output topic → time the Lightning Table's answer. Then set `'kafka.consumer.isolation-level' = 'read-uncommitted'` on the downstream table and time it again.
16. **How long `Provisioning` → `Active` actually takes** for a Lightning Table. The docs say only "several minutes"; the CLI `--wait` default timeout is 1 hour. This matters for the demo's setup timing.
17. **Whether `confluent_rtce_topic` in Terraform waits for `Active`** or returns as soon as the API accepts the request. UNCONFIRMED. If it does not wait, the setup script needs a poll.
18. **Whether `confluent_api_key` can create a `global`-scoped key**, or whether the CLI call is genuinely unavoidable. UNCONFIRMED from the resource docs.
19. **Whether the Flink foreground-statement 5-minute stop** bites the intended demo flow. It triggers on "no consumer for the results", not on idleness, so a dashboard that keeps polling may be safe — but verify.
20. **Whether `JOIN ... USING (col)` is accepted** by Confluent Cloud Flink. Grammar-only in the docs, zero examples. **Write the demo with `ON` and don't find out on stage.**
21. **Whether `$rowtime` can be qualified by a table alias** (`o.$rowtime`). Only the backticked table-name form is documented (`` orders.`$rowtime` ``). Use that form.
22. **Whether the Datagen connector's `STOCK_TRADES` or `CREDIT_CARDS` quickstart shapes fit the exposure model**, or whether a custom `schema.string` is needed. Remember the 10,000-character limit and that `regex` annotations are unsupported.
23. **Whether the Console offers a "data quality rule" category** in the Evolve → Rules → Add rules panel, or only "Data encryption rule". The docs only name the encryption category. If quality rules are REST-only, the governance demo beat changes shape.

### Known-stale or contradictory in Confluent's own docs

24. `--description` on `confluent rtce rtce-topic create` is marked **REQUIRED** in the CLI reference and in Terraform, but called "Optional" on the Lightning Tables manage page. Treat as required.
25. The RTCE billing page's Early Access note on direct API access is contradicted by the API page and the 2026-11-04 release note.
26. Flink's billing-dimensions page and FAQ disagree on provisioned vs consumption billing.
27. The Flink statements page calls 500 GB both a "soft limit" and "the absolute global limit".
28. `monitor-tableflow.html` says Tableflow "remains in the Suspend state until manually resumed by sending a PATCH request to the API with the `spec.suspend` property set to **true**" — the direction reads inverted. Likely a docs bug; do not repeat it.
