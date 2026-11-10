/**
 * The threshold check: what escalates when the risk agent has written nothing. A client
 * escalates when it is at or over the line and its figure changed in the last ten minutes.
 *
 * Freshness is what makes it the result of a narrative event, as the PRD requires. The
 * deck's clients sit over the line all day and are never traded, so without it the panel
 * opened with them already escalated; a fill on 4417 moves its as_of, and that gets in.
 */
import type { WireEscalation } from '../src/data/live';

/** Where the risk agent escalates. Kept identical to the simulator's threshold. */
export const ESCALATE_PCT = 85;
/** How recently a figure must have changed to count as a crossing rather than a standing state. */
export const FRESH_MS = 10 * 60_000;

export interface BookRow {
  clientId: string;
  limitUsd: number;
  limitUtilPct: number;
  asOfMs: number;
}

export function thresholdEscalations(book: BookRow[], nowMs: number): WireEscalation[] {
  return book
    .filter((b) => b.limitUtilPct >= ESCALATE_PCT && nowMs - b.asOfMs <= FRESH_MS)
    .slice(0, 5)
    .map((b) => ({
      atMs: b.asOfMs,
      title: 'Escalated to the risk officer',
      // It sees a figure over the line, not the fill that put it there, so it says no more.
      what: `Client ${b.clientId} at ${b.limitUtilPct.toFixed(1)}% of a $${Math.round(b.limitUsd / 1e6)}m limit, as of ${new Date(b.asOfMs).toISOString().slice(11, 19)}.`,
      tone: 'warn' as const,
      author: 'threshold-check' as const,
    }));
}
