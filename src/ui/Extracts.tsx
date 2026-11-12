import { motion } from 'motion/react';
import DecryptedText from '../reactbits/DecryptedText';
import PixelCard from '../reactbits/PixelCard';
import { TICKS, at } from './AgeRuler';
import { PALETTE, age } from './format';

const EASE = [0.16, 1, 0.3, 1] as const;

export interface Extract {
  id: string;
  name: string;
  /** How long ago this system's data was last extracted. */
  ms: number;
  tone?: 'fresh' | 'warn' | 'stale';
  stalest: boolean;
}

/**
 * Today's world, drawn as what it is: six extracts of six ages and one copy made from them.
 * Each system gets a bar as long as its data is old, all on one scale, so the eye finds the
 * longest at once. A rule stands at its end, and the nightly copy sits against that rule,
 * because an answer built from six extracts can be no fresher than the stalest of them. The
 * bars are blocks, like a batch: nothing here flows.
 */
export function Extracts({ rows, copyMs }: { rows: Extract[]; copyMs: number }) {
  const worst = rows.reduce((a, b) => (b.ms > a.ms ? b : a), rows[0]!);
  const settled = 0.15 + rows.length * 0.07 + 0.7;
  return (
    <div className="ext" role="img" aria-label={`Six extracts, the stalest ${age(worst.ms)} old; the nightly copy is ${age(copyMs)} old`}>
      <div className="ext-plot">
        {TICKS.map((t) => (
          <span key={t.label} className="ext-tick" style={{ left: `${at(t.ms)}%` }}>
            <em className="num">{t.label}</em>
          </span>
        ))}
        <motion.span
          className="ext-rule"
          style={{ left: `${at(worst.ms)}%` }}
          initial={{ opacity: 0, scaleY: 0 }}
          animate={{ opacity: 1, scaleY: 1 }}
          transition={{ duration: 0.5, delay: settled, ease: EASE }}
        >
          <em>the copy is no fresher than this</em>
        </motion.span>
        <div className="ext-rows">
          {rows.map((r, i) => (
            <div key={r.id} className="ext-row">
              <motion.span
                className="ext-bar"
                data-tone={r.tone}
                data-stalest={r.stalest}
                style={{ width: `${Math.max(1.4, at(r.ms))}%` }}
                initial={{ clipPath: 'inset(0 100% 0 0)' }}
                animate={{ clipPath: 'inset(0 0% 0 0)' }}
                transition={{ duration: 0.8, delay: 0.15 + i * 0.07, ease: EASE }}
              />
            </div>
          ))}
        </div>
        {/* Said beside the scale, not on it: the ticks need the whole of their row. */}
        <span className="ext-axis">how old / log scale</span>
      </div>

      <PixelCard
        className="ext-copy"
        colors={[PALETTE.stale, '#7A2F33', '#3B1D20']}
        pixelSize={3}
        gap={7}
        speed={0.28}
        opacity={0.32}
        glow={0}
        spotlight={0}
        radius={8}
        trigger="always"
        clickPulse={false}
        intro
        introDelay={settled * 1000}
        noFocus
        theme="dark"
      >
        <div className="ext-copy-in">
          <span className="ext-tag">nightly_copy</span>
          <span className="ext-age num">
            <DecryptedText key={age(copyMs)} text={age(copyMs)} animateOn="view" sequential speed={55} revealDirection="start" />
          </span>
          <span className="ext-as">as old as its stalest input</span>
          <p className="ext-why">No join. Six extracts of six ages, loaded once a night, with no age on the answer.</p>
        </div>
      </PixelCard>
    </div>
  );
}
