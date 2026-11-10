# The simulator is permanent, not a prototype

The demo's first build was a throwaway prototype fed by a local model with the real
intervals in it. It is kept, and the frontend's data layer is shaped around swapping
between it and Confluent. A reader expecting the prototype to have been discarded should
know it was promoted on purpose.

It does three jobs that would otherwise need three solutions: it is the deterministic
fallback when a conference network fails, where being pixel-identical matters more than
being real; it keeps the screen viewable while the Confluent stack is torn down, which is
what makes on-demand infrastructure tolerable (see ADR-0005); and it defined the backend
contract before any backend existed.

## Consequences

Every served figure must be derivable from both sources, so the simulator has to track
changes to the real schema. That cost is accepted deliberately: a fallback that drifts out
of step with the real thing is worse than no fallback.

## Superseded in part, 2026-11-10: the screen shows only the live stack

The demo runs live, and nothing the room sees comes from the simulator. Of its three jobs:

- **The stage fallback is gone.** A failed call keeps the last live snapshot on screen and
  says how long ago it was current. A fallback that was pixel-identical but not real is the
  thing a technical counterpart would catch.
- **Viewing the screen with the stack torn down is gone with it**, and so is the need: the
  stack stays up until the talk (ADR 0005, amended).
- **The contract stays.** The simulator remains as the reference implementation the shared
  contract suite runs against, so drift between it and the live source still fails a test.

Before mode, which it used to answer, is a fixed script (`src/data/before.ts`) over the live
answer: the six legacy systems' ages and last night's copy are scripted because they do not
exist, and what was actually true is the live served figure.
