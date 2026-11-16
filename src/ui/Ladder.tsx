import { useMemo } from 'react';
import { STORY_CLIENTS } from '../data/book';
import type { ClientExposure } from '../data/types';
import { ESCALATE_PCT } from './format';
import { useSize } from './useSize';

/** The most clients the served table hands the screen. */
export const LADDER_CLIENTS = 200;
const GAP = 1;
const AXIS = 16;
/** The size of a story client's name tag on the plot. */
const FLAG_W = 36;
const FLAG_H = 15;

/**
 * The book as a limit ladder: every client the served table returned is one square, stood on
 * the limit-used axis at its own figure and stacked where others share it. The shape is the
 * distribution, the right-hand end is who a risk desk worries about, and the two rules are
 * the lines this screen is about: where the agent escalates, and the limit itself.
 */
export function Ladder({ book, focus, also, onClient }: { book: ClientExposure[]; focus: string; also?: string | null; onClient(id: string): void }) {
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const rows = book.slice(0, LADDER_CLIENTS);

  const plot = useMemo(() => {
    if (!width || !height || !rows.length) return null;
    const pcts = rows.map((c) => c.limitUtilPct);
    // Whole fives either side, and always far enough right to show the limit.
    const lo = Math.max(0, Math.floor((Math.min(...pcts) - 1) / 5) * 5);
    const hi = Math.max(105, Math.ceil((Math.max(...pcts) + 1) / 5) * 5);
    const room = height - AXIS;
    // The largest square at which the tallest stack still stands inside the plot: a narrower
    // square means narrower bins, which spreads a crowded stretch of the axis out.
    let pitch = 6;
    let cols = 1;
    let per = hi - lo;
    let bins: number[] = [];
    for (; pitch >= 3; pitch--) {
      cols = Math.max(1, Math.floor(width / pitch));
      per = (hi - lo) / cols;
      bins = rows.map((c) => Math.min(cols - 1, Math.max(0, Math.floor((c.limitUtilPct - lo) / per))));
      const tallest = Math.max(...Array.from(new Set(bins), (b) => bins.filter((x) => x === b).length));
      if (tallest * pitch <= room) break;
    }
    pitch = Math.max(3, pitch);
    const cell = pitch - GAP;
    const left = Math.floor((width - cols * pitch) / 2);
    const cap = Math.max(1, Math.floor(room / pitch));
    const stacks = new Map<number, number>();
    const marks = rows.map((c, i) => {
      const col = bins[i]!;
      const n = stacks.get(col) ?? 0;
      stacks.set(col, n + 1);
      return { c, x: left + col * pitch, y: room - (Math.min(n, cap - 1) + 1) * pitch + GAP };
    });
    const at = (pct: number) => left + ((pct - lo) / per) * pitch;
    // The story's two clients are named on the plot. A label sits above its square, and where
    // the two are close the second is set a row higher so neither covers the other.
    const flags = marks
      .filter((m) => STORY_CLIENTS.includes(m.c.clientId))
      .sort((a, b) => a.x - b.x)
      .map((m) => ({ id: m.c.clientId, x: m.x + cell / 2, top: m.y, y: Math.max(FLAG_H / 2 + 1, m.y - 14) }));
    flags.forEach((f, i) => {
      const prev = flags[i - 1];
      if (prev && f.x - prev.x < FLAG_W + 4 && Math.abs(f.y - prev.y) < FLAG_H + 2) {
        f.y = prev.y - FLAG_H - 2 >= FLAG_H / 2 + 1 ? prev.y - FLAG_H - 2 : prev.y + FLAG_H + 2;
      }
    });
    return { marks, cell, at, lo, hi, room, flags };
  }, [rows, width, height]);

  return (
    <div className="ladder" ref={ref} role="img" aria-label="Clients by limit used">
      {plot ? (
        <svg width={width} height={height}>
          {[ESCALATE_PCT, 100].map((p) => (
            <line key={p} className="ladder-rule" data-at={p} x1={plot.at(p)} x2={plot.at(p)} y1={0} y2={plot.room} />
          ))}
          <line className="ladder-base" x1={0} x2={width} y1={plot.room + 0.5} y2={plot.room + 0.5} />
          {plot.marks.map(({ c, x, y }) => {
            const pct = c.limitUtilPct;
            return (
              <rect
                key={c.clientId}
                className="ladder-mark"
                data-tone={pct >= 100 ? 'stale' : pct >= ESCALATE_PCT ? 'warn' : undefined}
                data-focus={c.clientId === focus}
                data-beside={c.clientId === also}
                data-story={STORY_CLIENTS.includes(c.clientId)}
                x={x}
                y={y}
                width={plot.cell}
                height={plot.cell}
                onClick={() => onClient(c.clientId)}
              >
                <title>{`${c.clientId} / ${pct.toFixed(1)}% of limit`}</title>
              </rect>
            );
          })}
          {plot.flags.map((f) => {
            const cx = Math.min(width - FLAG_W / 2 - 1, Math.max(FLAG_W / 2 + 1, f.x));
            return (
              <g key={f.id} className="ladder-flag" data-focus={f.id === focus}>
                <line x1={f.x} x2={f.x} y1={Math.min(f.y, f.top)} y2={f.top} />
                <rect x={cx - FLAG_W / 2} y={f.y - FLAG_H / 2} width={FLAG_W} height={FLAG_H} rx={3} />
                <text x={cx} y={f.y} textAnchor="middle" dominantBaseline="central">{f.id}</text>
              </g>
            );
          })}
          <text className="ladder-tick" x={0} y={height - 3}>{plot.lo}%</text>
          <text className="ladder-tick" data-at={ESCALATE_PCT} x={plot.at(ESCALATE_PCT)} y={height - 3} textAnchor="middle">{ESCALATE_PCT}%</text>
          <text className="ladder-tick" x={plot.at(100)} y={height - 3} textAnchor="middle">limit</text>
        </svg>
      ) : null}
    </div>
  );
}
