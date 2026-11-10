# Escalations are written by a Streaming Agent that runs only on a crossing

The deck's risk agent watches every client and escalates before a breach. It is a Flink
Streaming Agent (`risk_agent`), and the model runs only when a client crosses 85% of its
limit, never on every update: the feeds change about 80 figures a minute, and an agent
asked about each would be slow, costly and mostly about nothing. Flink watches all the
time; the agent thinks only when something changes.

## Considered options

- **A model call on every update.** Simplest SQL, the wrong cost and latency.
- **Once per client, ever** (the quickstart's pattern). Proven on Confluent Cloud, but a
  client that drops back and crosses again would be missed. Kept as the fallback for the
  crossing step if `LAG` will not run.
- **Once per crossing**, chosen: `LAG` over an append copy of `client_exposure`.

## Consequences

- It takes three statements, because `LAG` reads only append-only input and
  `client_exposure` is an upsert table: an append copy, the crossing filter, then the agent.
- Only the agent statement starts from now. The first two read the whole history so every
  client's previous figure is known; the agent never sees a crossing from before it started,
  so a rebuild does not re-escalate the past.
- The escalation path reads uncommitted to keep its three hops short; `client_exposure`
  stays exactly-once, so the commit beat stays true.
- The Worker's threshold check stays as the fallback, and every escalation says which of
  them wrote it.

## Amended 2026-11-10: a crossing is a filter, not a comparison over time

Built, the `LAG` design did not emit: its append stage filled at about 110 rows a minute, a
bounded run of the same query found the one crossing it should, and the streaming version
sat behind a watermark that did not move for fifteen minutes. Event-time ordering was the
part that could not be relied on two days out.

So `client_exposure` carries the utilisation before its latest change, and what that change
was (`LAST_VALUE` of the record that produced each update), and `exposure_crossings` is a
filter on its changelog: below 85% before, 85% or above after. It takes two statements, not
three, waits on no watermark, and starts from now, so no history is needed and a rebuild
cannot re-escalate the past. Measured: the crossing row 13 s after the fill. The cause rides in
the row, so the agent never depends on `positions`, which another statement commits on its
own minute.

The agent has no tool. It was built with an MCP tool to read the live figure before writing,
and that read landed a moment before the Lightning Table caught up with the commit: the
agent wrote that 4417 had dropped back to 81% when it stood at 87%. The crossing row holds
every fact the note needs, so the agent works from it alone; MCP is the analyst's.

The Worker shows the agent's note, and stands the threshold check in for a crossing only
after 150 s with no note, or at once if the agent's table cannot be read.
