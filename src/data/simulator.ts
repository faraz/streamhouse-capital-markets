import type {
  Clock, ClientExposure, DeskSnapshot, Escalation, ExposureSource,
  Isolation, Mode, NormalizedRecord, Position, RejectedRecord, SourceAge,
} from './types';
import { buildBook, DECK_CLIENTS, FOLLOWED, STALE_REPORTED } from './book';
import { LIVE_BOOK_OF_RECORD, SOURCES } from './sources';
import { FILL_LOTS, FILL_PX } from './fill';

/** Flink commits transactions about once a minute. That, not the table, is the minute. */
export const COMMIT_MS = 60_000;
/** Tableflow publishes a fresh snapshot about every five minutes. */
export const SNAPSHOT_MS = 300_000;
/** A Lightning Table reflects a change within 100ms. */
export const MATERIALIZE_MS = 100;

/** The demo opens at 14:06:22 on the trading day, a little after two in the afternoon.
 * A real epoch, not milliseconds since midnight: the record's own event_time is rendered
 * as a date, and an offset showed every fact as having happened in 1970. */
export const OPENING_MS = Date.UTC(2026, 10, 9, 14, 6, 22);

/** Priced as the live stack prices it, so the two cannot tell different stories. */
const NOTIONAL_PER_LOT = FILL_PX;
/** The presenter's fill, sized in fill.ts to cross the escalation line from anywhere. */
export const DEFAULT_FILL_LOTS = FILL_LOTS;

/** Where the streaming agent escalates, and where "near a limit" begins. */
const ESCALATE_PCT = 85;
const THRESHOLDS = [85, 90, 100];

type Event =
  | { kind: 'fill'; atMs: number; clientId: string; lots: number }
  | { kind: 'fatfinger'; atMs: number; clientId: string };

/** Deterministic hash, so jitter is reproducible across a test and a rehearsal. */
function hash(s: string, tick: number): number {
  let h = 2166136261 ^ tick;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Bounded jitter: the screen must look alive without ever crossing a threshold on its
 * own. The amplitude is clamped to half the distance to the nearest threshold, so only a
 * narrative event can move a client across a line.
 */
function jitterPct(clientId: string, basePct: number, tick: number): number {
  const above = THRESHOLDS.filter((t) => t > basePct).sort((a, b) => a - b)[0] ?? 100;
  const below = THRESHOLDS.filter((t) => t < basePct).sort((a, b) => b - a)[0] ?? 0;
  const room = Math.min(0.3, (above - basePct) / 2, (basePct - below) / 2);
  const amp = Math.max(0, room);
  return (hash(clientId, tick) * 2 - 1) * amp;
}

export interface SimulatorOptions {
  clock: Clock;
  clientCount?: number;
  seed?: number;
}

export class Simulator implements ExposureSource {
  private readonly clock: Clock;
  private readonly base: ClientExposure[];
  private readonly byId: Map<string, ClientExposure>;
  private events: Event[] = [];
  private mode: Mode = 'streamhouse';
  private isolation: Isolation = 'committed';

  constructor(opts: SimulatorOptions) {
    this.clock = opts.clock;
    this.base = buildBook(opts.clientCount ?? 4000, opts.seed ?? 4417);
    this.byId = new Map(this.base.map((c) => [c.clientId, c]));
  }

  async setMode(mode: Mode): Promise<void> {
    this.mode = mode;
  }

  async setIsolation(level: Isolation): Promise<void> {
    this.isolation = level;
  }

  async produceFill(clientId: string, lots = DEFAULT_FILL_LOTS): Promise<void> {
    this.events.push({ kind: 'fill', atMs: this.clock(), clientId, lots });
  }

  async produceFatFinger(clientId: string): Promise<void> {
    this.events.push({ kind: 'fatfinger', atMs: this.clock(), clientId });
  }

  async reset(): Promise<void> {
    this.events = [];
  }

  /**
   * Under exactly-once, a change is visible only after Flink's next commit. Under
   * read-uncommitted it is visible as soon as it lands, and a reader may see something
   * that is later taken back.
   */
  private visibleAt(atMs: number): number {
    if (this.isolation === 'uncommitted') return atMs + MATERIALIZE_MS;
    return Math.ceil((atMs + 1) / COMMIT_MS) * COMMIT_MS + MATERIALIZE_MS;
  }

  private fillsFor(clientId: string, t: number, visibleOnly: boolean): number {
    return this.events
      .filter((e): e is Extract<Event, { kind: 'fill' }> => e.kind === 'fill' && e.clientId === clientId)
      .filter((e) => (visibleOnly ? this.visibleAt(e.atMs) <= t : e.atMs <= t))
      .reduce((sum, e) => sum + e.lots * NOTIONAL_PER_LOT, 0);
  }

  /** The age of the served figure: time since the commit it came from. */
  private servedAge(t: number): number {
    if (this.mode === 'before') {
      // The whole thesis: an assembled answer inherits the WORST age in the set, not the
      // age of the source you happen to think of as the main one.
      return Math.max(...this.sourceAges(t).map((s) => s.ageMs));
    }
    if (this.isolation === 'uncommitted') return MATERIALIZE_MS;
    return (t % COMMIT_MS) + MATERIALIZE_MS;
  }

  private exposureFor(clientId: string, t: number, visibleOnly: boolean): ClientExposure {
    const base = this.byId.get(clientId);
    if (!base) throw new Error(`unknown client ${clientId}`);

    const tick = Math.floor(t / 4000);
    const drift = jitterPct(clientId, base.limitUtilPct, tick);
    const jittered = base.exposureUsd * (1 + drift / 100);
    const exposureUsd = jittered + this.fillsFor(clientId, t, visibleOnly);

    return {
      clientId,
      exposureUsd,
      limitUsd: base.limitUsd,
      limitUtilPct: (exposureUsd / base.limitUsd) * 100,
      asOf: OPENING_MS + t - this.servedAge(t),
      lastSource: this.mode === 'before' ? 'nightly.extract' : 'book_of_record.changes',
    };
  }

  private sourceAges(t: number): SourceAge[] {
    const live = this.mode === 'streamhouse';
    const rows = SOURCES.map((s, i) => {
      const isBookOfRecord = s.becomesLive;
      const ageMs = s.name === 'Intraday feed'
        ? s.openingAgeSec * 1000
        : isBookOfRecord && live
          ? LIVE_BOOK_OF_RECORD.ageSec * 1000
          : s.openingAgeSec * 1000 + t;
      return {
        name: s.name,
        shape: isBookOfRecord && live ? LIVE_BOOK_OF_RECORD.shape : s.shape,
        raw: isBookOfRecord && live ? LIVE_BOOK_OF_RECORD.raw : s.raw,
        ageMs,
        live: isBookOfRecord && live,
        stalest: false,
        _i: i,
      };
    });
    // The assembled answer inherits the worst age in the set, and only the before-world
    // assembles an answer, so only there is one source marked as the binding constraint.
    if (this.mode === 'before') {
      const worst = Math.max(...rows.map((r) => r.ageMs));
      for (const r of rows) r.stalest = r.ageMs === worst;
    }
    return rows.map(({ _i, ...r }) => r);
  }

  private escalationsFor(clientId: string, t: number): Escalation[] {
    if (this.mode === 'before') {
      return [{
        at: 0,
        title: 'Found out the next morning / 08:14',
        what: `Client ${clientId} closed yesterday at 103% of limit. The risk agent saw 68% all afternoon and escalated nothing.`,
        tone: 'bad',
        author: 'simulator',
      }];
    }

    const out: Escalation[] = [];
    for (const e of this.events) {
      if (e.kind === 'fatfinger') {
        if (this.visibleAt(e.atMs) <= t + COMMIT_MS) {
          out.push({
            at: OPENING_MS + e.atMs,
            title: 'Flink validation',
            what: 'A 2,400,000 lot on ESZ6 was rejected to positions.dlq. The exposure figure never moved.',
            tone: 'warn',
            author: 'simulator',
          });
        }
        continue;
      }
      const visible = this.visibleAt(e.atMs);
      if (visible > t) continue;
      const after = this.exposureFor(e.clientId, visible, true);
      const before = this.exposureFor(e.clientId, Math.max(0, e.atMs - 1), true);
      // Exactly once per crossing: derived from the event, never accumulated.
      if (before.limitUtilPct < ESCALATE_PCT && after.limitUtilPct >= ESCALATE_PCT) {
        // Absolute, like the served tables' as_of, so it reads as a time on the trading day.
        const crossedAt = OPENING_MS + visible;
        out.push({
          at: crossedAt,
          title: 'Escalated to the risk officer',
          // A note, as the risk agent writes one: the client, when, the fill that did it,
          // and where it stands. A fallback then changes the author, not what is said.
          what: `Client ${e.clientId} crossed ${ESCALATE_PCT}% at ${new Date(crossedAt).toISOString().slice(11, 19)} on a ${e.lots.toLocaleString('en-US')} lot ESZ6 fill; now ${after.limitUtilPct.toFixed(1)}% of a $${Math.round(after.limitUsd / 1e6)}m limit.`,
          tone: 'warn',
          author: 'simulator',
        });
      }
    }
    return out.sort((a, b) => b.at - a.at);
  }

  async snapshot(requested: string): Promise<DeskSnapshot> {
    const clientId = this.byId.has(requested) ? requested : FOLLOWED;
    const t = this.clock();
    const sources = this.sourceAges(t);
    const live = this.mode === 'streamhouse';

    const served = live
      ? this.exposureFor(clientId, t, true)
      : (() => {
          const base = this.byId.get(clientId)!;
          const reported = STALE_REPORTED[clientId] ?? base.exposureUsd * 0.84;
          return {
            clientId,
            exposureUsd: reported,
            limitUsd: base.limitUsd,
            limitUtilPct: (reported / base.limitUsd) * 100,
            asOf: OPENING_MS + t - this.servedAge(t),
            lastSource: 'nightly.extract',
          };
        })();

    const truth = this.exposureFor(clientId, t, false);

    const pending = this.events
      .filter((e): e is Extract<Event, { kind: 'fill' }> => e.kind === 'fill' && e.clientId === clientId)
      .map((e) => ({
        atMs: e.atMs,
        lots: e.lots,
        notionalUsd: e.lots * NOTIONAL_PER_LOT,
        visibleAtMs: this.visibleAt(e.atMs) > t ? this.visibleAt(e.atMs) : null,
      }))
      .filter((p) => p.visibleAtMs !== null)
      .at(-1) ?? null;

    const fatFinger = this.events.find(
      (e) => e.kind === 'fatfinger' && e.atMs <= t && t - e.atMs < 7000,
    );
    const rejected: RejectedRecord | null = fatFinger
      ? {
          raw: 'MSG|ACCT=4417|SYM=ESZ6|QTY=+2400000|PX=5412.25',
          reason: 'Quantity exceeds the desk bound of 50,000 lots',
          topic: 'positions_dlq',
        }
      : null;

    const normalized: NormalizedRecord = {
      clientId,
      symbol: 'ESZ6',
      quantity: 240,
      price: 5412.25,
      notionalUsd: 240 * 5412.25,
      // Absolute, like every other time the screen shows. Computing it as an offset
      // from the demo's start rendered every record as 1970.
      eventTime:
        OPENING_MS + t - (live ? LIVE_BOOK_OF_RECORD.ageSec * 1000 : SOURCES[5]!.openingAgeSec * 1000 + t),
      source: live ? 'book_of_record.changes' : 'nightly.extract',
      ageMs: live ? LIVE_BOOK_OF_RECORD.ageSec * 1000 : SOURCES[5]!.openingAgeSec * 1000 + t,
    };

    const book = this.base
      .map((c) => this.exposureFor(c.clientId, t, true))
      .sort((a, b) => b.limitUtilPct - a.limitUtilPct)
      .slice(0, 200);

    const recent: Position[] = [{
      clientId,
      symbol: 'ESZ6',
      quantity: pending ? pending.lots : 240,
      price: pending ? 5414.0 : 5412.25,
      eventTime: pending ? pending.atMs : t - 3000,
      source: normalized.source,
    }];

    return {
      wallClock: OPENING_MS + t,
      mode: this.mode,
      isolation: this.isolation,
      sources,
      normalized,
      rejected,
      served,
      trueExposureUsd: truth.exposureUsd,
      book,
      // A handful of book clients standing in for "just traded". The simulator has no
      // live feed; this exists so the screen has something to offer when it falls back.
      active: book.slice(8, 14).map((c, i) => ({ ...c, asOf: OPENING_MS + t - (i + 1) * 3000 })),
      recent,
      escalations: this.escalationsFor(clientId, t),
      clocks: {
        servedAgeMs: this.servedAge(t),
        openTableAgeMs: live ? (t % SNAPSHOT_MS) + MATERIALIZE_MS : this.servedAge(t),
      },
      pendingFill: pending,
      origin: 'simulator',
    };
  }
}

export { FOLLOWED, DECK_CLIENTS };
