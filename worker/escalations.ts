/**
 * The escalation panel: the risk agent's notes first, the threshold check where it is silent.
 *
 * The agent (flink/36) writes a note for each crossing about 30 to 90 s after the fill: one
 * commit for the figure, its own seconds, and one for the note, since the Lightning Table
 * serves only what is committed. The threshold check sees the figure a commit sooner, so if it
 * spoke at once the panel would show the check and then swap it for the agent. It waits out
 * the agent's worst case first, and stands in at once only when the agent's table cannot be
 * read at all.
 */
import { FRESH_MS, thresholdEscalations, type BookRow } from './threshold';
import type { WireEscalation } from '../src/data/live';

/** The agent's worst case: a commit for the figure, about 15 s of its own, a commit for the note. */
export const AGENT_GRACE_MS = 150_000;

export interface AgentNote {
  clientId: string;
  crossedAtMs: number;
  status: string;
  note: string;
}

export function escalations(notes: AgentNote[] | null, book: BookRow[], nowMs: number): WireEscalation[] {
  const seen = new Set<string>();
  const written: Array<WireEscalation & { clientId: string }> = [];
  for (const n of notes ?? []) {
    const key = `${n.clientId}@${n.crossedAtMs}`;
    if (n.status !== 'SUCCESS' || nowMs - n.crossedAtMs > FRESH_MS || seen.has(key)) continue;
    seen.add(key);
    written.push({
      clientId: n.clientId,
      atMs: n.crossedAtMs,
      title: 'Escalated to the risk officer',
      what: n.note,
      tone: 'warn',
      author: 'risk-agent',
    });
  }

  // A client the agent has written about is the agent's; anyone else over the line waits out
  // the agent's worst case before the check stands in, unless the agent cannot be read.
  const noted = new Set(written.map((e) => e.clientId));
  const standIns = thresholdEscalations(
    book.filter((b) => !noted.has(b.clientId) && (notes === null || nowMs - b.asOfMs > AGENT_GRACE_MS)),
    nowMs,
  );

  return [...written.map(({ clientId: _, ...e }) => e), ...standIns].sort((a, b) => b.atMs - a.atMs).slice(0, 5);
}
