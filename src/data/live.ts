import type {
  Clock, ClientExposure, DeskSnapshot, Escalation, EscalationAuthor, ExposureSource,
  Isolation, Mode, NormalizedRecord, Position, RejectedRecord, SourceAge,
} from './types';
import { Simulator, OPENING_MS } from './simulator';
import { LIVE_BOOK_OF_RECORD, SOURCES } from './sources';

/**
 * The live source. Satisfies exactly the same contract as the simulator, by calling the
 * one server route that holds the credentials and fans out the queries.
 *
 * Before mode is delegated to the simulator, deliberately. The before-world is a fiction
 * about six legacy systems that do not exist in this account, and fabricating them in
 * Confluent would be dishonest about what is running. Streamhouse mode is the real thing.
 */
export interface LiveOptions {
  /** Where the server route lives. Relative in the browser. */
  baseUrl?: string;
  /** The shared secret the screen sends. Not a security boundary; scope is. */
  gate?: string;
  clock: Clock;
  fetchFn?: typeof fetch;
  clientCount?: number;
}

export class LiveSource implements ExposureSource {
  private readonly base: string;
  private readonly gate: string;
  private readonly clock: Clock;
  private readonly doFetch: typeof fetch;
  /** Answers Before mode, and stands in whenever the network fails. */
  private readonly fallback: Simulator;
  private mode: Mode = 'streamhouse';
  private isolation: Isolation = 'committed';

  constructor(opts: LiveOptions) {
    this.base = opts.baseUrl ?? '';
    this.gate = opts.gate ?? '';
    this.clock = opts.clock;
    // Bound: storing window.fetch as a property loses its receiver and every call
    // throws 'Illegal invocation'. A test's injected stub needs no binding.
    this.doFetch = opts.fetchFn ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
    this.fallback = new Simulator({ clock: opts.clock, clientCount: opts.clientCount ?? 4000 });
  }

  async setMode(mode: Mode): Promise<void> {
    this.mode = mode;
    await this.fallback.setMode(mode);
  }

  async setIsolation(level: Isolation): Promise<void> {
    this.isolation = level;
    await this.fallback.setIsolation(level);
  }

  async reset(): Promise<void> {
    await this.fallback.reset();
  }

  async produceFill(clientId: string, lots: number): Promise<void> {
    await this.fallback.produceFill(clientId, lots);
    if (this.mode === 'before') return;
    await this.post('/api/fill', { clientId, lots });
  }

  async produceFatFinger(clientId: string): Promise<void> {
    await this.fallback.produceFatFinger(clientId);
    if (this.mode === 'before') return;
    await this.post('/api/fat-finger', { clientId });
  }

  async snapshot(clientId: string): Promise<DeskSnapshot> {
    // The before-world has no Confluent in it. Nothing is queried, and nothing pretends.
    if (this.mode === 'before') return this.fallback.snapshot(clientId);

    const res = await this.doFetch(
      `${this.base}/api/snapshot?client=${encodeURIComponent(clientId)}&isolation=${this.isolation}`,
      { headers: this.headers() },
    );
    if (!res.ok) throw new Error(`snapshot failed: ${res.status}`);
    const wire = (await res.json()) as WireSnapshot;
    // A fill the screen posted is known to the screen before the served figure catches
    // up, so what is still in flight is tracked here rather than asked for.
    const own = await this.fallback.snapshot(clientId);
    return this.toSnapshot(clientId, wire, own.pendingFill);
  }

  private headers(): Record<string, string> {
    return this.gate ? { 'x-demo-gate': this.gate } : {};
  }

  private async post(path: string, body: unknown): Promise<void> {
    const res = await this.doFetch(`${this.base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.headers() },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
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
      symbol: 'ESU6',
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
