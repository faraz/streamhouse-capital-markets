import { describe, expect, it } from 'vitest';
import { thresholdEscalations } from '../threshold';

/**
 * The Worker's fallback for the risk agent. An escalation is the result of a narrative
 * event, so a client over the line whose figure has not moved for hours is not news: the
 * deck's clients sit there all day and are never traded.
 */
const NOW = Date.UTC(2026, 10, 12, 14, 21, 37);
const row = (clientId: string, limitUtilPct: number, ageMs: number) => ({
  clientId,
  exposureUsd: (450e6 * limitUtilPct) / 100,
  limitUsd: 450e6,
  limitUtilPct,
  asOfMs: NOW - ageMs,
});

describe('the threshold check', () => {
  it('escalates nobody at rest, when the clients over the line are hours old', () => {
    const book = [row('2286', 94, 5 * 3600_000), row('8803', 90.5, 5 * 3600_000), row('6154', 86.4, 5 * 3600_000)];
    expect(thresholdEscalations(book, NOW)).toEqual([]);
  });

  it('escalates a client just after a fill takes it over 85%, and only that one', () => {
    const book = [row('2286', 94, 5 * 3600_000), row('4417', 86.7, 30_000), row('1234', 60, 10_000)];
    const out = thresholdEscalations(book, NOW);
    expect(out).toHaveLength(1);
    expect(out[0]!.author).toBe('threshold-check');
    expect(out[0]!.atMs).toBe(NOW - 30_000);
    expect(out[0]!.what).toBe('Client 4417 at 86.7% of a $450m limit, as of 14:21:07.');
  });

  it('counts 85% exactly as over, and a figure ten minutes old as still fresh', () => {
    expect(thresholdEscalations([row('4417', 85, 600_000)], NOW)).toHaveLength(1);
    expect(thresholdEscalations([row('4417', 85, 600_001)], NOW)).toHaveLength(0);
    expect(thresholdEscalations([row('4417', 84.99, 1_000)], NOW)).toHaveLength(0);
  });
});
