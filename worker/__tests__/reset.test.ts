import { describe, expect, it } from 'vitest';
import { resetEvents } from '../reset';

/**
 * Reset puts the book back where it opened without a rebuild, by producing the opposite of
 * every fill the presenter has sent. A rebuild replays the whole history and leaves the
 * book wrong for minutes; an offsetting event lands at the next commit like any other.
 */
const TS = '2026-11-12 14:30:00.000';
const fill = (clientId: string, quantity: number, price = 5414) => ({ clientId, quantity, price });

describe('reset', () => {
  it('offsets what is left of the presenter fills, net of earlier resets', () => {
    // Two rehearsals on 4417: 4,000 lots then reset, then 1,200 lots.
    const out = resetEvents([fill('4417', 4000), fill('4417', -4000), fill('4417', 1200)], TS);
    expect(out).toEqual([{ acct: '4417', sym: 'ESU6', qty: -1200, px: 5414, ts: TS, kind: 'reset' }]);
  });

  it('produces nothing for a client already back where it opened', () => {
    expect(resetEvents([fill('4417', 1200), fill('4417', -1200)], TS)).toEqual([]);
  });

  it('splits an offset larger than the desk bound, so the guard never takes it for a fat finger', () => {
    const out = resetEvents([fill('4417', 40_000), fill('4417', 20_000)], TS);
    expect(out.map((e) => e.qty)).toEqual([-50_000, -10_000]);
  });

  it('offsets by notional when a fill was priced differently', () => {
    // 100 lots at 5,000 is $500,000, which is 92 lots at the fill price of 5,414.
    expect(resetEvents([fill('7405', 100, 5000)], TS)[0]!.qty).toBe(-92);
  });

  it('offsets each client the presenter filled', () => {
    const out = resetEvents([fill('4417', 1200), fill('11417', 300)], TS);
    expect(out.map((e) => [e.acct, e.qty])).toEqual([['4417', -1200], ['11417', -300]]);
  });
});
