// The one seam. The screen talks to an ExposureSource and never to Confluent, to the
// simulator, or to HTTP. Two implementations satisfy it: the simulator, which is pure
// and needs nothing, and the live source, which calls one server route.

export type Mode = 'before' | 'streamhouse';
export type Isolation = 'committed' | 'uncommitted';

/** Milliseconds since the demo began. Injected, never read from the ambient clock. */
export type Clock = () => number;

export interface SourceAge {
  /** The system's name as the audience sees it. */
  name: string;
  /** How it arrives, in the audience's words. */
  shape: string;
  /** A sample payload, shown verbatim so the shapes are visibly different. */
  raw: string;
  ageMs: number;
  /** True when it is read at source rather than waiting for a nightly extract. */
  live: boolean;
  /** The one the assembled answer inherits its age from. */
  stalest: boolean;
}

export interface NormalizedRecord {
  clientId: string;
  symbol: string;
  quantity: number;
  price: number;
  notionalUsd: number;
  eventTime: number;
  source: string;
  /** What lets an answer state how old it is. */
  ageMs: number;
}

export interface RejectedRecord {
  raw: string;
  reason: string;
  topic: string;
}

export interface ClientExposure {
  clientId: string;
  exposureUsd: number;
  limitUsd: number;
  /** Stored, never computed in a query: a Lightning Table sorts on columns. */
  limitUtilPct: number;
  asOf: number;
  lastSource: string;
}

export interface Position {
  clientId: string;
  symbol: string;
  quantity: number;
  price: number;
  eventTime: number;
  source: string;
}

/**
 * Who wrote an escalation: the deck's risk agent, the Worker's threshold check standing in
 * for it, the simulator, or the Before mode's script (the next-morning discovery). Named on every one, as `origin` is on every snapshot, so a fallback
 * mid-demo changes the label rather than passing one writer off as another.
 */
export type EscalationAuthor = 'risk-agent' | 'threshold-check' | 'simulator' | 'scripted';

export interface Escalation {
  at: number;
  /** What happened, as the audience reads it: who it reached, or what caught it. */
  title: string;
  what: string;
  tone: 'warn' | 'bad';
  author: EscalationAuthor;
}

export interface PendingFill {
  atMs: number;
  lots: number;
  notionalUsd: number;
  /** When the served figure will pick it up. Null once it has. */
  visibleAtMs: number | null;
}

export interface DeskSnapshot {
  /** Wall clock of the simulated trading day, in ms since midnight. */
  wallClock: number;
  mode: Mode;
  isolation: Isolation;
  sources: SourceAge[];
  normalized: NormalizedRecord;
  rejected: RejectedRecord | null;
  /** The figure as the served tables have it, which is what anyone asking gets. */
  served: ClientExposure;
  /** What is actually true this instant. The gap against `served` is the whole argument. */
  trueExposureUsd: number;
  /** Top N by limit utilisation, descending. Never more than 200 rows. */
  book: ClientExposure[];
  /**
   * Whoever traded most recently, freshest first. The demo cannot depend on two prepared
   * clients being recent: left idle for half an hour, their answers are half an hour old
   * and the screen contradicts its own argument. Someone has always just traded.
   */
  active: ClientExposure[];
  recent: Position[];
  escalations: Escalation[];
  clocks: { servedAgeMs: number; openTableAgeMs: number };
  pendingFill: PendingFill | null;
  /** Which implementation answered, so the screen can never misreport it. */
  origin: 'simulator' | 'confluent';
}

export interface ExposureSource {
  snapshot(clientId: string): Promise<DeskSnapshot>;
  produceFill(clientId: string, lots: number): Promise<void>;
  produceFatFinger(clientId: string): Promise<void>;
  setIsolation(level: Isolation): Promise<void>;
  setMode(mode: Mode): Promise<void>;
  reset(): Promise<void>;
}
