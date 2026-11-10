import { describe, expect, it } from 'vitest';
import { COMMIT_MS, DEFAULT_FILL_LOTS, MATERIALIZE_MS, Simulator } from '../simulator';
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

describe('simulator: the escalation reads like the risk agent will', () => {
  // The fill lands at 14:06:22 and Flink commits it at the next minute, 14:07:22. 4417 is
  // at about 81% of a $450m limit, and 5,000 lots at 5,414 add $27.07m, so it reads near 87%.
  it('is a note naming the client, when it crossed, the fill and where it now stands', async () => {
    const { source, advance } = harness();
    await source.produceFill(FOLLOWED, DEFAULT_FILL_LOTS);
    advance(COMMIT_MS + MATERIALIZE_MS + 1_000);

    const [e] = (await source.snapshot(FOLLOWED)).escalations;
    expect(e!.author).toBe('simulator');
    expect(e!.what).toMatch(
      /^Client 4417 crossed 85% at 14:07:22 on a 5,000 lot ESZ6 fill; now 8[67]\.\d% of a \$450m limit\.$/,
    );
  });
});
