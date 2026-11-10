# The Exposure Desk

Status: ready-for-agent

A live demo on Confluent Cloud for a 30 minute seller talk on **Thursday 2026-11-12**.
Vocabulary is `GLOSSARY.md`. Decisions and their reasons are `docs/adr/0001` to `0005`
and `docs/decisions-log.md`. Platform facts are `research/`. Session context, the
approved run-of-show and the list of facts that contradict reasonable assumptions are
`HANDOFF.md`. None of that is restated here.

## Problem Statement

A seller has a 17 page deck that argues an architecture, and nothing to show. The deck's
middle act claims that six systems of six different ages can be normalized into one
governed record carrying its own age, and that an agent can then be given that record to
reason over. An audience of Capital Markets and Wealth Management technical sellers will
believe the slides only as far as they believe the presenter, and the technical
counterparts in the room will not believe them at all, because the claims are exactly the
kind that sound good on a slide and fall over in a console.

Worse, the one claim the deck leans hardest on is the one most easily challenged: that an
answer can state how old it is. There is no way to assert that credibly in prose. It has
to be watched, ticking, next to a number that is wrong because nobody could tell how old
it was.

The seller also cannot currently answer the first question any client asks, which is "can
you connect to this?", nor the second, which is "how do I know the number is right?"

## Solution

One screen, driven live for about eleven minutes inside the talk, that answers **the
question** twice: once the way it is answered today, and once through a streamhouse.

In **Before mode** the screen shows six sources with six ages, the stalest flagged, and
one assembled number with no **age stamp** on it. An agent is asked for the client's
**exposure** and answers confidently, wrongly, and without escalating, and the screen then
shows what was actually true and what it cost. The same screen shows **the two edges** by
switching client: **the breach** on one, **the false block** on the other.

In **Streamhouse mode** six **raw topics** of deliberately divergent shape are normalized
by Flink into one record carrying a key, a time and its own age, under an enforced schema,
with a **Flink guard** sending a well-formed-but-wrong record to a dead letter topic
without moving the number. **The served tables** are published as Lightning Tables, and
the same agent, now an MCP client against the Real-Time Context Engine, writes its own SQL
and answers correctly with the age attached. A **narrative event** lands and the audience
watches it reach the answer at Flink's next commit, and watches the escalation fire on its
own. A toggle then trades exactly-once for sub-100ms freshness in front of the room, and
names the price.

Everything is synthetic. Nothing connects to a system of record. **The simulator** means
the screen works with no account, no network and no credentials, which is both the stage
fallback and the reason the Confluent footprint can be destroyed between rehearsals.

## User Stories

### The presenter, on stage

1. As the presenter, I want the screen to open already showing the Before world, so that my first sentence is about the problem rather than about the architecture.
2. As the presenter, I want six named sources with their ages visible at a glance, so that I can point at the stalest one instead of describing it.
3. As the presenter, I want the stalest source marked in alert red and nothing else in that colour, so that the audience's eye goes where my voice goes.
4. As the presenter, I want the assembled number to show no age stamp at all in Before mode, so that the absence is the point rather than a detail.
5. As the presenter, I want to see what the number actually should have been, so that the gap between reported and true is visible rather than asserted.
6. As the presenter, I want to switch to a second client and show the false block, so that the audience prices refusing a good client's trade as well as missing a breach.
7. As the presenter, I want one control that flips the whole screen from Before to Streamhouse, so that the contrast is a single gesture and not a navigation.
8. As the presenter, I want three fixed questions as buttons, so that the beats I depend on always work and always in the same order.
9. As the presenter, I want a free-text box beside them, so that I can take a question from the room and prove the agent is real.
10. As the presenter, I want to trigger a fill by hand, so that the change happens when I am talking about it and never before.
11. As the presenter, I want to trigger the fat finger by hand, so that the governance beat lands on my sentence.
12. As the presenter, I want baseline motion that never crosses a threshold, so that the screen looks alive without surprising me mid-sentence.
13. As the presenter, I want to flip isolation from exactly-once to read-uncommitted live, so that I can show the freshness trade-off as a setting rather than claim it as a limit.
14. As the presenter, I want a speed control that is visibly labelled when active, so that I can make the five minute clock watchable without appearing to cheat.
15. As the presenter, I want a reset that returns the screen to its opening state, so that I can rehearse a beat repeatedly and start clean in front of the room.
16. As the presenter, I want the screen to work identically with no network, so that a failed conference connection costs me nothing.
17. As the presenter, I want to know at a glance which data source is live, so that I never claim something is real when it is simulated.
18. As the presenter, I want the demo to be reachable at a stable URL on my own laptop and from the web, so that I am not dependent on a dev server starting.

### The audience, watching

19. As an audience member, I want to see the six raw payloads in their original shapes, so that I believe the systems really do disagree.
20. As an audience member, I want to see the one record they become, so that normalization is a thing I watched rather than a word I heard.
21. As an audience member, I want the record to carry its own age as a field, so that I understand where the age stamp comes from.
22. As an audience member, I want to see a schema contract named and enforced, so that "governed" means something specific.
23. As an audience member, I want to watch a bad record be rejected to a dead letter topic while the number stays still, so that I trust the number.
24. As an audience member, I want to see the agent's actual tool calls and the SQL it wrote, so that I can tell it is querying rather than being fed an answer.
25. As an audience member, I want every answer to carry how old it is, so that I can judge whether an agent should act on it.
26. As an audience member, I want to see the whole book sorted by limit utilisation, so that I believe this scales past one client.
27. As an audience member, I want to see the escalation appear without the presenter clicking anything, so that I believe something is watching continuously.
28. As a technical counterpart, I want the freshness numbers to be the real ones, so that I do not catch the presenter overclaiming and discount everything else.
29. As a technical counterpart, I want to see the Confluent console doing the work, so that I know this is the product and not a bespoke application.
30. As a technical counterpart, I want to see stream lineage for the number, so that I can answer my own second line and regulator.
31. As a technical counterpart, I want the demo to concede where this does not go, so that I believe the parts it does claim.

### In the fiction

32. As a trading desk, I want this client's exposure before I take on more risk, so that I do not breach a limit I did not know I was near.
33. As a risk officer, I want the whole book sorted by how much of each limit is used, so that I can see who is closest to the edge right now.
34. As an advisor, I want the household's exposure when a client calls, so that I am not reading from last night's file.
35. As the risk agent, I want to query exposure as often as I like over MCP, so that I can escalate before a breach rather than report after one.
36. As the risk agent, I want the answer to tell me how old it is, so that I can decline to act on something too stale.
37. As a reporting team, I want the same records in an open table, so that I can reconcile without asking anyone to build me a pipeline.

### Another seller, later

38. As another seller, I want to bring the whole stack up with one command, so that I can run this on my own account without reading the source.
39. As another seller, I want to tear it all down with one command, so that I do not discover a bill a month later.
40. As another seller, I want the demo to work before I have any credentials, so that I can rehearse the narrative before I provision anything.
41. As another seller, I want the prerequisites stated plainly, so that I know what I need before I start.

### Whoever maintains this

42. As a maintainer, I want the simulator and the live source behind one interface, so that the screen cannot tell them apart and neither can a test.
43. As a maintainer, I want the demo's logic tested without a browser or an account, so that I can change it confidently the morning of the talk.
44. As a maintainer, I want the live adapter tested against the same contract as the simulator, so that drift between them fails a test rather than the demo.
45. As a maintainer, I want one command that proves the real pipeline works end to end, so that "is it up?" has an answer that is not clicking around a console.
46. As a maintainer, I want no credential anywhere in the repo or the browser, so that publishing the demo is not a security event.

## Implementation Decisions

### One seam: the exposure source

**This is the only new seam, and it is the highest one available.** The screen never
talks to Confluent, to the simulator, or to HTTP. It talks to a single interface with two
implementations, which exist because ADR-0002 makes the simulator permanent.

The shape, taken from the prototype where it is already implicit (`prototype/exposure-desk.html`):

```ts
type Mode = 'before' | 'streamhouse';
type Isolation = 'committed' | 'uncommitted';

interface DeskSnapshot {
  wallClock: number;            // ms, the simulated trading day
  mode: Mode;
  isolation: Isolation;
  sources: SourceAge[];         // six feeds, each with its own age and shape sample
  normalized: NormalizedRecord; // the one record the six become
  rejected: RejectedRecord | null;
  served: ClientExposure;       // the followed client, as the served tables have it
  book: ClientExposure[];       // top N by limit_util_pct, N <= 200
  recent: Position[];           // most recent positions for the followed client
  escalations: Escalation[];
  clocks: { served: number; openTable: number }; // ages in ms
}

interface ExposureSource {
  snapshot(clientId: string): Promise<DeskSnapshot>;
  produceFill(clientId: string, lots: number): Promise<void>;
  produceFatFinger(clientId: string): Promise<void>;
  setIsolation(level: Isolation): Promise<void>;
}
```

`snapshot` returning everything in one call is deliberate: the Cloudflare free tier
allows 100,000 requests a day, so the screen polls **one** combined endpoint, and only
while the tab is visible.

### Modules

- **The simulator** — a pure function of seed, elapsed time and the list of narrative events. No I/O, no `Date.now()` of its own: it takes a clock. Implements `ExposureSource` entirely client-side, so the fallback needs no Worker and no network.
- **The live source** — implements `ExposureSource` by calling one Worker route. Handles the inline response branch for Tier 1. Must tolerate the 202-plus-poll branch without crashing even before that branch is implemented.
- **The Worker** — serves the built SPA from static assets and exposes the combined snapshot route, the two produce routes, and the agent route. Holds every credential. Checks a shared secret on each call. Stays thin enough not to deserve a seam of its own: a gate, a fan-out of queries, and a shape.
- **The agent route** — the Worker acting as MCP client against the Real-Time Context Engine, calling Anthropic with RTCE's three tools attached (`listTopics`, `getMetadata`, `queryData`). Streams its steps back so the screen can render tool calls as they happen. Per ADR-0003 this is not Flink's job.
- **The screen** — Vite plus vanilla TypeScript, no framework, ported from the prototype rather than rewritten. Renders a `DeskSnapshot`; holds no business logic.
- **Terraform** — environment, cluster, topics, schemas, three service accounts, role bindings, keys, Flink pool, Flink statements, `confluent_rtce_topic` on the served tables, and Tableflow behind a variable.
- **Flink SQL** — one statement per job, in `flink/`, applied as `confluent_flink_statement` resources.
- **Scripts** — the Global API key (Terraform cannot mint it), the client limits seed, and the end-to-end verification.

### Data contract

Six raw topics, each with its own Avro schema, divergent on purpose: one carries a time,
one has none, one sends every field as a string, one counts in cents, one sends only a
total, one is a change stream. Schemas are already written in `terraform/schemas/`.

Flink normalizes all six into `positions`, then maintains `client_exposure` as a stateful
aggregation joined against `client_limits`. Every record is a delta; nothing is re-summed
from the start.

`client_exposure` carries **`limit_util_pct` and `as_of` as stored columns**, because a
Lightning Table sorts and filters on columns and arithmetic in the projection is not
documented as supported. It uses `cleanup.policy=compact`, which selects upsert mode
automatically, with a **raw string key** to avoid the immutable-key-schema trap.

### Interfaces to the platform

- Reads go to the Lightning Tables SQL endpoint at `/query/v1`, authenticated with a **Global** API key, from the Worker only. No CORS is documented, so the browser never calls Confluent directly.
- Narrative events are produced over the Kafka REST produce API, which supports JSON and no Schema Registry. This is consistent with raw topics being ungoverned by design: governance is imposed where Flink normalizes.
- Every query is written to return at most 200 rows.

### Deliberate substitutions

Stream Governance is **Essentials**, which has no data quality rules and no field
encryption. The fat finger is caught by **the Flink guard** and the screen says "Flink
validation" rather than "quality rule", so nothing claims a feature that is not running.
Advanced is never set: it cannot be downgraded.

## Testing Decisions

A good test here asserts **what the demo shows**, never how it is computed. It drives the
`ExposureSource` interface and asserts the `DeskSnapshot` that comes back. It does not
touch the DOM, does not reach the network, and does not know whether Flink or a local
function produced the number.

### One contract suite, run twice

The same suite runs against both implementations. This is the highest-value decision in
the spec: drift between the simulator and the live source becomes a failing test rather
than a surprise on stage.

Against the simulator it runs with a fake clock and is the primary behavioural suite:

- The assembled Before-mode answer inherits the age of the stalest source, not of the freshest.
- The Before-mode answer carries no age stamp.
- The followed client reads below its true utilisation in Before mode, and the second client reads above it.
- A fill does not reach the served figure before Flink's next commit, and does reach it after.
- Under read-uncommitted a fill reaches the served figure immediately, and the served age falls under 100ms.
- The fat finger appears as a rejected record and leaves the served figure unchanged.
- An escalation appears exactly once when utilisation crosses its threshold, and only as the result of a narrative event.
- Bounded jitter never on its own moves any client across a threshold, over a long simulated run.
- The book is sorted by `limit_util_pct` descending and never exceeds 200 rows.

Against the live source it runs with the HTTP layer stubbed by recorded endpoint
responses, and is a mapping suite: the same assertions must hold when the numbers arrive
as `/query/v1` rows. It additionally asserts that the 202-plus-poll shape does not throw.

### Not unit tested, deliberately

The screen's rendering, the Terraform, and the Flink SQL. Rendering is verified by eye and
by rehearsal, which is what a demo's correctness actually is. Terraform is verified by
`validate` and `plan`. Flink SQL is verified by **one acceptance script** that produces
known records and asserts that `client_exposure` converges to the expected figure within
a bounded time, which is also the answer to "is it up?" before a rehearsal.

### Prior art

None in this repo: it has no tests yet. The prototype is the reference for expected
behaviour and expected numbers, and its eight clients with their limits and exposures are
the fixture.

## Out of Scope

- Any connection to a real system of record, and any change data capture (ADR-0004).
- Field-level encryption and Schema Registry data quality rules, which need Stream Governance Advanced.
- Bob as a second MCP client, the async-plus-presigned-download response branch, all six Datagen connectors rather than three, and any-seller packaging. These are Tier 3 in `HANDOFF.md` and explicitly not Thursday's problem.
- A DOM or browser test harness.
- Authentication beyond a shared secret and a minimally scoped reader service account. The real control is scope, not obscurity.
- Anything in the synchronous order path. The deck concedes this on stage and the demo must never imply otherwise.
- Pagination. Top-N is supported; `OFFSET` is not documented.

## Further Notes

The run-of-show in `HANDOFF.md` is the acceptance criterion. A beat that cannot be driven
is a failure even if every test passes; a feature not on it is not Tier 1.

Build the simulator path to completion before any infrastructure. It needs no account and
no network, so finishing it first converts Wednesday's question from "do I have a demo?"
into "how much of this is live?".

One platform risk is unresolved and cannot be settled from the documentation: the RTCE
billing page calls direct API querying an Early Access feature while the API reference and
the 2026-11-04 release note contradict it. It is the only documented reason
`POST /query/v1` might return 403 on a fresh account. **Test it before building the live
source**, because if it does 403 the agent's MCP path still works and the screen's polling
would have to move to MCP, which is capped at 200 rows and 20 seconds.

Enabling a Lightning Table takes several minutes and it is queryable only once its status
is Active. Budget for that in any rehearsal that starts from `terraform apply`.
