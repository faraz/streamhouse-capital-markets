// The one seam. The screen talks to an ExposureSource and never to Confluent, to the
// simulator, or to HTTP. Two implementations satisfy it: the simulator, which is pure
// and needs nothing, and the live source, which calls one server route.

export type Mode = 'before' | 'streamhouse';
export type Isolation = 'committed' | 'uncommitted';

/** Milliseconds since the demo began. Injected, never read from the ambient clock. */
export type Clock = () => number;

export interface SourceAge {
  /** The `source` its Flink statement stamps on every record it reshapes. */
  id: string;
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
  /** As the record carries it. Not always quantity times price: a clearing total has neither. */
  notionalUsd?: number;
  /** How stale its feed was, as its Flink statement stamped it. */
  ingestLagMs?: number;
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

/** What a Confluent Cloud console address is built from. Identifiers, not credentials. */
export interface ConsoleInfo {
  environmentId: string;
  clusterId: string;
  cloud: string;
  region: string;
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
  /** The newest governed records across the whole book, newest first: what is flowing now. */
  tape: Position[];
  /** The newest governed record from each of the six shaped feeds, where one exists. */
  shapes: Position[];
  /** The sources behind the newest records. Only these are arriving right now. */
  flowing: string[];
  /** Where the live stack lives in the Confluent Cloud console. Absent when nothing is live. */
  console?: ConsoleInfo;
  /** How long the served tables took to answer this snapshot. Absent when none were asked. */
  query?: { count: number; ms: number };
  escalations: Escalation[];
  clocks: { servedAgeMs: number; openTableAgeMs: number };
  pendingFill: PendingFill | null;
  /** Which implementation answered, so the screen can never misreport it. */
  origin: 'simulator' | 'confluent';
}

/**
 * A presenter event exactly as it was written to the raw_events topic, so the screen can
 * show the bytes that went into Kafka rather than a description of them.
 */
export interface RawEvent {
  acct: string;
  sym: string;
  qty: number;
  px: number;
  /** Flink's timestamp string, "YYYY-MM-DD HH:MM:SS.mmm", UTC. */
  ts: string;
  kind: 'fill' | 'fat_finger';
}

export interface ExposureSource {
  snapshot(clientId: string): Promise<DeskSnapshot>;
  /** Null when nothing was written, as in the before-world. */
  produceFill(clientId: string, lots: number): Promise<RawEvent | null>;
  produceFatFinger(clientId: string): Promise<RawEvent | null>;
  setIsolation(level: Isolation): Promise<void>;
  setMode(mode: Mode): Promise<void>;
  reset(): Promise<void>;
}
