# 18: The analyst, and an escalation panel that says who wrote it

**What to build:** Everything on the screen side of the risk agent that does not need
Flink, so it holds whether or not ticket 16 lands.

- **The analyst.** The MCP agent that answers questions is renamed from "the risk agent"
  to **the analyst** (see `GLOSSARY.md`), on the screen, in its system prompt and in the
  copy. "The risk agent" now means only the one that watches and escalates.
- **Escalation only from a narrative event.** The PRD says an escalation appears "only as
  the result of a narrative event" (`PRD.md`, implementation decisions). The simulator does
  this; the live Worker does not: it escalates anyone over 85%, so at rest the panel shows
  the deck's clients already escalated. The Worker's check escalates a client only when it
  is at or over 85% **and** its `as_of` is within the last 10 minutes. The deck's clients
  are never traded, so their figures are hours old and stay out; 4417 just after its fill
  gets in.
- **Who wrote it.** Every escalation names its author: the risk agent, the threshold check,
  or the simulator, the way every snapshot already names its `origin`.
- **A note, not a line.** The simulator's escalation reads like the agent's will: the
  client, when it crossed, the fill that did it, and where it now stands. A fall back
  mid-demo then changes the label, not the layout.

**Blocked by:** none.

**Status:** ready-for-agent

- [ ] The MCP agent is called the analyst on the screen, in `worker/agent.ts`'s system prompt and in the copy
- [ ] At rest, in live Streamhouse mode, the escalation panel is empty
- [ ] After a fill on 4417 crosses 85%, exactly one escalation appears, and none for clients whose figures are old
- [ ] Each escalation shows its author: risk agent, threshold check or simulator
- [ ] The simulator's escalation is a note naming the client, the crossing time, the fill and the new utilisation
- [ ] The Worker's fallback rule is covered by a test, and the shared contract suite still passes for both sources
- [ ] `scripts/shoot.sh` screenshots show the empty panel at rest and the one escalation after a fill
