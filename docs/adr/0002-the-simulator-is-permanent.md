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
