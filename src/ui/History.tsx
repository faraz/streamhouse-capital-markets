import { useEffect, useState } from 'react';
import type { DeskSnapshot } from '../data/types';
import { ESCALATE_PCT, age, tableAsOf } from './format';
import { useSize } from './useSize';

interface Sample {
  t: number;
  /** What the served table said, as a share of the limit. */
  pct: number;
  /** What was true at that instant. The same thing in a streamhouse; not in today's world. */
  truth: number;
  live: boolean;
  /** Whether this read was the first to carry a new Flink commit. */
  commit: boolean;
}

/** How much of the session the chart keeps, and the least it ever spans. */
const WINDOW_MS = 15 * 60_000;
const MIN_SPAN_MS = 20_000;
const KEEP = 900;

/**
 * What each client's figure has done since this screen was opened, kept outside the
 * component so following another client and coming back does not forget it.
 */
const sessions = new Map<string, { samples: Sample[]; asOf: number }>();

function record(s: DeskSnapshot): Sample[] {
  const id = s.served.clientId;
  const session = sessions.get(id) ?? { samples: [], asOf: 0 };
  sessions.set(id, session);
  const live = s.mode === 'streamhouse';
  const asOf = live ? tableAsOf(s) : 0;
  const last = session.samples.at(-1);
  const t = Date.now();
  const pct = s.served.limitUtilPct;
  const truth = (s.trueExposureUsd / s.served.limitUsd) * 100;
  const commit = live && session.asOf !== 0 && asOf !== session.asOf;
  if (live) session.asOf = asOf;
  // One point per read that says something: a change, a commit, or enough time passing.
  if (last && !commit && last.live === live && last.pct === pct && last.truth === truth && t - last.t < 1900) return session.samples;
  session.samples.push({ t, pct, truth, live, commit });
  if (session.samples.length > KEEP) session.samples.splice(0, session.samples.length - KEEP);
  return session.samples;
}

/**
 * The last thing the screen read of a client in today's world: what the nightly copy said and
 * what was true at that moment. Null if it has not followed that client there this session.
 */
export function remembered(clientId: string): { pct: number; truth: number } | null {
  const sample = [...(sessions.get(clientId)?.samples ?? [])].reverse().find((p) => !p.live);
  return sample ? { pct: sample.pct, truth: sample.truth } : null;
}

const PAD = { l: 0, r: 84, t: 14, b: 6 };

/**
 * How far to move the copy's label away from the true figure's so the two never overlap, as a
 * signed distance for the copy (the true figure's label takes the opposite). The copy can sit
 * either side: below what was true for a breach nobody saw, above it for a false block.
 */
function apartBy(copyY: number, trueY: number): number {
  const push = Math.max(0, 7 - Math.abs(copyY - trueY) / 2);
  return copyY >= trueY ? push : -push;
}

/**
 * The limit instrument: the figure as a share of its limit, over the session, with the line
 * where the agent escalates and the limit itself ruled across it. Where a bar would show
 * only this instant, this shows how the figure got here. It is drawn as steps because the
 * served table only changes when Flink commits, and each commit is ticked along the foot, so
 * a step in the figure can be seen to land on one. In today's world the nightly copy is a
 * flat line and what was really true runs apart from it: the space between them is the
 * staleness, drawn as distance.
 */
export function History({ snapshot }: { snapshot: DeskSnapshot }) {
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const [samples, setSamples] = useState<Sample[]>([]);
  useEffect(() => {
    setSamples([...record(snapshot)]);
  }, [snapshot]);

  const now = samples.at(-1)?.t ?? 0;
  const shown = samples.filter((p) => now - p.t <= WINDOW_MS);
  const first = shown[0];
  const last = shown.at(-1);
  const span = first ? Math.max(MIN_SPAN_MS, now - first.t) : MIN_SPAN_MS;
  const apart = !!last && !last.live;

  const tone = last && last.live ? (last.pct >= 100 ? 'stale' : last.pct >= ESCALATE_PCT ? 'warn' : undefined) : undefined;
  let body = null;
  if (width && height && first && last) {
    const t0 = now - span;
    const values = shown.flatMap((p) => (p.live ? [p.pct] : [p.pct, p.truth]));
    const lo = Math.max(0, Math.floor((Math.min(...values, ESCALATE_PCT) - 6) / 5) * 5);
    const hi = Math.max(101, Math.ceil(Math.max(...values) + 2));
    const w = width - PAD.l - PAD.r;
    const h = height - PAD.t - PAD.b;
    const x = (t: number) => PAD.l + ((t - t0) / span) * w;
    const y = (p: number) => PAD.t + ((hi - p) / (hi - lo)) * h;
    const right = x(now);

    // Runs of one world at a time, each a stepped line held until the next read.
    const runs: Sample[][] = [];
    for (const p of shown) {
      const run = runs.at(-1);
      if (run && run[0]!.live === p.live) run.push(p);
      else runs.push([p]);
    }
    const stepped = (run: Sample[], value: (p: Sample) => number, until: number) => {
      let d = `M${x(run[0]!.t).toFixed(1)} ${y(value(run[0]!)).toFixed(1)}`;
      for (let i = 1; i < run.length; i++) d += `H${x(run[i]!.t).toFixed(1)}V${y(value(run[i]!)).toFixed(1)}`;
      return `${d}H${until.toFixed(1)}`;
    };
    const until = (i: number) => (runs[i + 1] ? x(runs[i + 1]![0]!.t) : right);

    body = (
      <svg width={width} height={height} aria-hidden="true">
        {[ESCALATE_PCT, 100].map((p) => (
          <g key={p}>
            <line className="hist-rule" data-at={p} x1={PAD.l} x2={right} y1={y(p)} y2={y(p)} />
            {/* One label at each end of its rule, so the two never sit on top of each other. */}
            <text className="hist-tick" data-at={p} x={p === 100 ? right : PAD.l} y={y(p) - 4} textAnchor={p === 100 ? 'end' : 'start'}>
              {p === 100 ? 'Limit' : `${p}% escalate`}
            </text>
          </g>
        ))}
        {runs.map((run, i) => {
          const end = until(i);
          if (run[0]!.live) return <path key={i} className="hist-line" data-tone={i === runs.length - 1 ? tone : undefined} d={stepped(run, (p) => p.pct, end)} />;
          // Today's world: the copy, what was true, and the distance between them.
          const top = stepped(run, (p) => p.truth, end);
          const back = [...run].reverse();
          let gap = `${top}V${y(run.at(-1)!.pct).toFixed(1)}`;
          for (const p of back) gap += `H${x(p.t).toFixed(1)}V${y(p.pct).toFixed(1)}`;
          return (
            <g key={i}>
              <path className="hist-gap" d={`${gap}Z`} />
              <path className="hist-line" data-world="copy" d={stepped(run, (p) => p.pct, end)} />
              <path className="hist-line" data-world="true" d={top} />
            </g>
          );
        })}
        {shown.filter((p) => p.commit).map((p) => (
          <line key={p.t} className="hist-commit" x1={x(p.t)} x2={x(p.t)} y1={height - PAD.b} y2={height} />
        ))}
        <circle className="hist-now" data-world={apart ? 'copy' : undefined} data-tone={tone} cx={right} cy={y(last.pct)} r={3} />
        <text className="hist-val" data-world={apart ? 'copy' : undefined} data-tone={tone} x={right + 8} y={y(last.pct) + (apart ? apartBy(y(last.pct), y(last.truth)) : 0)} dominantBaseline="central">
          {apart ? 'copy ' : ''}{last.pct.toFixed(1)}%
        </text>
        {apart ? (
          <>
            <circle className="hist-now" data-world="true" cx={right} cy={y(last.truth)} r={3} />
            <text className="hist-val" data-world="true" x={right + 8} y={y(last.truth) - apartBy(y(last.pct), y(last.truth))} dominantBaseline="central">
              live {last.truth.toFixed(1)}%
            </text>
          </>
        ) : null}
      </svg>
    );
  }

  const commits = shown.filter((p) => p.commit).length;
  return (
    <div className="hist" role="img" aria-label={last ? `${last.pct.toFixed(1)}% of limit used` : 'Limit used'}>
      <div className="hist-plot" ref={ref}>{body}</div>
      <div className="hist-foot">
        <span>{first ? `${age(span)} ago` : 'this session'}</span>
        <span className="hist-key">
          {apart ? (
            <>
              <i data-world="copy" /> the nightly copy <i data-world="true" /> what was true
            </>
          ) : (
            <>
              <i /> limit used, as served <b /> {commits ? `${commits} Flink ${commits === 1 ? 'commit' : 'commits'}` : 'a tick for each Flink commit'}
            </>
          )}
        </span>
        <span>now</span>
      </div>
    </div>
  );
}
