import { describe, expect, it } from 'vitest';
import { AGENT_GRACE_MS, escalations } from '../escalations';

/**
 * What the panel shows: the risk agent's notes, and the threshold check only where the agent
 * has said nothing. The agent's note lands 30 to 90 s after a fill: one commit for the figure,
 * the agent's own seconds, one commit for its note. So the check waits that long before it
 * speaks for a crossing, and speaks at once if the agent's table cannot be read at all.
 */
const NOW = Date.UTC(2026, 10, 12, 14, 30, 0);
const book = (ageMs: number) => [
  { clientId: '2286', limitUsd: 120e6, limitUtilPct: 94, asOfMs: NOW - 5 * 3600_000 },
  { clientId: '4417', limitUsd: 450e6, limitUtilPct: 87.4, asOfMs: NOW - ageMs },
];
const note = (crossedAgoMs: number, status = 'SUCCESS', clientId = '4417') => ({
  clientId,
  crossedAtMs: NOW - crossedAgoMs,
  status,
  note: 'Client 4417 crossed 85% at 14:28:00 on a 5,000-lot ESZ6 fill; now 87.4% of a $450m limit.',
});

describe('the escalation panel', () => {
  it("shows the risk agent's note, and no threshold check beside it", () => {
    const out = escalations([note(60_000)], book(60_000), NOW);
    expect(out).toHaveLength(1);
    expect(out[0]!.author).toBe('risk-agent');
    expect(out[0]!.what).toMatch(/^Client 4417 crossed 85%/);
  });

  it('waits for the agent before the threshold check speaks for a fresh crossing', () => {
    expect(escalations([], book(40_000), NOW)).toEqual([]);
    const late = escalations([], book(AGENT_GRACE_MS + 1_000), NOW);
    expect(late.map((e) => e.author)).toEqual(['threshold-check']);
  });

  it('falls back to the threshold check at once when the agent table cannot be read', () => {
    const out = escalations(null, book(10_000), NOW);
    expect(out.map((e) => e.author)).toEqual(['threshold-check']);
  });

  it('shows one note per client and crossing, though the agent may write it twice', () => {
    expect(escalations([note(60_000), note(60_000)], book(60_000), NOW)).toHaveLength(1);
  });

  it('treats a failed agent run as no note, so the threshold check covers it', () => {
    const out = escalations([note(AGENT_GRACE_MS + 1_000, 'FAILED')], book(AGENT_GRACE_MS + 1_000), NOW);
    expect(out.map((e) => e.author)).toEqual(['threshold-check']);
  });

  it('never shows a note older than ten minutes, which keeps the warm-up row off the screen', () => {
    const warm = { ...note(0, 'SETUP', '90000'), crossedAtMs: Date.UTC(2000, 0, 1) };
    expect(escalations([note(11 * 60_000), warm], book(11 * 60_000), NOW)).toEqual([]);
  });
});
