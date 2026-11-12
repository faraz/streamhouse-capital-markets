import type { ClientExposure, DeskSnapshot, Escalation, Isolation, Position, SourceAge } from './types';
import type { WireSnapshot } from './live';
import { FOLLOWED, STALE_REPORTED } from './book';
import { SOURCES } from './sources';

/**
 * The before-world, as a script. The six legacy systems do not exist in the account and
 * nothing here pretends they do: their ages are the fixed ones the story states, and the
 * answer anyone gets is last night's copy. What was actually true is not scripted. It is
 * the live served figure, so "it was really 81%" is read from Confluent as it is said.
 *
 * The copy differs from the truth only for the two clients the story is told with: 4417
 * reads 68% when it is at 81% (the breach) and 7405 reads 98% when it is at 77% (the false
 * block). Everyone else's overnight figure is shown as it stands; the point is made twice
 * and does not need making four thousand times.
 */

/** The stalest of the six, which an answer assembled from all of them inherits. */
const STALEST_MS = Math.max(...SOURCES.map((s) => s.openingAgeSec * 1000));
const NIGHTLY = SOURCES.find((s) => s.becomesLive)!;

const DISCOVERY: Escalation = {
  at: 0,
  title: 'Found out the next morning / 08:14',
  what: `Client ${FOLLOWED} closed yesterday at 103% of limit. The risk agent saw 68% all afternoon and escalated nothing.`,
  tone: 'bad',
  author: 'scripted',
};

function fromCopy(row: { clientId: string; exposureUsd: number; limitUsd: number }, asOf: number): ClientExposure {
  const exposureUsd = STALE_REPORTED[row.clientId] ?? row.exposureUsd;
  return {
    clientId: row.clientId,
    exposureUsd,
    limitUsd: row.limitUsd,
    limitUtilPct: (exposureUsd / row.limitUsd) * 100,
    asOf,
    lastSource: 'nightly.extract',
  };
}

export function beforeSnapshot(
  clientId: string,
  wire: WireSnapshot,
  nowMs: number,
  isolation: Isolation,
): DeskSnapshot {
  const asOf = nowMs - STALEST_MS;
  const sources: SourceAge[] = SOURCES.map((s) => ({
    id: s.id,
    name: s.name,
    shape: s.shape,
    raw: s.raw,
    ageMs: s.openingAgeSec * 1000,
    live: false,
    stalest: s.openingAgeSec * 1000 === STALEST_MS,
  }));

  const served = fromCopy({ clientId, ...wire.served }, asOf);
  const book = wire.book
    .map((b) => fromCopy(b, asOf))
    .sort((a, b) => b.limitUtilPct - a.limitUtilPct);

  // The one row the copy holds for this client, as the nightly extract wrote it.
  const extractAt = nowMs - NIGHTLY.openingAgeSec * 1000;
  const recent: Position[] = [{
    clientId,
    symbol: 'ESZ6',
    quantity: 240,
    price: 5412.25,
    eventTime: extractAt,
    source: 'nightly.extract',
  }];

  return {
    wallClock: nowMs,
    mode: 'before',
    isolation,
    sources,
    normalized: {
      clientId,
      symbol: 'ESZ6',
      quantity: 240,
      price: 5412.25,
      notionalUsd: 240 * 5412.25,
      eventTime: extractAt,
      source: 'nightly.extract',
      ageMs: NIGHTLY.openingAgeSec * 1000,
    },
    rejected: null,
    served,
    trueExposureUsd: wire.served.exposureUsd,
    book,
    // Nobody has "just traded" in a world that learns about trades overnight.
    active: [],
    recent,
    // One nightly file is all there is: nothing flows, and nothing was reshaped on the way.
    tape: recent,
    shapes: [],
    flowing: [],
    escalations: [DISCOVERY],
    clocks: { servedAgeMs: STALEST_MS, openTableAgeMs: STALEST_MS },
    pendingFill: null,
    // The figures that are true are Confluent's; the rest is the script, and says so.
    origin: 'confluent',
  };
}
