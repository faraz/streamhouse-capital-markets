/** Milliseconds, said the way a person on a desk would say them. */
export function age(ms: number): string {
  if (ms < 1000) return '<100ms';
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

export const PALETTE = {
  ink: '#03050C',
  paper: '#F3F6FC',
  mist: '#A9B7D9',
  cobalt: '#8FB0FF',
  mint: '#63E6AE',
  alert: '#FF5A4E',
  amber: '#FFC24B',
  sand: '#E8D5B0',
} as const;
