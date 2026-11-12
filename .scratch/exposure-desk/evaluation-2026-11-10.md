# Evaluation of the exposure desk demo, 2026-11-10

For the talk on Thursday 2026-11-12. An evaluation, not a build: nothing in the app was
changed to write this.

## How this was done, and what it rests on

There is no recording of a live run, so the run is reconstructed from the code and checked
against the live stack with read-only calls. Evidence used:

- The tour as coded (`src/ui/Tour.tsx`), every panel, the record trace, the hero.
- The Flink statements in `flink/`, the Worker (`worker/index.ts`, `worker/agent.ts`).
- The live stack through the deployed Worker: `/api/snapshot` for clients 4417, 90000 and
  10467, and two timed questions to `/api/ask`. All read-only.
- The talk's own script and vocabulary: the speaker notes in
  `talks/inference-stack/slides/streamhouse-sellers/index.tsx` and
  `docs/context/streamhouse-sellers.md` and `streamhouse.md`.
- One cold read by a fresh agent with no project context, shown ten screens in order. A
  pre-screen only. See the last section.

Not done, and nothing here should be read as covering it: a stopwatch run on the live stack,
a fill or fat finger fired on the live stack by me, a look at the room's actual display, or
real people watching it.

## The standard: three sentences a seller should be able to say afterwards

Proposed, in the deck's own pillar words. Everything below is judged against these.

1. Today the answer is put together from six systems, so it is as old as the stalest one and
   nothing says how old: the analyst said 68% when the truth was 81%.
2. In a streamhouse each source lands as records in a topic (Connect, Stream); Flink reshapes
   them into one governed record and keeps every client's exposure up to date as records
   arrive (Process); a record that is well formed but wrong is turned away before it counts
   (Govern).
3. That number sits in a Lightning Table anyone can query in under a second (Query): an
   analyst agent asks it in English over MCP and says how old its answer is, and a risk agent
   watching every client escalates without being asked.

## Verdict

The build is real and in places elegant, and the Today half of the story lands. The
Streamhouse half undercuts itself in three ways that a cold viewer will feel and a Flink
person will catch: the screen and the analyst both report ages of hours and days in the
world that is supposed to be fresh; the six flowing lanes are not six flowing feeds; and the
labels are not the five pillar names the room has just been taught. All three are fixable
before Thursday without touching the stack.

## Findings, most serious first

### 1. "Age" means the wrong thing in Streamhouse mode, and the analyst says it out loud

The deck: "the desk or the risk agent gets the exposure for one client, with its age attached,
and that age is a minute at most." The demo computes age as the time since that client's last
record (`src/ui/Client.tsx:24`, `src/ui/Book.tsx:68`), and colours it red past ten minutes.

Live, tonight:

- Analyst, asked the exposure question (16 s, 7 tool calls): "That figure was last updated at
  20:59:40 UTC yesterday, about 6 hours 25 minutes ago. The feed isn't stalled: other
  clients' figures updated within the last 80 seconds..."
- Analyst, asked the book question (12 s): "All three figures are opening balances from
  2026-11-09 08:00:00, about 43 hours 25 minutes old..."
- Snapshot: the top of the book has ages of 156,033 s (43 h); 4417's is 22,853 s.

So in the fresh world the book's Age column is red from top to bottom, 4417's pill turns
amber three minutes after Reset and red after ten, and the star AI moment tells the room the
answer is 43 hours old. A figure that has not changed is not stale. The honest age stamp is
how far the served table trails live, which the snapshot already carries (the newest `as_of`
in the table: 50 s when checked) and which the analyst already works out as its aside.

### 2. Six lanes flow on screen; one feed flows in the stack, and it is not one of the six

`activeSources` from the live snapshot is `['trade']`. The two Datagen connectors both write
`raw_trades`. The six differently shaped raw topics each hold one record, seeded once at
build for client 90000 (`scripts/regenerate.sh:126-131`). In Streamhouse mode the pipeline
panel draws moving particles on six lanes named for the six legacy systems, with ages that
are constants from `src/data/sources.ts` (`src/data/live.ts:150`), two of them green ("2s",
"3s"). "Change data capture / mainframe 3s" is green with no CDC anywhere (ADR 0004).

The six-shape normalization is real: six statements run and client 90000's `positions` rows
carry `custodial`, `clearing` and the rest with their stamped lag. But the tour never goes
there. Beat 4 says "Six shapes, normalized by Flink into one record" over a records tape
whose rows are `reset` and `fill` (rehearsal housekeeping for 4417), and "Trace a record"
there traces a reset through `raw_events`, which is not one of the six shapes.

The hero says "Six real-time feeds" (`src/ui/Hero.tsx:104`). The deck says "One feed, and
five files", and lists "real-time" as a word to avoid.

### 3. The screen does not use the words the room has just learned

The deck spends seven pages on Connect, Stream, Process, Govern, Query, and its context file
says every label reads a pillar name. None of the five appears on the desk. Worse, the
Streamhouse panel is titled "Pipeline" (`src/ui/Pipeline.tsx:42`), which the deck defines as
"the before-world's hand-built copy chain... what serve replaces". The beats already map
cleanly: beat 4 is Connect, Stream and Process; beat 5 is Govern; beats 6 and 7 are Query
(the deck's clock one and clock two); beat 8 is Process again, then the agent. The deck also
credits the reshaping to Connect, where this build does it in Flink SQL; the labels should
say which pillar is doing what here rather than leave the seller to guess.

### 4. Beat 8 hides its own payoff and asks the analyst too early

The fill opens the record trace, which covers the whole desk (`src/styles.css:747`,
`inset: 0`). Behind it, unseen: the figure rolling, the 85% line pulsing, the alert arriving
with its border, the heat ripple, and the analyst, who is asked "What just changed for 4417?"
1.2 s after the click (`src/ui/Tour.tsx:102`). The analyst now answers in 12 to 16 s; the
fill lands 11 to 56 s after the click. So it will usually read the table before the commit
and report the previous reset as the latest change, invisibly, behind the trace. Moving to
the next beat closes the trace (`src/App.tsx:62`), so a presenter who moves on early never
shows the landing.

Beat 9, "Exactly once", is a caption with nothing happening, placed after the wait it
explains.

### 5. The Lightning Table is named but never shown doing its job

It appears as a label ("upsert on client_id / Lightning Table") and in captions. Nothing
shows the two numbers the deck's clock one is built on: how long the asking took, and how old
the answer is. The Worker log shows a snapshot of seven Lightning Table queries answering in
about 90 ms; the screen never says so. The trace footer claims "served in under 100ms"
(`src/ui/trace/Trace.tsx:437`), which the demo does not measure; the deck's own figure is
"under a second", and the age formatter prints "<100ms" for anything under one second
(`src/ui/format.ts:3`).

### 6. The opening beats light the wrong panels

Beat 1, "One question, six systems", lights only the client panel; the six systems and their
ages sit dimmed and blurred in the panel below. Beat 2 lights the analyst and the client but
not Alerts, where the scripted "Found out the next morning / 103%" is the breach's punchline.

### 7. Vocabulary a cold viewer has no handle on

On screen with no definition: fill, fat finger, lots, ESZ6, limit used, headroom, book,
escalate, `positions_dlq`, commit, exactly once, upsert, Avro, JSON Schema, MCP, Lightning
Table, materialized table. The deck introduces some by voice (a fill moves exposure; a fat
finger is one zero too many) but the demo's own captions lean on them: "Book a fill" sits
beside a panel called "Book". The before-world has three names: "Today" (badge), "Nightly
batch" (toggle), "Nightly answer" (beat).

### 8. Smaller things that are untrue or unlabelled

- The rejection strip prints `MSG|ACCT=4417|QTY=2400000` as the raw record
  (`worker/index.ts:127`). The record was JSON in `raw_events`; that string is made up.
- The guard's red verdict in the trace appears in about a second. It is what the WHERE clause
  will do, shown before Flink has done it. The card beside it does wait for the real row.
- `positions_dlq / 1` is a flag, not a count.
- Beat 9: "computed in one step, so there is only one [commit]" is true for presenter events
  only. Feed records take two hops.
- A failed fill or fat finger (a 503 from the Worker) shows nothing: the promise is rejected
  with no message on screen (`src/useDesk.ts`, `src/App.tsx`).

### 9. Motion: three loops are decoration

Data-driven motion earns its place: the figure rolling at a commit, rows reordering, the
trace's wires, the convergence on the flip. Three things loop forever and mean nothing: the
light orbiting the live badge in the app bar, the light orbiting the rail's next button, and
the particle burst on the rail at every beat change, which pulls the eye to the foot of the
screen at the moment the panel above changes.

## Claim audit

| Claim on screen | Backed by | Status |
|---|---|---|
| Hero: 81.0%, $364,300,640 of $450,000,000, "live from client_exposure" | `SELECT ... FROM client_exposure WHERE client_id = '4417'` | True |
| Hero: "Six real-time feeds, normalized" | One live generated feed; six topics seeded once | Overclaims |
| Hero card: six feeds, six ages, "today" | Constants in `sources.ts` | Scripted; reads as the before-world, fair |
| "Live / Confluent Cloud / us-east-1" | Snapshot origin; region is a fixed string | True |
| Today mode: 68%, 98%, six systems, `nightly_copy` SQL | `src/data/before.ts`, scripted | Scripted; says so only in a tooltip |
| Today mode: "what was true 81%" | Live `client_exposure` | True |
| Streamhouse lanes: six flowing feeds with ages | Animation; ages are constants | Scripted and unlabelled |
| "Change data capture / mainframe 3s" | Constant; no CDC (ADR 0004) | Scripted and unlabelled |
| "Flink / normalize + guard" | Statements 10 to 19 | True |
| Governed records rows | `positions` for the followed client | True; shows housekeeping rows |
| Pill "as of N ago", Book "Age" | now minus that client's last record | True number, misleading meaning |
| "client_exposure / 4,000 clients" | Seed scripts; a Lightning Table cannot count | Unverified |
| "top 200 clients, live" | `ORDER BY limit_util_pct DESC LIMIT 200` every 2 s | True |
| Analyst: MCP, three tools, its own SQL | `rtce.listTools()`, streamed tool calls | True |
| Risk agent note | `client_escalations`, written by `AI_RUN_AGENT` | True; fallback is labelled |
| Trace: SQL and line numbers | `flink/*.sql` imported at build | True |
| Trace: Kafka card for fill and fat finger | The Worker's produced payload | True |
| Trace: Kafka card for a feed record | Rebuilt from the record and the schema | Labelled as such |
| Trace: guard verdict | Client-side reading of the WHERE clause | Unlabelled prediction |
| Trace: "served in under 100ms" | Not measured here | Unverified; deck says under a second |
| Fill "$27.07m" | 5,000 x 5,414 | True |
| Rejection strip `MSG|ACCT=...` | Made up in the Worker | False |

## What actually happens to a record (the lineage, from the SQL)

- **The live flow:** Datagen writes `raw_trades`; statement 19 reshapes into `positions`;
  the materialized table `client_exposure` sums per client and joins the limit. Two commits,
  about 90 s.
- **The six shapes:** one seeded record per topic for client 90000; statements 10 to 16
  reshaped each once and are still running with nothing arriving.
- **A fill:** the Worker produces JSON to `raw_events`; `client_exposure` reads that topic
  itself and sums it in one commit (11 to 56 s measured). Statement 17 also copies it to
  `positions` for the tape.
- **A fat finger:** same topic; statement 18 routes it to `positions_dlq`; the complementary
  bound keeps it out of everything else.
- **The escalation:** `exposure_crossings` is a second materialized table, a filter over
  `client_exposure`'s changelog (was under 85, now at or over). Statement 36 hands each
  crossing to `AI_RUN_AGENT`, a model hosted by Confluent, and writes the note to
  `client_escalations`.
- **The analyst:** the Worker calls the model with the engine's three MCP tools; it lists
  topics, reads schemas and queries the Lightning Tables.

The demo shows the fill's path well (the trace into `client_exposure` is the deck's Process
page made real). It does not show the six shapes being reshaped unless someone clicks a row
that happens to be one, and it never shows `exposure_crossings`, which is the most original
piece of Flink in the build.

## Beat sheet, as coded

Timings are estimates from the code's delays, HANDOFF's measurements and tonight's two
analyst calls. No stopwatch has been run.

| # | Beat | What the room looks at | Waits | Problem |
|---|---|---|---|---|
| 0 | Hero | The question, 81.0% live, six ages | none | "real-time feeds" |
| 1 | The question (Today) | Client panel only | none | The six systems are dimmed |
| 2 | Nightly answer | Analyst script, 68% then 81% | about 5 s, scripted | The 103% discovery is dimmed |
| 3 | False block (7405) | 98% against a live 77% marker | none | Works |
| 4 | Streamhouse | Lanes converge; records tape | none | Tape shows resets; ages red |
| 5 | Fat finger | Trace: JSON, guard, dead letter | up to a minute | Landing unverified live |
| 6 | Ask the analyst | Tool calls, answer | 16 s measured | Says "6 hours 25 minutes ago" |
| 7 | The book | Book panel, answer | 12 s measured | Says "43 hours old"; ages red |
| 8 | A fill lands | Trace over the whole desk | 11 to 56 s, then about 10 s | Payoff hidden; analyst asked early |
| 9 | Exactly once | A caption | none | Belongs in beat 8's wait |
| 10 | The desk | Everything | none | No cue for the console cutaway |

About nine minutes if the waits are talked through. Two long silences are possible: the fat
finger's commit and the fill's commit.

## If things go wrong (from the code)

| Failure | What the room sees | Gap |
|---|---|---|
| Stack stops answering | An amber banner with how old the last answer is | None; good |
| Analyst slow or failing | "Querying..." shimmer with no limit; a red Failed card on error | No timeout or line to say |
| Fill takes 56 s | The trace counts the seconds and says it is waiting | Fine if the presenter stays |
| Fill or fat finger refused by the Worker | Nothing at all | Silent failure |
| Risk agent writes nothing | After 150 s a note labelled Threshold check | Fine, and honest |
| Presenter on the wrong client | Fill and fat finger always move to 4417 | None |

## What works and should not be touched

- The Today analyst: confident, fast and wrong, corrected by the live figure. It is the
  clearest minute in the demo.
- The false block on 7405.
- The record trace: real SQL with real line numbers, exact bytes for presenter events, and a
  second half that waits for the real commit.
- The crossing-to-agent chain in Flink, and the origin and author labels on everything.
- The analyst's speed (12 to 16 s) and that it visibly writes its own SQL.
- Events firing only when stepping forward, and Reset returning to the hero.

## Changes, ranked

Before Thursday. None touches the Confluent stack; all are frontend, the Worker's queries or
the analyst's prompt, and each can be checked with read-only calls or the simulator.

| # | Change | Rests on | Cost |
|---|---|---|---|
| 1 | Make the age stamp mean "how far the table trails live": show "current to N s ago" from the newest `as_of`, show a client's "last change" in neutral, and tell the analyst the same; stop it narrating resets, verify and opening balances; hold it to two sentences | Finding 1; tonight's two answers | 2 h |
| 2 | Label the flow with the five pillars and retire "Pipeline" in Streamhouse mode; say in captions which pillar each beat is | Finding 3; the deck's context file | 1 to 2 h |
| 3 | Make the six sources honest and visible: mark which feed is flowing now, label lane ages as the feed's stamped lag, and have beat 4 open the trace on a real six-shape record (custodial or desk sheet) with a way to step through all six | Finding 2; client 90000's rows | 4 h, includes a Worker query |
| 4 | Split beat 8: the trace until the fill lands, then the desk with the alert, and ask "what just changed" only after it has landed. Fold "Exactly once" into the wait | Finding 4 | 2 h |
| 5 | Show the Lightning Table working: "answered in 0.09 s" beside "current to 50 s ago" | Finding 5; Worker timings | 1 h |
| 6 | Light the six sources in beat 1 and Alerts in beat 2 | Finding 6 | 10 min |
| 7 | Define each trade and platform word at first use in the captions; one name for the before-world | Finding 7; the cold read | 1 h |
| 8 | Remove what is untrue: the made-up `MSG|ACCT` string, "<100ms", the unlabelled guard prediction, the 0/1 count, the silent failure on a refused fill | Finding 8 | 1 h |
| 9 | Records tape shows the newest records across the whole book, so it moves, instead of 4417's rehearsal rows | Finding 2 | 1 h |
| 10 | Drop the three decorative loops, or keep them knowingly | Finding 9 | 20 min |

After Thursday: show `exposure_crossings` as a stage in the fill's trace; six real generators;
the Stream pillar's replay ("what was it at four o'clock yesterday"); a live count of the
book.

## Proof still owed, and who can give it

- **A timed live run, twice,** by the presenter, with a stopwatch, including the fat finger's
  dead-letter landing, which has never been seen on screen.
- **Two or three real cold viewers.** Show the demo once with the talk's narration and no
  extra help. Then ask, and write down the answers word for word: What problem was that
  solving? Why was the first answer wrong? What happened to the six sources, and what did it?
  What do the two AI agents each do? What would you tell a client tomorrow? Pass: two of
  three give all three sentences in their own words, and nobody asks what a fill is.
- **One person who knows Flink and one who knows a risk desk** read the claim audit and the
  captions and mark anything false.

## Cold read (pre-screen only)

A fresh agent with no project context, playing a wealth-management sales lead with no trading
or streaming vocabulary, was shown ten screens in order and asked to explain them back. It
is one more reader, not a substitute for the people named above. Several of its screens were
older captures or taken on the simulator, so its remarks about the Simulator badge and about
figures that nearly agree (80.8, 80.9, 81.0) describe the captures, not the live demo.

What it could say back, unprompted: one current figure per client from six systems, with its
age; bad data stopped before it counts; ask in English and get an answer that says how fresh
it is. It could not say what the risk agent does ("I did not really see that part"), what a
Lightning Table is ("a brand name... never defined"), or how Kafka, Flink and the third box
differ ("a guess from the lines, not from the labels").

What it added to the findings above:

- **Clocks disagreed.** Record times were UTC and the wall clock local, five hours apart, so
  "the data is not from now".
- **Red meant three things:** old, wrong and the limit.
- **"The breach" at 81%** made no sense under an 85% line; the 103% that makes it a breach
  was dimmed.
- **Three names** on the opening screen (Exposure Desk, Streamhouse, Confluent Cloud) with
  nothing to say which is the product.
- **The dimming** left most of the screen unreadable.
- **Speed was stated three ways** ("<100ms", "45s", "inside a minute") without saying what
  each measured.
- **Demo artefacts read as staging:** fill and reset rows alternating, a record that names
  itself `fat_finger`, "a presenter event skips positions".
- **"No client has crossed 85%"** beside "3 above 85%".
- It listed about 120 words it could not explain to a client.

## What was changed, 2026-11-11

All ten ranked changes were made, and the cold read's additions with them. Frontend, the
Worker's queries and the analyst's prompt only; the Confluent stack was not touched. Not
deployed and not committed at the time of writing.

1. **Age.** The pill reads "current to N ago" from the newest `as_of` in the table; a
   client's "last change" is a separate, neutral figure; the Book's column is "Changed". The
   analyst is told the same, told not to narrate housekeeping records, and held to two or
   three sentences. Live, after the change: "Client 4417's total exposure is $364,300,640
   against a $450,000,000 limit, which is 81.0% of the limit. The table is current to within
   about 45 seconds." Eight seconds, four tool calls.
2. **Pillars.** The Streamhouse panel is titled Streamhouse, not Pipeline, with the five
   pillars over the part of the flow each one is. Captions and the trace's stages carry the
   pillar they show. "Pipeline" is kept for Today, where the deck uses it.
3. **Six sources.** A lane moves only while its source is producing: the live trade feed has
   its own lane, and the six shaped sources show the lag their statement stamps. A new beat,
   "Six shapes", opens the trace on a real record of each shape (served from `positions` for
   client 90000) with a picker. A field the statement drops is shown as "not kept".
4. **The fill.** One beat for the trace and the wait, where exactly-once is said; the next
   for the risk agent on the desk. The analyst is asked what changed only once the fill has
   reached the served figure. Eleven beats in all.
5. **Lightning Table.** "7 queries answered in 0.06 s" beside "current to N ago".
6. **Lighting.** Beat 1 lights the six systems; beat 2 lights the 103% discovery.
7. **Words.** Each caption says its trade or platform word plainly at first use. The
   before-world is "Today" throughout.
8. **Untruths.** The made-up rejection string is replaced by the dead letter row's own
   columns; "<100ms" is gone; a refused fill or fat finger now says so on screen.
9. **Tape.** The newest records across the whole book.
10. **Motion.** The app bar's capsule and the rail's button sit still; the rail's particle
    burst is off.

From the cold read: every time on screen is UTC and labelled; red is used for staleness only
(a rejection is neutral, the limit is a plain line); the spotlight dims less and no longer
blurs; the hero says what Exposure Desk, the streamhouse and Confluent Cloud each are.

Checked after the change: typecheck, 64 tests, a build, the design detector (no findings),
the tour on the simulator through the fat finger, the fill and the risk-agent beat, and the
read-only beats on the live stack.

Still not checked: a fill or fat finger fired on the live stack with the new flow; the fat
finger's dead-letter landing on screen; a stopwatch run; real viewers.
