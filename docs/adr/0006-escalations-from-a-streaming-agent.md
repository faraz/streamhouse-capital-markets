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
