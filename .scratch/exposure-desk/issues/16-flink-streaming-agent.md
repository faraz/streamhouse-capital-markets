# 16: The risk agent as a Flink Streaming Agent (Tier 1, stretch)

**What to build:** The deck's risk agent doing the job the deck gives it: watching every
client against its limit and escalating to the risk officer before a breach. Flink notices
the crossing all the time; the agent thinks only when one happens. It reads what pushed
the client over through the same MCP server the analyst uses, and writes one or two
sentences for the risk officer, for example: "Client 4417 crossed 85% at 14:21:07 on a
1,200-lot ESU6 fill from the presenter's events; now 91.2% of a $112m limit."

The agent never touches an order path. Its only action is getting a person there in time.

Why it is shaped this way: `docs/adr/0006-escalations-from-a-streaming-agent.md`. Syntax,
proven patterns and traps: `research/flink-materialized-tables-and-agents-2026-11.md`
§2 to §5, and Confluent's quickstart (`confluentinc/quickstart-streamhouse`, `sql/26` to
`sql/32`).

**Blocked by:** 17, 18.

**Status:** ready-for-agent

**The pieces:**

1. **Model.** Run `SHOW MODELS` in us-east-1 and use the newest Claude it lists, with
   `anthropic.claude-sonnet-4-6` as the default. Confluent-hosted (`'provider' =
   'confluent'`): no key, no connection.
2. **Tool.** An `mcp_server` connection to the RTCE MCP endpoint (CLI only, no Terraform),
   and `CREATE TOOL` on it allowing `getMetadata` and `queryData`.
3. **Agent.** `CREATE AGENT risk_agent`. Editing it means `DROP AGENT` first, because
   `IF NOT EXISTS` keeps the old definition.
4. **Three statements, named for their role**, all reading uncommitted
   (`'kafka.consumer.isolation-level' = 'read-uncommitted'`); `client_exposure` itself stays
   exactly-once:
   - `exposure_changes`: `TO_CHANGELOG` of `client_exposure` as an append table, read from
     the beginning.
   - `exposure_crossings`: `LAG` per client keeps a change from below 85% to 85% or above,
     read from the beginning so every client's previous figure is known (4417 is never
     traded by the feeds, so its fill would otherwise look like its first value).
   - `client_escalations`: `AI_RUN_AGENT('risk_agent', ...)` on each crossing, started
     `FROM_NOW` and created last by `regenerate.sh`, so crossings in the seeds' history
     never reach the model.
5. **Serving.** `client_escalations` is published as a Lightning Table. The Worker reads
   the newest five, shows one per client and crossing time (a duplicate row is possible
   under read-uncommitted), and falls back to ticket 18's threshold check when the table is
   empty or fails.

- [ ] `SHOW MODELS` was run and the model chosen from it is recorded here
- [ ] The tool, the agent and the three statements are created by `regenerate.sh` and removed by `clear.sh`
- [ ] A fill on 4417 that crosses 85% produces exactly one escalation, written by the agent, naming why
- [ ] Holding above 85% writes nothing more; dropping below and crossing again writes a second
- [ ] A rebuild produces no escalations for past crossings
- [ ] The screen shows the agent's escalation labelled as the risk agent, and the threshold check takes over when the table is empty or fails
- [ ] Nothing in the prompt, the tool's allowed calls or the output is an instruction to trade
- [ ] `verify.sh` checks the agent's statements are running, and the capacity check counts them
- [ ] `HANDOFF.md`'s run-of-show has the 7:15 beat's real timing (the figure about 90 s after the click, the escalation after it, covered by an analyst question), and the console cutaway opens Materialized tables, then Streaming Agents (`risk_agent`)
- [ ] Working by Wednesday 2026-11-11 evening; otherwise the threshold check is what is presented, and that is recorded here as the outcome
