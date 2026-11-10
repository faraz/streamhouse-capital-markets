# 14: The read-uncommitted lever (Tier 2)

**What to build:** The beat that wins the architect in the room. A control that trades
exactly-once delivery for freshness, live, and names the price out loud.

The minute in the freshness ladder does not come from the serving table, which reflects a
change within 100 milliseconds. It comes from the stream processor committing
transactions about once a minute, which is what exactly-once costs. Reading uncommitted
drops end-to-end latency under 100 milliseconds, and a reader can then see a change that
is later taken back.

This is a setting, not a limit, and showing it as a choice is more persuasive than any
claim about speed.

**Blocked by:** 09.

**Status:** ready-for-agent

- [ ] A control flips the served reads between committed and uncommitted
- [ ] Under uncommitted, a fill reaches the served figure immediately rather than at the next commit
- [ ] The displayed age falls under 100 milliseconds and is shown as such rather than rounded to zero
- [ ] The screen states the cost in plain words: a reader can see a change that is later taken back
- [ ] The simulator and the live source behave identically under the flip, enforced by the shared contract suite
