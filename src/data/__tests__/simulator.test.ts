import { describe, expect, it } from 'vitest';
import { Simulator } from '../simulator';
import { FOLLOWED } from '../book';
import { runContract } from './contract';

// A controllable clock: the simulator must never read the ambient one, so a whole
// trading day runs in milliseconds.
function harness() {
  let now = 0;
  const source = new Simulator({ clock: () => now, clientCount: 250 });
  return { source, advance: (ms: number) => { now += ms; } };
}

runContract({ name: 'simulator', make: async () => harness() });

describe('simulator: determinism', () => {
  it('two instances with the same seed and clock agree exactly', async () => {
    const a = harness();
    const b = harness();
    a.advance(37_000);
    b.advance(37_000);
    const sa = await a.source.snapshot(FOLLOWED);
    const sb = await b.source.snapshot(FOLLOWED);
    expect(sa.served.exposureUsd).toBe(sb.served.exposureUsd);
    expect(sa.book.map((c) => c.clientId)).toEqual(sb.book.map((c) => c.clientId));
  });

  it('reads no ambient clock: no time passes without advancing it', async () => {
    const { source } = harness();
    const a = await source.snapshot(FOLLOWED);
    await new Promise((r) => setTimeout(r, 30));
    const b = await source.snapshot(FOLLOWED);
    expect(b.wallClock).toBe(a.wallClock);
  });
});
