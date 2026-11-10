/**
 * Reset, on the live stack: the opposite of every fill the presenter has sent, so the book
 * goes back to where it opened at the next commit, about 90 seconds, with nothing torn down.
 *
 * A rebuild is the other way back, and the wrong one between rehearsals: client_exposure
 * replays every position from the beginning and serves partial totals for minutes while it
 * does. An offsetting event is just another record, summed like the rest.
 *
 * What is left to offset is read from the served positions themselves, the presenter's fills
 * and the resets already sent, rather than remembered anywhere: the Worker holds no state.
 */
import { FILL_PX, type DemoEvent } from './produce';

/** The guard sends anything larger to the dead letter topic, so an offset never exceeds it. */
const DESK_BOUND_LOTS = 50_000;

export interface FillRow {
  clientId: string;
  quantity: number;
  price: number;
}

export function resetEvents(rows: FillRow[], ts: string): DemoEvent[] {
  const net = new Map<string, number>();
  for (const r of rows) net.set(r.clientId, (net.get(r.clientId) ?? 0) + r.quantity * r.price);

  const out: DemoEvent[] = [];
  for (const [acct, notional] of net) {
    let left = -Math.round(notional / FILL_PX);
    while (left !== 0) {
      const qty = Math.sign(left) * Math.min(Math.abs(left), DESK_BOUND_LOTS);
      out.push({ acct, sym: 'ESU6', qty, px: FILL_PX, ts, kind: 'reset' });
      left -= qty;
    }
  }
  return out;
}
