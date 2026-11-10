import type {
  Clock, ClientExposure, DeskSnapshot, Escalation, EscalationAuthor, ExposureSource,
  Isolation, Mode, NormalizedRecord, Position, RejectedRecord, SourceAge,
} from './types';
import { COMMIT_MS } from './simulator';
import { beforeSnapshot } from './before';
import { FILL_PX } from './fill';
import { LIVE_BOOK_OF_RECORD, SOURCES } from './sources';

/**
 * The live source, and the only one the screen uses. Satisfies the same contract as the
 * simulator, which now exists for the tests, by calling the one server route that holds the
 * credentials and fans out the queries.
 *
 * Before mode is a script (before.ts) over the same live answer. The before-world is a
 * fiction about six legacy systems that do not exist in this account, and fabricating them
 * in Confluent would be dishonest about what is running; what was really true in it is
 * still the live figure.
 */
export interface LiveOptions {
  /** Where the server route lives. Relative in the browser. */
  baseUrl?: string;
  /** The shared secret the screen sends. Not a security boundary; scope is. */
  gate?: string;
  clock: Clock;
  fetchFn?: typeof fetch;
}

export class LiveSource implements ExposureSource {
  private readonly base: string;
  private readonly gate: string;
  private readonly clock: Clock;
  private readonly doFetch: typeof fetch;
  /**
   * The fills this screen has sent, each with the event time the Worker stamped on it. One is
   * in flight until its client's served as_of reaches that time: as_of is the newest event the
   * figure includes, so that is the moment the figure has it. Read off the live answer rather
   * than predicted, so it holds for any client and however long the commit takes.
   */
  private inFlight: Array<{ clientId: string; lots: number; eventMs: number }> = [];
  private mode: Mode = 'streamhouse';
  private isolation: Isolation = 'committed';

  constructor(opts: LiveOptions) {
    this.base = opts.baseUrl ?? '';
    this.gate = opts.gate ?? '';
    this.clock = opts.clock;
    // Bound: storing window.fetch as a property loses its receiver and every call
    // throws 'Illegal invocation'. A test's injected stub needs no binding.
    this.doFetch = opts.fetchFn ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  }

  async setMode(mode: Mode): Promise<void> {
    this.mode = mode;
  }

  async setIsolation(level: Isolation): Promise<void> {
    this.isolation = level;
  }

  /**
   * Offsets every fill the presenter has sent, on the live stack too, so the next run starts
   * from the opening book without a rebuild. In either mode: the fills it offsets are in
   * Confluent whichever world the screen is showing.
   */
  async reset(): Promise<void> {
    this.inFlight = [];
    await this.post('/api/reset', {});
  }

  async produceFill(clientId: string, lots: number): Promise<void> {
    // The before-world learns about trades overnight: a fill sent there would move the live
    // book behind the story's back and be found at 7:15.
    if (this.mode === 'before') return;
    const { produced } = (await this.post('/api/fill', { clientId, lots })) as { produced?: { ts?: string } };
    const eventMs = produced?.ts ? Date.parse(produced.ts.replace(' ', 'T') + 'Z') : NaN;
    if (Number.isFinite(eventMs)) this.inFlight.push({ clientId, lots, eventMs });
  }

  async produceFatFinger(clientId: string): Promise<void> {
    if (this.mode === 'before') return;
    await this.post('/api/fat-finger', { clientId });
  }

  async snapshot(clientId: string): Promise<DeskSnapshot> {
    const res = await this.doFetch(
      `${this.base}/api/snapshot?client=${encodeURIComponent(clientId)}&isolation=${this.isolation}`,
      { headers: this.headers() },
    );
    if (!res.ok) throw new Error(`snapshot failed: ${res.status}`);
    const wire = (await res.json()) as WireSnapshot;
    // The before-world is a script over the live truth: what anyone was told comes from last
    // night's copy, and what was really so comes from Confluent.
    if (this.mode === 'before') return beforeSnapshot(clientId, wire, Date.now(), this.isolation);
    return this.toSnapshot(clientId, wire, this.pendingFor(clientId, wire.served.asOfMs));
  }

  /** The newest fill sent for this client that its served figure does not yet include. */
  private pendingFor(clientId: string, servedAsOfMs: number): DeskSnapshot['pendingFill'] {
    const mine = this.inFlight.filter((f) => f.clientId === clientId);
    const landed = mine.filter((f) => servedAsOfMs >= f.eventMs);
    if (landed.length) this.inFlight = this.inFlight.filter((f) => !landed.includes(f));
    const open = mine.filter((f) => servedAsOfMs < f.eventMs).at(-1);
    if (!open) return null;
    return {
      atMs: open.eventMs,
      lots: open.lots,
      notionalUsd: open.lots * FILL_PX,
      // One commit at most, now that presenter events reach the figure in a single hop.
      visibleAtMs: open.eventMs + COMMIT_MS,
    };
  }

  private headers(): Record<string, string> {
    return this.gate ? { 'x-demo-gate': this.gate } : {};
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const res = await this.doFetch(`${this.base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.headers() },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
    return res.json().catch(() => ({}));
  }

  /**
   * The source panel's ages are the per-source constants the normalizing statements
   * stamp on every record, because a feed's staleness is a property of the feed rather
   * than something to re-derive per request. What the server supplies is which sources
   * have actually produced records.
   */
  private toSnapshot(
    clientId: string,
    wire: WireSnapshot,
    pendingFill: DeskSnapshot['pendingFill'],
  ): DeskSnapshot {
    const t = this.clock();
    const seen = new Set(wire.activeSources);

    const sources: SourceAge[] = SOURCES.map((s) => {
      const isBookOfRecord = s.becomesLive;
      return {
        name: s.name,
        shape: isBookOfRecord ? LIVE_BOOK_OF_RECORD.shape : s.shape,
        raw: isBookOfRecord ? LIVE_BOOK_OF_RECORD.raw : s.raw,
        ageMs: isBookOfRecord ? LIVE_BOOK_OF_RECORD.ageSec * 1000 : s.openingAgeSec * 1000,
        live: isBookOfRecord && seen.has('book_of_record'),
        stalest: false, // only the before-world assembles one answer from all six
      };
    });

    const served: ClientExposure = {
      clientId,
      exposureUsd: wire.served.exposureUsd,
      limitUsd: wire.served.limitUsd,
      limitUtilPct: wire.served.limitUtilPct,
      asOf: wire.served.asOfMs,
      lastSource: 'book_of_record.changes',
    };

    const escalations: Escalation[] = wire.escalations.map((e) => ({
      at: e.atMs,
      title: e.title,
      what: e.what,
      tone: e.tone,
      author: e.author,
    }));

    const normalized: NormalizedRecord = wire.normalized ?? {
      clientId,
      symbol: 'ESZ6',
      quantity: 0,
      price: 0,
      notionalUsd: 0,
      eventTime: served.asOf,
      source: 'book_of_record.changes',
      ageMs: LIVE_BOOK_OF_RECORD.ageSec * 1000,
    };

    const rejected: RejectedRecord | null = wire.rejected
      ? { raw: wire.rejected.raw, reason: wire.rejected.reason, topic: 'positions_dlq' }
      : null;

    const recent: Position[] = wire.recent.map((p) => ({
      clientId: p.clientId,
      symbol: p.symbol,
      quantity: p.quantity,
      price: p.price,
      eventTime: p.eventTimeMs,
      source: p.source,
    }));

    return {
      // Real time: the served rows carry real timestamps, and an age is only right
      // when it is measured against the same clock they were stamped with.
      wallClock: Date.now(),
      mode: this.mode,
      isolation: this.isolation,
      sources,
      normalized,
      rejected,
      served,
      // In the streamhouse the served figure IS the current one. The only gap is a fill
      // that has landed in the topic and not yet been committed, which the screen knows
      // about because it posted it.
      trueExposureUsd: wire.trueExposureUsd + (pendingFill ? pendingFill.notionalUsd : 0),
      book: wire.book.map((b) => ({
        clientId: b.clientId,
        exposureUsd: b.exposureUsd,
        limitUsd: b.limitUsd,
        limitUtilPct: b.limitUtilPct,
        asOf: b.asOfMs,
        lastSource: 'book_of_record.changes',
      })),
      active: (wire.active ?? []).map((b) => ({
        clientId: b.clientId,
        exposureUsd: b.exposureUsd,
        limitUsd: b.limitUsd,
        limitUtilPct: b.limitUtilPct,
        asOf: b.asOfMs,
        lastSource: 'trade',
      })),
      recent,
      escalations,
      clocks: {
        servedAgeMs: wire.servedAgeMs,
        openTableAgeMs: wire.openTableAgeMs,
      },
      pendingFill,
      origin: 'confluent',
    };
  }
}

export interface WireEscalation {
  atMs: number;
  title: string;
  what: string;
  tone: 'warn' | 'bad';
  author: EscalationAuthor;
}

/** What the server route returns. Flat and already parsed, so the screen does no maths. */
export interface WireSnapshot {
  served: { exposureUsd: number; limitUsd: number; limitUtilPct: number; asOfMs: number };
  trueExposureUsd: number;
  book: Array<{ clientId: string; exposureUsd: number; limitUsd: number; limitUtilPct: number; asOfMs: number }>;
  active: Array<{ clientId: string; exposureUsd: number; limitUsd: number; limitUtilPct: number; asOfMs: number }>;
  recent: Array<{ clientId: string; symbol: string; quantity: number; price: number; eventTimeMs: number; source: string }>;
  rejected: { raw: string; reason: string } | null;
  escalations: WireEscalation[];
  activeSources: string[];
  normalized: NormalizedRecord | null;
  servedAgeMs: number;
  openTableAgeMs: number;
  pendingFill: DeskSnapshot['pendingFill'];
}
