# Confluent's Streamhouse Quickstart: What It Builds, What It Calls Things, and Where the Seller Deck Disagrees

Read 2026-11-08, as text only: nothing from the repo was installed, executed or deployed. Shallow clone at commit `04cd65e` into the session scratchpad, plus `gh api` for metadata. Line numbers below refer to that commit.

**Ranked changes for the seller deck (`slides/streamhouse-sellers`)**, detail in section 5:

1. **Clock one's age (pages 10, 13, 18 and the vocabulary doc).** The repo says Flink output reaches Lightning Tables, and so the Real-Time Context Engine, only at Flink's once-a-minute commit ("up to a minute (about 20–25 s in rehearsal)"). The answer comes back in under a second, but the number in it is seconds old, and up to a minute. The deck's "each answer under a second old" does not survive a technical counterpart who has run this repo. See R11.
2. **MCP and SQL read the same Lightning Table (pages 10, 11, 13).** The repo says the Real-Time Context Engine is "powered by Lightning Tables". The deck's clocks one and two are the same tables asked two ways, not two different doors. See R17.
3. **The MCP call on page 10 would not run.** The Real-Time Context Engine exposes three generic tools, `listTopics`, `getMetadata` and `queryData`. There is no per-question tool like `get_client_exposure`. See R8.
4. **The page 8 and page 10 SQL disagree with each other.** Page 10 reads `as_of`, which page 8 never writes. Page 8 also uses neither the repo's idiom (`CREATE OR ALTER MATERIALIZED TABLE`, joins with `ON`) nor its point-lookup form (`"KEY" = '...' LIMIT 1`). See R5 and R7.
5. **Page 11's "Nobody's materialized view refreshes faster than about a minute" is contradicted.** The repo shows source-topic changes in Lightning Tables "within seconds". The minute it does show has a different cause from the one page 11 gives. See R12 and R13.

---

## 1. Source

| Field | Value |
|---|---|
| Repo | https://github.com/confluentinc/quickstart-streamhouse |
| Default branch / commit read | `master` / `04cd65e81bc21980679a8e7abf6d20c57496fb4e`, committed 2026-11-03T22:12:43Z (14:12:43 -08:00), "Rename the labs and tidy the Agentic Airline Operations workshop (#10)" |
| Created | 2026-10-20T21:03:13Z (service-bot scaffolding only on that date) |
| Content landed | 2026-11-03, PRs #1 to #10 merged between 03:44Z and 22:12Z that day (authors: Brenner Heintz, Ahmed Zamzam, dmarsh-confluent) |
| Last push (any branch) | 2026-11-08T23:45:57Z. This is a service-bot branch (`chore-service-bot-update`, "chore: normalize service.yml field names"), not content. PR #11 (service bot) is open. |
| Stars / forks | 5 / 1 (on 2026-11-08) |
| License | Apache License 2.0 (`LICENSE`; `pyproject.toml` `license = {text = "Apache-2.0"}`) |
| GitHub description / topics | none / none |
| Package | `pyproject.toml`: `name = "streamhouse-demo"`, `version = "0.1.0"`, `description = "Streamhouse labs on Confluent Cloud: Flight Disruptions and Agentic Pit Decisions."` |

**What it says it is** (`README.md` L1 to L11): titled "Streamhouse Quickstart", tagline "*Your business, always current.*". It ends its opening with "Build one on Confluent Cloud in either of these hands-on labs:". There are two labs:

- **Agentic Airline Operations** (`docs/flight-disruptions/workshop.md`; the deploy prompt calls it Flight Disruptions): "Rebook passengers in real time when a delay breaks their connections. A streaming agent recovers three delayed flights (RA417, RA183, and RA185) while hotel rooms sell out." (`README.md` L20)
- **F1 Agentic Pit Decisions** (`docs/agentic-pit-decisions/walkthrough.md`): "Call every F1 pit stop with anomaly detection and a streaming agent." (`README.md` L24)

`AGENTS.md` L7 calls the first one "the River Air flight recovery demo on Confluent Cloud". The repo also holds a presenter script, `docs/flight-disruptions/demo-script-screens.md`, written for a live keynote-style demo in three scenes. Its own status tags mark several scenes as not built yet (see section 7).

Durations stated: "**This workshop takes about 60 minutes to complete.**" (`workshop.md` L16). The pit lab is "this ~45-minute lab" (`agentic-pit-decisions/walkthrough.md` L5). "**Deploy takes about 10 minutes to create all of the workshop infrastructure and source topics.**" (`workshop.md` L142).

---

## 2. What the quickstart builds

### 2.1 Shared base (`terraform/core/`)

`uv run deploy` (`scripts/deploy.py`) runs Terraform in this order. It is "AWS-only by design (RTCE + Flink Native Inference are AWS-only), so there is no cloud or region choice" (`scripts/deploy.py` L31 to L32).

1. **Environment** with `stream_governance { package = "ADVANCED" }` (`terraform/core/main.tf` L42 to L48).
2. **Kafka cluster**: Standard by default, `availability = "SINGLE_ZONE"`. With `kafka_cluster_type = "dedicated"` it is Dedicated, `cku = 1` (`main.tf` L60 to L83). Default region `us-east-1` (`docs/flight-disruptions/walkthrough.md` L89).
3. **Schema Registry** (data source `confluent_schema_registry_cluster`). Every topic's values are `'value.format' = 'avro-registry'`.
4. **Flink compute pool**, `max_cfu = 20` (`main.tf` L96 to L104).
5. **Service accounts, role bindings, API keys, ACLs**: `EnvironmentAdmin` for the app manager. An `rtce-reader` service account gets `DeveloperRead` "on topics + Schema Registry subjects" (`main.tf` L187 to L203). A **Global API key** for that reader is minted with the Confluent CLI (`scripts/setup_rtce.py` L159 to L176).

### 2.2 Agentic Airline Operations, end to end in order

| Step | What it is | Where |
|---|---|---|
| **Sources** | A Python generator, `uv run airport-datagen`, produces with `confluent_kafka.Producer` (Avro via Schema Registry) to three source topics: `flight_status`, `passenger_itineraries`, `hotel_inventory`. A fourth, `passenger_recommendations`, takes the offers. The generator writes most offers; the agent writes three flights' offers. The tables are created by Flink DDL: upsert, `'key.format' = 'raw'` STRING key named `key`. | `scripts/airport_datagen.py` L46; `terraform/airline-demo/sql/20` to `23`; `workshop.md` L149 to L157 |
| **Connectors** | One: a fully managed **Webhooks source connector**, `"connector.class" = "WebhookSource"`, `"name" = "hotel-partner-webhook"`, `"schema.enforcement.mode" = "EVOLVE"`, into `hotel_availability_updates`. Flink keys that topic into `hotel_inventory` (`sql/33`, `sql/34`). It is deployed only on a Dedicated cluster and never in the workshop: "No Webhooks source connector is deployed yet; the generator publishes hotel rows directly." No CDC connector anywhere. | `terraform/airline-demo/webhook.tf` L32 to L55; `AGENTS.md` L37; `walkthrough.md` L50 to L51 |
| **Flink: serving state** | `passenger_state`: a `CREATE OR ALTER MATERIALIZED TABLE` that joins each itinerary to its inbound and connecting flight and flags `risk` `HIGH` under 45 minutes. `flight_impact`: a materialized table with each flight's delay and its count of HIGH passengers. Both are upsert, compacted, raw key, `START_MODE = FROM_BEGINNING`. | `sql/24`, `sql/25`; `workshop.md` L208 to L296 |
| **Flink: the agent** | Staging: `passenger_state_changes` (append, via `TO_CHANGELOG`) and `impacted_passengers` (append, first HIGH only). Then `CREATE MODEL passenger_recovery_model` (`'provider' = 'confluent'`, `'confluent.model' = 'anthropic.claude-sonnet-4-6'`), then `CREATE TOOL hotel_inventory_live_context USING CONNECTION \`rtce-connection\`` (`'type' = 'mcp'`, `'allowed_tools' = 'getMetadata,queryData'`), then `CREATE AGENT passenger_recovery_agent ... USING TOOLS hotel_inventory_live_context`. Finally `INSERT INTO passenger_recommendations` calls `AI_RUN_AGENT`. | `sql/26` to `32`; `workshop.md` L388 to L617 |
| **Governance** | Schema Registry on every topic. Stream Governance package `ADVANCED` on the environment. The Real-Time Context Engine "requires topics to have a registered schema in Schema Registry" (`setup_rtce.py` L12 to L13). The reader has `DeveloperRead` only. No data quality rules, field encryption, dead letter topics or lineage are configured or shown. | `core/main.tf`; `setup_rtce.py` |
| **Query: Lightning Tables** | Enabled per topic in the Console ("Find the **Lightning Table** column ... click **+ Enable**", `workshop.md` L336), on all six topics. In the full demo deploy enables them through `setup_rtce.main()`, which calls `confluent rtce rtce-topic create`. | `workshop.md` L328 to L350; `scripts/deploy.py` L506 to L507; `setup_rtce.py` L502 to L560 |
| **Query: Lightning Queries (REST/SQL)** | The FastAPI app `uv run airport-app` ("operations and passenger views over Lightning Tables", `scripts/airport_app.py` L1) POSTs SQL to `https://sql.{region}.{cloud}.confluent.cloud/query/v1alpha1`. The browser polls every 2.5 seconds. `uv run setup-rtce --lightning <topic> [--run]` prints or runs one query. | `airport_app.py` L69 to L106; `setup_rtce.py` L908 to L993; `walkthrough.md` L132 |
| **Query: Real-Time Context Engine (MCP)** | Two consumers. (a) The Flink agent's tool, through the Flink connection `rtce-connection` (`--type mcp_server`, `--transport-type STREAMABLE_HTTP`). (b) Coding agents (Claude Code, Codex, Gemini CLI), registered as MCP server `confluent-streamhouse-rtce` by `uv run setup-rtce`. | `setup_rtce.py` L52 to L62, L266 to L355, L589 to L783 |
| **Lakehouse** | **Tableflow** on `flight_impact` (Terraform default `tableflow_topics = ["flight_impact"]`) and on `passenger_recommendations`, which the presenter enables on screen. `table_formats = ["ICEBERG"]` lands in a customer-owned S3 bucket (`byob_aws`), with a `confluent_catalog_integration` to **AWS Glue**. **Amazon Athena** and **Amazon Quick** answer the historical questions. This needs AWS credentials and is not part of the workshop. | `terraform/airline-demo/analytics.tf` L1 to L6, L153 to L203; `variables.tf` L16; `data-model.md` L5 to L36 |
| **Agent and MCP** | The streaming agent runs inside Flink on Claude hosted in Confluent, which the repo calls "Flink Native Inference" (`sql/32` L1). It reads live flights and hotels through the Real-Time Context Engine. An optional challenge has Claude Code or Codex ask questions over MCP. | `AGENTS.md` L18; `workshop.md` L652 to L704 |

The repo's own one-paragraph summary (`walkthrough.md` L136 to L137): "The demo maintains passenger state in Flink, serves current rows to the app through Lightning Tables and to a connected agent through RTCE/MCP, and enables Tableflow for Iceberg history."

### 2.3 F1 Agentic Pit Decisions, end to end in order

1. **Sources**: `uv run f1-race` (simulator) produces `car_telemetry` (append) and `race_standings` (upsert, keyed by `car_number`) as Avro via Schema Registry. `driver_race_history` is seeded with a bounded Flink INSERT ("no Postgres/CDC", `scripts/pit_decisions/seed.py` L1). No connectors. `race_simulator/config.py` L6 says: "There is no IBM MQ hop anymore."
2. **Flink**: `car_state` is a temporal join (`FOR SYSTEM_TIME AS OF`) plus 20-second `TUMBLE` windows plus `ML_DETECT_ANOMALIES`. Then come `CREATE AGENT pit_strategy_agent USING MODEL llm_textgen_model` and `pit_decisions` via `AI_RUN_AGENT` (`walkthrough.md` L165 to L354). The model is again Claude hosted in Confluent (`terraform/agentic-pit-decisions/sql/04-model-llm-textgen.sql`).
3. **Optional IBM Granite variants**: `AI_FORECAST` with `'model' VALUE 'ttm'` (`docs/agentic-pit-decisions/sql/granite_tire_forecast.sql`), and `AI_DETECT_ANOMALIES` (`enrichment_anomaly_ai.sql`, Early Access, see 2.4).
4. **Query**: Lightning Tables enabled on `car_telemetry`, `car_state` and `pit_decisions` (`walkthrough.md` L399 to L425). The Real-Time Context Engine is used by a coding agent (L427 to L465), and a Lightning Queries `curl` challenge follows (L467 to L494).
5. **Dashboard**: the Pit Wall (`uv run f1-pitwall`, port 8001) reads Kafka directly with a consumer (`scripts/pit_decisions/pitwall/consumer.py` L1 to L6), not Lightning.
6. No Tableflow, no lakehouse.

### 2.4 Every Confluent product, feature, CLI and API it touches, as the repo spells them

Status column: the repo marks release status in only two places. The Early Access Program note on `AI_DETECT_ANOMALIES`, and "GA" on the ARIMA default. Everything else is unmarked, and "unmarked" below means exactly that.

| Name as spelled | Where | Status marking in the repo |
|---|---|---|
| Confluent Cloud | everywhere | unmarked |
| Confluent's Data Streaming Platform ("The Streamhouse architecture on Confluent's Data Streaming Platform makes that possible.") | `demo-script-screens.md` L33 | unmarked |
| Confluent Cloud for Apache Flink (linked); Flink SQL workspace; "Materialized Tables in Confluent Cloud for Apache Flink" | `walkthrough.md` L3; `workshop.md` L179 to L191, L260 | unmarked |
| `CREATE OR ALTER MATERIALIZED TABLE`, `START_MODE = FROM_BEGINNING`, `TO_CHANGELOG`, `$rowtime` | `sql/24` to `27` | unmarked |
| `CREATE MODEL` (`'provider' = 'confluent'`), "Claude hosted in Confluent", "Flink Native Inference" | `sql/32` L1 to L13; `AGENTS.md` L18 | unmarked; "AWS-only" (`deploy.py` L31) |
| `CREATE TOOL ... 'type' = 'mcp'`, `CREATE AGENT`, `AI_RUN_AGENT`, `SHOW AGENTS`; prose: "a streaming agent" (lower case, never "Streaming Agents") | `sql/29` to `31`; `README.md` L20, L24 | unmarked |
| `ML_DETECT_ANOMALIES` | pit `walkthrough.md` L195 | "the GA ARIMA default" (`scripts/pit_decisions/labs.py` L56) |
| `AI_DETECT_ANOMALIES` (IBM Granite) | `docs/agentic-pit-decisions/sql/enrichment_anomaly_ai.sql` | "AI_DETECT_ANOMALIES is gated behind an Early Access Program, and Granite model support is earlier still." (L59 to L60) |
| `AI_FORECAST` with IBM Granite TTM | `granite_tire_forecast.sql` L1, L7 to L8 | unmarked ("AI_FORECAST is a built-in function.") |
| Lightning Tables / Lightning Table (per topic) / Lightning Queries / "Lightning Query" | `workshop.md` L328 to L360; pit `walkthrough.md` L399 to L494 | unmarked. The REST path carries API version `v1alpha1` (`setup_rtce.py` L936; asserted in `tests/test_workshop.py` L196). |
| Real-Time Context Engine (RTCE); MCP tools `listTopics`, `getMetadata`, `queryData` | `workshop.md` L12, L704 | unmarked. "RTCE is AWS-only. Azure deployments are not supported." (`setup_rtce.py` L6). Region list follows below. |
| Tableflow; Apache Iceberg; Delta Lake (narration only); AWS Glue Data Catalog; Amazon Athena; Amazon Quick | `analytics.tf`; `demo-script-screens.md` L72 to L80 | unmarked |
| Schema Registry; `stream_governance { package = "ADVANCED" }` (the phrase "Stream Governance" never appears in prose) | `core/main.tf` L45 to L46 | unmarked |
| Webhooks source connector (`WebhookSource`); "Webhooks Source Connector" (script) | `webhook.tf` L41; `demo-script-screens.md` L57 | "still planned" (`walkthrough.md` L50 to L51); scene 2.2a carries the script's "not built" tag |
| Confluent Assistant (to create the webhook connector) | `demo-script-screens.md` L57 to L58 | tagged "not built; the query shown is a draft that hasn't been run" (status legend, L9) |
| Confluent CLI: `confluent login`; `confluent rtce rtce-topic list` / `create`; `confluent flink connection create/update/describe ... --type mcp_server --transport-type STREAMABLE_HTTP`; Global API key creation | `README.md` L78; `setup_rtce.py` L291 to L355, L466 to L530 | unmarked |
| REST: `https://api.confluent.cloud/rtce/v1/rtce-topics`; `https://sql.{region}.{cloud}.confluent.cloud/query/v1alpha1`; MCP endpoint `https://mcp.{region}.aws.confluent.cloud/mcp/v1/context-engine/organizations/{org}/environments/{env}/kafka-clusters/{cluster}` | `setup_rtce.py` L490, L547, L936, L266 to L272 | unmarked |
| Terraform (Confluent provider): `confluent_environment`, `confluent_kafka_cluster`, `confluent_flink_compute_pool`, `confluent_flink_statement`, `confluent_tableflow_topic`, `confluent_catalog_integration`, `confluent_provider_integration`, `confluent_connector`, `confluent_api_key`, `confluent_service_account`, `confluent_role_binding`, `confluent_kafka_acl` | `terraform/` | unmarked |
| Confluent's own MCP server package `@confluentinc/mcp-confluent` (entry point `uv run setup-mcp`), separate from RTCE and referenced by no doc | `scripts/mcp_setup.py` L161, L234; `pyproject.toml` | unmarked |

RTCE regions the script knows (`setup_rtce.py` L72 to L83): `us-east-1`, `us-east-2`, `us-west-2`, `ap-northeast-2`, `ap-south-1`, `ap-southeast-1`, `ap-southeast-2`. The script adds: "New regions are added regularly".

**Linked Confluent docs, checked the same day (outside the repo; read through a summarising fetch tool, so verify before putting on a slide).** The RTCE overview page (https://docs.confluent.io/cloud/current/ai/real-time-context-engine/overview.html) defines it as: "The Real-Time Context Engine is the Model Context Protocol (MCP) interface to Lightning Tables in Confluent Intelligence." The Lightning Tables page lists them under a docs category "Query", described as "Read and serve the current state of your business", with the link text "Serve current state with Lightning Tables". The fetch found no release-status label, latency figure or SQL restriction on either page.

---

## 3. The vocabulary it uses

**The README's definition** (`README.md` L5 to L9), verbatim:

> A **Streamhouse** is a data architecture that continuously captures, processes, governs, and serves the current state of the business to applications, AI agents, and analytics, so they all work from the same fresh, trusted source of truth. It sits alongside your warehouse or lakehouse, not in place of it.
>
> - **Always current:** data updates as business events happen, not on a batch schedule.
> - **Mission critical:** built to production service levels, because the business depends on it.
> - **Decentralized:** the same trusted context, in whatever shape each consumer needs, wherever it's needed.

The pit lab's shorter version (`agentic-pit-decisions/walkthrough.md` L7): "Along the way, you build a small **Streamhouse**: an architecture that continuously captures, processes, and serves the current state of the business."

Observations:

- **Four verbs in the README** (captures, processes, governs, serves) and **three in the pit lab**. The public IBM sentence the deck uses has five: capture, transport, transform, govern, serve. So does the working group definition in `research/confluent-streamhouse.md` §2. The README has no "transport".
- **"Current state"**, not "changing state" (the deck's page 4 wording).
- **The three characteristics carry the deck's names exactly**: Always current, Mission critical, Decentralized. But "Decentralized" is glossed on the consumer side ("the same trusted context, in whatever shape each consumer needs"). The deck and the working group gloss it on the source side ("meets data where it lives").
- **No pillar vocabulary.** The words Connect, Stream, Process, Govern, Query and "pillar" appear nowhere as architecture terms. The only grouping is the demo script's three scenes: "**Demo 1 Streamhouse for Apps: Always on, Always Current view of the operations**" (L32), "Demo 2 ... Streamhouse for AI" (L52), "**Demo 3 Streamhouse for Analytics Reporting**" (L72). Those three readers map one-to-one onto the deck's three clocks: app or desk, agent, lakehouse.
- **Product terms, as spelled**: "Lightning Tables" for the product, "Lightning Table" for the one on a topic, "Lightning Queries" / "Lightning Query" for the REST/SQL surface, "Real-Time Context Engine (RTCE)", "RTCE/MCP", "Tableflow", "Confluent Cloud", "Confluent's Data Streaming Platform", "Claude hosted in Confluent", "Flink Native Inference", "materialized table", "streaming agent". One slip: "**Realtime Context Engine**" (`demo-script-screens.md` L57).
- **How the repo describes the relation between the query surfaces** (the most load-bearing vocabulary for the deck):
  - "Real-Time Context Engine (RTCE), powered by Lightning Tables, exposes a Kafka topic as an MCP tool, so any MCP-compatible AI agent can query the live stream. Other agents get the same live data the pit strategy agent uses, without another copy or pipeline." (pit `walkthrough.md` L401)
  - "Because RTCE reads from Lightning Tables, a topic is available to agents once its **Lightning Table** is enabled." (L403)
  - "RTCE runs on Lightning Tables, so you can also query the same real-time data directly with Lightning Queries over low-latency REST." (L469)
  - "One click per topic does it. Enabling a topic's **Lightning Table** keeps a low-latency table of its latest rows that apps query directly, and the Real-Time Context Engine (RTCE) exposes the same table to AI agents over MCP." (`workshop.md` L332)
  - "Flink performs every join and aggregation. Lightning Tables only serves current rows, and RTCE/MCP gives a connected agent the same rows." (`data-model.md` L85)
- **Tableflow, in the presenter's words** (`demo-script-screens.md` L73): "Tableflow makes it push-button simple to turn your Kafka topics into Iceberg or Delta Lake tables." Also: "Our Kafka topic and its schema are now automatically synced to an Iceberg table in the AWS Glue Data Catalog. No custom code. No pipelines to build or manage. With Tableflow, your streams simply become tables, ready to query with the BI and SQL tools you already use."
- **Materialized table, as taught** (`workshop.md` L256 to L258): "A materialized table is a single object that owns both the schema and the query logic that keeps filling it [...] Flink creates a backing Kafka topic, registers the schema, and runs the query continuously, so passenger risk updates as flights change."

---

## 4. Concrete, demo-able facts a seller could cite

**Speed and freshness, as the repo states them**

- Query response: "an operations dashboard that's always on and always current, answering in milliseconds, with no extra database, cache, or sync pipeline to build." (`workshop.md` L330). `uv run setup-rtce --lightning hotel_inventory --run` "prints the three hotels' current rows and the round-trip time" (L358). No number is given for that round trip.
- Source topics reach Lightning in seconds: "Status and delay come straight from `flight_status`, so they change within seconds" (`workshop.md` L377). `data-model.md` L82: `flight_status` "reaches Lightning within seconds rather than at Flink's once-a-minute commit."
- Flink output lags by up to a minute: "Flink commits its results to Kafka about once a minute (exactly-once), and Lightning only sees committed data. So the **At risk** counts and seat-map colors trail the stream by up to a minute (about 20–25 s in rehearsal), while flight status, delays, hotel rooms, and the generator's bookings show within seconds." (`demo-script-screens.md` L104). The same rule appears in `AGENTS.md` L34: "Flink output reaches Lightning only at its once-a-minute commit". Flink-to-Flink reads can skip it: "passenger_state is read uncommitted so a new HIGH count doesn't wait for that table's once-a-minute Flink commit." (`sql/25` L2 to L3)
- Enabling: "Each topic shows **Provisioning** while Confluent loads its rows, then **Active**." (`workshop.md` L350). "It may take a couple of minutes to enable each Lightning Table." (pit `walkthrough.md` L419)
- Agent throughput (synthetic): "The agent runs about 40 s per flight and destination, one after another." (`demo-script-screens.md` L103). An earlier live run produced "all 400 offers ... within about 3 minutes of the statement starting" (L66).
- Tableflow: the repo gives no freshness figure and no setting for one. The only timing is a rehearsal note: "Time the first sync in rehearsal, because 3-2 needs this table in Athena about a minute later." (`demo-script-screens.md` L76). The deck's "about five minutes" comes from Confluent's docs (`research/confluent-streamhouse.md` §5 step 6), not from this repo.

**The SQL a Lightning Table takes** (all from the repo, all run by the app or the agent)

- Point lookup by key: ``SELECT * FROM `flight_status` WHERE "KEY" = 'RA417-20260928' LIMIT 1`` (`demo-script-screens.md` L42; the same form is the agent's `inbound_query` in `sql/31` L34).
- Filter on a value column, sorted: ``SELECT * FROM `flight_status` WHERE origin = 'SFO' AND destination = '...' AND scheduled_time >= TIMESTAMP '...' ORDER BY scheduled_time ASC LIMIT 12`` (`sql/31` L35 to L38).
- Range window: ``SELECT * FROM `flight_status` WHERE scheduled_time >= TIMESTAMP '2026-09-27 23:00:00' AND scheduled_time < TIMESTAMP '2026-09-28 23:00:00' ORDER BY scheduled_time ASC LIMIT 200`` (`demo-script-screens.md` L44).
- Unquoted table names also appear: `SELECT lap, <column>, <column> FROM pit_decisions WHERE lap = 24 LIMIT 1` (pit `walkthrough.md` L485).
- Rules: "Every Lightning query returns at most 200 rows, even with `LIMIT 500` or a filter, and OFFSET, COUNT, and GROUP BY are rejected." (`AGENTS.md` L35). The app's own builder notes that "the table is backtick-quoted and the key column is written "KEY", matching what the Lightning SQL surface accepts" (`setup_rtce.py` L862 to L863). Every query it builds ends in `LIMIT` (L905), and none ends in a semicolon. Because Lightning has no aggregation, counts are computed in Flink or in the app: "The app sorts because Lightning has no aggregation; Flink already computed each count." (`demo-script-screens.md` L45)
- Division of labour: "Run joins, aggregations, enrichment, and complex computation in Flink, not Lightning Tables." (`AGENTS.md` L33)
- Transport: POST to `https://sql.{region}.{cloud}.confluent.cloud/query/v1alpha1` with body `{"catalog_name": <environment id>, "database_name": <cluster id>, "query": ...}`, Basic auth with the Global API key. Rows come back as `result.schema.columns` and `result.data` (`setup_rtce.py` L936 to L941, L991 to L993).
- Snapshot queries: none in the repo.

**How an agent reaches the data**

- MCP server name: `confluent-streamhouse-rtce`. It is fixed on purpose so org allowlists keep matching (`setup_rtce.py` L52 to L57). One server serves both labs (`AGENTS.md` L29).
- Tools: "RTCE gives your agent three tools, `listTopics`, `getMetadata`, and `queryData`, and exposes only topics whose context engine is on. Watch the tool calls: the answers come from your live data, not from the model's memory." (`workshop.md` L704). Arguments: `queryData` needs all of "`topic_name`, `query`, and `max_result_rows`. `getMetadata` takes a single `topic_name` string." (`walkthrough.md` L154 to L155). The agent prompt says the same: "Use the queryData tool (arguments: topic_name, query, max_result_rows)" (`sql/30` L11).
- The pit architecture diagram labels the call "MCP query_data" (`docs/images/agentic-pit-decisions/architecture.excalidraw`). The tool name in the code that actually runs is `queryData` (`sql/29` L8).
- Endpoint and auth: `https://mcp.{region}.aws.confluent.cloud/mcp/v1/context-engine/organizations/{org_id}/environments/{env_id}/kafka-clusters/{cluster_id}`, streamable HTTP, Basic auth with the Global key (`setup_rtce.py` L266 to L272, L302 to L306).
- Inside Flink: `CREATE TOOL hotel_inventory_live_context USING CONNECTION \`rtce-connection\` WITH ('type' = 'mcp', 'allowed_tools' = 'getMetadata,queryData', 'request_timeout' = '30');` (`sql/29`). "The API key stays in the connection, so your SQL holds no secrets." (`workshop.md` L400)
- "Any MCP client can query the topics you turned on in Lab 3." (`workshop.md` L654)
- Access is read-only: the RTCE service account has "DeveloperRead on topics + Schema Registry subjects" (`core/main.tf` L189).

**Tableflow configuration** (`analytics.tf` L153 to L203)

- `confluent_tableflow_topic` per topic, with `table_formats = ["ICEBERG"]` and `byob_aws { bucket_name, provider_integration_id }`. Default topics `["flight_impact"]` (`variables.tf` L16). `passenger_recommendations` is enabled on screen: "Topics → `passenger_recommendations` → Enable Tableflow", status "Pending → Syncing" (`demo-script-screens.md` L74, L76).
- `confluent_catalog_integration` with `aws_glue { provider_integration_id }`. The Glue database is the cluster ID ("Confluent's convention", L29 to L30).
- A cross-account IAM role for Tableflow, built in an order that breaks a circular dependency (L8 to L14).
- No freshness, commit interval or snapshot setting appears anywhere in the Terraform.
- Athena reference queries, with expected answers on the default seed: "roughly 1,600 delayed flights, 8,600 impacted passengers, about $550,000 of hotel spend, and an average recovery time of about 23 seconds" (`data-model.md` L25 to L38). The data is synthetic.

**Lines a seller can lift**

- "Your business, always current." (`README.md` L3)
- "It sits alongside your warehouse or lakehouse, not in place of it." (`README.md` L5)
- "No batch job, no polling, and no model keys to manage: the agent itself is a few SQL statements." (`workshop.md` L392)
- "The dashboard you open in this lab and the recovery agent you build in Lab 4 read the same live state, each in the form it needs." (`workshop.md` L332)
- "An app working from stale data would book a room that's already gone." (`workshop.md` L621)

**Cost to try** (useful when pointing a counterpart at it): "A payment method is required for Terraform to create a **Standard** cluster." (`workshop.md` L99). "All new sign-ups get **$400 in free credit** to use within the first 30 days" (L103). Prerequisites are Git, uv, Terraform and the Confluent CLI (`README.md` L31).

---

## 5. Alignment audit against the deck

Verdicts are the five requested. One more, **NOT SHOWN IN REPO**, marks where the repo neither confirms nor contradicts the deck. Exact replacement wording and SQL are in 5.2, keyed R1 to R22. Deck text is quoted from `.scratch/streamhouse-sellers/spine.md` (talk track, shot, takeaway) or `slides/streamhouse-sellers/index.tsx` (on-screen labels and SQL).

### 5.1 Table

| # | Deck page and exact deck text | What the repo shows | Verdict | Change |
|---|---|---|---|---|
| A1 | p4 talk track: "continuously capture, transport, transform, govern and serve the changing state of the business" | `README.md` L5: "continuously captures, processes, governs, and serves the current state of the business"; pit `walkthrough.md` L7: "captures, processes, and serves" | NAMING DIFFERS | R1 |
| A2 | p4 talk track: "Decentralized: it meets data where it lives instead of forcing everything into one place first" | `README.md` L9: "**Decentralized:** the same trusted context, in whatever shape each consumer needs, wherever it's needed." "Always current" and "Mission critical" match (L7 to L8). | NAMING DIFFERS | R2 |
| A3 | p5, p6, p16 label "Kafka Connect / CDC"; p6 talk track "More than a hundred and twenty connectors" | No CDC anywhere. The one connector is `WebhookSource`, Dedicated only, never in the workshop: "No Webhooks source connector is deployed yet; the generator publishes hotel rows directly." (`AGENTS.md` L37) | NOT SHOWN IN REPO | R3 |
| A4 | p5, p7, p16 label "Apache Kafka / Kora" | Standard, `SINGLE_ZONE` cluster (`core/main.tf` L65 to L67); Kora never named | NOT SHOWN IN REPO | none |
| A5 | p7 talk track: "what it was at four o'clock yesterday when somebody made a decision" | The repo's state tables are compacted: `'kafka.cleanup-policy' = 'compact'` (`sql/24` L17, `sql/25`, `sql/23`), which keeps each key's latest record | DECK MISSING SOMETHING | R4 |
| A6 | p8 on-screen: `INSERT INTO exposure SELECT client, SUM(qty * price) FROM positions JOIN prices USING (symbol) GROUP BY client;` | The repo's idiom for kept state is `CREATE OR ALTER MATERIALIZED TABLE ... AS SELECT` (`sql/24`, `sql/25`). It always joins with `ON`, and joins against upsert tables keyed by `key` (`sql/20`). Page 10 then reads `as_of`, which this statement never writes. | DECK SQL WOULD NOT RUN AS SHOWN (together with p10) | R5 |
| A7 | p8 talk track: "Inside the platform it becomes a SQL statement" ... "the output is itself a record on a topic" | `workshop.md` L256: Flink "creates a backing Kafka topic, registers the schema, and runs the query continuously"; L392: "the agent itself is a few SQL statements" | ALIGNED | none |
| A8 | p9 and p16 label "Stream governance"; p5 label "Stream Governance" | `core/main.tf` L45 to L46 `stream_governance { package = "ADVANCED" }`; no prose spelling | NAMING DIFFERS (the deck disagrees with itself) | R6 |
| A9 | p9 on-screen: SCHEMA V2, RULE QTY < 1,000,000, TOPIC / DEAD LETTERS, ENCRYPTED, lineage chain | Only schemas (`avro-registry`), `"schema.enforcement.mode" = "EVOLVE"` (`webhook.tf` L51) and read-only RBAC. No rules, dead letters, encryption or lineage. | NOT SHOWN IN REPO | none |
| A10 | p10 on-screen: `SELECT exposure, as_of FROM exposure WHERE client = 4417;` | The repo's point lookup is ``SELECT * FROM `flight_status` WHERE "KEY" = 'RA417-20260928' LIMIT 1`` (`demo-script-screens.md` L42). The key is a raw STRING queried as `"KEY"` (`setup_rtce.py` L862 to L863). `as_of` does not exist (A6). | DECK SQL WOULD NOT RUN AS SHOWN | R7 |
| A11 | p10 on-screen: `tools/call get_client_exposure {"client": 4417}` | Tools are `listTopics`, `getMetadata`, `queryData` (`workshop.md` L704). `queryData` needs `topic_name`, `query`, `max_result_rows` (`walkthrough.md` L154 to L155). No per-question tools are shown. | DECK SQL WOULD NOT RUN AS SHOWN | R8 |
| A12 | p10 door "MCP / REAL-TIME CONTEXT ENGINE"; talk track "for agents, over MCP, through the Real-Time Context Engine" | "Real-Time Context Engine (RTCE)" (`workshop.md` L12); "RTCE/MCP" (`AGENTS.md` L34) | ALIGNED | none |
| A13 | p10 talk track: "The agent calls a tool, the tool reads the stream" | "Because RTCE reads from Lightning Tables" (pit `walkthrough.md` L403) | NAMING DIFFERS | R9 |
| A14 | p10 (absent) | "exposes only topics whose context engine is on" (`workshop.md` L704); reader is `DeveloperRead` (`core/main.tf` L189) | DECK MISSING SOMETHING | R10 |
| A15 | p10 shot: "each answer under a second old"; p10 talk track: "That is the first of three clocks: whoever is asking, under a second"; vocabulary: "The three clocks: The deck's name for the freshness ladder" | "Flink output reaches Lightning only at its once-a-minute commit" (`AGENTS.md` L34). Process-computed results "trail the stream by up to a minute (about 20–25 s in rehearsal)" (`demo-script-screens.md` L104). The answer itself is fast: "answering in milliseconds" (`workshop.md` L330). | CONFLICTS | R11 |
| A16 | p11 takeaway: "Lightning Tables keep the whole book queryable about a minute behind live." | True as an upper bound for a table Process computes (A15 sources). The repo puts the cause in Flink's commit. | ALIGNED | R12 (mechanism) |
| A17 | p11 talk track: "Changes land in a columnar changelog within about a second, and once a minute compaction folds them into the stored view, with the Velox engine underneath."; on-screen "CHANGELOG / UNDER 1 S", "FOLDS IN", "VELOX ENGINE" | Changelog, compaction and Velox are never mentioned. The minute the repo shows is the Flink exactly-once commit. | NOT SHOWN IN REPO (the repo gives a different reason for the minute) | R12 |
| A18 | p11 talk track: "Nobody's materialized view refreshes faster than about a minute." | "Status and delay come straight from `flight_status`, so they change within seconds" (`workshop.md` L377; `data-model.md` L82) | CONFLICTS | R13 |
| A19 | p11 on-screen: `SELECT client, exposure, used FROM book_exposure WHERE used > 0.80 ORDER BY used DESC;` | WHERE on a value column with ORDER BY a value column is a shape the repo runs (`sql/31` L35 to L38). But every repo query ends in `LIMIT`, none ends in `;`, and the key is `"KEY"`. | NAMING DIFFERS (shape supported; key, LIMIT and semicolon not) | R14 |
| A20 | p11 on-screen: "THE WHOLE BOOK, AT ONCE", "+ 3,994 MORE ROWS, FOLDED" | "Every Lightning query returns at most 200 rows ... and OFFSET, COUNT, and GROUP BY are rejected." (`AGENTS.md` L35). The app pages by key (`airport_app.py` L108 to L122). | DECK MISSING SOMETHING (speaker guard) | R15 |
| A21 | p11 on-screen: "LIGHTNING TABLE / BOOK_EXPOSURE" (p10 reads `exposure`) | A Lightning Table is enabled on a topic and carries its name ("click **+ Enable** for `flight_status`", `workshop.md` L336). Computation belongs in Flink (`AGENTS.md` L33). So `book_exposure` with `used` is a second topic that Process must write. | DECK MISSING SOMETHING | R16 |
| A22 | p5 door "Lightning Tables", sub "MCP / API / SQL" | pit `walkthrough.md` L401, L469; `workshop.md` L332 | ALIGNED | none |
| A23 | p13 doors "MCP / SQL", "LIGHTNING TABLES", "TABLEFLOW"; p10 and p11 present the first two clocks as different doors | MCP and SQL both read the Lightning Table: "RTCE, powered by Lightning Tables", "RTCE runs on Lightning Tables, so you can also query the same real-time data directly with Lightning Queries" (pit `walkthrough.md` L401, L469). Page 5's own door says the same. | CONFLICTS | R17 |
| A24 | p16 Query pillar product line "Tables, Tableflow, MCP" | "Lightning Tables", "Tableflow", "Real-Time Context Engine" | NAMING DIFFERS | R18 |
| A25 | p5 door "Streaming & Snapshot Queries" | Not in the repo. Its Flink SQL workspace SELECTs are streaming queries, never snapshot queries. | NOT SHOWN IN REPO | none |
| A26 | p12 talk track: "materializes it into an open table, Iceberg, in object storage, committing a fresh snapshot about every five minutes and keeping the catalog in step"; on-screen "A SNAPSHOT ABOUT EVERY 5 MINUTES" | `table_formats = ["ICEBERG"]`, customer-owned S3, `aws_glue` catalog integration (`analytics.tf` L163 to L166, L181 to L197). No freshness figure or setting. | ALIGNED (the five minutes rests on Confluent's docs, not the repo) | R19 (optional) |
| A27 | p12 takeaway: "Tableflow publishes the topic as an open table; the job disappears, not the copy." | "No custom code. No pipelines to build or manage." and "Our Kafka topic and its schema are now automatically synced to an Iceberg table" (`demo-script-screens.md` L73). No zero-copy claim. | ALIGNED | none |
| A28 | p13 takeaway: "One record, written once, answers three readers on three clocks." | `flight_impact` feeds the dashboard through Lightning, the agent through RTCE, and "It is also the Iceberg table for question 1." (`data-model.md` L82; `walkthrough.md` L136 to L137) | ALIGNED (strong) | R20 (optional) |
| A29 | p15 takeaway: "The lakehouse explains what happened; the streamhouse powers what happens next." | "It sits alongside your warehouse or lakehouse, not in place of it." (`README.md` L5) | ALIGNED | none |
| A30 | p16 takeaway: "Streamhouse is the category; Confluent's DSP is how we deliver it." | "The Streamhouse architecture on Confluent's Data Streaming Platform makes that possible." (`demo-script-screens.md` L33) | ALIGNED | none |
| A31 | p16 "WHERE IT RUNS / NO FORKLIFT": On premises (Confluent Platform), CLUSTER LINKING, Confluent Cloud | "RTCE is AWS-only. Azure deployments are not supported." (`setup_rtce.py` L6), plus a seven-region list (L72 to L83); "AWS-only by design (RTCE + Flink Native Inference are AWS-only)" (`deploy.py` L31) | DECK MISSING SOMETHING | R21 |
| A32 | p17: "watsonx Orchestrate and Bob turn served events into governed agent action" | The repo's agent runs inside Flink on `'confluent.model' = 'anthropic.claude-sonnet-4-6'` (`sql/32` L11). Its external agents are Claude Code, Codex and Gemini CLI. IBM appears only as optional Granite functions (`AI_FORECAST` `'ttm'`; `AI_DETECT_ANOMALIES`, Early Access). | DECK MISSING SOMETHING (positioning) | R22 |

### 5.2 Recommended changes in full

**R1 (p4, speaker note only).** Keep IBM's five-verb sentence. It is the public one the deck is built on. Add to the speaker's notes (not the slide): "Confluent's own quickstart says it with four verbs, captures, processes, governs and serves. Same architecture; do not correct a client who uses either."

**R2 (p4, talk track, optional).** Replace "Decentralized: it meets data where it lives instead of forcing everything into one place first, because data resists centralization, and six systems holding six versions of your client is exactly what that looks like." with "Decentralized: it meets data where it lives instead of forcing everything into one place first, and it serves the same trusted context in whatever shape each reader needs, because data resists centralization, and six systems holding six versions of your client is exactly what that looks like." This picks up the README's half of the word, which page 13 then pays off.

**R3 (pointer caveat, no slide change).** If a seller points a counterpart at the quickstart, say it starts after capture: its data is produced straight to topics by a generator, and it shows no CDC and no Kafka Connect source. Page 6's claims are untouched.

**R4 (p7, speaker note).** Add to the notes: "Replay needs the history kept. A compacted topic keeps only each key's latest record, so the topic you replay is one kept by time, not compacted." The repo compacts its state tables (`sql/24` L17).

**R5 (p8 on-screen Flink SQL).** Preferred, in the repo's idiom. It writes the `as_of` page 10 reads and names the output column:

```sql
-- Keep each client's exposure current.
CREATE OR ALTER MATERIALIZED TABLE exposure AS
SELECT p.client, SUM(p.qty * px.price) AS exposure,
  MAX(p.$rowtime) AS as_of
FROM positions p JOIN prices px ON p.symbol = px.symbol
GROUP BY p.client;
```

Minimal alternative (keeps `INSERT INTO`, which needs `exposure` to exist already):

```sql
-- Keep each client's exposure current.
INSERT INTO exposure
SELECT p.client, SUM(p.qty * px.price), MAX(p.$rowtime)
FROM positions p JOIN prices px ON p.symbol = px.symbol
GROUP BY p.client;
```

Caveats, stated plainly:

- Neither version was run.
- `prices` must be a latest-price table keyed by symbol: an upsert table, as `flight_status` is in `sql/20`. Against an append-only tick stream, a regular join multiplies each position by every price ever ticked.
- `$rowtime` follows `sql/27` (`CAST(MIN($rowtime) AS TIMESTAMP(3))`), but the repo never qualifies `$rowtime` through a join alias.
- The repo always joins with `ON`. Whether Confluent Cloud for Apache Flink accepts `JOIN ... USING` was not shown in the repo and not checked.
- The repo's production form also spells out the column list and `'key.format' = 'raw'`. It warns that "A query-only definition defaults to Avro keys" (`walkthrough.md` L65), which matters for how the key is queried on page 10.

**R6 (p9 and p16 labels).** Change `product="Stream governance"` to `product="Stream Governance"` on pages 9 (`index.tsx` L6749) and 16 (L8660), to match page 5 (L2465).

**R7 (p10 on-screen SQL).** Replace with the repo's point-lookup form. It assumes R5, and that the client id is the Kafka key, as page 7's "Keyed by client" says:

`SELECT exposure, as_of FROM exposure WHERE "KEY" = '4417' LIMIT 1`

If Process instead writes `client` as a value column too (as `passenger_recommendations` carries `passenger_id` beside its `key`, `sql/23`, and the app filters on it, `airport_app.py` L189), the readable form is `SELECT exposure, as_of FROM exposure WHERE client = 4417 LIMIT 1`. The repo runs no query whose key column has a name other than `key`, so treat the original `WHERE client = 4417` as unproven rather than wrong. Drop the trailing semicolon either way: no Lightning query in the repo has one.

**R8 (p10 on-screen MCP call).** Replace `tools/call get_client_exposure {"client": 4417}` with the real tool, carrying the same SQL the desk sends:

`tools/call queryData {"topic_name": "exposure", "query": "SELECT exposure, as_of FROM exposure WHERE \"KEY\" = '4417' LIMIT 1", "max_result_rows": 1}`

If that is too wide for the panel, show the shape and let the row above carry the SQL: `tools/call queryData {"topic_name": "exposure", "query": "…", "max_result_rows": 1}`. This also makes a good teaching point: the agent sends the same question as the desk, in SQL, wrapped in MCP.

**R9 (p10 talk track).** Replace "The agent calls a tool, the tool reads the stream, and the agent gets the number it needs to act" with "The agent calls a tool, the tool queries the live table the platform keeps for that topic, and the agent gets the number it needs to act". The repo's own framing still supports "not a copy" in the deck's sense: "without another copy or pipeline" (pit `walkthrough.md` L401).

**R10 (p10 talk track, one clause).** After "as often as it likes, and an agent asks constantly." add: "It sees only the topics you have turned on for it, and only to read them." This is the sentence a regulated firm's architect wants to hear, and the repo shows both halves (`workshop.md` L704; `core/main.tf` L189).

**R11 (p10 shot, p10 talk track, the vocabulary doc).** Keep the on-screen mark "ANSWERED / UNDER A SECOND": it measures time to answer, which the repo supports.

- Spine p10 shot: change "each answer under a second old" to "each answer back in under a second, with its as-of".
- p10 talk track: replace the last sentence with: "That is the first of three clocks: whoever is asking gets the answer in under a second, and the number in it is seconds old, a minute at most, against an hour for the copy and most of a day for the stalest file we started with."
- `docs/context/streamhouse-sellers.md`, "The three clocks": change "whoever asked (under a second)" to "whoever asked (answered in under a second, from a number seconds old)".

Underlying fact: the exposure topic is Process output, and "Flink output reaches Lightning only at its once-a-minute commit" (`AGENTS.md` L34).

**R12 (p11 talk track, mechanism).** After "with the Velox engine underneath." insert: "And because the book is computed by Process, it reaches the table each time Flink commits, about once a minute; Confluent's own quickstart measured twenty to twenty five seconds in rehearsal." Keep "Watch the count, and watch the rows move when it folds." after it. The on-screen CHANGELOG / FOLDS IN / VELOX labels rest on S2 (Dima). The repo neither confirms nor contradicts them, so leave them unless S2 is re-checked.

**R13 (p11 talk track).** Replace "Nobody's materialized view refreshes faster than about a minute." with "A view computed from other data refreshes on the order of a minute everywhere: Snowflake's dynamic tables set a sixty second minimum target lag, and Flink commits what it computes about once a minute." The original sentence is contradicted by the same product showing a source topic within seconds.

**R14 (p11 on-screen SQL).** Replace with:

```sql
SELECT "KEY", exposure, used
FROM book_exposure
WHERE used > 0.80
ORDER BY used DESC LIMIT 200
```

If Process writes `client` as a value column (see R7), keep `client` in place of `"KEY"`. In both cases add `LIMIT` and drop the semicolon.

**R15 (p11 talk track guard).** After "the clients nearest the edge rise to the top" add: "It hands back up to two hundred rows a question, so you ask for the ones near the edge, which is what the risk officer wants anyway." Also keep the on-screen count as something the screen counts, never as SQL: Lightning rejects `COUNT`.

**R16 (p11, talk track or nothing).** Either rename the table to the page 8 topic and add `used` to R5's statement, or let the talk track own it: "Process writes the book with each client's limit beside the exposure, and the platform keeps that topic as a table." The repo is explicit that the arithmetic belongs in Flink (`AGENTS.md` L33).

**R17 (pages 11 and 13: what separates clock one from clock two).** Per the repo, the desk's SQL, the agent's MCP call and the risk officer's query all read the same Lightning Table. What separates clocks one and two is the shape of the question, one row or the whole book, not a different engine.

- **Option A, talk track only (minimal).** Page 11 beat 1, replace "Lightning Tables keep one." with "Lightning Tables keep one. In fact the desk and the agent on the last page were already reading one: the Real-Time Context Engine and SQL both answer from it. What changes here is the shape of the question."
- **Option B, on screen.** Page 13 doors read "LIGHTNING / ONE ROW, MCP + SQL", "LIGHTNING / THE WHOLE BOOK, SQL", "TABLEFLOW / OPEN TABLE". The readers' clocks stay as they are.

Option A costs nothing and turns the conflict into the teaching point page 11 already argues ("a different shape of question").

**R18 (p16 label).** Change `product="Tables, Tableflow, MCP"` (`index.tsx` L8661) to `product="Lightning Tables, Tableflow, MCP"`. If width forbids it, use `product="Lightning, Tableflow, MCP"`; the repo itself shortens to "Lightning" throughout (`AGENTS.md` L34 to L36).

**R19 (p12 talk track, optional).** After "keeping the catalog in step" add ", AWS Glue in Confluent's own quickstart". This names a real catalog the counterpart can see working.

**R20 (p13 talk track, optional).** After "zero." add: "Confluent's public quickstart does exactly this with one topic: the dashboard, the agent and the lakehouse all read it."

**R21 (p16 talk track).** After "so clients get the capabilities without a forklift." add: "One caution on the new pillar: the Real-Time Context Engine runs on Confluent Cloud on AWS today, in a list of regions, so check the client's cloud before you promise the agent door."

**R22 (p17, speaker note, positioning).** Add to the notes: "If a client's architect has run Confluent's quickstart, they have seen an agent run inside Flink on a Claude model Confluent hosts, and coding agents read the same topics over MCP. Page 17's line holds: IBM is what acts across the enterprise with controls, approvals and an audit trail, on the same served context." Optional and low priority: the quickstart's optional F1 step forecasts with IBM Granite TTM through Flink's built-in `AI_FORECAST` (`granite_tire_forecast.sql` L1, L7 to L8). That is a real IBM-in-Confluent fact. But its anomaly sibling is Early Access, and "Granite model support is earlier still" (`enrichment_anomaly_ai.sql` L59 to L60), so cite it only as "in Confluent's quickstart", never as a GA capability.

---

## 6. Worth adding?

**Yes, as a one-line "try it" pointer for technical counterparts, with the caveats said out loud.**

Why it earns a line:

- It is official: the `confluentinc` org, public, Apache-2.0.
- It is cheap to try: one `uv run deploy`, about 10 minutes to deploy, about 60 minutes for the workshop, new-account credit covers it.
- It exercises exactly the deck's new pillar: Process as materialized tables, Lightning Tables for an app, the Real-Time Context Engine over MCP for agents (including the counterpart's own Claude Code or Codex), and in the full demo Tableflow to Iceberg in Glue and Athena.
- Its three demo scenes are the deck's three readers: "Streamhouse for Apps", "Streamhouse for AI", "Streamhouse for Analytics Reporting".
- The workshop path has been run on Confluent Cloud: "The workshop pasted SQL 32, 29, 30, and 31 by hand on Confluent Cloud on 2026-10-28, and the hosted model's agent wrote RA417's offers." (`demo-script-screens.md` L88)

What to say with it:

- The data is airline and F1, not finance.
- It runs on Confluent Cloud on AWS only, and the account needs a payment method.
- The Tableflow scene needs AWS credentials and is not in the workshop.
- It shows no CDC and none of page 9's controls beyond schemas and read-only access.
- Its agent runs on Claude hosted in Confluent, not on watsonx.
- The repo is days old (content landed 2026-11-03) and its presenter script still lists open gaps.

**Where it fits: page 16, not page 18.**

- **Page 16 (Delivered by Confluent).** The quickstart is Confluent's delivery, and it runs only on Confluent Cloud. That is the "WHERE IT RUNS" beat, so it sits naturally there. On screen, one mono caption under the Confluent Cloud platform box ("THE ENGINEERING FOCUS"): `TRY IT / CONFLUENTINC/QUICKSTART-STREAMHOUSE`. In the talk track, after the cluster linking sentence (and R21 if adopted): "If a client's architect wants to see it working, Confluent publishes a quickstart on GitHub, quickstart-streamhouse, that builds one on Confluent Cloud in about an hour."
- **Not page 18.** Its where-to-go-next row was deliberately removed on 2026-11-03, and its job is the retell. Its talk track already points sellers at the watsonx workshop. A Confluent repo there would compete with the close.

---

## 7. Gaps

- **Nothing was run.** Every behaviour above is what the repo's docs and code say, not what I observed. Latency and freshness figures are the authors' (one rehearsal measured "about 20–25 s"), on a Standard single-zone cluster with synthetic data.
- **No figures for Lightning query latency** beyond "answering in milliseconds". No figure for RTCE latency. No Tableflow freshness figure or setting at all.
- **No release status in the repo** for Lightning Tables, Lightning Queries, RTCE or Tableflow. The `v1alpha1` in the Lightning REST path is an API version string; I did not infer product status from it. A quick fetch of the two linked docs pages found no status label either, but that fetch was partial: the RTCE page's body did not come through cleanly.
- **Unverified SQL points**:
  - whether Confluent Cloud for Apache Flink accepts `JOIN ... USING`;
  - how Lightning names a key column not called `key`;
  - whether Lightning requires `LIMIT` or tolerates a trailing `;`;
  - whether `$rowtime` can be qualified through a join alias.

  The recommendations avoid depending on any of these, or flag where they do.
- **Product quirks the repo records** that a technical seller should not be surprised by:
  - "After Lightning is enabled on `flight_status`, it can keep a frozen copy of a flight's row beside the live one (seen in the 2026-10-28 workshop run), and no column tells them apart." (`AGENTS.md` L36)
  - "`flight_status` in Lightning showed only the 34 flights updated since enablement" (`demo-script-screens.md` L87)
- **Unbuilt pieces of the presenter demo**, by its own "Must fix" list (`demo-script-screens.md` L85 to L90): the Webhooks connector and its Confluent Assistant prompt, and Amazon Quick. The workshop does not depend on them.
- **Not covered by the repo at all**: Kora, CDC, the 120+ connector catalogue, Stream Governance's data quality rules, field-level encryption, lineage, snapshot queries, Velox, the Lightning changelog and compaction, Confluent Platform, cluster linking, Delta Lake (named in narration only), Azure and GCP.
- **An undocumented second MCP path**: `uv run setup-mcp` registers Confluent's open-source `@confluentinc/mcp-confluent` server. No doc mentions it; I did not trace it further.
- **Screenshots** (about 50 PNGs) were not inspected beyond the Flight Disruptions architecture diagram. Their text labels came from the Excalidraw sources.
- **The existing research needs a note.** `research/confluent-streamhouse.md` §6 describes RTCE as serving context "from an in-memory low-latency cache (Q4 2025 launch)". This repo, and the linked RTCE docs page, describe it as the MCP interface to Lightning Tables. That file should be reconciled. I have not edited it.
