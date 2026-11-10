# 07: The Flink guard and the dead letter topic

**What to build:** The governance beat. A record that is well formed but wrong, a fat
finger with one zero too many, is caught and routed to a dead letter topic, and the
exposure figure provably does not move.

Stream Governance is Essentials here, which has no data quality rules, so Flink does this
work. Nothing on screen or in a label may call it a quality rule, because that is the
Advanced product feature and claiming it would be false. On Advanced this becomes a
declarative rule and the guard can be deleted, which is a clean upgrade story.

**Blocked by:** 05.

**Status:** ready-for-agent

- [ ] A dead letter topic exists
- [ ] The normalizing path rejects a record whose quantity exceeds a stated bound, and writes it to the dead letter topic with enough context to see why it was rejected
- [ ] A rejected record never reaches the normalized topic and never reaches the exposure figure
- [ ] Producing a fat finger and then querying the exposure figure returns the same value as before, demonstrably
- [ ] Every label, comment and screen string calls this Flink validation, never a quality rule
