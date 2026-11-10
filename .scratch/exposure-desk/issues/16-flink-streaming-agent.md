# 16: The risk agent as a Flink Streaming Agent (Tier 1, stretch)

**What to build:** The deck's risk agent doing the job the deck gives it: watching every
client against its limit and escalating to the risk officer before a breach. Flink notices
the crossing all the time; the agent thinks only when one happens. It reads what pushed
the client over through the same MCP server the analyst uses, and writes one or two
sentences for the risk officer, for example: "Client 4417 crossed 85% at 14:21:07 on a
5,000-lot ESZ6 fill from the presenter's events; now 87.4% of a $450m limit."

The agent never touches an order path. Its only action is getting a person there in time.

Why it is shaped this way: `docs/adr/0006-escalations-from-a-streaming-agent.md`. Syntax,
proven patterns and traps: `research/flink-materialized-tables-and-agents-2026-11.md`
§2 to §5, and Confluent's quickstart (`confluentinc/quickstart-streamhouse`, `sql/26` to
`sql/32`).

**Blocked by:** 17, 18.

**Status:** done

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

**Found in 17 (2026-11-10):** after `regenerate.sh` creates `client_exposure`, the
materialized table replays `positions` for about four minutes, and its rows move through
partial totals while it does. A `client_escalations` statement started `FROM_NOW` straight
after would see those replayed changes as new, and could run the agent on crossings from
the past. Wait for the replay (90000's row present and a fresh `as_of`) before creating it,
or filter on event time. Also: `CONTINUOUS` in `regenerate.sh` and the role list in
`verify.sh` are fixed counts (11 and 10) that this ticket's statements must raise, and the
materialized table's query is not in `statement list`, so verify cannot see it by name.

**Outcome, 2026-11-10:** working, a day early. Measured on the live stack: a 5,000-lot fill on
4417, the figure 55 s after the click (one commit; 11 s on another run), and the risk agent's
note 9 s after that: "Client 4417 crossed 85% at 18:37:34 UTC on a 5,000-lot ESZ6 fill; now
87.0% of a $450m limit." `verify.sh` passes in full with the agent's pieces in it.

- **Model:** `SHOW MODELS` listed Sonnet 4.6, Opus 4.6, 4.7 and 4.8, and Haiku 4.5. Opus 4.8,
  the newest, wrote the cleaner note in 13 s to Sonnet's 16 s on the same crossing.
- **Two statements, not three.** `LAG` over event time never emitted: its output sat behind a
  watermark for fifteen minutes. `client_exposure` now carries the utilisation before its
  latest change and what that change was, so `exposure_crossings` is a filter, started from
  now, with no watermark (ADR 0006, amended). The crossing row lands 4 to 13 s after the fill
  reaches the figure.
- **No MCP tool.** Built with one, the agent read the live figure a moment before the
  Lightning Table caught up with the commit, and wrote that 4417 had dropped back to 81% when
  it stood at 87%. The crossing row carries every fact the note needs, so the agent works from
  it alone; MCP and RTCE are the analyst's. The first run with the tool also took 17 minutes
  to write its note, most likely because the prompt did not name `queryData`'s required
  `topic_name` and the agent retried; not investigated further once the tool went.
- **Holding above 85% writes nothing more** (a crossing needs the previous figure below the
  line), and Reset then a fill crossed again and wrote a second note.
- **A rebuild escalates nothing:** the crossing table is created after the book is right and
  starts from now, and the agent's statement from the latest offset.
- **The threshold check** stands in only after 150 s without a note, or at once if the
  escalations table cannot be read. It did, correctly, during the 17-minute run.

Only one timed run was made with the final, tool-free agent. Rehearse the beat two or three
times before Thursday.
