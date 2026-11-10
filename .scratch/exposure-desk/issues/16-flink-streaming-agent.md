# 16: The Flink streaming agent (Tier 2)

**What to build:** The agent from the talk, doing the job the talk describes: watching
every client against its limit continuously and escalating to a person before a breach.

Until this lands, escalations are produced by the server layer, which looks identical on
screen. This ticket moves that work into the stream processor, where it belongs: it reacts
to every change rather than to a request, which is the shape the interactive agent
deliberately is not.

The agent must never touch an order path. Its only action is getting a person there in
time.

**Blocked by:** 08.

**Status:** ready-for-agent

- [ ] A model and an agent are declared in the stream processor, and the agent reads current exposure
- [ ] Crossing the escalation threshold writes an escalation record to its own topic, with the client, its utilisation and the time
- [ ] An escalation is written once per crossing, not repeatedly while the condition holds
- [ ] The screen reads escalations from that topic, and the server-side substitute is removed
- [ ] No statement or prompt can place the agent in an order path, and nothing it writes is an instruction to trade
- [ ] If the feature proves unavailable or costly in this region, the server-side substitute stays and that is recorded as the outcome
