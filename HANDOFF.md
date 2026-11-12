# Handoff: the Streamhouse capital markets demo

Written 2026-11-09 (Monday). **The talk is Thursday 2026-11-12.** Three days.

You are continuing a build that is fully designed and partly scaffolded. Every design
decision is settled, all research is done, and the frontend exists as a working
prototype. What remains is implementation. Do not reopen decisions; if one looks wrong,
check `docs/adr/` and `docs/decisions-log.md` before raising it.

## What this is

A live demo on Confluent Cloud that makes the middle act of an existing seller talk real.
The talk is a 30 minute deck at `/Users/naf/second-bran/talks/inference-stack`, slide
`slides/streamhouse-sellers` (17 pages; the speaker notes in `index.tsx` are the script).
Its spine is one question: *what is this client's exposure right now, across everything?*

The demo's star, stated by the user in those words, is **using Streamhouse to normalize
real-time data and then hooking an agent up to RTCE for AI queries**. The three
freshness clocks are supporting evidence, not the headline. Do not let the clocks
become the centrepiece again.

## Read these first, in this order

| What | Where |
|---|---|
| Vocabulary for this demo | `GLOSSARY.md` |
| The five decisions with reasons | `docs/adr/0001` to `0005` |
| Every settled decision plus cost facts | `docs/decisions-log.md` |
| Lightning Tables SQL surface, limits, auth | `research/lightning-table-sql-surface-2026-11.md` |
| Capability facts, Terraform and CLI coverage | `research/confluent-cloud-capabilities-2026-11.md` |
| Pricing, meters, trial | `research/confluent-cloud-demo-platform-2026-11.md` |
| Confluent's own reference implementation, read and compared | `research/confluent-quickstart-streamhouse.md` |
| Inherited vocabulary | `talks/inference-stack/docs/context/streamhouse-sellers.md` and `streamhouse.md` |

The working prototype is `prototype/exposure-desk.html`, 831 lines of vanilla JS, also
published at https://claude.ai/artifact/N8LTwxNh1c1ok5Hg7pFxAr (private, version 6). It
is **not throwaway** (ADR-0002): it is the deterministic stage fallback and the source of
the frontend's design and data contract. Port it, do not rewrite it, and keep it working.

## The one thing blocking everything

The user must run `confluent login` in their own terminal. The Confluent CLI (v4.82.0)
and Terraform (1.17.1) are installed via Homebrew. Nothing Confluent-side can be applied
until that login exists. Ask once, then work on what does not need it.

Credentials go in a gitignored `.env` (see `.env.example`) and, for the Worker, through
`wrangler secret put`. **No secret is committed anywhere, and none appears in this file.**

## What exists

- `terraform/versions.tf`, `variables.tf`, `main.tf` — environment (Stream Governance
  **Essentials**, deliberately: Advanced cannot be downgraded), Basic cluster on AWS
  us-east-1, three service accounts (manager / producer / reader), role bindings, API
  keys, Flink compute pool with `max_cfu = 10`.
- `terraform/schemas/*.avsc` — nine Avro schemas, all valid JSON. Six deliberately
  divergent raw sources, plus `positions`, `client_limits`, `client_exposure`.
- Scaffold: `package.json`, `vite.config.ts`, `tsconfig.json`, `wrangler.toml`,
  `.env.example`. Vite plus vanilla TypeScript, no framework, no React.
- Empty and waiting: `flink/`, `src/`, `worker/`, `scripts/`.
- Git repo at `main` with **no commits yet**. Remote is
  `https://github.com/faraz/streamhouse-capital-markets` (empty).

## What to build, in priority order

**Tier 1, must be live Thursday.** Terraform for topics and schemas; Datagen connectors
for **three** of the six raw topics (the full six is Tier 2); Flink SQL to normalize into
`positions`, the Flink guard routing a well-formed-but-wrong record to `positions.dlq`,
and the stateful aggregation into `client_exposure`; `confluent_rtce_topic` on
`client_exposure` and `positions`; the RTCE MCP connection; the Cloudflare Vite SPA and
Worker routes; the interactive agent with both canned and free-text questions; the
Before/Streamhouse toggle carrying both edges. Inline query responses only.

**Tier 2, if Wednesday goes well.** Tableflow and clock three. The Flink streaming agent
(`CREATE MODEL` / `CREATE TOOL` / `CREATE AGENT` / `AI_RUN_AGENT`) writing escalations,
with a Worker-side substitute if it eats a day. The other three raw topics. The
read-uncommitted lever.

**Tier 3, after Thursday.** Bob as a second MCP client. The async-plus-presigned-download
response branch. All six Datagen connectors. Any-seller packaging and one-command apply.

**Build the simulator path to completion first.** It needs no account, no network and no
credentials. Once it is done, Wednesday's question is "how much of this is live?" rather
than "do I have a demo?" This inverts the instinct to do infrastructure first. Do it
anyway.

## The run-of-show

Revised 2026-11-10 to what the demo lands: **Lightning Tables, the materialized table, the
Streaming Agent, and MCP through the Real-Time Context Engine**. Tableflow, Bob and the
read-uncommitted control are out. Everything below runs on the live stack; Before mode is a
script whose "what was really true" is the live figure. About nine minutes.

| Time | Beat |
|---|---|
| 0:00 | Open in **Before**. The question, six sources, six ages, stalest flagged. |
| 1:00 | Ask the analyst the exposure question. It reads last night's copy: 68%, no action needed. Then what was true, read live (81%), and the next-morning discovery at 103%. Click 7405 for ~20 s: the copy reads 98%, the client is at 77%, the **false block**. |
| 2:30 | Flip to **Streamhouse**. Six shapes, one governed record, with an age. |
| 3:30 | **Send a fat finger** (always on 4417). Rejected to `positions_dlq` within a minute; 4417's figure never moves. |
| 4:15 | Ask the exposure question again. The analyst lists the topics, reads a schema, writes its own SQL against the Lightning Table, and states the age. About 40 s. |
| 5:15 | Ask the book question: the top of 4,000 clients by `limit_util_pct`, the same table. |
| 6:15 | **A fill arrives** (always 4417, $27.07m: say the dollars, not the lots). Ask the analyst "what just changed?" while it lands: the figure moves to 87.4% at the next commit, then the **risk agent's** note appears in Escalations, written by the Streaming Agent from the crossing Flink detected. Timings below. |
| 7:45 | The price of exactly-once, said rather than shown: "the figure waits for Flink's next commit; we computed it in one step so there is only one; a late figure beats a doubled one." |
| 8:15 | **Console cutaway**: Materialized tables (`client_exposure`, `exposure_crossings`), then Streaming Agents (`risk_agent`), then the topics list with the Lightning Tables column. |

Measured 2026-11-10 for the 6:15 beat: the figure 11 to 56 s after the click (one commit),
the risk agent's note about 10 s after the figure. The analyst's answer to "what just
changed?" takes about 40 s and covers the wait.

The screen now drives these beats itself, as a tour of eleven steps in `src/ui/Tour.tsx`
(revised 2026-11-11 after `.scratch/exposure-desk/evaluation-2026-11-10.md`): the question,
today's answer, wrong both ways (the breach and the false block), Streamhouse, six shapes (a real record of each source
traced through Kafka and Flink), the fat finger, the analyst, the book, the fill (its trace,
and exactly-once said during the wait), the risk agent (the analyst is asked what changed
only once the fill has landed), then the desk. The console cutaway is still the presenter's
own, after the last step.

The desk follows the window (2026-11-11): side columns flex, the middle column scrolls on a
short window, and under 900px wide everything stacks into one column with the narration
fixed at the foot. The book's edge, the analyst's edge and the top of the records drag, and
the sizes are kept in that browser; a double click on a handle puts the design's size back.
Each step's caption is docked above the rail with its Back and Next.

Names on the live desk open their own page in the Confluent Cloud console (2026-11-11): the
five pillars, topics, Flink statements, the two materialized tables, Lightning Tables, the
`risk_agent` Streaming Agent and stream lineage. The addresses are built in
`src/ui/console.tsx` from the environment and cluster the Worker already holds. Flink
statement names carry the build's stamp, so after a rebuild set `STATEMENT_STAMP` there to the
stamp `scripts/regenerate.sh` prints. The links need a browser logged in to Confluent Cloud.
Each link is a chip with a way-out arrow, wrapped in React Bits' GlareHover: a glare crosses it
once when it first shows and again under the pointer or keyboard focus, and it is still at rest.

The desk is flat graphite: colour appears only on data, never as atmosphere (2026-11-11). Its
graphics carry the argument. The client panel's limit instrument is the figure over the session,
stepped, with a tick for each Flink commit; in Today mode the nightly copy and what was true run
apart. Under the flow, one log-scale ruler places every source and the answer by age. The book
opens with a limit ladder, one square per client. In a trace, field names ride the wires. When a
fill lands and the desk is in view, its four stops are numbered in order for sixteen seconds.

Step 3 is named Wrong both ways on the rail (2026-11-12): the false block is told against the breach, the client panel splits in two,
4417 beside 7405 on one scale, the copy's mark staying put and the true figure leaving it in
opposite directions. Both clients are read live while the step is on screen, and the analyst
is asked the same question about each. The Alerts panel follows the Today steps: empty at step 1,
the next-morning discovery at step 2, and a scripted "Blocked on a stale number" for 7405 added
at step 3.

In Today mode the Pipeline panel is a chart, not a flow (2026-11-12): one blocked bar per system,
as long as its extract is old, on a log scale, with a rule at the stalest and the `nightly_copy`
plate against it. The lanes shader is drawn only in Streamhouse mode.

The spotlight is a gesture (2026-11-12): on arriving at a step the panels it is about take a
bright edge and the rest dim for 4.5 seconds, then the whole desk comes back up. Escape, or the
rail's Spotlight button, lifts it early or gives it again.

Before the room: `scripts/verify.sh --quick`, then press **Reset** and wait for 4417 to read
81%. Reset also offsets any rehearsal fills; nothing needs rebuilding.

## Facts that will bite you

These are all sourced in `research/`. They contradict things you would reasonably assume.

- **The Terraform resource is `confluent_rtce_topic`.** Searching the provider for
  "lightning" returns zero hits. All six of its arguments are required.
- **There is no 60-second Lightning Table refresh.** A Lightning Table updates within
  **100ms**. The minute comes from Flink committing transactions about every minute.
  `'kafka.consumer.isolation-level' = 'read-uncommitted'` drops end-to-end under 100ms at
  the cost of exactly-once. That is the 8:45 beat, and it is a setting, not a limit.
- **`WHERE "KEY" = '...'` does not exist.** Use the schema's own column name, bare and
  unquoted: `WHERE client_id = '4417'`. The quickstart's idiom is wrong.
- **A Lightning Table serves one topic, read-only.** No joins, aggregates or `GROUP BY`.
  But `ORDER BY` and `LIMIT` on stored columns **are** supported, so the top-N book query
  works directly and Flink does **not** need a ranked topic. Arithmetic in the projection
  is undocumented, which is why `limit_util_pct` is a stored column.
- **Querying needs a Global API key**, which Terraform cannot mint:
  `confluent api-key create --resource global`. Cloud keys manage, Global keys query.
  The reader needs `DeveloperRead` on both the cluster and the Schema Registry cluster.
- **No CORS is documented.** The Worker must always proxy; the browser never holds a key.
- **A query returns 200 inline only under 10s and 4MiB**, otherwise 202 plus poll plus a
  presigned download, and the docs say you cannot predict which. Tier 1 handles inline;
  design for **200 rows maximum** (the OpenAPI caps `max_result_rows` at 200, and MCP is
  hard-capped at 200 rows / 20s).
- **Enabling a Lightning Table takes several minutes** and it is queryable only at status
  `Active`. Budget for this in rehearsal.
- **Upsert mode is automatic from `cleanup.policy`** including `compact`, and needs a
  record key. Use a **raw** string key to avoid the immutable-key-schema trap.
- **Datagen custom schemas** go in `schema.string`, cap at 10,000 characters, cannot use
  the `regex` annotation, and take `options` only as a JSON array.
- **The Kafka REST produce API has no Schema Registry support** (BINARY, JSON, STRING
  only) and **cannot consume**. This is why the raw topics are ingested as written and
  governance is imposed where Flink normalizes.
- **Data quality rules and field-level encryption are Stream Governance Advanced only.**
  The user has Essentials. The fat finger is caught by a **Flink guard**, and screen
  labels say so rather than claiming the product feature.
- **Tableflow now has Confluent-managed storage**, so no bucket and no IAM role.
- **Stream Governance cannot be downgraded.** Never set `advanced`.
- **Unresolved:** the RTCE billing page calls direct API querying an Early Access feature
  while the API reference and the 2026-11-04 GA note contradict it. Acceptable for a
  demo. It is the only documented reason `POST /query/v1` might 403 on a fresh account,
  so **test it first**.

## Money and time

$400 of trial credit, clock started 2026-11-09, expiring about 2026-12-09, all of it
unspent. An always-on footprint is plausibly $300 to $700 a month, so the stack is
**on-demand** (ADR-0005): `terraform apply` for rehearsals and the talk, destroy after.
Build and exercise `terraform destroy` from the first ticket, not at the end. The two
largest meters are Flink statements and Tableflow topic-hours; pausing those is the light
lever for same-day rehearsals.

Cloudflare free tier: 10ms CPU per request (network I/O does not count) and 100,000
requests a day. Hence **one combined endpoint polled only while the tab is visible**.

## Suggested skills

Call the Skill tool for these:

- **`setup-matt-pocock-skills`** first. This repo has no issue tracker or doc layout yet,
  and `to-spec` and `to-tickets` both require one.
- **`to-spec`** then **`to-tickets`**, in one unbroken context, to turn this document and
  the ADRs into a spec and a task graph. User-invoked, so ask.
- **`implement-spec`** to run implementers in parallel across the ready frontier, which is
  what the deadline wants. Each implementer drives **`tdd`**.
- **`wizard`** for the credential capture if `confluent login` plus CLI key minting proves
  fiddly, and because the procedure is a deliverable for other sellers later.
- **`impeccable`** before touching the frontend's visual design. The look is deliberate:
  it inherits the deck's Blue Hour theme (`talks/inference-stack/themes/blue-hour.md`).
  Ink ground `#03050C`, paper `#F3F6FC`, cobalt accent `#8FB0FF`, alert red `#FF5A4E` for
  staleness and nothing else, IBM Plex Sans and Mono. **No purple, ever.** One colour per
  concept. Real boxes with craft, not soft tiles.
- **`code-review`** over the integration branch before Thursday.

Two standing user preferences that are easy to breach: **never use em dashes** in any
prose, and label separators are slashes, not middots. Commits name only the user; the
attribution trailer this harness asks for still applies, but no Co-Authored-By beyond it.

## Where this session stopped

Mid-way through writing Terraform. `main.tf` covers the environment through the Flink
pool. Still to write in `terraform/`: topics, schema registrations, the Datagen
connectors, `confluent_rtce_topic` resources, Tableflow, and outputs. Then `flink/`,
`src/`, `worker/`, `scripts/`. Nothing has been applied against the account, and the
account has no demo resources in it.
