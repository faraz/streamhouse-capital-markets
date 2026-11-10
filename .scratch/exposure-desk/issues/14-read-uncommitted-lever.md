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

**Found 2026-11-10, before starting:** as written this cannot be met on the live stack.

- The last hop is the Lightning Table reading `client_exposure`. It reads committed data and
  offers no isolation setting: "the option doesn't affect consumers outside Flink"
  (docs.confluent.io/cloud/current/flink/concepts/delivery-guarantees.html).
- Reading uncommitted inside `client_exposure`'s query would double-count after an abort,
  and the wrong sum would stay in its state. Changing the query is also an evolution that
  replays everything, so it can never be flipped on stage.
- The one hop that could go, presenter events through `positions`, went on 2026-11-10 by
  reading them straight off `raw_events`. A fill now waits on one exactly-once commit, about
  30 s on average and a minute at worst.
- So the honest version of this beat is a sentence, not a control: "the figure waits for
  Flink's next commit; that is exactly-once; we removed one of two commits by computing in
  one step, and the last one is the price we choose to pay, because a doubled exposure
  figure is worse than a late one." Rescope or close this ticket before building it.
