# 03: The simulator behind the ExposureSource seam

**What to build:** The demo's entire behaviour as a pure module with no I/O, sitting
behind the one interface the screen will use, with the contract suite that asserts it.
The simulator takes an injected clock and is a pure function of seed, elapsed time and
the list of narrative events, so a test can run a whole trading day in milliseconds.

This is the foundation: it needs no account, no network and no credentials, and finishing
it first means the demo exists before any infrastructure does.

The interface, from the prototype where it is currently implicit:

```ts
interface ExposureSource {
  snapshot(clientId: string): Promise<DeskSnapshot>;
  produceFill(clientId: string, lots: number): Promise<void>;
  produceFatFinger(clientId: string): Promise<void>;
  setIsolation(level: 'committed' | 'uncommitted'): Promise<void>;
}
```

`snapshot` returns the whole screen's state in one call on purpose: the free hosting tier
allows 100,000 requests a day, so the screen polls one combined endpoint.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] The Before-mode answer inherits the age of the stalest source, not of the freshest
- [ ] The Before-mode answer carries no age stamp at all
- [ ] The followed client reads below its true limit utilisation in Before mode, and the second client reads above it, so both of the two edges are expressible
- [ ] A fill does not reach the served figure before the next commit, and does reach it after
- [ ] Under read-uncommitted a fill reaches the served figure immediately and the served age falls under 100ms
- [ ] The fat finger appears as a rejected record and leaves the served figure unchanged
- [ ] An escalation appears exactly once when utilisation crosses its threshold, and only ever as the result of a narrative event
- [ ] Over a long simulated run, bounded jitter never moves any client across a threshold on its own
- [ ] The book is sorted by limit utilisation descending and never returns more than 200 rows
- [ ] The suite runs with no browser and no network, and the module contains no direct clock read
