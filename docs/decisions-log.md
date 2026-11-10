# Streamhouse demo: findings before the grilling

Captured 2026-11-09. Routing session (`/ask-matt`). Nothing here is decided except
the four answers in "Settled" below; everything else is input to `/grill-with-docs`.

## Settled by the user, 2026-11-09

1. **Home**: its own new repo, outside the deck repo. (The deck's AGENTS.md forbids
   touching `package.json` or adding dependencies, and this is an app, not a slide.)
2. **Stage mode**: live against Confluent Cloud, with a deterministic fallback that is
   visually identical when the network fails.
3. **Clocks**: all three genuinely live, or it is not the story.
4. **Audience**: any seller, on their own account. One-command apply and teardown,
   no hardcoded ids.

Tension flagged at the time, now probably resolved: (3) + (4) only collide if Lightning
Tables are sales-gated. Evidence below says they are self-serve. Confirm before planning.

## The demo is already specified by the deck

Source: `slides/streamhouse-sellers/index.tsx` on `main` of the deck repo (17 pages, in
acts PREMISE / ARCHITECTURE / PILLARS / PAYOFF / PLATFORM / PLAYBOOK). The speaker notes
travel with each page, so the notes are the spec.

**The question** (the spine, asked verbatim): "What is this client's exposure right now,
across everything?" Asked by a trading desk, a risk officer, an advisor, and a risk agent
that asks constantly.

**The six sources, each with its own age** — the demo needs all six, and their ages are
the point:

| Source | Shape | Age |
|---|---|---|
| Intraday feed | stream of messages on MQ | genuinely current |
| Venue | loose fields | reconciles at noon |
| Desk spreadsheet | cells somebody types | ad hoc |
| Custodial file | fixed-width columns | landed 06:00 |
| Clearing statement | printed total | yesterday |
| Position file | last night's extract from book of record on mainframe | last night's close |

Then **CDC off the book of record** reads inserts/updates/deletes as they occur, making
the stalest input seconds old. That move is the Connect beat's payoff.

**The thesis**: the assembled number is only as fresh as the stalest input, and it arrives
with no timestamp, so the person acting on it cannot tell. Hence the **age stamp**: every
record carries its age, so the answer can say how old it is.

**The two edges** (both ways staleness costs money): the **breach** (finding out late a
limit was crossed) and the **false block** (refusing a client's trade, or posting
collateral, against exposure that was never there).

**Process / the computation**: Flink keeps the number continuously instead of assembling
it on demand. Stateful: one value per client, each arriving record is a delta. A fill
times its price moves the exposure; a price move times the position moves it again.
Nothing is ever re-summed from the start. The output is itself a record on a topic.

**Govern beats** — note the official quickstart implements NONE of these, so this is where
the demo beats the reference labs:
- schema contract on a position record (client, symbol, quantity, time, typed), evolvable
- quality rule rejecting well-formed-but-wrong records: the fat finger, one zero too many,
  goes to a **dead letter topic** and the number never moves
- **client-side field-level encryption** of the client identifier: ciphertext on the topic
- **stream lineage**: which sources, which version, as of when

**The three clocks**:
1. **Under a second** — one client's exposure, via Lightning Tables in SQL for the desk,
   and over MCP via the Real-Time Context Engine for the risk agent. Carries its age.
2. **About a minute** — the whole book, one row per client with its limit, queryable and
   sortable by limit utilisation, so the clients nearest the edge rise to the top.
   The minute is **Flink's commit** (the price of exactly-once), not the table: a
   Lightning Table takes a change in under a second.
3. **About five minutes** — Tableflow materializes the topic as an Iceberg table in
   object storage, catalog kept in step, for reporting, recalibration and audit.
   Honest claim: the bytes still exist twice. What disappears is the job, not the copy.

**Payoff**: same records, three readers, three speeds, zero pipelines owned.

**The stated boundary** (page 16, conceded before anyone asks): not inside a matching
engine, a pre-trade risk gate, or any synchronous order path — those budgets are
microseconds. The demo must not imply otherwise.

**Worked data already in the deck** (`index.tsx` ~L7397), client id / limit / exposure:

    2286  120.0m  112.8m   (94%)
    8803  300.0m  271.5m   (91%)
    6154  250.0m  216.0m   (86%)
    4417  450.0m  364.3m   (81%)   <- the followed client
    7405   80.0m   61.6m   (77%)
    9021  500.0m  371.0m   (74%)
    3318  200.0m  141.2m   (71%)
    5560  150.0m  101.3m   (68%)

The risk officer's view is 4,000 clients; these eight are the top of the sort.

## The official reference implementation

`confluentinc/quickstart-streamhouse`, Apache-2.0. Its own package name is
`streamhouse-demo`. Prior detailed read at commit `04cd65e` is written up at
`research/confluent-quickstart-streamhouse.md` in the deck repo. Two labs: Agentic
Airline Operations and F1 Agentic Pit Decisions. **No financial services example** — the
deck says so on the Delivered page. This demo fills that gap.

What it proves works, and what we should follow rather than invent:
- `terraform/core/`: environment with `stream_governance { package = "ADVANCED" }`;
  Kafka Standard, SINGLE_ZONE, default us-east-1; Schema Registry; Flink compute pool
  `max_cfu = 20`; service accounts, role bindings, API keys, ACLs; an `rtce-reader`
  service account with `DeveloperRead`.
- **AWS-only by design**, because RTCE and Flink Native Inference are AWS-only. No cloud
  or region choice in their deploy script.
- Lightning Tables enabled **per topic**, either "+ Enable" in the Console or
  `confluent rtce rtce-topic create`. This is the evidence that it is self-serve.
- Lightning Queries by POSTing SQL to
  `https://sql.{region}.{cloud}.confluent.cloud/query/v1alpha1`. Their web app is FastAPI
  and the browser polls it every 2.5s. This is the frontend pattern to copy or beat.
- RTCE as an MCP server exposing exactly three generic tools: `listTopics`, `getMetadata`,
  `queryData`. There is no per-question custom tool, so a demo that shows
  `get_client_exposure` as a tool name would not run.
- Tableflow into Iceberg in a **customer-owned S3 bucket** (`byob_aws`) with a catalog
  integration to **AWS Glue**, queried by Athena. Needs AWS credentials; not part of
  their workshop.
- A streaming agent inside Flink: `CREATE MODEL` / `CREATE TOOL` / `CREATE AGENT` /
  `AI_RUN_AGENT`, on a Confluent-hosted Anthropic model.
- Their deploy still uses the CLI for the Global API key and for enabling Lightning
  Tables, which suggests Terraform provider gaps.

## Risks and open questions

- **Cluster cloud and region.** The existing cluster must almost certainly be AWS, and
  probably us-east-1. If it is not, it may need rebuilding. Only the user can check.
  This is the first thing to confirm.
- **Lightning Tables entitlement** on this specific account, five days after GA
  (2026-11-04). Self-serve per the quickstart; unverified on this org.
- **Clock one's honesty.** The answer returns in under a second but the number is up to a
  minute old, gated by Flink's commit (~20-25s observed in the quickstart's rehearsal).
  The deck currently says "each answer under a second old", which a counterpart who has
  run the quickstart would challenge. The age stamp is the right device to show the true
  number, and this is an argument for building it honestly rather than smoothing it.
- **Tableflow needs the seller's own AWS account** (bucket, IAM, Glue). That is a real
  obstacle to "any seller, on their own account" and needs a decision: require it,
  automate it in Terraform, or degrade clock three gracefully.
- **Six sources means six ingestion shapes.** Generating MQ, loose fields, a spreadsheet,
  a fixed-width file, a printed total and a nightly extract is a meaningful slice of work
  on its own, and the quickstart has no CDC connector to copy from.
- **The fallback.** "Visually identical when the network fails" needs a mechanism settled
  before the frontend is built, not bolted on after.
- **Cost and teardown** at demo scale, and current free-trial credits. Outstanding.

## Route

`/research` (running) -> `/grill-with-docs` -> `/to-spec` -> `/to-tickets` ->
`/implement-spec`, with `/wizard` for the irreducible human steps (Confluent org,
environment, API keys, the AWS bucket and IAM role for Tableflow), `/prototype` then
`impeccable` for the frontend, and `/code-review` and `/retro` to close out.
New repo will need `/setup-matt-pocock-skills` to establish its tracker and doc layout
before `/to-tickets`.

## Cost facts, confirmed 2026-11-09

Full sourcing in `research/confluent-cloud-demo-platform-2026-11.md`. Rates are from
confluent.io's pricing page and its own data files; docs.confluent.io deliberately
publishes no list prices, only billing mechanics.

**The trap: Stream Governance Advanced is $1.00 per environment-hour**, about $730 a
month, and the official quickstart's Terraform sets `package = "ADVANCED"` on the
environment. Essentials is free up to 100 schemas. But **client-side field-level
encryption is Advanced-only** ($0.02 per encryption rule), and the deck's Govern beat
needs CSFLE to show the encrypted client identifier. So either we pay $1/hour only while
demoing and tear down hard, or we drop the CSFLE beat. Decision for the grilling.

Other standing costs if left running:

| Component | Rate | Notes |
|---|---|---|
| Basic cluster | first eCKU free, then $0.14/eCKU-hr; $0.05/GB in+out; $0.08/GB-month | effectively $0 idle; zero consumption is free |
| Standard cluster | $0.75/eCKU-hr, about $385-547/month | what the quickstart uses; 99.99% SLA needs 2 eCKU |
| Flink | $0.21/CFU-hr, min 1 CFU-minute per statement | charged only while statements run; an idle pool is free unless a baseline CFU is set |
| Tableflow | $0.10/topic-hr for the first 10 topics, plus $0.04/GB processed | two topics is about $5/day |
| Lightning Tables | $0.105/CCU-hr, plus $0.029/GB-month managed storage | appears on the public pricing page, which is good evidence it is self-serve |
| Stream Governance Advanced | $1.00/environment-hr | about $24/day, the largest single line |
| Datagen source connector | $0.017-0.0347/task-hr plus $0.025/GB | not free, about $12/month per task |

Everything left running is plausibly **$50 or more per day**. Two consequences:
`terraform destroy` is a first-class deliverable, not a footnote; and the fallback mode
matters for cost as well as for stage safety, because it lets the cloud footprint be
destroyed between rehearsals.

**Free trial**: $400 credit, 30 days, whichever comes first, and the unused balance
expires at the end of the 30 days. A payment method is required to create any resource.
The user's account already exists, so the trial may be partly or wholly consumed. Worth
checking before assuming the demo is free to build.

Partitions are free on every cluster type. Kafka storage is billed post-replication, so
billed storage is about three times what is written.

## Decisions, 2026-11-09 (second round)

5. **Repo**: https://github.com/faraz/streamhouse-capital-markets, to be cloned under
   `/Users/naf/second-bran/projects/`. Note the name is streamhouse-capital-markets.
6. **Key scope**: an OrganizationAdmin key throughout, chosen over the bootstrap-then-scope
   option. Accepted tradeoff: a long-lived credential on disk with full rights over the
   org, including the ability to incur billing. Mitigations to build in regardless:
   `.env` gitignored before any key is written, and a teardown script.

## Decisions, 2026-11-09 (third round)

7. **The demo's star is normalization plus the agent on RTCE**, not the three clocks.
   Confirmed by the user after seeing the first prototype. The hook is: six differently
   shaped real-time feeds normalized into one governed record, then an agent hooked to
   the Real-Time Context Engine asking AI queries over it. The three clocks are demoted
   to supporting evidence (a compact strip showing how old each answer is), because
   their job is to explain why the agent's answer can be trusted.
8. **Sources are synthetically generated.** Nothing connects to a real system of record.
   Data is pumped into topics directly. This removes the single biggest build risk, since
   managed CDC connectors for Oracle are "contact us" priced and the official quickstart
   ships no CDC connector at all.

## Architecture that follows from decision 8

Six generators produce six differently shaped payloads into six raw topics, so the
normalization story stays visible even though every byte is synthetic:

    raw.mq_intraday        pipe-delimited, carries a time
    raw.venue              loose JSON, no time
    raw.desk_sheet         CSV out of a spreadsheet
    raw.custodial          fixed-width columns
    raw.clearing           a printed total
    raw.book_of_record     a change stream standing in for CDC

Then, in Flink SQL:

    positions              one schema: client_id, symbol, quantity, price,
                           event_time, source, age_ms. Schema Registry enforces it.
                           A quality rule routes the fat finger to positions.dlq.
                           client_id carries client-side field-level encryption.
    positions.dlq          where the rejected record lands
    client_exposure        stateful aggregation, one row per client, limit beside it.
                           Never re-summed from the start; each record is a delta.

Then, serving:
- **Lightning Table** on `client_exposure` and `positions`, enabled per topic
- **RTCE / MCP** over those tables: the agent gets `listTopics`, `getMetadata`,
  `queryData` and writes its own SQL. No purpose-built tool, because none can exist.
- **Tableflow** on `client_exposure` into Iceberg, for the third clock
- **Flink `CREATE AGENT` / `AI_RUN_AGENT`** on a Confluent-hosted Anthropic model for the
  streaming agent that writes escalations to a topic
- **Vercel**: Next.js route handlers hold the credentials and proxy the SQL endpoint; the
  browser polls or streams from them. The browser never holds a Confluent key.

**Open recommendation, not yet decided**: with everything generated, the Connect pillar
is represented rather than demonstrated, because no actual connector is running. Putting
at least one fully managed connector in the path (a Webhook source the generator POSTs
to, or Datagen) would make Connect real in the console for the price of a few cents an
hour. Worth doing for a seller demo. Caveat to verify: the quickstart deploys its Webhook
source connector only on a Dedicated cluster, and Datagen's custom-schema support is
unconfirmed.

## Capability research, landed 2026-11-09

Full detail in `research/confluent-cloud-capabilities-2026-11.md` and
`research/confluent-cloud-demo-platform-2026-11.md`.

**Resolved: Lightning Tables are GA, self-serve, and ungated.** No entitlement,
allowlist, preview enrolment or sales gate anywhere in the docs. Prerequisites are a role
plus a registered schema. **Basic qualifies**; Standard is not the floor. AWS-only,
10 regions, **us-east-1 included**. RTCE went GA 2026-05-19; the Lightning Tables rename
landed 2026-11-04 with no lifecycle qualifier. So decisions 3 and 4 do not collide.

**Three corrections that change the build:**

1. **The "~60 second Lightning Table refresh" does not exist.** Docs say a Lightning
   Table reflects new data "within **100 milliseconds**". The minute comes from Flink,
   which "commits transactions approximately every minute". So the middle rung is
   *answered in under a second, from a number up to a minute old*. And
   `'kafka.consumer.isolation-level' = 'read-uncommitted'` collapses the age to under
   100ms at the cost of exactly once. That is a **setting, not a limit**, and it is now a
   live toggle in the prototype: a real engineering trade-off the audience can watch.
   This also means the deck is wrong in two specific places (page 11's "nobody's
   materialized view refreshes faster than about a minute", and the attribution of the
   minute), which the earlier quickstart research had already flagged.
2. **Lightning Tables cannot compute the aggregate.** Single-topic and read-only: joins,
   aggregates and GROUP BY are rejected. So Flink must write `client_exposure` with
   `limit_util_pct` and `as_of` as **explicit precomputed columns**, and the age stamp is
   read off the row rather than derived. Prototype corrected.
3. **The SQL endpoint is `/query/v1`, not `/query/v1alpha1`.** The quickstart's version
   string is stale.

**Kafka REST v3 cannot consume**, stated as an `Important` admonition. A backend consumer
is mandatory for anything that needs to read the stream face live. Not a problem for this
demo, because all three reads are query-based, but it rules out a browser-only design.

**Tableflow now has a Confluent-managed storage option**, needing no bucket and no IAM
role. This removes the AWS-account dependency that was the biggest obstacle to
"any seller on their own account".

**Terraform coverage is near complete.** The Lightning Table resource is
`confluent_rtce_topic` (searching the provider for "lightning" finds nothing). Only two
steps sit outside Terraform: the global API key, and the optional MCP connection. A
one-command apply and destroy is genuinely achievable.

**Warning: Stream Governance Advanced is a one-way door** at about $24/day. It cannot be
downgraded back to Essentials on that environment. Since CSFLE requires Advanced and the
Govern beat needs CSFLE, flipping it commits that environment permanently. Create the
demo in its own environment so the commitment is contained.

**Test first:** the RTCE *billing* page calls direct API querying an Early Access
feature, which the API reference and the GA release note both contradict. Resolve that
before building on the SQL endpoint.

**Pricing caveat:** the two reports disagree on what is published. The first found Flink
at $0.21/CFU-hour and Tableflow topic-hour tiers in the pricing page's own data files;
the second reports those rates as published nowhere. Read the Console to settle it.

## Decisions, 2026-11-09 (fourth round)

9. **Stream Governance Essentials only.** The user has Essentials, not Advanced, so the
   encryption beat is dropped. This also makes the one-way-door warning moot: nothing
   flips to Advanced, and the environment stays free at the governance line.

What that costs and what survives, confirmed from the packages doc:

| Govern beat | Package | In the demo |
|---|---|---|
| Schema contract, typed and evolvable | Essentials, 100 schemas free | Yes, enforced at produce |
| Stream lineage | Essentials, **last 10 minutes** only | Yes. 10 minutes is ample for a live demo; Advanced adds a 7 day point-in-time view and a searchable graph |
| Data quality rules | **Advanced only** | Reimplemented as a **Flink guard**: a Flink statement routes the fat finger to `positions.dlq` |
| Client-side field-level encryption | **Advanced only** | Dropped |

The fat-finger moment therefore survives, but it is Flink doing the work rather than a
declarative Schema Registry data rule. The outcome on screen is identical: the bad record
lands in `positions.dlq` and the exposure figure never moves. Labels in the prototype say
"Flink validation" rather than "quality rule" so the claim stays true. On Advanced it
becomes a declarative rule and the Flink guard can be deleted, which is a clean upgrade
story to tell a client.

Lineage surviving matters more than the encryption loss, because the deck's own argument
is that the question a second line and a regulator ask is not what the number is but how
you got it.
