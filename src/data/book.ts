import type { ClientExposure } from './types';

/**
 * The eight clients named in the deck, with the limits and exposures it states. These
 * are the true current figures, and they sit at the top of the book's sort so the
 * narrative still lands on 4417.
 */
export const DECK_CLIENTS: ReadonlyArray<{ id: string; limitUsd: number; exposureUsd: number }> = [
  { id: '2286', limitUsd: 120e6, exposureUsd: 112.8e6 },
  { id: '8803', limitUsd: 300e6, exposureUsd: 271.5e6 },
  { id: '6154', limitUsd: 250e6, exposureUsd: 216.0e6 },
  { id: '4417', limitUsd: 450e6, exposureUsd: 364_300_640 },
  { id: '7405', limitUsd: 80e6, exposureUsd: 61.6e6 },
  { id: '9021', limitUsd: 500e6, exposureUsd: 371.0e6 },
  { id: '3318', limitUsd: 200e6, exposureUsd: 141.2e6 },
  { id: '5560', limitUsd: 150e6, exposureUsd: 101.3e6 },
];

/** The client the talk follows, and the one the breach happens to. */
export const FOLLOWED = '4417';
/** The mirror case: its stale number reads high, so a good trade gets refused. */
export const FALSE_BLOCK = '7405';
/** Where the followed client closed the day its copy read low, as a share of its limit: the breach found the next morning. */
export const BREACH_CLOSE_PCT = 103;

/** What last night's file says, against which the true figures above are compared. */
export const STALE_REPORTED: Record<string, number> = {
  '4417': 306.2e6, // reads 68% when it is really 81%: the breach
  '7405': 78.4e6, // reads 98% when it is really 77%: the false block
};

/** Deterministic, so a test and a rehearsal see the same book. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The deck's eight, then as many generated clients as asked for. Generated utilisation
 * stays below the escalation threshold, so the only thing that ever crosses a line is a
 * narrative event.
 */
export function buildBook(clientCount: number, seed = 4417): ClientExposure[] {
  const rnd = mulberry32(seed);
  const now = 0;

  const deck: ClientExposure[] = DECK_CLIENTS.map((c) => ({
    clientId: c.id,
    exposureUsd: c.exposureUsd,
    limitUsd: c.limitUsd,
    limitUtilPct: (c.exposureUsd / c.limitUsd) * 100,
    asOf: now,
    lastSource: 'book_of_record.changes',
  }));

  const generated: ClientExposure[] = [];
  const taken = new Set(DECK_CLIENTS.map((c) => c.id));
  while (deck.length + generated.length < clientCount) {
    const id = String(1000 + Math.floor(rnd() * 8999));
    if (taken.has(id)) continue;
    taken.add(id);
    const limitUsd = Math.round((20 + rnd() * 480) * 1e6);
    // Capped below the escalation threshold on purpose.
    const util = 8 + rnd() * 66;
    generated.push({
      clientId: id,
      exposureUsd: (limitUsd * util) / 100,
      limitUsd,
      limitUtilPct: util,
      asOf: now,
      lastSource: 'book_of_record.changes',
    });
  }

  return [...deck, ...generated];
}
