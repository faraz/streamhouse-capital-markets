# Confluent Cloud Capabilities for an AWS us-east-1 Streamhouse Build

Researched 2026-11-09. Companion to `confluent-cloud-demo-platform-2026-11.md` (which carries the cost and connector detail). This file is the **build-mechanics** report: what the features actually are, where they run, how they are created, and what the exact commands and resource names are.

Sources are restricted to `docs.confluent.io`, the official Confluent CLI command reference, the Confluent Cloud release notes, `confluent.io` official pricing pages, and `github.com/confluentinc` (Terraform provider docs and CHANGELOG). Blogs and third-party tutorials were excluded. Nothing was executed against a live account.

Anything not sourceable is labelled **UNCONFIRMED**. Where two primary Confluent pages disagree, both are quoted.

---

## 1. Lightning Tables — capability facts

### 1.1 They are publicly documented and self-serve

Prerequisites to enable one, verbatim from [lightning-tables/manage](https://docs.confluent.io/cloud/current/lightning-tables/manage.html):

> - A Basic, Standard, Enterprise, or Dedicated cluster on AWS in a supported region.
> - An Apache Kafka® topic.
> - A schema for the topic (Avro, Protobuf, or JSON Schema)…
> - At minimum, the CloudClusterAdmin role or the ResourceOwner role on the topic.
> - A Cloud API key for CLI access.
> - A Cloud API key or Global API key for Terraform access.

That is a role check and a schema. **No entitlement, allowlist, preview enrolment, phased-rollout caveat or "contact your account team" language appears anywhere in the Lightning Tables documentation tree.** Checked by grep across the overview, manage, limitations, access-control, monitor, private-networking, all query/* pages, the Streamhouse pages, the RTCE pages and the billing page, for `phased`, `rollout`, `in phases`, `allowlist`, `entitle`, `enroll`, `contact your account team`: **zero hits.**

For contrast, Confluent *does* use that language when it applies: the same 2026-11-04 release-notes entry that announces Lightning Tables says, of a different feature, "To request access, contact your Confluent account team."

### 1.2 The one surviving gate, and why it is probably stale

[billing/dimensions/rtce](https://docs.confluent.io/cloud/current/billing/dimensions/rtce.html) (last updated 2026-11-03) carries:

> **Note** — Direct API access, issuing a lightning query yourself without an AI agent, is an Early Access Program feature in Confluent Cloud.

…plus EA boilerplate ("without support", "AS IS", "No service level commitment will apply") and a sign-up link to `events.confluent.io/early-access-flink-features`.

**Two other primary sources contradict it**: the API page itself ([query/api](https://docs.confluent.io/cloud/current/lightning-tables/query/api.html), same date) carries no EA banner, and the 2026-11-04 release note announces API querying with no caveat. The note most likely survives from the 2026-08-18 EA milestone. **This is the single most important thing to test in the Console** — it is the only documented reason `POST /query/v1` might return 403 on a fresh account.

### 1.3 GA status and date

From [release notes](https://docs.confluent.io/cloud/current/release-notes/index.html), verbatim:

| Date | Entry |
|---|---|
| 2025-10-29 | "The Real-Time Context Engine with Confluent Intelligence is available for **early access**." |
| **2026-05-19** | "The Real-Time Context Engine is now **generally available**. … You enable the Real-Time Context Engine on a topic, and your agents can immediately query the most current data." |
| 2026-08-18 | "You can now query the same data the Real-Time Context Engine queries for AI agents directly through an API, without an agent, as an **Early Access Program** feature. … you issue a *lightning query*…" |
| 2026-10-19 | OAuth sign-in to the managed MCP servers, including the RTCE server. |
| **2026-11-04** | "With Lightning Tables, you can query the data in an Apache Kafka® topic with SQL and get sub-second response times. Query a Lightning Table from the Confluent Cloud Console, the Confluent CLI, an API, a JDBC client, or an AI agent over the Model Context Protocol (MCP)." |

The 2026-11-04 entry carries **no lifecycle qualifier**, while sibling bullets in the same dated entry explicitly say "now available as a Limited Availability feature". That omission is Confluent's house style for GA.

Independent GA confirmation: [streamhouse/query-surface](https://docs.confluent.io/cloud/current/streamhouse/query-surface.html) has an **Availability** column reading `Generally available` for the Lightning Tables row and the "MCP and the Real-Time Context Engine" row. The control-plane OpenAPI carries `x-lifecycle-stage: General Availability`. The Terraform resource carries a `Lifecycle Stage - General Availability` badge.

**Reconciliation**: Lightning Tables is the rename and productisation of the RTCE "rtce-topic". The machinery still says `rtce` everywhere — CLI `confluent rtce rtce-topic`, Terraform `confluent_rtce_topic`, REST `rtce/v1/rtce-topics`, metrics `io.confluent.rtce/*` — and the old doc URLs 301-redirect to the new tree (`/ai/real-time-context-engine/lightning-queries.html` → `/lightning-tables/query/api.html`). The capability GA'd as RTCE on **2026-05-19**; the surface was renamed and extended with Console + CLI + JDBC on **2026-11-04**.

### 1.4 Clouds, regions, cluster types — Basic qualifies, AWS only

[limitations](https://docs.confluent.io/cloud/current/lightning-tables/limitations.html), verbatim:

> Lightning Tables are available on the following cluster types on AWS:
> - Basic
> - Standard
> - Enterprise
> - Dedicated

[access-control](https://docs.confluent.io/cloud/current/lightning-tables/access-control.html) reinforces: "It works on all supported cluster types, including Basic and Standard clusters."

**Standard is not the floor. Basic qualifies.** Freight is not listed. Azure and Google Cloud are not supported — the `--cloud` flag and field accept only `aws`/`AWS`.

[get-started/regions](https://docs.confluent.io/cloud/current/get-started/regions.html) has rows for both `Lightning Tables` and `Real-Time Context Engine`; the rows are **identical**, and appear only under the AWS region table (no row in the Azure, Google Cloud, AWS GovCloud or Jio Cloud tables, and no row in the "Cluster type support by feature" table). `Yes` in **10 regions**:

| Group | Yes | No |
|---|---|---|
| Americas | **us-east-1**, us-east-2, us-west-2 | ca-central-1, ca-west-1, sa-east-1 |
| East Asia / Australia | ap-northeast-2, ap-southeast-2 | ap-east-1, ap-northeast-1, ap-northeast-3, ap-southeast-4 |
| South / SE Asia | ap-south-1, ap-southeast-1 | ap-south-2, ap-southeast-3, ap-southeast-5, ap-southeast-7 |
| Europe | eu-central-1, eu-west-1, eu-west-2 | eu-central-2, eu-north-1, eu-south-1, eu-south-2, eu-west-3 |
| Middle East / Africa | — | all No |

**`us-east-1` is supported.**

### 1.5 Every documented way to enable one

**Console** — three entry points, all opening the same dialog ([manage](https://docs.confluent.io/cloud/current/lightning-tables/manage.html)): the Lightning Tables page (`Add Lightning Table` / `Enable Lightning Table`), the Topics page (`+ Enable` in the Lightning Tables column), or topic → Settings tab → `Enable Lightning Table`.

**CLI** — lifecycle lives under `rtce`, not `lightning`:
```sh
confluent rtce rtce-topic create \
  --cloud aws --region us-east-1 \
  --topic-name <topic> --description "<model-readable description>" \
  [--environment env-xxx] [--cluster lkc-xxx] [--wait] [--timeout 30m]
```
All four of `--cloud`, `--description`, `--region`, `--topic-name` are marked **REQUIRED** in the [command reference](https://docs.confluent.io/confluent-cli/current/command-reference/rtce/rtce-topic/confluent_rtce_rtce-topic_create.html). `--cloud` accepts only `aws`. **`create` takes no positional argument** — the topic comes from `--topic-name`. `--timeout` defaults to `1h0m0s`.

**REST** — confirmed exactly as hypothesised: `POST https://api.confluent.cloud/rtce/v1/rtce-topics`, HTTP Basic (`-u key:secret`), body `{"spec": {cloud, description, environment.id, kafka_cluster.id, region, topic_name}}`, returns **202**. Also `GET /rtce/v1/rtce-topics?environment=&spec.kafka_cluster=`, `DELETE /rtce/v1/rtce-topics/<topic_name>?...`, and `PATCH /rtce/v1/rtce-topics/<topic_name>?environment=&spec.cloud=AWS&spec.kafka_cluster=` (description only).

**Terraform** — `confluent_rtce_topic`, badged General Availability. Added in provider **2.73.0 (2026-05-14)**: "Added the `confluent_rtce_topic` resource and data-source to support the Real Time Context Engine feature on AWS." **All six arguments are Required**: `cloud`, `description` ("A model-readable description of the RTCE topic"), `environment { id }`, `kafka_cluster { id }` ("The Kafka cluster containing the topic to be materialized"), `region`, `topic_name`. Exports `api_version`, `kind`, `resource_name`. Import ID `<env>/<lkc>/<topic_name>`. A 403-on-refresh bug (invalid Cloud API key) was fixed in 2.86.0. ([resource doc](https://github.com/confluentinc/terraform-provider-confluent/blob/master/docs/resources/confluent_rtce_topic.md))

Confluent's own [manage](https://docs.confluent.io/cloud/current/lightning-tables/manage.html) page documents Terraform as a supported path and names `confluent_rtce_topic`, and says you disable one by removing that resource and running `terraform apply`.

**SQL DDL — none.** There is no `CREATE LIGHTNING TABLE`. The SQL surface explicitly rejects "DDL statements (CREATE, ALTER, DROP)".

**Two Console-only edges, in opposite directions:**
- Enabling a Lightning Table for a topic that has **no** schema — the Console prompts you to author and register one inline. No CLI or API equivalent is documented. **Avoidable**: register the schema first.
- Editing a table's **description** — "**You can't edit a table description in the Cloud Console.**" That needs PATCH, CLI `update`, or Terraform. (Descriptions matter: they are what tells an MCP agent what the data is.)

### 1.6 Prerequisites in detail

- **Schema required**: "To enable a Lightning Table for a topic, the topic must have a registered schema in Avro, Protobuf, or JSON Schema format."
- **Unsupported types block enablement entirely**: `INTERVAL YEAR TO MONTH`, `INTERVAL DAY TO SECOND`, `MULTISET`, `TIMESTAMP WITH TIME ZONE`, `RAW`. "If your topic schema uses an unsupported data type, you can't enable a Lightning Table for that topic." Also: `MAP` with nullable non-character keys excluded; `TIME` precision 0 only; `TIMESTAMP`/`TIMESTAMP_LTZ` precision 0–6.
- **Upsert vs append is automatic, not configurable**: "The topic's `cleanup.policy` must include `compact`. Topics with the default `delete` policy use append mode."
- **Upsert needs a record key**: "The topic must have a Kafka record key, which the Lightning Table uses as the primary key for deduplication. The key can be raw bytes, or it can use a schema in Avro, Protobuf, or JSON Schema format. **A Lightning Table doesn't support changes to the key schema.**" Tombstones (null value) delete the key; a later record re-adds it; last-write-wins.
- **Provisioning**: "Enabling a Lightning Table takes **several minutes**." Statuses `Pending` → `Provisioning` → `Active`, plus `Unavailable`, `Failed`, `Deleting`; `Off` when absent. "**You can query a Lightning Table only when its status is Active.**"
- **Retention is decoupled from the topic**: "The Lightning Table persists independently of the topic's retention policy. As a result, a Lightning Table query can return data that has already aged out of the topic."
- **Topic size / partition ceilings: UNCONFIRMED** — none documented. The only size limits are on query results.

### 1.7 Refresh / materialization interval — 100 ms, not 60 seconds

Verbatim, on two pages ([overview](https://docs.confluent.io/cloud/current/lightning-tables/overview.html) and [query/overview](https://docs.confluent.io/cloud/current/lightning-tables/query/overview.html)):

> "When you enable a Lightning Table for a topic, Confluent Cloud materializes the topic data into a table that's optimized for fast lookups. **Confluent Cloud updates the Lightning Table within 100 milliseconds of new data arriving in the topic.**"

Plus: "Lightning Table queries read your topic data with sub-second response times" and "Runs once and returns a result in less than a second."

**There is no documented 60-second refresh interval, and no documented refresh interval of any kind.** Exhaustive grep across the Lightning Tables, Streamhouse, RTCE and billing pages for `60 second`, `refresh interval`, `freshness`, `every minute`, `commit interval`, `checkpoint`: the only hits are the 100 ms / sub-second statements, plus one `Table freshness` link that belongs to **Tableflow** ("approximately every 5 minutes").

**The minute comes from Flink, not from Lightning.** [flink/concepts/delivery-guarantees](https://docs.confluent.io/cloud/current/flink/concepts/delivery-guarantees.html), verbatim:

> "Flink statements write to Kafka by using transactions. Flink commits transactions periodically, **approximately every minute**."
> "**Exactly-Once**: If you require exactly-once, each statement whose output a consumer reads typically adds up to roughly one minute of latency."
> "**At-Least-Once**: … set the Flink table option `'kafka.consumer.isolation-level' = 'read-uncommitted'`. With this configuration … you can **achieve an end-to-end latency below 100 ms**, but you can see some output messages twice."
> "each hop in the chain typically adds between zero and one commit interval of latency, **or about 30 seconds on average**."
> "Confluent is actively working on reducing the latency under exactly-once semantics."

**The honest composed claim for a Flink-fed Lightning Table is ~1 minute (Flink commit) + ≤100 ms (Lightning materialization), answered in under a second.** No Confluent page states that composition, so it is an inference across two doc sets — **UNCONFIRMED as a quotable claim**, though Confluent's own Streamhouse quick start observes it: "Within about a minute, both connecting passengers are at risk." Whether a Lightning Table reads its backing topic `read_committed` or `read_uncommitted` is **not stated anywhere** — that is the specific unknown.

The 100 ms figure is unambiguous only for a topic written **directly by a producer**.

### 1.8 Single-topic only

> "A Lightning Table query runs read-only SQL on **a single Lightning Table**."
> — [query/sql-reference](https://docs.confluent.io/cloud/current/lightning-tables/query/sql-reference.html)

**Supported**: key lookups; `WHERE` with `=`, `!=`, `>`, `<`, `>=`, `<=`, `IN`, `NOT IN`, `IS NULL`, `IS NOT NULL`, `LIKE`, `NOT LIKE`, `BETWEEN`; `AND`/`OR` compounds; column selection; `ORDER BY` asc/desc; `LIMIT`. Plus `SHOW TABLES` and `DESCRIBE <topic>` through the same endpoint.

**Rejected, verbatim:**
> - Aggregate functions (COUNT, SUM, AVG, MIN, MAX)
> - GROUP BY clauses
> - Joins
> - Subqueries
> - Set operators (UNION, EXCEPT, INTERSECT)
> - DDL statements (CREATE, ALTER, DROP)
> - DML statements (INSERT, UPDATE, DELETE)
>
> "Confluent Cloud rejects an unsupported query without running it."

**Design consequence**: an aggregate exposure across several source topics **must be computed in Flink** into one output topic, and the Lightning Table enabled on that topic. The age stamp must also be an explicit Flink-written column — Lightning cannot compute `MAX(...)`.

Naming: non-alphanumeric topic names need backticks (`` SELECT * FROM `web-orders` LIMIT 10; ``). "Quoted names are case sensitive, but unquoted names aren't." Unquoted column names come back uppercase.

### 1.9 What a CCU is and how it is sized

From [billing/dimensions/rtce](https://docs.confluent.io/cloud/current/billing/dimensions/rtce.html) — notably, this is the **one** newer component whose docs publish list prices outright instead of deferring to the pricing page.

> **Storage** — "$0.029 per GB-month, billed hourly, based on the average monthly bytes of materialized data stored."
> **Compute** — "measured in CCUs. The price is **$0.105 per CCU-hour**, which is **$0.00175 per CCU-minute**. Usage is metered every minute and rolled up into hourly billing increments."

One CCU, verbatim:
> - "**Hot memory size:** Compute for a hot memory size supporting roughly **40 GB** of base storage."
> - "**Query scan:** Up to **80 GB scanned** by your queries **per hour**, whether that's one large query or many small ones."
> - "**Ingest throughput:** Up to **10 MBps** of sustained data streaming in."
>
> "You pay for whichever meter is highest in a given minute. A CCU isn't "40 GB and 80 GB and 10 MBps" all at once. It's whichever single threshold your workload reaches."

Idle behaviour, verbatim and with a sharp edge:
> "If a table has no new data coming in and no queries running against it, you're **not charged any CCUs**; you pay only for storage on whatever's already materialized."
> "If data is streaming in but no queries have run yet, you're **still charged for the compute** required to keep the table materialized and current. This continues for as long as the topic stays actively streaming, even without any queries running against it."
> "If both throughput and queries stop, CCUs scale down to zero… Charges resume as soon as either data starts streaming in or queries start running again."

Also: "You're charged for the total amount of data scanned in a minute, not the number of queries that produced it: ten small queries and one large query cost the same if they scan the same amount of data." Both figures are "list prices before the regional multiplier is applied."

Terminology trap Confluent flags itself: Confluent **Compute** Unit ≠ Confluent **Consumption** Unit (marketplace billing).

Forecasting metrics ([monitor](https://docs.confluent.io/cloud/current/lightning-tables/monitor.html)), filterable and groupable by `metric.topic`, requiring `MetricsViewer`:
- `io.confluent.rtce/compute_utilization/ccu_minutes` (counter)
- `io.confluent.rtce/compute_utilization/dp_scanned_bytes` (counter)
- `io.confluent.rtce/storage_utilization/storage_bytes` (gauge)

**UNCONFIRMED**: whether a trickle of demo data bills a fraction of a CCU or rounds up to a whole one. The docs describe per-minute metering of "whichever meter is highest" without stating a rounding rule. Worst case for a continuously-streaming topic is ~$2.52/day.

---

## 2. The SQL query endpoint

### 2.1 The version string in the hypothesis is wrong

**The documented path is `/query/v1`, not `/query/v1alpha1`.** The string `v1alpha` appears **nowhere** in the Lightning Tables documentation set. Anything written against `v1alpha1` comes from an older source and should be corrected.

### 2.2 Endpoint, auth, shape

| Property | Value |
|---|---|
| Base URL | **`https://sql.<region>.<cloud>.confluent.cloud/query/v1`** — for this build, `https://sql.us-east-1.aws.confluent.cloud/query/v1` |
| Method | a single `POST`. `SHOW TABLES` and `DESCRIBE <topic>` go through the same path |
| Async status | `GET /query/v1/jobs/<env>/<lkc>/<topic>/<statement_id>/status` |
| Auth | "Requests to this endpoint use HTTP Basic authentication with a **Global API key**." → `Authorization: Basic <base64(key:secret)>` |
| RBAC | `DeveloperRead` on **both** the Kafka topic **and** the Schema Registry cluster |
| Stability | `v1`. Control-plane OpenAPI carries `x-lifecycle-stage: General Availability`. **But** see §1.2: the RTCE billing page calls direct API access an Early Access Program feature, contradicted by the API page and the 2026-11-04 release note |

([query/api](https://docs.confluent.io/cloud/current/lightning-tables/query/api.html), [execute-query-v-1-statement](https://docs.confluent.io/cloud/current/ccloud/execute-query-v-1-statement/))

**Request body** carries the catalog and database as the environment and cluster ids, plus the query. **Response shape** has two modes, verbatim:

> "If the query resolves in under **10 seconds** and returns less than **4 MiB**, the response will be an inline HTTP **200 OK**. Otherwise, a **202 Accepted** response redirects the client to retrieve results from a separate streamed data location."

Important detail for a proxy implementation: the presigned result download takes **no** `Authorization` header — "If you include one, cloud storage rejects the request." Every response carries `X-Request-Id`. Error codes: 400, 401, 403, **404 (table not yet queryable — retry)**, 429, 500.

### 2.3 Rate limits and result limits

| Limit | Value | Scope |
|---|---|---|
| Row limit | **none** | "A Lightning Table query that you run through the API has no row limit." |
| Max rows | 200 | **MCP only**, not the API |
| Query timeout | 20 s | **MCP only**, not the API |
| Sync → async switchover | 10 s or 4 MiB | API |
| Max result size | exists, value not published | **UNCONFIRMED** numerically — "A query result has a maximum size. If a result exceeds it, the job fails." |
| Rate limit | **numbers UNPUBLISHED — UNCONFIRMED** | "Lightning Table queries through the API share a rate limit with the Real-Time Context Engine MCP tools (`listTopics`, `getMetadata`, and `queryData`). Requests from either count toward that limit." Exceed → API `429`, MCP `RATE_LIMIT_EXCEEDED`. "Requests to the job status endpoint don't count toward this rate limit." |

The shared rate limit matters here: if the frontend polls the SQL API **and** a risk agent queries over MCP, both consume the same budget. No numeric quota appears in `get-started/regions.html`, `quotas/index.html`, or the OpenAPI spec.

### 2.4 Browser-direct vs a server-side proxy

**CORS: UNCONFIRMED.** Zero occurrences of `CORS`, `cross-origin`, or `Access-Control-Allow` in any Lightning Tables page, the RTCE pages, the Streamhouse pages, or the `query/v1` OpenAPI reference. No statement either way about a browser calling `sql.<region>.<cloud>.confluent.cloud/query/v1` directly.

**But CORS is not the deciding factor.** The auth model is a **Global API key** in an HTTP Basic header. A Global API key is, per [api-keys/overview](https://docs.confluent.io/cloud/current/security/authenticate/workload-identities/service-accounts/api-keys/overview.html), "Used to access all Confluent Cloud resources, with some limitations… limited to the organization in which it was created." Putting that in browser JavaScript exposes the whole organization. **A server-side proxy is mandatory on credential grounds regardless of what the CORS headers say.**

**Is a Vercel serverless route the sanctioned pattern?** As close as the docs get to endorsing anything. The Kafka REST page's own stated use cases are, verbatim:

> "serverless functions, CI/CD pipelines, shell scripts, or restricted environments where only HTTPS is permitted."
> — [kafka-rest-cc](https://docs.confluent.io/cloud/current/kafka-rest/kafka-rest-cc.html)

A serverless function is literally the first documented use case for the HTTPS surfaces. There is **no** Confluent documentation of a browser/BFF pattern specifically, and **no** official WebSocket or SSE path for Kafka, so this is "consistent with documented use" rather than "a documented reference architecture". Label the architectural endorsement **UNCONFIRMED**; the credential reasoning is not.

**Recommended shape for the three faces:**

| Face | Path | Why |
|---|---|---|
| Stream (ms) | serverless/long-lived service runs a **native Kafka consumer**, pushes to the browser over WebSocket or SSE | the Kafka REST API cannot consume (§7); there is no documented alternative |
| Lightning Table | serverless route proxies `POST .../query/v1` with the Global API key | credential containment; also lets you cache and shape the response |
| Open table (Iceberg) | serverless route runs a Flink snapshot query, or DuckDB/Athena against the catalog | both need credentials and a client library |

Note one wrinkle: a Vercel serverless function is short-lived, so the **stream face needs a long-running process** (an edge/long-running runtime, a separate small service, or a hosted WebSocket relay), not a plain request-scoped function. The Lightning and Iceberg faces are fine as request-scoped routes.

**Private networking**, if it ever becomes relevant ([private-networking](https://docs.confluent.io/cloud/current/lightning-tables/private-networking.html)): PNI and Ingress PrivateLink Gateway give `sql-<access_point_id>.<region>.aws.accesspoint.glb.confluent.cloud` (access point id with the hyphen stripped: `ap-abc123xyz` → `apabc123xyz`); the original PrivateLink Attachment gives `sql.<region>.aws.private.confluent.cloud`. **Console and CLI do not work over private networking** — use the API, JDBC or MCP.

### 2.5 The other query interfaces

| Interface | Entry | Auth |
|---|---|---|
| Console | Lightning Tables page → `Query data` icon → **Preview Lightning Table** pane, tabs `SQL` / `API` / `MCP` | Console session. Not available over private networking |
| CLI | `confluent lightning query --sql "…"` / `--file`, `--max-rows`, `-o human\|json\|yaml`. **Requires CLI 4.82.0+** | user account only: `confluent login`. "**It doesn't support signing in with an API key.**" Public endpoint only. Runs synchronously; fails rather than going async; `-o human` previews the first 100 rows; `-o json`/`-o yaml` fetch every row; statements up to ~1 MB; waits ~2 minutes incl. retries |
| JDBC | `jdbc:confluent:lightning://`, host `sql.<region>.<cloud>.confluent.cloud`, driver class `io.confluent.jdbc.avatica.ConfluentJdbcDriver`, **Java 17+**. Same driver as Flink JDBC — no standalone Lightning download | Global API key as `user`, secret as `password`, or `client.global-api-key`/`client.global-api-secret` in a properties file (`chmod 600`; "Clients often log connection URLs, so a URL can leak your API secret"). Flink-only properties such as `compute-pool-id` make the connection fail. Autocommit only, no batch execution, forward-only read-only result sets |
| MCP | see §8 | see §8 |

---

## 3. Region and cloud support matrix

The authoritative page is [get-started/regions](https://docs.confluent.io/cloud/current/get-started/regions.html), which carries per-feature Yes/No rows per region and a separate "Cluster type support by feature" table. **Treat that page as the source of truth over any transcription, including this one.**

### 3.1 For AWS us-east-1 — all four are supported

| Feature | AWS us-east-1 | Clouds | Cluster types |
|---|---|---|---|
| **Lightning Tables / RTCE** | **Yes** | **AWS only** (10 regions) | **Basic, Standard, Enterprise, Dedicated** (not Freight) |
| **Flink** | **Yes** | AWS, Azure, Google Cloud | **Yes for all five** cluster types |
| **Managed Model Inference** (`CREATE MODEL` with `'provider' = 'confluent'`) | **Yes** | **AWS, Azure, Google Cloud** | — |
| **Tableflow** | **Yes** | AWS, Azure, Google Cloud | **Yes for all five** cluster types |

**Nothing in the intended stack is unavailable in AWS us-east-1.** The cluster does not need to be rebuilt if it is already there.

### 3.2 Where each one is *not* available

**Lightning Tables / RTCE** — AWS only, the 10 regions in §1.4. Not on Azure, Google Cloud, AWS GovCloud or Jio Cloud. Not on Freight.

**Flink** — not available on AWS ca-west-1, ap-northeast-3, ap-southeast-4, ap-south-2, ap-southeast-5, eu-central-2, eu-south-2, me-central-1, il-central-1; Azure koreacentral, austriaeast, qatarcentral; Google Cloud us-west3, southamerica-west1, asia-east2, asia-northeast2/3, europe-west9, europe-central2, europe-west6, europe-west12, me-west1, me-central1.

**Managed Model Inference** — a per-region row on the regions page. On AWS: us-east-1, us-east-2, us-west-2, ca-central-1, Seoul, Sydney, Mumbai, Singapore, Frankfurt, Ireland, London. Also available on Azure and Google Cloud. No AWS GovCloud, no Jio Cloud, no AWS Middle East/Africa.

**Tableflow** — AWS us-east-1, us-east-2, us-west-2, ca-central-1, sa-east-1, ap-east-1, ap-northeast-1/2, ap-southeast-1/2/3, ap-south-1, eu-central-1, eu-north-1, eu-south-1, eu-west-1/2/3, me-south-1, af-south-1; most Azure (austriaeast and qatarcentral are No); most Google Cloud (us-west3, southamerica-west1, asia-east2, asia-northeast2/3, europe-west9, europe-central2, europe-west6, europe-west12, me-west1, me-central1 are No). Not on AWS GovCloud or Jio Cloud, and not for self-managed Confluent Platform.

### 3.3 Correction to a widely-repeated claim

The Streamhouse quickstart says the stack is "AWS-only by design (RTCE + Flink Native Inference are AWS-only)". **That is half right.**

- **Lightning Tables / RTCE are AWS-only** — confirmed.
- **Managed Model Inference is NOT AWS-only.** Release note 2026-10-23, verbatim: "Confluent Cloud for Apache Flink now supports managed AI models in compute pools that run on **AWS, Azure, and Google Cloud**." And [ai/managed-model](https://docs.confluent.io/cloud/current/ai/managed-model.html): "Managed Model Inference runs models on the cloud provider that hosts your compute pool: Amazon Bedrock on AWS, Vertex AI on Google Cloud, and Azure OpenAI on Azure. The syntax is the same on every cloud. Only the model name differs."

So the AWS-only constraint on this build is driven **by Lightning Tables alone**.

Also: **"Flink Native Inference" is not a Confluent product name.** It appears nowhere in Confluent's docs — zero hits in the Flink docs, the Cloud release notes, or the Platform changelog. The documented feature is **Managed Model Inference**. **UNCONFIRMED as a product name; do not use it in a deck.**

### 3.4 Flink must share the cluster's cloud and region

[compute-pools](https://docs.confluent.io/cloud/current/flink/concepts/compute-pools.html): "A compute pool is provisioned in a specific region" and "The statements using a compute pool can only read and write Apache Kafka® topics in the same region as the compute pool."

[flink/overview](https://docs.confluent.io/cloud/current/flink/overview.html): Flink "is a regional service"; Confluent Cloud "doesn't allow you to query across regions."

**Flink cannot read a Kafka cluster in a different region.** Create the compute pool in `aws` / `us-east-1`.

### 3.5 Managed model ids

Model **families** on AWS, from the [CREATE MODEL reference](https://docs.confluent.io/cloud/current/flink/reference/statements/create-model.html): Amazon Nova (LLM), Amazon Titan Text Embeddings (embedding), Anthropic Claude Opus / Sonnet / Haiku (LLM), OpenAI GPT-OSS Safeguard (LLM).

**A complete id catalogue is not published, by design.** Verbatim: "These are display names. Run `SHOW MODELS` to see the available models, and use the name without the `system.` prefix as the `confluent.model` value." And: "The list of available models depends on your cloud provider and region." So **"list every available id" is UNCONFIRMED** — the docs delegate it to `SHOW MODELS`.

Every literal id that appears anywhere in the docs (the exhaustive set found): `anthropic.claude-sonnet-4-6`, `openai.gpt-5.4-mini`, `google.gemini-3.5-flash`, `amazon.titan-embed-text-v2`, `openai.text-embedding-3-small`, `google.gemini-embedding-2`; and for direct reference `system.anthropic.claude-opus-4-8`, `system.openai.gpt-5.4-mini`, `system.google.gemini-3.5-flash`.

The quickstart's `'confluent.model' = 'anthropic.claude-sonnet-4-6'` is **confirmed verbatim** as the AWS text-generation example:
```sql
CREATE MODEL `managed_model_llm`
INPUT (prompt STRING) OUTPUT (response STRING)
WITH ('provider' = 'confluent', 'task' = 'text_generation',
      'confluent.model' = 'anthropic.claude-sonnet-4-6');
```
Models can also be called with **no `CREATE MODEL`** at all: "Reference a model by name directly in the AI_COMPLETE or AI_EMBEDDING functions, using the form `system.<provider>.<model>`."

Other `confluent`-scoped options: `confluent.system_prompt`, `confluent.PARAMS.*` (e.g. `'confluent.params.temperature' = '0.2'`).

**Discrepancy to note**: the 2026-03-03 release note says "Confluent Intelligence now supports Anthropic and Fireworks AI as remote model providers", and the CLI accepts connection types `anthropic` / `fireworksai`, but the `CREATE MODEL` provider list does **not** include them. `'provider' = 'anthropic'` as a `CREATE MODEL` value is **UNCONFIRMED**.

### 3.6 Agents: `CREATE TOOL` / `CREATE AGENT` / `AI_RUN_AGENT`

All exist in the official Flink SQL reference, none with a lifecycle banner:

| Statement | URL |
|---|---|
| `CREATE AGENT` | [create-agent](https://docs.confluent.io/cloud/current/flink/reference/statements/create-agent.html) |
| `CREATE TOOL` | [create-tool](https://docs.confluent.io/cloud/current/flink/reference/statements/create-tool.html) |
| `AI_RUN_AGENT` | [model-inference-functions](https://docs.confluent.io/cloud/current/flink/reference/functions/model-inference-functions.html) |
| `SHOW AGENTS` / `SHOW TOOLS` / `SHOW CREATE AGENT` / `SHOW CREATE TOOL` | [show](https://docs.confluent.io/cloud/current/flink/reference/statements/show.html) |
| `ALTER TOOL`, `DROP TOOL`, `DROP AGENT` | linked from the above |

**Status: Streaming Agents are GA as of 2026-05-19** — "Streaming Agents in Confluent Intelligence are now generally available, and you can now create, manage, and monitor Streaming Agents in the Confluent Cloud Console." The ladder was: preview (2025-08-19) → Open Preview (2025-10-29) → GA (2026-05-19). No Limited Availability rung.

Supported models ([ai/streaming-agents/overview](https://docs.confluent.io/cloud/current/ai/streaming-agents/overview.html)): "Anthropic / Gemini / OpenAI".

`CREATE TOOL` options, verbatim: "**type**: Tool type ('function' or 'mcp' or 'a2a') (Required)"; "**allowed_tools**: Comma-separated list of allowed tools (MCP only, Required)"; "**request_timeout**: Request timeout for external tools (Optional, default: '30')".

`CREATE AGENT` options: `max_consecutive_failures` (default `3`), `max_iterations` (default `20`); reflection via `TYPE = 'REFLECTION'`, `PASS_CONDITION` `'APPROVAL'`|`'CONFIDENCE'` (default APPROVAL), `CONFIDENCE_VALUE` 0.0–1.0 (default 0.8).

`AI_RUN_AGENT(agent_name, prompt [, request_id] [, system_table] [, invocation_config])` — "The function returns a ROW<String status, String response>." Used as a table function: `LATERAL TABLE(AI_RUN_AGENT('…', '…', request_id))`.

**UNCONFIRMED**: none of `CREATE AGENT`, `CREATE TOOL`, `CREATE MODEL`, `AI_RUN_AGENT` or `SHOW AGENTS` was ever announced in a dated release-notes entry — only the capability prose was. Do not date the statements.

Anomaly/forecast functions: `ML_DETECT_ANOMALIES` and `ML_FORECAST` are **GA** (ARIMA-based, 2025-08-19). `AI_DETECT_ANOMALIES`, `AI_FORECAST` and `AI_DETECT_PII` are **Early Access Program** features, stated on their own pages. `AI_FORECAST` defaults to IBM Granite TTM (`'model' VALUE 'ttm'`) and also supports `timesfm-2.5`, `flowstate`, `patchtstfm` — "All models are managed by Confluent and hosted in Confluent Cloud."

MCP connections from Flink: `CREATE CONNECTION … WITH ('type' = 'mcp_server', 'endpoint' = '…', 'token' = '…', 'transport-type' = 'STREAMABLE_HTTP')`, or `confluent flink connection create --type mcp_server --transport-type STREAMABLE_HTTP`. **`--transport-type` defaults to SSE**, so STREAMABLE_HTTP must be passed explicitly. "For REST and MCP_SERVER connection types, you must provide exactly one [authentication method]." **Terraform cannot create one** — see §5.

---

## 4. Tableflow prerequisites

### 4.1 Yes, there is now a Confluent-managed storage option

This is the biggest correction to the quickstart's approach. [configure-storage](https://docs.confluent.io/cloud/current/topics/tableflow/how-to-guides/configure-storage.html), verbatim:

> "There are **no additional configurations required** to use Confluent Managed Storage with Tableflow."

**No bucket. No IAM role. No AWS account at all.** The CLI default is literally `--storage-type MANAGED`, and the Terraform block is an empty `managed_storage {}`.

Trade-offs, all documented:
- **Iceberg only.** Delta Lake requires BYOS.
- **Does not sync to external catalogs.** Per [tableflow/overview](https://docs.confluent.io/cloud/current/topics/tableflow/overview.html), only custom-storage (BYOS) topics sync to Glue, Snowflake, Unity or Polaris. So **Athena is not available on managed storage** (Athena SQL, Redshift and EMR all route through Glue).
- Access is credential-vended: "Iceberg data in Confluent Managed Storage can only be accessed with credentials vended by the Tableflow Iceberg REST Catalog."
- Storage is billed separately on stored data, read/write request counts and transfer (same-region transfer is free).
- **Not available on privately networked clusters**: "Privately networked clusters do not support Tableflow-enabled topics using Confluent-managed storage" — BYOS only in that case.

**Recommendation for this build: use Confluent Managed Storage.** It removes an entire AWS prerequisite chain, and the queryable surfaces that remain (Flink snapshot queries, DuckDB, the built-in Iceberg REST catalog) are enough for the demo's third clock.

### 4.2 If you do use BYOS on AWS — minimum IAM permissions

Your own **empty** S3 bucket, in the **same region as the Kafka cluster**, plus a Confluent **provider integration** backed by an IAM role. Documented minimum permissions:

On the bucket: `s3:GetBucketLocation`, `s3:ListBucketMultipartUploads`, `s3:ListBucket`.
On objects: `s3:PutObject`, `s3:PutObjectTagging`, `s3:GetObject`, `s3:DeleteObject`, `s3:AbortMultipartUpload`, `s3:ListMultipartUploadParts`.

Cross-account buckets need a bucket policy. Cross-account KMS needs `kms:Decrypt`, `kms:Encrypt`, `kms:ReEncrypt*`, `kms:GenerateDataKey*`, `kms:DescribeKey`. "Tableflow exclusively uses Amazon S3 Gateway endpoints."

**The trust-policy mechanics**: `confluent_provider_integration` takes `aws { customer_role_arn }` and **exports `iam_role_arn` and `external_id`**, which you then feed back into the IAM role's trust policy. The Tableflow quickstart's Terraform builds this "in an order that breaks a circular dependency" — the role must exist to be referenced, but its trust policy needs values Confluent only emits after the integration is created. Expect a two-phase apply, or use `confluent_provider_integration_authorization` / `confluent_provider_integration_setup`.

Other clouds: **GCS** needs an empty bucket in the same region (dual-region OK if it includes that region; "Tableflow doesn't support multi-region buckets"), uniform bucket-level access, and a service account with `storage.objects.get/list/create/delete` + `storage.folders.create` (or `roles/storage.objectUser`). **Azure ADLS Gen2** needs hierarchical namespace enabled, an empty container, and roles `Storage Blob Data Contributor` + `Reader`.

**Terraform caveat**: `confluent_provider_integration` documents only `aws` — "Currently only `aws` config is supported" — despite GCP and Azure provider integrations existing in the Tableflow docs. The GCP/Azure Terraform path is **UNCONFIRMED**.

### 4.3 Catalogs

The **built-in Tableflow Iceberg REST Catalog** needs no setup. Endpoint format: `https://tableflow.<cloud_region>.aws.confluent.cloud/iceberg/catalog/organizations/<org_id>/environments/<env_id>` (substitute `gcp` on Google Cloud). The OAuth token URI is that endpoint + `/v1/oauth/tokens`. Needs endpoint URI + API key + secret.

Optional catalog integrations (**BYOS only**): AWS Glue Data Catalog, Snowflake Open Catalog / Snowflake Horizon, Databricks Unity Catalog, Apache Polaris. Terraform: `confluent_catalog_integration` with `aws_glue { provider_integration_id }` or `snowflake { endpoint, client_id, client_secret, warehouse, allowed_scope }`. Glue additionally needs `ProviderIntegrationResourceOwner` or `ProviderIntegrationAssigner`.

### 4.4 Schema Registry is mandatory

[tableflow/overview](https://docs.confluent.io/cloud/current/topics/tableflow/overview.html): Schema Registry is "the source of truth for table schemas"; Avro, Protobuf and JSON Schema supported; **both key and value must have a schema; schemaless topics are not supported.** Auto-handled evolution: add column, remove column, widen type (int→long). Compatibility-breaking changes need manual intervention.

**This is the same trap as Lightning Tables**: Datagen's `output.data.format` defaults to schemaless `JSON`, which satisfies neither. Set it to `AVRO`.

### 4.5 Commit interval

> "Tableflow publishes new data to a table **approximately every 5 minutes**."
> — [tableflow/overview](https://docs.confluent.io/cloud/current/topics/tableflow/overview.html), restated on [streamhouse/query-surface](https://docs.confluent.io/cloud/current/streamhouse/query-surface.html)

Higher-throughput topics can commit sooner, because Tableflow also commits when enough data accumulates. Snapshots: minimum 10, maximum 100 retained, **not user-configurable**. "A snapshot is created every time it commits a change to your table," including during maintenance such as compaction. Data TTL "waits up to 24 hours after at least one row in a Parquet file expires."

**There is no documented compaction interval, no documented end-to-end query latency figure, and no Terraform or CLI setting to change the commit cadence.** ~5 minutes is the only hard number.

### 4.6 Minimum steps and permissions

Quick-start prerequisites, verbatim ([quick-start-managed-storage](https://docs.confluent.io/cloud/current/topics/tableflow/get-started/quick-start-managed-storage.html)):

> - "DeveloperRead access on all schema subjects"
> - "CloudClusterAdmin access on your Kafka cluster"
> - "Assigner access on all provider integrations"

Full RBAC at [tableflow-rbac](https://docs.confluent.io/cloud/current/topics/tableflow/operate/tableflow-rbac.html): to enable on a topic, either `ResourceOwner` on the topic + `DeveloperRead` on all schema subjects, or `CloudClusterAdmin` on the cluster + `DeveloperRead` on schema subjects (`OrganizationAdmin` / `EnvironmentAdmin` also qualify). To read table data: `OrganizationAdmin`, `EnvironmentAdmin`, `CloudClusterAdmin`, `ResourceOwner`, or cluster-scoped `DeveloperRead`.

Minimum path with managed storage: create topic → produce with an Avro schema → `confluent tableflow topic enable <topic>` (defaults are `MANAGED` + `ICEBERG`) → copy the REST Catalog endpoint, mint a Tableflow API key → query.

### 4.7 What can query it without standing up a separate engine

**1. Flink snapshot queries — no external engine at all.** [query-with-flink](https://docs.confluent.io/cloud/current/topics/tableflow/how-to-guides/query-engines/query-with-flink.html): "Confluent Cloud for Apache Flink can read Tableflow tables only by using **snapshot queries**. Streaming queries can't read Tableflow tables." Enable with `SET 'sql.snapshot.mode' = 'now';` or the Snapshot mode dropdown in the workspace.

The behaviour is better than it sounds, verbatim from [snapshot-queries](https://docs.confluent.io/cloud/current/flink/concepts/snapshot-queries.html):

> "If Tableflow is not enabled on a topic, the query reads from Kafka. If Tableflow is enabled on a topic, the query reads the historical data that Tableflow has materialized into tables, **unioned with the live streaming data in Kafka**. This is true for both Confluent Managed Storage and custom storage (BYOS)."

Restrictions: only `AS OF NOW()` — "You can't query an arbitrary point in the past." "Flink also can't query Iceberg or Delta Lake tables that Tableflow didn't write." **SQL hints are ignored in snapshot mode**, so the `read-uncommitted` hint trick does not work there. `scan.bounded.*` / `scan.startup.*` options are ignored. Temporal joins (`FOR SYSTEM_TIME AS OF`) are **rejected** in batch mode, which includes snapshot queries. And: "Because Tableflow only materializes committed messages, the snapshot portion of the query always reflects only committed data, regardless of the isolation-level setting."

You still need a Flink compute pool, but no third-party engine. `SET 'sql.snapshot.mode'` is in the [SET options table](https://docs.confluent.io/cloud/current/flink/reference/statements/set.html), default `"off"`, valid values `"now"` and `"off"`.

**2. DuckDB against the built-in REST catalog — the lightest external client.** [query-with-duckdb](https://docs.confluent.io/cloud/current/topics/tableflow/how-to-guides/query-engines/query-with-duckdb.html). Works against **Confluent Managed Storage**. Needs `httpfs` + `iceberg` extensions, a `CREATE SECRET … TYPE ICEBERG` with client id/secret/endpoint and `OAUTH2_SCOPE 'catalog'`, then:
```sql
ATTACH 'warehouse' AS iceberg_catalog (TYPE iceberg, SECRET iceberg_secret, ENDPOINT '<url>');
SELECT * FROM iceberg_catalog."lkc-abc123"."test-topic-123" LIMIT 10;
```
**Documented live-demo hazards**: the DuckDB Iceberg extension is "experimental"; `ENDPOINT` must be given twice; and **after ~30 minutes queries fail with HTTP 401** — you must restart the session, recreate the secret and re-attach. Plan around that if DuckDB is on stage.

**3. Other documented engines** ([query-engines/overview](https://docs.confluent.io/cloud/current/topics/tableflow/how-to-guides/query-engines/overview.html)): AWS Athena (Trino SQL via `AwsDataCatalog`), Athena for Spark, Redshift (`awsdatacatalog`), EMR (`GlueCatalog`) — **all via Glue, therefore BYOS only**. Plus Snowflake, Trino, DuckDB, and Databricks via Unity Catalog (Delta). Tables are exposed read-only. **BigQuery and standalone Spark are named in prose but have no dedicated how-to page — UNCONFIRMED as first-class integrations.**

Gotcha: the metadata column naming setting "doesn't rename user-defined columns," so engines that reject `$` or `-` in column names still cannot read those tables.

---

## 5. Terraform and CLI coverage

### 5.1 Provider version

**v2.94.0, published 2026-11-06** — confirmed from three primary sources: the GitHub releases API (`tag_name: v2.94.0`, `published_at: 2026-11-06T04:10:39Z`), the Terraform Registry API, and the CHANGELOG heading `## 2.94.0 (November 6th, 2026)`. Cadence is roughly weekly.

**Practical note**: the HTML registry pages (`registry.terraform.io/providers/confluentinc/confluent/latest/...`) are JS-rendered and return no usable text to a fetcher. Read `github.com/confluentinc/terraform-provider-confluent/blob/master/docs/resources/*.md` instead, and use the registry **API** endpoint for version metadata.

### 5.2 Resource coverage for every requested piece

Names verbatim from `docs/resources` on `master`.

| Piece | Resource | Covered? |
|---|---|---|
| Environment | `confluent_environment` | Yes |
| Kafka cluster | `confluent_kafka_cluster` | Yes |
| Topic | `confluent_kafka_topic` | Yes |
| Schema | `confluent_schema` | Yes |
| Service account | `confluent_service_account` | Yes |
| Role binding | `confluent_role_binding` | Yes |
| API key | `confluent_api_key` | Yes — **but see the Global-key gap below** |
| Flink compute pool | `confluent_flink_compute_pool` (+ `confluent_flink_compute_pool_config`) | Yes |
| Flink statement | `confluent_flink_statement` | Yes |
| Tableflow topic | `confluent_tableflow_topic` | Yes |
| Catalog integration | `confluent_catalog_integration` — **no `tableflow_` prefix** | Yes |
| Connector | `confluent_connector` | Yes |
| **Lightning Table / RTCE topic** | **`confluent_rtce_topic`** (GA) | **Yes** |

Also relevant and present: `confluent_kafka_acl`, `confluent_kafka_cluster_config`, `confluent_kafka_mirror_topic`, `confluent_schema_registry_cluster_config`, `confluent_schema_registry_cluster_mode`, `confluent_subject_config`, `confluent_subject_mode`, `confluent_tag`, `confluent_tag_binding`, `confluent_business_metadata`, `confluent_business_metadata_binding`, `confluent_catalog_entity_attributes`, `confluent_flink_materialized_table` (GA), `confluent_flink_connection`, `confluent_flink_artifact`, `confluent_provider_integration` (+ `_authorization`, `_setup`), `confluent_custom_connector_plugin`, `confluent_connect_artifact`, `confluent_schema_registry_dek`, `confluent_schema_registry_kek`, `confluent_schema_exporter`, `confluent_kafka_client_quota`, `confluent_byok_key`, `confluent_identity_pool`, `confluent_identity_provider`, `confluent_tf_importer`.

**The Lightning Table resource is findable only if you know it is called `rtce`.** Searching the provider for `lightning` returns **zero hits** — in the CHANGELOG and in every resource filename. Confluent's Lightning Tables [manage](https://docs.confluent.io/cloud/current/lightning-tables/manage.html) page is the only place that bridges the two names.

A second materialized surface also exists: **`confluent_flink_materialized_table`** (GA, added in 2.71.0, 2026-04-30). In 2.90.0 it gained a `start_mode` block with `FROM_BEGINNING`, `FROM_NOW`, `FROM_TIMESTAMP`, `RESUME_OR_FROM_BEGINNING`, `RESUME_OR_FROM_NOW`, `RESUME_OR_FROM_TIMESTAMP`. Documented gotchas: removing `start_mode` after setting it is **not detected as drift** (set `kind = RESUME_OR_FROM_BEGINNING` explicitly to revert), and `session_options` is applied at creation only and ignored on update.

### 5.3 What has NO provider resource — the exact gap list

| Gap | Workaround | Severity for this build |
|---|---|---|
| **Global API key** | `confluent api-key create --resource global` (CLI). Needed for the Lightning Tables HTTP API and JDBC. **UNCONFIRMED** whether `confluent_api_key` can express a `global` scope — the resource doc describes managed-resource and cloud scopes | **Blocking for automation** — one CLI line is unavoidable |
| **Flink `mcp_server` connection** | Flink SQL `CREATE CONNECTION`, or `confluent flink connection create --type mcp_server`. `confluent_flink_connection` accepts only `OPENAI, AZUREML, AZUREOPENAI, BEDROCK, SAGEMAKER, GOOGLEAI, VERTEXAI, MONGODB, PINECONE, ELASTIC, COUCHBASE` — no `mcp_server`, `a2a`, `rest`, `confluent_jdbc`, `anthropic` or `fireworksai` | Only matters if a Flink-internal agent calls RTCE |
| **Schema Registry cluster** | None needed — `confluent_schema_registry_cluster` is a **data source only**; the cluster "is provisioned automatically" when the environment has a Stream Governance block | Not a gap in practice |
| **Inline schema authoring during Lightning Table enablement** | Console only. Avoid by registering the schema first with `confluent_schema` | Avoidable |
| **Lightning Table description via Console** | Not possible in the Console at all — PATCH, CLI `update`, or Terraform `description` | Terraform covers it |
| **Stream Governance downgrade** | Impossible anywhere: "You can upgrade to an Advanced governance package, but it is not possible to downgrade from Advanced to Essentials. The only option is to delete the environment, and start over." | **One-way door — do not set `advanced` casually** |
| **GCP / Azure provider integrations** | `confluent_provider_integration` documents only `aws`. **UNCONFIRMED** for other clouds | Irrelevant on AWS |

Other provider-level constraints worth knowing ([index](https://github.com/confluentinc/terraform-provider-confluent/blob/master/docs/index.md)):
- **OAuth does not cover four resource types**, which still need `cloud_api_key` / `cloud_api_secret`: `confluent_catalog_integration`, `confluent_custom_connector_plugin`, `confluent_flink_artifact`, `confluent_tableflow_topic` (and their data sources). With a static access token, token refresh is "NOT supported."
- "An Identity Provider must be set up first on Confluent Cloud before using the OAuth credentials for Terraform Provider."
- "Terraform version `1.6.0` is not supported." `max_retries` must be at least `4`. Large plans can still hit HTTP 429 — lower `-parallelism` or raise `max_retries`.
- Flink statements: "Terraform doesn't encrypt the sensitive `credentials` value"; provider-level `flink_principal_id` silently takes precedence over the `principal` block; "To stop a running statement, no other argument can be updated except `stopped`"; and "only 3 Flink statements support the resume feature, namely: `CREATE TABLE AS`, `INSERT INTO`, and `EXECUTE STATEMENT SET`."
- **UNCONFIRMED**: whether `confluent_rtce_topic` waits for `Active` or returns as soon as the API accepts (202). If it does not wait, the setup script needs a poll.

**Verdict on one-command setup**: `terraform apply` plus **two shell lines** (global API key; optionally the MCP connection). Teardown is `terraform destroy` plus **one shell line** (`confluent api-key delete`). That is achievable and genuinely clean.

### 5.4 CLI coverage

**v4.82.0, released 2026-11-03.** Its one new feature: `confluent lightning query`.

42 top-level entries in the [command reference index](https://docs.confluent.io/confluent-cli/current/command-reference/): `ai`, `api-key`, `asyncapi`, `audit-log`, `billing`, `budget`, `byok`, `ccpm`, `cloud-signup`, `cluster`, `completion`, `configuration`, `configurationcontrol`, `connect`, `context`, `endpoint`, `environment`, `feedback`, `flink`, `iam`, `kafka`, `ksql`, **`lightning`**, `local`, `login`, `logout`, `network`, `organization`, `plugin`, `prompt`, `provider-integration`, **`rtce`**, `schema-registry`, `secret`, `service-quota`, `shell`, `stream-share`, `switchover`, **`tableflow`**, `update`, `usm`, `version`.

**Lightning is split across two groups — this is a real trap:**
- **`confluent lightning`** — described as "Manage Lightning Tables", but has **exactly one** subcommand: `confluent lightning query`. **No create, enable or delete here.**
- **`confluent rtce`** — "Manage Real Time Context Engine." Lifecycle lives here: `confluent rtce region` and `confluent rtce rtce-topic` (create/delete/describe/list/update).

Timeline worth knowing: `rtce` commands landed in **v4.62.0 (2026-05-14)**, the same day as provider 2.73.0; the `lightning query` front door arrived only in **v4.82.0 (2026-11-03)**.

`confluent tableflow` exists ("Manage Tableflow") with `catalog-integration` and `topic` sub-groups. `confluent flink` has `artifact`, `compute-pool`, `compute-pool-config`, `connection`, `connectivity-type`, `endpoint`, `materialized-table`, `query`, `region`, `shell`, `statement`.

Install methods ([install](https://docs.confluent.io/confluent-cli/current/install.html)): Homebrew `brew install confluentinc/tap/cli`; APT/YUM repos at `packages.confluent.io/confluent-cli/`; Windows ZIP from GitHub releases; Docker `confluentinc/confluent-cli:latest`; or `curl -sL --http1.1 https://cnfl.io/cli | sh -s -- <version>`. Verify with `confluent version`; update with `confluent update`.

### 5.5 Verified command syntax for the setup script

Every flag below is copied from the official command reference. **REQUIRED** markers are the docs' own. Nothing here is invented.

#### Non-interactive login

`confluent login` has **no credential flags**. From the [login reference](https://docs.confluent.io/confluent-cli/current/command-reference/confluent_login.html), verbatim:

> "Email and password login can be accomplished non-interactively using the `CONFLUENT_CLOUD_EMAIL` and `CONFLUENT_CLOUD_PASSWORD` environment variables."

Also documented: `CONFLUENT_CLOUD_ORGANIZATION_ID` (equivalent to `--organization`). For Confluent Platform: `CONFLUENT_PLATFORM_USERNAME`, `CONFLUENT_PLATFORM_PASSWORD`, `CONFLUENT_PLATFORM_MDS_URL`, `CONFLUENT_PLATFORM_CERTIFICATE_AUTHORITY_PATH`.

> "SSO login can be accomplished headlessly using the `--no-browser` flag, but **non-interactive login is not natively supported**."

Token lifetime: "Authentication tokens last 8 hours and are automatically refreshed with CLI client usage." (The `--save` flag text says one hour for Cloud — the page is internally inconsistent on this.)

Flags: `--url`, `--certificate-authority-path`, `--client-cert-path`, `--client-key-path`, `--certificate-only`, `--no-browser`, `--organization`, `--prompt`, `--save`. None REQUIRED.

> **Two things to know before writing the script:**
> 1. **`CONFLUENT_CLOUD_API_KEY` and `CONFLUENT_CLOUD_API_SECRET` are UNCONFIRMED.** These names appear **nowhere** in the CLI documentation — grepped across the login, install, connect, beginner-cloud, FAQ, troubleshoot, overview, migrate, plugins, configuration-list and API-keys pages: **zero hits.** Treat them as undocumented.
> 2. **You cannot `confluent login` with an API key.** The reference offers only email+password, SSO, or mTLS (`--certificate-only`). API keys are supplied per-resource instead: `confluent api-key store <key> <secret> --resource <id>` then `confluent api-key use <key>`; or directly on data-plane commands, `confluent kafka topic produce|consume --bootstrap <endpoint> --api-key <k> --api-secret <s>`. Official statement ([cli-multiple-credentials](https://docs.confluent.io/cloud/current/security/access-control/cli-multiple-credentials.html)): "`confluent kafka topic produce` and `confluent kafka topic consume` support the `--bootstrap`, `--api-key`, and `--api-secret` flags directly."
> 3. **`confluent context create` has been removed** from the current CLI — the URL now redirects to the `context` index; only `delete|describe|list|update|use` remain. A script written against v3 docs will break on v4.82.
>
> A per-command "works with API-key auth vs requires user login" matrix is **UNCONFIRMED** — no such page exists. Only produce/consume are documented as API-key-authenticable.

```sh
export CONFLUENT_CLOUD_EMAIL="..."
export CONFLUENT_CLOUD_PASSWORD="..."
confluent login
```

#### Environments and clusters

```sh
confluent environment list [-o json|yaml] [--context <name>]
confluent environment create <name> [--governance-package essentials|advanced]
confluent environment use <env-id>          # no flags beyond globals
```
`--governance-package`, verbatim: "Specify the Stream Governance package as "essentials" or "advanced". On create, if not specified, the "essentials" package is used. **Downgrading the package from "advanced" to "essentials" is not allowed** once the Schema Registry cluster is provisioned."

```sh
confluent kafka cluster list [--all] [--environment env-xxx] [-o json]
confluent kafka cluster create <name> --cloud aws --region us-east-1 \
  [--type basic] [--availability single-zone] [--cku N] [--max-ecku N] \
  [--deletion-protection] [--byok <key-id>] [--network <id>] [--environment env-xxx]
confluent kafka cluster describe [lkc-xxx] [--environment env-xxx] [--kafka-endpoint <ep>]
confluent kafka cluster use <lkc-xxx>       # no flags beyond globals
```
`--cloud` and `--region` are **REQUIRED**. `--type` **defaults to `basic`** and accepts `basic | standard | enterprise | freight | dedicated`. `--availability` **defaults to `single-zone`** and accepts `single-zone | multi-zone | low | high`. `--cku` is "Required for Kafka clusters of type "dedicated"". Note: "You cannot use this command to create a cluster that is configured with AWS PrivateLink."

#### Topics

```sh
confluent kafka topic create <topic> [--partitions N] \
  [--config cleanup.policy=compact,retention.ms=604800000] \
  [--cluster lkc-xxx] [--environment env-xxx] [--dry-run] [--if-not-exists]
```
`--config`, verbatim: "A comma-separated list of configuration overrides ("key=value") for the topic being created." No flag is REQUIRED; `--partitions` has no documented default. **`--replication-factor` is on-premises only** — it is absent from the Cloud flag list.

For an **upsert** Lightning Table, set `--config cleanup.policy=compact` and produce with a record key.

#### API keys — including the Global key

```sh
confluent api-key create --resource cloud                               # (a) Cloud / control-plane
confluent api-key create --resource lkc-123456 [--service-account sa-x] # (b) Kafka cluster
confluent api-key create --resource lsrc-123456                         # (c) Schema Registry
confluent api-key create --resource flink --cloud aws --region us-east-1 # (d) Flink region
confluent api-key create --resource tableflow                           #     Tableflow
confluent api-key create --resource global                              # (e) GLOBAL
confluent api-key list [--resource <...>] [--current-user] [--environment env-xxx] [-o json]
confluent api-key delete <key> [--force]
confluent api-key use <key>
confluent api-key store <key> <secret> --resource <id> [-f]
```

`--resource` is the only **REQUIRED** flag on create. Verbatim from the [create reference](https://docs.confluent.io/confluent-cli/current/command-reference/api-key/confluent_api-key_create.html):

> "REQUIRED: The ID of the resource the API key is for. Use "cloud" for a Cloud API key, "global" for a Global API key, "flink" for a Flink API key, or "tableflow" for a Tableflow API key."
> "Specify a Kafka cluster ID (for example, lkc-abc123) … to create a Kafka cluster API key, a Schema Registry cluster ID (for example, lsrc-abc123) to create a Schema Registry API key… **To create a Global API key that can be used across all supported Confluent Cloud resources, specify "global".**"

So **a Global key is a `--resource` value, not a separate flag.** Other flags: `--description`, `--cloud`, `--region`, `--use`, `--environment`, `--service-account`, `-o/--output`.

Minor doc inconsistency: the description says a Flink key needs `--environment` + `--region`, while the example uses `--cloud` + `--region`. Both flags exist; pass all three to be safe.

`api-key list` takes the same `--resource` value set but it is **not** REQUIRED there, and that command has **no `--context` flag**. `api-key delete` accepts multiple keys and `--force`. `api-key use` has no flags.

#### Schema Registry

```sh
confluent schema-registry cluster describe [--environment env-xxx] [-o json] \
  [--schema-registry-endpoint <url>]
confluent schema-registry endpoint list [--environment env-xxx] [-o json]
confluent schema-registry schema create --subject <subject> --schema <file> --type avro \
  [--references <file>] [--metadata <file>] [--ruleset <file>] [--normalize] \
  [--environment env-xxx] [--schema-registry-endpoint <url>] [-o json]
```

`--schema` and `--subject` are **REQUIRED** on `schema create`. `--type` accepts "avro", "json" or "protobuf". Example from the docs: `confluent schema-registry schema create --subject employee --schema employee.avsc --type avro`.

Two documented caveats:
- `cluster describe` carries a Warning: "The "Private Endpoint URL" output field is deprecated. Please use the "Private Regional Endpoint URLs" field instead." And operationally, "in current versions, `confluent schema-registry cluster describe` returns only the PrivateLink Attachment private endpoints, whereas `confluent schema-registry endpoint list` lists all endpoints."
- The quick start names the references flag `--refs`; the command reference says `--references`. **Trust the reference.**

**Output field lists for both describe and endpoint list are UNCONFIRMED** — neither reference page shows sample output.

**`--ruleset` ("The path to schema ruleset file") is the one CLI route to a data contract rule**, though no doc narrates it.

Endpoint form: `https://psrc-<id>.<region>.<cloud>.confluent.cloud`. **Schema Registry needs its own API key**, verbatim ([get-started/schema-registry](https://docs.confluent.io/cloud/current/get-started/schema-registry.html)): "The API key for Confluent Cloud Schema Registry is **distinct** from the API key you created for Kafka clusters in the same environment… You need an API key/secret pair for each Kafka cluster and another for the Schema Registry cluster." Region is fixed: "The Schema Registry cluster is automatically assigned to the same region as this first Kafka cluster deployed in an environment. **This Schema Registry region does not change.**"

Client properties: use the **unprefixed** `basic.auth.credentials.source=USER_INFO` and `basic.auth.user.info=<key>:<secret>` — "The `schema.registry` prefixed versions of these properties were deprecated in Confluent Platform 5.0." Shell env: `SCHEMA_REGISTRY_URL`, `SCHEMA_REGISTRY_BASIC_AUTH_USER_INFO`.

**Auto-registration is ON by default**, including on Cloud: "By default, client applications automatically register new schemas… This is convenient in development environments, but in production environments it's recommended that client applications do not automatically register new schemas." Disable client-side with `auto.register.schemas=false`. It is a **client-side serializer default, not a Cloud toggle** — no Cloud-side setting to forbid it is documented (**UNCONFIRMED**).

#### Lightning Tables

```sh
confluent rtce rtce-topic create --cloud aws --region us-east-1 \
  --topic-name <topic> --description "<model-readable description>" \
  [--environment env-xxx] [--cluster lkc-xxx] [--wait] [--timeout 30m] [-o json]
confluent rtce rtce-topic list [--cloud aws] [--region us-east-1] \
  [--environment env-xxx] [--cluster lkc-xxx] [-o json]
confluent rtce rtce-topic describe <topic-name> [--environment env-xxx] [--cluster lkc-xxx]
confluent rtce rtce-topic update <topic-name> [--description "<text>"]
confluent rtce rtce-topic delete <topic-name> [...more] [--force]
confluent rtce region list

confluent lightning query --sql "SELECT * FROM my_topic LIMIT 10" \
  [--file <path>] [--cluster lkc-xxx] [--environment env-xxx] [--max-rows N] [-o json]
```

On create, **all four of `--cloud`, `--description`, `--region`, `--topic-name` are REQUIRED**; `--cloud` accepts only `aws`; `create` takes **no positional argument**; `--timeout` defaults to `1h0m0s`. **Use `--wait`** so the script does not race the `Provisioning` → `Active` transition.

> **Doc conflict**: the CLI reference and Terraform both mark `--description` / `description` **Required**; the Lightning Tables manage page calls it "Optional". **Treat it as required.**

`confluent lightning query` needs **CLI 4.82.0+**, uses the **logged-in user account** (it "doesn't support signing in with an API key"), works on the **public endpoint only**, and defaults to 100 rows in `-o human` (`--max-rows 0` = no limit; `-o json`/`-o yaml` fetch every row and return a bare array of row objects). When `--max-rows` truncates, a warning goes to stderr and the exit code is still 0.

#### Flink

```sh
confluent flink compute-pool create <name> --cloud aws --region us-east-1 \
  [--max-cfu 5] [--environment env-xxx] [--default-pool] [--wait] [--timeout 30m]
confluent flink statement create [name] --sql "<SQL>" \
  [--compute-pool lfcp-xxx] [--database <cluster id>] [--service-account sa-xxx] \
  [--property sql.current-catalog=<env name>] [--cloud aws] [--region us-east-1] \
  [--environment env-xxx] [--wait]
confluent flink connection create <name> --cloud aws --region us-east-1 \
  --type mcp_server --endpoint <url> --transport-type STREAMABLE_HTTP [--api-key ...]
confluent flink region list
```

`compute-pool create`: `--cloud` and `--region` are **REQUIRED**; **`--max-cfu` defaults to 5**. (Terraform restricts `max_cfu` to `5, 10, 20, 30, 40, 50`; max per pool is 50; "you can't decrease Max CFUs" after creation.)

`statement create`: **`--sql` is REQUIRED**. Useful properties: `sql.current-catalog` = environment display name, `sql.current-database` = Kafka cluster display name.

`connection create`: `--cloud`, `--region`, `--type` and `--endpoint` are all **REQUIRED**. `--type` accepts, verbatim: "openai", "azureml", "azureopenai", "anthropic", "fireworksai", "a2a", "bedrock", "sagemaker", "googleai", "vertexai", "mongodb", "elastic", "pinecone", "couchbase", "confluent_jdbc", "rest", "mcp_server", "cosmosdb", or "s3vectors". **`--transport-type` defaults to SSE**, so `STREAMABLE_HTTP` must be passed explicitly. Credential flags: `--api-key`, `--aws-access-key`, `--aws-secret-key`, `--aws-session-token`, `--service-key`, `--username`, `--password`, `--token`, `--token-endpoint`, `--client-id`, `--client-secret`, `--scope`, `--sse-endpoint`.

#### Tableflow

```sh
confluent tableflow topic enable <name> [--cluster lkc-xxx] [--environment env-xxx] \
  [--storage-type MANAGED] [--table-formats ICEBERG] [--retention-ms 604800000] \
  [--error-handling SUSPEND|SKIP|LOG] [--log-target <topic>] \
  [--provider-integration <id>] [--bucket-name <bucket>] \
  [--metadata-column-naming-scheme DEFAULT|PORTABLE]
confluent tableflow topic disable <name>
confluent tableflow topic list|describe|update
confluent tableflow catalog-integration create|delete|describe|list|update
```

`--storage-type` **defaults to `MANAGED`** and accepts `MANAGED | BYOS | AzureDataLakeStorageGen2 | GoogleCloudStorage`. `--table-formats` **defaults to `ICEBERG`** and is documented as singular-valued ("One of DELTA or ICEBERG") despite the plural name. `--retention-ms` defaults to `"604800000"`. **There is no `--managed-storage` flag.** `--record-failure-strategy` is marked **DEPRECATED** — use `--error-handling`.

No flag is marked REQUIRED, so the minimal managed-storage invocation really is `confluent tableflow topic enable <topic>`.

#### IAM

```sh
confluent iam service-account create <name> [--description "<text>"] [--resource-owner <id>]
confluent iam rbac role-binding create --role <Role> --principal User:u-xxx \
  [--environment env-xxx] [--current-environment] [--cloud-cluster lkc-xxx] \
  [--kafka-cluster lkc-xxx] [--schema-registry-cluster lsrc-xxx] \
  [--flink-region aws.us-east-1] [--resource "Topic:my-topic"] [--prefix]
```
`--role` and `--principal` are **REQUIRED**. `--principal` uses "Prefix:ID" format. `--flink-region` is "formatted as "cloud.region"". `--resource` uses "Prefix:ID" format too.

#### Connectors

```sh
confluent connect cluster create --config-file config.json [--cluster lkc-xxx] [--environment env-xxx]
```
`--config-file` is **REQUIRED**: "JSON connector configuration file." Shape from the docs' own example: `{ "name": ..., "config": { "connector.class": ..., ... }, "offsets": [...] }`.

---

## 6. Governance mechanics

### 6.1 Which package each feature needs

Verbatim rows from [stream-governance/packages](https://docs.confluent.io/cloud/current/stream-governance/packages.html):

| Feature | Essentials | Advanced |
|---|---|---|
| Schema Registry | Yes | Yes |
| Schema Registry SLA | 99.5% | 99.99% |
| SR calls/sec | Read 75 / Write 25 | Read 75 / Write 25 |
| **Data rules** | **No** | **Yes** |
| Schemas included | **100** | **20,000** |
| Exporters included | 10 | 100 |
| Stream catalog tags | **Yes** | Yes |
| Stream catalog business metadata | **No** | **Yes** |
| Stream catalog REST API | Yes | Yes |
| Stream catalog GraphQL API | **No** | **Yes** |
| Data portal | **Yes** | Yes |
| Stream lineage (last 10 minutes) | Yes | Yes |
| **Stream lineage (point in time: last 7 days)** | **No** | **Yes** |
| AsyncAPI export/import | Yes | Yes |

The matrix has **one** "Data rules" row — it does not break out data quality rules, migration rules, CSFLE or "data contracts". Mapping those needed other pages:

- **CSFLE → Advanced only.** "CSFLE is only available with the Stream Governance Advanced package." ([csfle/overview](https://docs.confluent.io/cloud/current/security/encrypt/csfle/overview.html)) Prerequisite on [client-side](https://docs.confluent.io/cloud/current/security/encrypt/csfle/client-side.html): "Stream Governance Advanced package must be enabled." **CSFLE does not appear in the packages comparison table at all** — the Advanced requirement comes only from the CSFLE pages.
- **All schema rules (data quality + migration) → Advanced only.** "Schema rules are only available on Confluent Enterprise and Confluent Cloud with the Stream Governance Advanced package." ([data-contracts](https://docs.confluent.io/cloud/current/sr/fundamentals/data-contracts.html))
- **Business metadata → Advanced only.** "Business metadata is only available in the Advanced package for Stream Governance."
- **Tags and the Data Portal are in Essentials.** This corrects a common assumption.

Cost: Essentials has no base charge. Advanced is "**Upgrade to Stream Governance Advanced starting at $1/hour**" — the only dollar figure on any primary source, and roughly **$24/day**. Per-schema-hour and per-rule-hour rates **UNCONFIRMED**. Rules are billed individually: "if you apply multiple Client-Side Field Level Encryption encryption rules to the same schema, **each rule is billed separately**."

**One-way door**: "You can upgrade to an Advanced governance package, but it is not possible to downgrade from Advanced to Essentials. The only option is to delete the environment, and start over."

### 6.2 Data quality rules — how they are actually configured

A rule has `name`, `doc`, `kind` (CONDITION | TRANSFORM), `type`, `mode`, `tags`, `params`, `expr`, `onSuccess`, `onFailure`. Built-in types ([data-contracts](https://docs.confluent.io/cloud/current/sr/fundamentals/data-contracts.html)):

- **`CEL`** — data quality rules. "CEL is the Google Common Expression Language." Example: `"expr": "size(message.ssn) == 9"`.
- **`CEL_FIELD`** — field transforms. "Field transformations support only primitive types (string, bytes, int, long, float, double, boolean). They don't support enums."
- **`JSONATA`** — migration rules.
- SQL-like `CHECK` constraints on Logical Types: "It compiles to a domain rule under Rules."
- Inline rules: "run only when the client sets the `validation.rules.execution` serializer property, and only during serialization, not deserialization."

Modes, verbatim: "**Domain rules run during serialization (WRITE), deserialization (READ), or both (WRITEREAD).**" / "**Migration rules run in UPGRADE mode, DOWNGRADE mode, or both (UPDOWN).**" In JSON they sit under `ruleSet.domainRules` and `ruleSet.migrationRules`. A global rule can be set with `PUT <SR_URL>/config`.

**Interface — REST, or the CLI's `--ruleset` flag.** Every documented example is a `curl -X POST .../subjects/<subject>/versions` with a `"ruleSet"` body. The CLI has `confluent schema-registry schema create --ruleset <file>` ("The path to schema ruleset file"), which is the one CLI route, though no doc narrates it.

**Console authoring of CEL data quality rules: UNCONFIRMED, and the evidence points to "no".** The data-contracts page links to "Manage Data Contracts in Confluent Cloud", but that link resolves to [sr/schemas-manage](https://docs.confluent.io/cloud/current/sr/schemas-manage.html), which contains **no rule-authoring section** — only View / Create / Infer / Edit / Compare / Tag. The **only** documented Console rule flow is for encryption ([manage-csfle](https://docs.confluent.io/cloud/current/security/encrypt/csfle/manage-csfle.html)): "Select a schema from the list, click **Evolve**, then click **Rules** > **Add rules**… Open the **Category** dropdown list and select **Data encryption rule**." The dropdown implies other categories exist, but **no Confluent doc names a "data quality rule" category.**

**Terraform**: `confluent_schema` is the documented schema resource, but **nothing says it carries a `ruleSet`** — **UNCONFIRMED**.

**Failure handling — there is a DLQ rule action.** "You can set these values to **NONE, ERROR, DLQ, or a custom action type.**" Default `onFailure` is `ERROR`, `onSuccess` is `NONE`. Example: `"params": { "dlq.topic": "bad-data" }, "onFailure": "DLQ"`.

**Three limitations that will shape the demo, verbatim:**
1. "**The non-Java clients (.NET, go, Python, JavaScript) don't yet support the DLQ action.**" A Node or Python producer gets a thrown serialization error, not a routed record.
2. "**Flink SQL and ksqlDB don't support rules execution** in either Confluent Platform or Confluent Cloud."
3. "**Kafka Connect on Confluent Cloud doesn't support rules execution.**"

Plus: "Schema rules are only executed for the root schema, not referenced schemas."

**So a data-quality-rule demo must run through a client serializer** — not Flink, not Connect.

### 6.3 CSFLE — how it is configured

**Package: Advanced only.**

**Supported clients, verbatim** ([client-side](https://docs.confluent.io/cloud/current/security/encrypt/csfle/client-side.html)):

> "**Confluent Platform or Apache Kafka® Java Client** — Confluent Platform 7.4.5+ (Kafka 3.4.5+) / 7.5.4+ (3.5.5+) / 7.6.1+ (3.6.1+)
> **Confluent Go Client** — Requires version 2.5.0 or later
> **Confluent .NET Client** — Requires version 2.5.0 or later
> **Confluent JavaScript Client for Apache Kafka®** — Requires version 0.2.1 or later. Version 1.3.2 adds support for Data Quality rules using CEL.
> **Confluent Python Client for Kafka** — Requires version 2.8.0 or later."

**CSFLE is not Java-only.** Node is supported from JS client **0.2.1**, Python from **2.8.0** — so a Node or Python backend can do CSFLE. Two separate JS minimums matter: CSFLE from 0.2.1, CEL data quality rules from 1.3.2. **But the DLQ rule action is Java-only**, which is the real constraint on a Node/Python backend. "librdkafka-based clients are supported" as a blanket claim is **UNCONFIRMED** — the word `librdkafka` appears nowhere on the CSFLE pages, and no C or C++ client is listed.

**KMS options, verbatim**: "AWS Key Management Service (AWS KMS) / Azure Key Vault / Google Cloud Key Management Service (Cloud KMS) / Hashicorp Vault Transit Secrets Engine. Applies only when the KEK is not shared with Confluent. / Local key (for testing only)". The Console add-key flow is narrower: "Supported key management options include AWS, Azure, and Google Cloud" — **no Vault in the Console**.

**Interface**: the Console path is the one documented rule-authoring flow — schema → **Evolve** → **Rules** → **Add rules** → Category = **Data encryption rule**. Terraform has `confluent_schema_registry_kek` and `confluent_schema_registry_dek` for the key material.

**Constraints**: "Encryption is only supported for fields of type **string or bytes**." / "Before using the tags, you must add the tag definitions in Stream Catalog." / "For a schema with inline tags, catalog tags can't be applied. The request returns a 4xx error." / "You are billed for each encryption rule."

**Flink + CSFLE is Limited Availability** ([flink-integration](https://docs.confluent.io/cloud/current/security/encrypt/csfle/flink-integration.html)): "Client-side field level encryption (CSFLE) and client-side payload encryption (CSPE) with Flink is a **Limited Availability** feature in Confluent Cloud… If you would like to participate in the Limited Availability Program, **contact your Confluent account team**." Two modes: **transparent decryption** ("requires that you share Key Encryption Keys with Confluent") and **deterministic encryption** ("Flink processes encrypted data without decrypting it… supports limited operations like equality comparisons, grouping, and joins"). Permissions: "DeveloperWrite is required for the first write, which generates the Data Encryption Key. After the first write, DeveloperRead is enough."

LA limitations, verbatim: "**Schema evolution is not supported for running statements.**" / "**Encryption rule changes are not supported for running statements.** … It **silently** continues to use the encryption rules that were captured when the statement was created." / "**Data Encryption Keys refresh every five minutes.**" And decisively: "If the KEK is not shared: **Stream processing on decrypted data in Confluent Cloud using Flink is not possible.**"

Bonus: "Tableflow can materialize Kafka topics that use CSFLE into Apache Iceberg™ or Delta Lake tables. Depending on whether you share key access with Confluent Cloud, Tableflow either decrypts the tagged fields into plaintext columns or preserves them as ciphertext."

**Implication for this build**: if CSFLE is in scope and the pipeline runs through Flink, you are in a Limited Availability program that needs an account-team conversation, **and** you must share KEKs with Confluent for Flink to see plaintext. If CSFLE is applied at the producer and the field is never processed in Flink, it works on Advanced with no LA program. **Choose the second shape if possible.**

### 6.4 Dead letter topics — three products, one vocabulary

This is more capable than expected, and the three defaults differ.

**Connect — auto-created, always on, sink only.** [connectors/dead-letter-queue](https://docs.confluent.io/cloud/current/connectors/dead-letter-queue.html): "In Confluent Cloud, the connector does not stop when serde errors occur. Instead, the connector continues processing records and sends the errors to a Dead Letter Queue (DLQ)." / "**The DLQ topic is created automatically**, based on the resource associated with the connector API key" / "The topic is named **`dlq-<connector-ID>`**". Sink-only: "Dead Letter Queues (DLQs) are only applicable for sink connectors." **Source connectors have no DLQ.**

Properties: `errors.tolerance` (default `none`; `all` "changes the behavior to skip over problematic records"), `errors.log.enable` (default `false`), `errors.deadletterqueue.topic.name` (on Cloud, "If you don't set this property, it defaults to `dlq-${connector}`"), `errors.deadletterqueue.context.headers.enable` (default `false`), `errors.deadletterqueue.topic.replication.factor` (default 3), `errors.retry.timeout` (default 0).

**Cloud-specific catch** ([connectors/limits](https://docs.confluent.io/cloud/current/connectors/limits.html)): "Additional connector properties | **Configurable through the Confluent REST API and Confluent CLI only, not the Confluent Cloud Console**". The `errors.*` set is in that list. Also: "You cannot add a sink connector's DLQ topic to the list of topics consumed by the same sink connector." Header keys on real Cloud records use **two** underscores (`__connect.errors.topic`); the concepts page prints one — a docs defect.

**Flink — a real DLQ.** [configure-dlq](https://docs.confluent.io/cloud/current/flink/how-to-guides/configure-dlq.html): "A Dead Letter Queue (DLQ) captures records that Confluent Cloud for Apache Flink cannot deserialize, enabling your statements to continue processing instead of failing." Scope limit, verbatim: "**DLQ error handling applies only to deserialization errors at the source. Errors in user-defined functions (UDFs), serialization, or windowed aggregations are not routed to the DLQ.**"

Property ([create-table](https://docs.confluent.io/cloud/current/flink/reference/statements/create-table.html)): `error-handling.mode`, **default `fail`**, values `fail | ignore | log`. "**log:** The error is logged to a Dead Letter Queue (DLQ) table and processing continues." Plus `error-handling.log.target` (default `error_log`). "**Only table-level overrides are supported. Per-statement overrides are not supported.**" Metric `io.confluent.flink/num_records_in_errors`, which "increments once per record that fails source deserialization, independent of `error-handling.mode`". Gotcha: "If DLQ creation fails … the CREATE TABLE or ALTER TABLE statement itself **does not fail**. The failure surfaces later when the first deserialization error occurs."

**Tableflow — a log mode, same property names.** [configure-tableflow](https://docs.confluent.io/cloud/current/topics/tableflow/operate/configure-tableflow.html): "Tableflow offers three modes for handling per-record materialization failures: `suspend`, `skip`, and `log`. **The default mode is `suspend`.**"
- `suspend` — "causes Tableflow to enter the Pause state whenever a record can't be materialized". Note: "Failures that occur for reasons that are not record-specific always cause Tableflow to enter the Pause state, regardless of the configured `error-handling.mode`."
- `skip` — "skips over records that fail to materialize… reports the number of skipped records in the `rows_skipped` metric."
- `log` — "sends records that fail to materialize to a dead letter queue (DLQ) topic. The DLQ is a Kafka topic in the same cluster as your Tableflow table." **Critical restriction**: "Failure handling with log mode is available only for topics that are configured with **Avro or Protobuf** schemas." (Not JSON Schema.) "The account enabling or updating Tableflow to use the `log` error-handling mode must have write permissions on the DLQ topic."

Confirmed shared vocabulary, from the Flink side: "Tableflow uses the same `error-handling.mode` and `error-handling.log.target` table properties and the same DLQ schema."

CLI: `--error-handling SUSPEND|SKIP|LOG` and `--log-target <topic>`; `--record-failure-strategy` is **DEPRECATED**. Property names `tableflow.error.handling` and `tableflow.record.failure.strategy` are **UNCONFIRMED** — the property is `error-handling.mode`.

**No Stream Governance package is required for any of the three DLQ mechanisms** — they are Connect, Flink and Tableflow features, not governance features. Only the *schema-rule* `DLQ` action needs Advanced (and is Java-only).

### 6.5 Stream lineage

[stream-lineage](https://docs.confluent.io/cloud/current/stream-governance/stream-lineage.html)

**Retention per package, verbatim**: "Point-in-time lineage allows to visualize the flow of data at a point in time in the past. The **Essentials package only allow users to visualize the flow of data from the past 10 minutes**, but with point-in-time feature, **only available on Advanced package**, a user can choose to see last 10 minutes, 30 minutes, 1 hour, 4 hours, 8 hours, 12 hours, 24 hours and 1 hour window on any of the last 7 days."

**Six documented node types**: Topic; Custom application; **Flink statement** (shows "Statement name and link to the statement / Statement status / Total throughput as a time series line graph / Bytes produced and consumed per topic"); Kafka Streams app; **Kafka Connector** ("Connector name and link to the connector / Type of connector / Message throughput and lag / Associated tasks and their statuses"); CLI node. Producers and consumers appear but grouped: "Consumers and producers are automatically grouped; that is, a group of consumers or producers is represented as a single node that expands upon drilldown to show the client IDs." Schemas are an attribute of the topic node, not a node type. ksqlDB is **not mentioned anywhere** on the current page — **UNCONFIRMED / no longer documented.** 24 or more like nodes collapse into a node group; edge thickness is throughput.

**Interface**: Console only — "On the left menu from anywhere within a cluster on the Cloud Console, click **Stream Lineage**." No Terraform or CLI configuration exists, because there is nothing to configure.

**"Lineage requires no configuration" is UNCONFIRMED as a quotable docs claim.** No sentence on docs.confluent.io says "no configuration required" or "out of the box". What *is* quotable: it is derived from observed activity ("The lineage graph always shows the activity of producers and consumers of data for the last 10 minutes"); Essentials is attached by default; and you need data flowing ("If you haven't set up a data pipeline yet, your lineage view may only show a single, lonely event node"). **No `client.id` naming convention is required** — client IDs are what you see on drilldown and what search matches, not a prerequisite.

**The real gate is RBAC on the viewer**, verbatim: "**Developer roles do not grant access to Stream Lineage.** You can give developers access to Stream Lineage by granting them additional roles … such as Operator role at the cluster level." / "If you do not see the option Explore Stream Lineage, then you do not have the required permissions." Full access: OrganizationAdmin, EnvironmentAdmin, CloudClusterAdmin, Operator, DataDiscovery, DataSteward — with "DataSteward and DataDiscovery … cannot access the actual message contents" and "don't have access to view details of an Flink statement node."

### 6.6 Tags, business metadata and the Data Portal

**Tags are Essentials; only business metadata needs Advanced.** Tag creation **is** possible in the Console, verbatim ([stream-catalog](https://docs.confluent.io/cloud/current/stream-governance/stream-catalog.html)): "Select an environment and click **Add tags to this cluster** on the right panel. Click **Create tag**. … Click **Create** to create the tag with the current name and description." Business metadata too: "click Catalog management on the left menu, then click the **Business metadata** tab. Click Add business metadata."

Terraform equivalents: `confluent_tag`, `confluent_tag_binding`, `confluent_business_metadata`, `confluent_business_metadata_binding`.

**What can be tagged**: "In the current release, you can tag **schemas, data records, data fields, topics, and connectors**." The REST entity-type list also includes `flink_compute_pool`. **Flink *statements* are not a taggable entity type — UNCONFIRMED / not supported.** "You cannot add business metadata to Unified Stream Manager entity types" (the `usm_` prefix).

**Limits**: up to 100 tags per resource; up to 12,000 characters across all tags; tag definition name up to 1,024 characters; description up to 600; business metadata up to 20 attributes per definition, 20 instances per resource, 20,000 chars total; "A maximum of 1000 tag definitions (TagDef) is allowed per environment." (Docs contradiction: the REST page says names "must not exceed 8192 characters" — treat 1,024 as safe.)

**Demo gotchas, verbatim**: "You cannot edit the name of an existing tag, only its description." / "If you want to delete a tag, first make sure that the tag is not currently applied to any entities." / "**Only inline tags show up as the tags of a field in the Cloud Console. External tags do not display in the console.**" / "**You must switch to the tree view of the schema to see record and field level tags. The raw schema view, which is the default, does not show them.**" Applying a field tag creates a new schema version.

**Data Portal** ([data-portal](https://docs.confluent.io/cloud/current/stream-governance/data-portal.html)): in both packages. "Users need search Stream Catalog permissions to use the Data Portal, at a minimum **DataDiscovery** role" — and "On the 'add new user' workflow, the DataDiscovery role is pre-selected by default". **One Basic-cluster limitation: "The topic access request workflow is not available for topics on Basic clusters."** Search: "Prefix, substring, fuzzy, and wildcard search are available in the Confluent Cloud Console. If you are using Stream Catalog REST APIs, only prefix search is available."

**Nice demo beat**: "Features that specifically require the Advanced Stream Governance package provide an upgrade option when you hover over the feature on the right panel."

---

## 7. Kafka REST API v3 — can it consume?

### 7.1 No. It can only produce.

Stated as an `Important` admonition at the top of [kafka-rest-cc](https://docs.confluent.io/cloud/current/kafka-rest/kafka-rest-cc.html), verbatim:

> "The Kafka REST API for Confluent Cloud **can't currently consume records**. To consume records, use the Confluent Cloud Console Messages tab, the Confluent CLI, or a native Kafka client."

What it *can* do, verbatim: "The API lets you **produce records** to topics, create and configure topics, manage ACLs, and configure Cluster Linking."

Admin surface (Cluster v3): list cluster info; list/create/delete topics; list/modify cluster and topic configuration; list/create/delete ACLs; "Listing information on consumer groups, consumers, and consumer lag **(for dedicated cluster only)**"; list partitions; manage Cluster Linking.

**API reference confirmation**: the Cloud **Records (v3)** reference contains exactly **one** operation — "Produce Records". There is no fetch or consume operation. ([records-v-3](https://docs.confluent.io/cloud/current/ccloud/records-v-3/)) The **Consumer Group (v3)** reference contains 7 operations, all metadata and lag, none returning records, and three carry an "Available in dedicated clusters only" badge. ([consumer-group-v-3](https://docs.confluent.io/cloud/current/ccloud/consumer-group-v-3/))

**One precision point worth getting right**: self-managed REST Proxy **v3 has no consume endpoint either**. Consuming is the **v2** consumer-instance API (`GET /consumers/{group}/instances/{instance}/records`, [platform kafka-rest/api](https://docs.confluent.io/platform/current/kafka-rest/api.html)), and Confluent Cloud exposes **no v2 surface at all** (grepped the Cloud REST page for "v2": zero hits). So the accurate framing is: *Cloud v3 matches self-managed v3 for records (produce only); what Cloud lacks is the entire REST Proxy v2 surface, which is where consumption lives.*

**No long-poll.** "Streaming mode" in v3 is chunked HTTP POST (`Transfer-Encoding: chunked`) for **producing**, not a read channel.

### 7.2 Availability by cluster type

> "The Kafka REST API (v3) is compatible with the Kafka REST Proxy v3 APIs and is **available by default on all Basic, Standard, Enterprise, Dedicated, and Freight Kafka clusters**."

Endpoint: `https://<REST-endpoint>/kafka/v3/clusters/<cluster-id>/...`. Auth is HTTP Basic with `<API key>:<API secret>` base64-encoded.

Limits, verbatim table ("Kafka REST Produce v3"):

| Dimension | Basic | Standard | Enterprise | Dedicated | Freight |
|---|---|---|---|---|---|
| Max connection requests/sec | 25 | 25 | 25 | 75,600 † | 25 |
| Max streamed requests/sec | 1000 | 1000 | 1000 | 756,000 † | 1000 |
| Max message size (MB) | 8 | 8 | 8 | 20 | 8 |

† at 252 CKUs; "scales linearly with the number of CKUs provisioned." "Connection request limits are enforced per cluster and IP address for elastic cluster types."

Other behaviour: HTTP 429 can occur "even though the limit has not been exceeded" — documented mitigation is a `Connection: close` header. Compression is rejected: "you cannot transmit compressed records from clients to the Kafka REST Produce API… `Content-Encoding: gzip` is not supported." Streaming mode returns 200 once the connection is established, so you must check per-record `error_code`.

### 7.3 So the REST API is not a fallback for the frontend

**It cannot serve the stream face.** A native Kafka consumer in a backend service, pushing to the browser over WebSocket or SSE, is the only documented path. Confluent documents **no** official WebSocket or SSE surface for Kafka and **no** browser/BFF guidance.

What the REST API *is* good for in this build: **producing** demo events from a serverless route or a script, over plain HTTPS, without a Kafka client library. That is genuinely useful — it means the "write" side of the demo needs no Kafka driver at all.

Two other read-over-HTTP paths exist but neither replaces a consumer:
- Managed MCP regional server tool `consume_kafka_messages` — "Read one to ten sample messages from a topic. You can target a specific partition and offset." Sampling only.
- Lightning Tables read-only SQL over HTTP (§2).

**CORS on the Kafka REST endpoint: UNCONFIRMED** — same situation as the SQL endpoint. Greps for `cors`, `cross-origin`, `browser`, `javascript`, `websocket`: zero hits. The self-managed `access.control.allow.origin` config is Confluent **Platform** only.

---

## 8. MCP / Real-Time Context Engine

**Three distinct things exist, and conflating them is the most common error.**

| | Open-source MCP server | Managed MCP servers | **Real-Time Context Engine** |
|---|---|---|---|
| Who runs it | You, locally | Confluent | Confluent |
| Endpoint | `confluentinc/mcp-confluent` (local) | `api.confluent.cloud/mcp/v1` + regional | `mcp.<region>.aws.confluent.cloud/.../context-engine/...` |
| Status | "**community-supported**" | GA (2026-05-19 release note) | **GA (2026-05-19)** |
| Tools | 50+, read and write | ~30, "most read-only" | **exactly 3** |
| Scope | Kafka, Flink, SR, connectors, Tableflow, metrics, billing | Discovery, topics, schemas, Flink, connectors, metrics | SQL over Lightning Tables |

### 8.1 The Real-Time Context Engine — the one for this demo

> "**The Real-Time Context Engine is the Model Context Protocol (MCP) server for Lightning Tables.**"
> — [lightning-tables/query/mcp](https://docs.confluent.io/cloud/current/lightning-tables/query/mcp.html)

**Status: GA.** 2026-05-19 release note: "The Real-Time Context Engine is now generally available. The Real-Time Context Engine delivers real-time data from your Kafka topics to AI agents through the Model Context Protocol (MCP). You enable the Real-Time Context Engine on a topic, and your agents can immediately query the most current data."

**Endpoint**: `https://mcp.<region>.aws.confluent.cloud/mcp/v1/context-engine/organizations/<org_id>/environments/<env_id>/kafka-clusters/<lkc_id>`, streamable HTTP transport.

**Exactly three tools — and the set is FIXED. There is no documented mechanism for custom per-question tools:**

| Tool | Arguments | Description |
|---|---|---|
| `listTopics` | none | "topics that have a Lightning Table and are visible to the agent" |
| `getMetadata` | `topic_name` | column names, data types, primary key info for one topic |
| `queryData` | `topic_name`, `query`, `max_result_rows` | runs a read-only SQL query against a topic |

The docs advise calling `getMetadata` before `queryData` to avoid column and type errors.

**You cannot define a `get_client_exposure` tool.** The agent must send SQL through `queryData` — which is arguably the better teaching point: the agent asks the same question as the desk, in the same SQL, wrapped in MCP.

**Hard limits**: max **200 rows**; **20-second** query timeout; `max_result_rows` is **required on every `queryData` call** (0 or omitted → error); "The SQL `LIMIT` clause can further reduce the result set but can't exceed the `max_result_rows` cap." Rate limits return `RATE_LIMIT_EXCEEDED` and are **shared with the HTTP API** — numeric values **UNCONFIRMED**.

**Authentication — three documented options:**
1. **Global API key + HTTP Basic.**
2. **Confluent Cloud account OAuth browser flow** — e.g. `claude mcp add --transport http --client-id claude-cli …`, no `Authorization` header; "queries run with your own roles". Added 2026-10-19.
3. **OAuth 2.0 client credentials** with an external IdP + identity pool, via a `Confluent-Identity-Pool-Id` header, 401 + `WWW-Authenticate` discovery, then a bearer token. Needs `DeveloperRead` on **both** the Kafka and Schema Registry clusters granted to the pool.

**Permissions** ([access-control](https://docs.confluent.io/cloud/current/lightning-tables/access-control.html)): MCP operations are `listTopics`, `queryData`, `getMetadata`, gated by role; "Queries are limited to topics the user can already read in Kafka."

**Prerequisites**: the Lightning Table must be **Active**. A table **description** helps agents understand the data, and descriptions are set via **PATCH, CLI or Terraform — not the Console.**

**Security caveat worth repeating**: "With private networking enabled, Lightning Tables that you query with MCP **might be accessible across environments and private network boundaries within your organization**." ([private-networking](https://docs.confluent.io/cloud/current/lightning-tables/private-networking.html))

### 8.2 Calling RTCE from inside Flink

The quickstart's pattern is confirmed as valid syntax:
```sql
CREATE TOOL hotel_inventory_live_context USING CONNECTION `rtce-connection`
WITH ('type' = 'mcp', 'allowed_tools' = 'getMetadata,queryData', 'request_timeout' = '30');
```
`type` ('function' | 'mcp' | 'a2a') and `allowed_tools` (MCP only) are both Required; `request_timeout` defaults to `'30'`. The connection itself is `CREATE CONNECTION … WITH ('type' = 'mcp_server', 'transport-type' = 'STREAMABLE_HTTP', …)` in Flink SQL, or `confluent flink connection create --type mcp_server --transport-type STREAMABLE_HTTP`. **Not available in Terraform.**

### 8.3 The open-source MCP server

- Repo: [confluentinc/mcp-confluent](https://github.com/confluentinc/mcp-confluent) — created 2025-01-16, latest release **v1.6.1 (2026-10-26)**, not archived, **MIT** licensed (confirmed via the GitHub API; the docs page does not name a license). npm: `@confluentinc/mcp-confluent`.
- **Status: explicitly NOT GA-supported.** Verbatim from [open-source-mcp-server](https://docs.confluent.io/cloud/current/ai/ai-tools/open-source-mcp-server.html): it is "a **community-supported project**" and Confluent "**doesn't provide dedicated support for it**" — best-effort, **no service level commitments**. The page never uses the words GA, preview or early access. *(A confluent.io blog claims GA; per the source rules it is not used here, and the docs say the opposite.)*
- **50+ tools**, including `produce-message` (with Schema Registry serialization for AVRO/JSON/PROTOBUF keys and values), `consume-messages` (can target a partition and start from offset, timestamp, earliest or latest), the full Flink statement lifecycle plus catalog browsing and diagnostics (`check-flink-statement-health`, `detect-flink-statement-issues`, `get-flink-statement-profile`), connector management, Schema Registry, catalog/tags, Tableflow topics and catalog integrations, metrics and billing. Discover your set without starting the server: `npx -y @confluentinc/mcp-confluent --list-tools`.
- Install: `npx @confluentinc/mcp-confluent --init-config` then `npx @confluentinc/mcp-confluent --config ./config.yaml`. **Requires Node.js 22+.** **Docker is NOT a documented way to run the server** — neither the docs page nor the README describes a server image. **UNCONFIRMED.**
- Telemetry is collected; disable with the `DO_NOT_TRACK` environment variable.
- Note: its Tableflow tools "fail with authorization errors until IAM roles and provider integrations are set up", and `create-connector` "requires a `direct` connection with static API keys".

### 8.4 The managed MCP servers

[managed-mcp-server](https://docs.confluent.io/cloud/current/ai/ai-tools/managed-mcp-server.html). GA per the 2026-05-19 release note, though the page itself carries **no lifecycle label** (**UNCONFIRMED** as a labelled status).

- **Global**: `https://api.confluent.cloud/mcp/v1` — `list_environments`, `list_clusters`, connector tools (`list_connectors`, `get_connector_config`, `get_connector_status`, `get_connector_logs`, `get_connector_offsets`, `get_connector_metrics`, `get_connector_error_summary`, `get_connector_fix_recommendations`, `restart_connector`, `update_connector_config`), `list_metrics`, `query_metrics`, `get_flink_statement_metrics`.
- **Regional**: `https://mcp.<region>.<cloud>.confluent.cloud/mcp/v1/organizations/<org_id>` — `list_kafka_topics`, `describe_kafka_topic`, **`consume_kafka_messages`**, `list_schema_subjects`, `read_schema_subject`, `describe_flink_table_schema`, `validate_flink_sql`, `create_flink_statement`, `list_flink_statements`, `delete_flink_statement`, `check_flink_statement_health`, `detect_flink_statement_issues`, `get_flink_statement_exceptions`, `get_flink_statement_profile`.
- **Private regional**: `https://mcp.<region>.<cloud>.private.confluent.cloud/mcp/v1/organizations/<org_id>`.
- Write-capable tools are enumerated: `restart_connector`, `update_connector_config`, `create_flink_statement`, `delete_flink_statement`. "Most tools are read-only, so you can explore your Confluent resources without risk of modifying them." The page warns to check your client's auto-approval settings.
- Auth: OAuth sign-in with a Confluent-registered client ID (documented examples `claude-cli`, `vscode-desktop`, `cursor-desktop`), or API key via HTTP Basic (Global key works with both servers; Cloud key is global-server-only; Flink key is regional-only and scoped to a cloud and region).
- "Access is governed by your existing Confluent Cloud permissions, so each server returns only the data your credentials can access."

---

## 9. CDC source connectors

### 9.1 Which exist, and their status

**No connector in Confluent's catalog carries a "GA", "Preview" or "Early Access" label.** The only labels Confluent prints are `[Deprecated]` and `[End of Life]`. So **"GA" is UNCONFIRMED as a printed label**; the evidence of current status is the absence of a deprecation marker.

| Exact documented name | Label |
|---|---|
| **PostgreSQL CDC Source V2 (Debezium)** | none |
| MySQL CDC Source V2 (Debezium) | none |
| Microsoft SQL Server CDC Source V2 (Debezium) | none |
| **Oracle CDC Source** | none |
| **Oracle XStream CDC Source** | none |
| MariaDB CDC Source (Debezium) | none |
| MongoDB CDC Source (Debezium) | none |
| MongoDB Atlas Source | none |
| Amazon DynamoDB CDC Source | none |
| Google Cloud Spanner CDC Source (Debezium) | none |
| Salesforce CDC Source | none |
| PostgreSQL CDC Source (Debezium) — V1 | **[End of Life]** |
| MySQL CDC Source (Debezium) — V1 | **[End of Life]** |
| Microsoft SQL Server CDC Source (Debezium) — V1 | **[End of Life]** |

**Do not demo the three V1 connectors.** Note that MongoDB has two distinct products: "MongoDB Atlas Source" and "MongoDB CDC Source (Debezium)".

### 9.2 Which are "contact us" only

From [connect-pricing](https://www.confluent.io/confluent-cloud/connect-pricing/), verbatim cells:

| Connector | $/task/hour | $/GB |
|---|---|---|
| PostgreSQL CDC V2 (Debezium) | **"Contact us"** | $0.025 |
| MySQL CDC V2 (Debezium) | **"Contact us"** | $0.025 |
| Microsoft SQL Server CDC V2 (Debezium) | **"Contact us"** | $0.025 |
| **Oracle CDC Premium** | **"Contact us"** | $0.025 |
| **Oracle XStream CDC Premium** | **"Contact us"** | $0.025 |
| MongoDB Atlas | $0.150 – $0.30 | $0.025 |
| Datagen (development & testing) | $0.017 – $0.0347 | $0.025 |

**Every Postgres and Oracle CDC connector is a "Contact us" / Premium connector.** There is no row named plainly "Oracle CDC" — the page has a "Premium Connectors" section holding Oracle CDC Premium and Oracle XStream CDC Premium. **The per-task-hour figure for all of them is UNCONFIRMED** — Confluent does not publish it. The GB rate is $0.025 throughout, on **decompressed** data. Footnotes: "Prices vary by cloud region"; PrivateLink adds $0.03/task-hour; custom SMT adds $0.05/task-hour; a dedicated Connect cluster adds $0.27778/hr.

Confluent's billing page says prices are shown in-product: "is displayed in the Add Connector screen."

### 9.3 Postgres CDC V2 operational facts

All from [cc-postgresql-cdc-source-v2-debezium](https://docs.confluent.io/cloud/current/connectors/cc-postgresql-cdc-source-v2-debezium/cc-postgresql-cdc-source-v2-debezium.html).

**One task only**: `tasks.max` "Valid Values: **[1,…,1]**", and the UI step says "This connector supports a single task only." Org-wide: "Organizations can run multiple connectors with a limit of one task per connector."

**Prerequisites, verbatim highlights**: "The PostgreSQL database must be configured for CDC. / **Public access may be required for your database.** / **A parameter group with the property `rds.logical_replication=1` is required** … Once created, you must reboot the database."

> **`wal_level=logical` is UNCONFIRMED on the Cloud V2 page.** The string does not appear on it, nor on the connector limits page — the page delegates server configuration to debezium.io. What the Cloud page documents is the AWS equivalent, `rds.logical_replication=1`. The `wal_level = logical` line exists only on Confluent's **self-managed Platform** page.

**Publication**: `publication.autocreate.mode` default **`all_tables`**, values `all_tables | disabled | filtered`. "**The connector user must have superuser permissions to create this publication, so it is usually preferable to create the publication before starting the connector for the first time.**" And Confluent's own recommendation: "In general, it is best to manually create publications for the tables that you want to capture before configuring the connector." `publication.name` default `dbz_publication`. RDS least-privilege path: pre-create the publication, transfer ownership to the IAM-login user, set `publication.autocreate.mode = disabled` — because "`CREATE PUBLICATION ... FOR ALL TABLES` requires `rds_superuser` on RDS, which you typically should not grant to a connector user."

**Replication slot**: `slot.name` default `debezium`, regex `^[a-z0-9_]+$`. `slot.drop.on.stop` default **`false`** — "WARNING: Do not set this to true for connectors in production." One slot per connector: "Each connector instance requires its own replication slot." Auto-created on first run. Demo hazard: "During the snapshot process, the replication slot is not advanced… it is possible that the PostgreSQL disk space consumed by WAL files keeps increasing."

**Privileges, verbatim**: `CREATE ROLE <user> with LOGIN REPLICATION PASSWORD '<pw>';` · `GRANT CONNECT ON DATABASE <db> TO <user>;` · `GRANT USAGE ON SCHEMA public TO connector_user;` · `GRANT SELECT ON ALL TABLES IN SCHEMA public TO connector_user;` · `GRANT CREATE ON DATABASE your_database TO connector_user;`. Cloud SQL caveat: "The `postgres` superuser cannot be used for replication" — use `cloudsqlsuperuser`.

### 9.4 The blocking networking constraint

**A fully managed connector cannot reach a non-public database from a Basic or Standard cluster.**

The decisive row in [internet-resource](https://docs.confluent.io/cloud/current/connectors/networking/internet-resource.html): **Public Endpoint → Private IP address connectivity: "No" / IP range used: "N/A".** The supportability table marks `Confluent Cloud Public` + RDS or self-managed services as "**Yes only if the endpoint is public**".

Cluster type requirements for private egress, verbatim:
- "**Egress PrivateLink Endpoints described in this document is only available for use with Dedicated clusters inside a "PrivateLink Access" type network.**" ([aws-egress-access-point](https://docs.confluent.io/cloud/current/networking/aws-egress-access-point.html)) Also: "can only be used by fully managed connectors" and "Confluent Cloud does not support cross-region connections with PrivateLink on AWS."
- "**Egress PrivateLink Endpoints described in this document is only available for use with Enterprise clusters.**" ([aws-egress-privatelink-esku](https://docs.confluent.io/cloud/current/networking/aws-egress-privatelink-esku.html))
- "**Private Network Interface (PNI) … is available for Enterprise and Freight clusters.**" ([aws-eap-self-managed](https://docs.confluent.io/cloud/current/connectors/networking/aws-eap-self-managed.html))

**Basic and Standard are never listed as eligible.** Whether they are explicitly barred is **UNCONFIRMED** — they are simply absent from every eligibility statement. Also, for self-hosted Postgres: "you must configure private networking using egress endpoints… The egress endpoint must be in the same region as your Kafka cluster. Cross-region egress is not supported."

Public egress IP allowlisting exists but is caveated ([static-egress-ip-addresses](https://docs.confluent.io/cloud/current/networking/static-egress-ip-addresses.html)): "Public egress IP addresses are **not guaranteed to be static**, although Confluent will make a reasonable effort to minimize changes." / "are **not exclusive** to specific Confluent Cloud accounts." / "are **not available for privately networked clusters**." Retrieve with `GET https://api.confluent.cloud/networking/v1/ip-addresses` or `confluent network ip-address list`.

### 9.5 The cheap alternative: Datagen

[cc-datagen-source](https://docs.confluent.io/cloud/current/connectors/cc-datagen-source.html)

- **Fully managed**: "The fully managed Datagen Source connector for Confluent Cloud generates mock data for development and testing." Warning: "This connector is not suitable for production use."
- **Price: $0.017 – $0.0347/task-hour + $0.025/GB** — the lowest published task band, ~**$0.41–$0.83/day** at one task. **It is billed, not free.**
- **Custom Avro schema supported**: `schema.string` — "Provide a custom JSON-encoded Avro schema. **The length of the schema string cannot exceed 10000 characters.** This option cannot be used with the quickstart property." Also "**The regex annotation type is not supported**" and "The options annotation type object file variant is not supported. The JSON array variant is supported."
- **38 `quickstart` values**, mutually exclusive with `schema.string`. Relevant ones for an exposure demo: `STOCK_TRADES`, `CREDIT_CARDS`, `TRANSACTIONS`, `ORDERS`, `PURCHASES`, `INSURANCE_CUSTOMERS`.
- **`schema.keyfield`** — "Name of the field to use as message key". **Set this**: an upsert Lightning Table needs a record key.
- **Default `output.data.format` is `JSON`** (schemaless). Valid: AVRO, JSON_SR, PROTOBUF, JSON. **Override to `AVRO`** — Lightning Tables and Tableflow both require a registered schema, and Tableflow's `log` error mode needs Avro or Protobuf specifically.
- `tasks.max` "Valid Values: [1,…]" — not capped at one.
- **No free connector allowance exists.** The one waiver: "If you use a Basic or Standard Kafka cluster, your connector runs in multitenant Kafka Connect clusters… there is no Connect capacity (CONNECT_CAPACITY) charge." Task and throughput charges remain. And **pausing does not stop the bill**: "The connector is still active and hourly base costs for tasks assigned to the connector continue to build up. **To stop your Connect connectors from accumulating billed usage, you can delete them.**"

---

## Blocking risks for an AWS us-east-1 build

Ordered by how badly each would derail the build.

**1. The Early Access note on direct API access (§1.2) — the only real unknown.** If `POST https://sql.us-east-1.aws.confluent.cloud/query/v1` returns 403 on this account, the Lightning Table clock cannot be served to the frontend at all without enrolling at `events.confluent.io/early-access-flink-features`. The evidence says the note is stale (the API page has no banner and the 2026-11-04 release note is unqualified), but it is a one-page contradiction that only a live call resolves. **Test this first, before anything else is built.**

**2. The frontend cannot read Kafka, and the REST API cannot help (§7).** The stream face requires a long-running backend process holding Kafka credentials, pushing over WebSocket or SSE. A plain Vercel request-scoped function cannot hold a consumer. **Budget for a long-running runtime or a separate small service.** This is not a risk to the demo's feasibility, but it is a risk to a serverless-only architecture assumption.

**3. The aggregate must be computed in Flink, not queried out of Lightning (§1.8).** Lightning Tables are single-topic with no joins and no aggregates. If the build plan assumed "point the Lightning Table at the source topics and SUM", **that plan does not work.** Flink must write one exposure topic, and the age stamp must be an explicit column.

**4. The freshness ladder's middle rung is ~1 minute, not 60s-by-design and not 100 ms (§1.7).** If the demo's narrative depends on "the Lightning Table refreshes every 60 seconds", that is not what the docs say, and a technical audience member who has read them will notice. If it depends on "under a second old", that is also wrong for a Flink-computed topic. The defensible claim is: **answered in under a second, from a number that is seconds to a minute old, and here is the one-line change that collapses it to 100 ms** (`'kafka.consumer.isolation-level' = 'read-uncommitted'`).

**5. Stream Governance Advanced is a one-way, ~$24/day door (§6.1).** Needed for CSFLE and data quality rules. Cannot be downgraded; the only exit is deleting the environment. **Decide before `terraform apply` whether CSFLE and rules are genuinely in scope.** If they are only in scope for a slide, stay on Essentials.

**6. CSFLE + Flink is Limited Availability and needs an account-team conversation (§6.3).** If the demo encrypts a field *and* processes it in Flink, you need the LA program and must share KEKs with Confluent. **Mitigation: encrypt a field that Flink never touches** — then it works on Advanced with no LA program.

**7. CDC is effectively unavailable (§9).** Every Postgres and Oracle CDC connector is "Contact us" priced, and a non-public database needs Dedicated, Enterprise or Freight networking. **On a Basic cluster, CDC means a publicly reachable database and an unpublished price.** Use Datagen or a plain producer, and present the Connect pillar through those.

**8. Flink and Tableflow dollar rates are unpublished.** Not a feasibility blocker, but a continuously-running Flink statement and an enabled Tableflow topic both bill at rates you cannot read from any document. **Read them off the Console before launching, and watch the first bill.**

**9. Flink's 5-minute foreground-statement stop (§3.5 of the companion report).** "If there is no consumer for the results of a foreground statement for five minutes or longer, Confluent Cloud moves the statement to the STOPPED state." A `SELECT` left on screen while you talk will die. **Use background statements (writing to topics) for anything that must survive the demo narrative.**

**10. Small syntax traps that fail at runtime, not at review:**
- `'scan.isolation-level'` does not exist — it is `'kafka.consumer.isolation-level'`, and setting the wrong key fails with `Unsupported options found`. It also cannot be set via `SET`.
- `CREATE MATERIALIZED TABLE … FRESHNESS` does not exist in Confluent Cloud (upstream Flink only; the dbt adapter explicitly fails on `freshness_interval`).
- `JOIN ... USING (col)` is grammar-only with zero examples — **use `ON`**.
- `o.$rowtime` (alias-qualified) is undocumented — use `` orders.`$rowtime` ``.
- `$rowtime` is invisible to `SELECT *` and `DESCRIBE` — only `DESCRIBE EXTENDED` shows it.
- Datagen's `output.data.format` defaults to schemaless `JSON`, which satisfies neither Lightning Tables nor Tableflow.
- The Lightning SQL API is `/query/v1`, not `/query/v1alpha1`.
- `confluent tableflow topic enable` has no `--managed-storage` flag; it is `--storage-type MANAGED`.
- `confluent context create` has been removed from CLI v4.

---

## Must verify in the console

Only an account holder can confirm these.

### Before committing to the build

1. **Does `POST https://sql.us-east-1.aws.confluent.cloud/query/v1` return 200 or 403?** The single highest-value test in this list (risk 1 above).
2. **Is there a "Lightning Tables" column with `+ Enable` on the Topics page?** And does the Lightning Tables page appear in the left nav at all?
3. **What cloud and region is the existing cluster in?** Lightning Tables are AWS-only in 10 regions. If the cluster is on Azure or GCP, or outside those ten, **it must be rebuilt**. `us-east-1` is fine.
4. **What cluster type is it?** Basic is eligible for Lightning Tables, Tableflow and Flink — so Basic is fine. Confirm it is not a legacy configuration.
5. **Is the organization on the eCKU billing model** (created on or after 2024-04-16) or the legacy base-and-partitions model? Changes every cluster cost number.
6. **What trial credit remains?** The $400/30-day credit applies to new signups only; an account with an existing cluster may have none left.
7. **Is the CLI at 4.82.0 or later?** `confluent lightning query` needs it. `confluent version`.
8. **Which Stream Governance package is the environment already on?** If it is somehow already Advanced, the ~$1/hour is already accruing and cannot be undone except by deleting the environment.

### Rates no primary source publishes

9. **The Flink CFU dollar rate** — from the Console or the Cost Estimator.
10. **The Tableflow $/topic-hour and $/GB-processed rates.**
11. **The Stream Governance Advanced base rate** beyond "starting at $1/hour", plus the per-schema-hour and per-rule-hour rates.
12. **Whether an idle Flink compute pool with zero statements shows any charge** — two primary Confluent pages disagree ([billing/dimensions/flink](https://docs.confluent.io/cloud/current/billing/dimensions/flink.html) vs [flink-faq](https://docs.confluent.io/cloud/current/flink/flink-faq.html)).
13. **Whether a trickle of demo data bills a fraction of a CCU or rounds up to a whole one.** Worst case ~$2.52/day per Lightning Table.
14. **The Lightning Tables / RTCE rate-limit numbers** — documented as existing, never quantified, and **shared between the HTTP API and MCP**. Matters if the frontend polls while an agent queries.
15. **The Lightning Tables maximum query result size** — stated to exist, value unpublished.

### Behavioural, only observable live

16. **CORS headers on `sql.us-east-1.aws.confluent.cloud/query/v1`.** Send a preflight `OPTIONS`. Do this regardless of the answer — the Global API key must not reach the browser either way, so the proxy stands.
17. **Whether a Lightning Table over a Flink output topic reads `read_committed`.** This decides whether the middle rung is ~1 minute or ~100 ms, and the docs never state it. Test: produce → watch the Flink output topic → time the Lightning answer. Then set `'kafka.consumer.isolation-level' = 'read-uncommitted'` on the downstream table and time it again. **This is the demo's most interesting measurement.**
18. **How long `Provisioning` → `Active` actually takes** for a Lightning Table. Docs say only "several minutes"; the CLI `--wait` default timeout is 1 hour.
19. **Whether `confluent_rtce_topic` in Terraform waits for `Active`** or returns on the 202. If it does not wait, the setup script needs a poll loop.
20. **Whether `confluent_api_key` can create a `global`-scoped key**, or whether `confluent api-key create --resource global` is genuinely unavoidable in the script.
21. **Whether the Flink 5-minute foreground stop bites the intended flow.** It triggers on "no consumer for the results", not idleness, so a continuously-polling dashboard may be safe.
22. **Whether `JOIN ... USING (col)` is accepted.** Grammar-only in the docs. **Write the demo with `ON` and don't find out on stage.**
23. **Whether the Console's Evolve → Rules → Add rules panel offers a "data quality rule" category**, or only "Data encryption rule". If quality rules are REST-only, the governance demo beat changes shape.
24. **Whether Datagen's `STOCK_TRADES` or `CREDIT_CARDS` shapes fit the exposure model**, or whether a custom `schema.string` is needed (10,000-character limit, no `regex` annotations).
25. **`SHOW MODELS` output** in the Flink workspace — the only documented way to get the exact managed model ids available in this account and region.

### Known-stale or contradictory in Confluent's own docs

26. `--description` on `confluent rtce rtce-topic create` is **REQUIRED** in the CLI reference and in Terraform, but called "Optional" on the Lightning Tables manage page. Treat as required.
27. The RTCE billing page's Early Access note on direct API access is contradicted by the API page and the 2026-11-04 release note.
28. Flink's billing-dimensions page and FAQ disagree on provisioned vs consumption billing.
29. The Flink statements page calls 500 GB both a "soft limit" and "the absolute global limit".
30. `monitor-tableflow.html` says Tableflow "remains in the Suspend state until manually resumed by sending a PATCH request to the API with the `spec.suspend` property set to **true**" — the direction reads inverted. Likely a docs bug.
31. The `confluent login` page says tokens last 8 hours in one place and that re-login happens "after one hour for Confluent Cloud" in the `--save` flag text.
32. The Datagen quick start names the SR schema-references flag `--refs`; the command reference says `--references`. Trust the reference.
33. `stream-catalog.html` says tag definition names are "Up to 1,024 characters"; `stream-catalog-rest-apis.html` says "must not exceed 8192 characters". Treat 1,024 as safe.
