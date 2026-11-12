import type React from 'react';
import { age } from './format';

/** The axis runs from half a second to two days, on a log scale: ages here span five decades. */
const LO = Math.log10(500);
const HI = Math.log10(2 * 86_400_000);
export const at = (ms: number) => Math.min(1, Math.max(0, (Math.log10(Math.max(500, ms)) - LO) / (HI - LO))) * 100;
export const TICKS = [
  { ms: 1_000, label: '1s' },
  { ms: 60_000, label: '1m' },
  { ms: 3_600_000, label: '1h' },
  { ms: 86_400_000, label: '1d' },
];

export interface Aged {
  id: string;
  name: string;
  ms: number;
}

/**
 * One ruler for how old everything is. Each source sits where its feed's lag puts it, and
 * the answer sits where the served figure does. In today's world the answer can be no
 * fresher than its stalest input, so it sits at the far end with it. In a streamhouse the
 * sources stay where they were, each lag written on its records, and the answer moves to the
 * near end: the whole argument, as one distance.
 */
export function AgeRuler({ sources, answerMs, live }: { sources: Aged[]; answerMs: number; live: boolean }) {
  const x = at(answerMs);
  const side = x > 55 ? 'left' : 'right';
  return (
    <div className="ruler" data-live={live} role="img" aria-label={`The answer is ${age(answerMs)} old`}>
      <span className="ruler-cap">How old</span>
      <div className="ruler-axis">
        {TICKS.map((t) => (
          <span key={t.label} className="ruler-tick" style={{ left: `${at(t.ms)}%` }}>
            <em>{t.label}</em>
          </span>
        ))}
        {sources.map((s) => (
          <i key={s.id} className="ruler-src" style={{ left: `${at(s.ms)}%` }} title={`${s.name} / ${age(s.ms)}`} />
        ))}
        <span className="ruler-answer" data-side={side} style={{ '--x': `${x}%` } as React.CSSProperties}>
          <b />
          <span>
            the answer / {live ? `current to ${age(answerMs)} ago` : `as old as its stalest input, ${age(answerMs)}`}
          </span>
        </span>
      </div>
    </div>
  );
}
