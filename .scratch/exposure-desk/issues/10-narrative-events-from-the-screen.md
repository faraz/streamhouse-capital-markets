# 10: Narrative events from the screen

**What to build:** The presenter's two controls, producing real records. A fill arrives
and the audience watches it reach the answer at the next commit rather than instantly. A
fat finger is sent and lands in the dead letter topic while the figure stays still.

These are narrative events: they happen when the presenter causes them and never on their
own. The produce path carries JSON without a registry, which is consistent with raw
topics being ungoverned by design; governance is imposed where Flink normalizes.

**Blocked by:** 09, 07.

**Status:** done

- [ ] The fill control produces a real record to a raw topic and the screen reports it as in flight
- [ ] The screen names how long until the change reaches the served figure, and the figure then changes at that moment and not before
- [ ] The fat-finger control produces a record that lands in the dead letter topic, and the served figure is unchanged afterwards
- [ ] Neither control can fire by itself, and neither depends on the presenter's laptop running a generator
- [ ] Both controls are disabled while their effect is still pending, so a double press cannot confuse the story
