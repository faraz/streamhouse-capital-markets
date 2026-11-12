import type { DeskSnapshot } from '../data/types';

/** Milliseconds, said the way a person on a desk would say them. */
export function age(ms: number): string {
  if (ms < 1000) return '<1s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}

export const money = (n: number) => Math.round(n).toLocaleString('en-US');

export function wallClock(ms: number): string {
  const d = new Date(ms);
  return [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}

/**
 * Staleness, as the one signal the palette carries. Green means as fresh as this design
 * delivers: under exactly-once that is up to about three minutes, two commits end to end.
 * Turning amber at 90 seconds painted the pipeline's normal operation as a warning.
 */
export function freshness(ms: number): 'fresh' | 'warn' | 'stale' {
  return ms < 180_000 ? 'fresh' : ms < 600_000 ? 'warn' : 'stale';
}

/**
 * One colour per concept: fresh, near a limit, stale or breached, and the two agents. The
 * workstation's neutrals live in styles.css; these are the ones code needs, for the shaders.
 */
export const PALETTE = {
  ground: '#0A0C0F',
  text: '#E7EAEE',
  dim: '#8B94A1',
  line: '#232831',
  fresh: '#3DD68C',
  warn: '#F5A524',
  stale: '#F2555A',
  agent: '#4D8BFF',
} as const;

/** Where a client is near its limit, and where the risk agent escalates. */
export const ESCALATE_PCT = 85;

export const usd = (n: number) => `$${money(n)}`;
export const usdM = (n: number) => `$${(n / 1e6).toFixed(1)}m`;

/** A hex colour as the 0..1 RGB triple a shader uniform takes. */
export function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * How far the served table trails live: the newest as_of anywhere in it. This, not the time
 * since one client last traded, is how old an answer is. A figure that has not changed for
 * six hours is still a current figure.
 */
export function tableAsOf(s: DeskSnapshot): number {
  return Math.max(s.served.asOf, ...s.active.map((c) => c.asOf));
}

/** What the screen measures ages against: real time on the live stack, the simulator's own day otherwise. */
export function baseTime(s: DeskSnapshot, now: number): number {
  return s.origin === 'confluent' ? now : s.wallClock;
}

/** How long the asking took, in seconds. Kept apart from how old the answer is. */
export const seconds = (ms: number) => `${(ms / 1000).toFixed(2)} s`;
