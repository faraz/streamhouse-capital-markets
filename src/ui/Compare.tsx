import { useEffect, useRef } from 'react';
import { animate, motion } from 'motion/react';
import { BREACH_CLOSE_PCT, FALSE_BLOCK, FOLLOWED } from '../data/book';
import type { DeskSnapshot } from '../data/types';
import { ESCALATE_PCT } from './format';
import { remembered } from './History';

const EASE = [0.16, 1, 0.3, 1] as const;
const TRAVEL = [0.77, 0, 0.175, 1] as const;
/** When the true figure leaves the copy's mark, and how long it takes to reach its own. */
const LEAVES_S = 0.7;
const TRAVEL_S = 1.1;

/** Both scales run over the same stretch of the limit, so the two cards can be read against each other. */
const LO = 50;
const HI = 110;
const at = (pct: number) => Math.min(100, Math.max(0, ((pct - LO) / (HI - LO)) * 100));

interface Side {
  id: string;
  verdict: string;
  cost: string;
  copy: number;
  /** What was true, or null where it has not been read this session. */
  truth: number | null;
  /** Where the figure went after that, if the story follows it there. */
  later?: { pct: number; label: string };
}
const tenth = (n: number) => Math.round(n * 10) / 10;

/**
 * The true figure, counted from the copy's figure to its own while its mark makes the same
 * journey along the scale below: the number and the mark are one thing, so they move as one.
 * A later read that differs settles to the new figure without replaying the journey.
 */
function Travels({ from, to }: { from: number; to: number }) {
  const node = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(null);
  useEffect(() => {
    const el = node.current;
    if (!el) return;
    const first = shown.current === null;
    const run = animate(shown.current ?? from, to, {
      duration: first ? TRAVEL_S : 0.4,
      delay: first ? LEAVES_S : 0,
      ease: first ? TRAVEL : EASE,
      onUpdate: (v) => {
        shown.current = v;
        el.textContent = `${v.toFixed(1)}%`;
      },
    });
    return () => run.stop();
  }, [from, to]);
  return (
    <span ref={node} className="cmp-v num">
      {from.toFixed(1)}%
    </span>
  );
}

/** Which side of its mark a label sits, so one near an end of the scale stays on the card. */
const edge = (pct: number) => (at(pct) > 80 ? 'end' : at(pct) < 12 ? 'start' : undefined);

/**
 * One stale copy, wrong in both directions. The followed client stays on screen and the
 * other joins it, on the same scale: the copy's mark stays where the copy put it, and the
 * true figure leaves it for where the client really was. On one card it travels toward the
 * limit, on the other away from it, at the same moment, which is the whole point of the step:
 * a number with no age misses a breach and refuses a good trade for the same reason.
 */
export function Compare({ snapshot, beside }: { snapshot: DeskSnapshot; beside: DeskSnapshot | null }) {
  const s = snapshot;
  // The followed client is read live beside this one for as long as the step is on screen.
  // Until that first read is back, the card shows what the screen last read while following
  // it, which on the way here from the step before is seconds old.
  const read = beside && beside.mode === 'before' && beside.served.clientId === FOLLOWED
    ? { pct: beside.served.limitUtilPct, truth: (beside.trueExposureUsd / beside.served.limitUsd) * 100 }
    : null;
  const before = read ?? remembered(FOLLOWED);
  const row = s.book.find((c) => c.clientId === FOLLOWED);
  const sides: Side[] = [
    {
      id: FOLLOWED,
      verdict: 'A breach nobody saw',
      cost: `It read low, so nobody was told. By the next morning the client was at ${BREACH_CLOSE_PCT}% of its limit.`,
      copy: before?.pct ?? row?.limitUtilPct ?? 0,
      truth: before?.truth ?? null,
      later: { pct: BREACH_CLOSE_PCT, label: 'next morning' },
    },
    {
      id: FALSE_BLOCK,
      verdict: 'A good trade refused',
      cost: 'It read high, so the desk refused a trade the client had room for.',
      copy: s.served.limitUtilPct,
      truth: (s.trueExposureUsd / s.served.limitUsd) * 100,
    },
  ];

  return (
    <div className="cmp">
      {sides.map((side, i) => {
        const { copy, truth } = side;
        const low = truth !== null && truth > copy;
        const from = truth === null ? copy : Math.min(copy, truth);
        const to = truth === null ? copy : Math.max(copy, truth);
        return (
          <motion.article
            key={side.id}
            className="cmp-card"
            data-reads={low ? 'low' : 'high'}
            initial={{ opacity: 0, x: i ? 28 : 0 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: i * 0.12, ease: EASE }}
          >
            <header className="cmp-head">
              <span className="cmp-who">Client</span>
              <span className="cmp-id num">{side.id}</span>
              <h3 className="cmp-verdict">{side.verdict}</h3>
            </header>

            <div className="cmp-figs">
              <div className="cmp-fig" data-world="copy">
                <span className="fig-k">The copy said</span>
                <span className="cmp-v num">{copy.toFixed(1)}%</span>
              </div>
              {truth !== null ? (
                <>
                  {/* No arrow between the two figures: the scale below says which way, and an
                      arrow here pointed right on both cards while the scale pointed both ways. */}
                  <motion.div
                    className="cmp-fig"
                    data-world="true"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3, delay: LEAVES_S, ease: EASE }}
                  >
                    <span className="fig-k">It was really</span>
                    <Travels from={copy} to={truth} />
                  </motion.div>
                  <motion.span
                    className="cmp-off"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: LEAVES_S + TRAVEL_S, ease: EASE }}
                  >
                    {/* From the figures as shown, so the three numbers on the card always agree. */}
                    <b className="num">{Math.abs(tenth(truth) - tenth(copy)).toFixed(1)}</b> points too {low ? 'low' : 'high'}
                  </motion.span>
                </>
              ) : null}
            </div>

            <div
              className="cmp-scale"
              role="img"
              aria-label={
                truth === null
                  ? `Client ${side.id}: the copy said ${copy.toFixed(1)}% of limit`
                  : `Client ${side.id}: the copy said ${copy.toFixed(1)}% of limit, it was really ${truth.toFixed(1)}%`
              }
            >
              <div className="cmp-track">
                {truth !== null ? (
                  <motion.span
                    className="cmp-band"
                    // The distance grows out of the copy's mark, toward wherever the truth was.
                    data-toward={low ? 'limit' : 'room'}
                    style={{ left: `${at(from)}%`, width: `${at(to) - at(from)}%`, originX: low ? 0 : 1 }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: TRAVEL_S, delay: LEAVES_S, ease: TRAVEL }}
                  />
                ) : null}
                <span className="cmp-rule" data-at="85" style={{ left: `${at(ESCALATE_PCT)}%` }}>
                  <em>{ESCALATE_PCT}% escalate</em>
                </span>
                <span className="cmp-rule" data-at="100" style={{ left: `${at(100)}%` }}>
                  <em>Limit</em>
                </span>
                <span className="cmp-mark" data-world="copy" data-edge={edge(copy)} style={{ left: `${at(copy)}%` }}>
                  <em>copy</em>
                </span>
                {/* The scale starts at half the limit, and says so. */}
                <span className="cmp-from num">{LO}%</span>
                {truth !== null && side.later ? (
                  <>
                    {/* Where it went next: the climb the copy never showed, past the limit. */}
                    <motion.span
                      className="cmp-climb"
                      style={{ left: `${at(truth)}%`, width: `${at(side.later.pct) - at(truth)}%`, originX: 0 }}
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 0.8, delay: LEAVES_S + TRAVEL_S + 0.2, ease: TRAVEL }}
                    />
                    <motion.span
                      className="cmp-mark"
                      data-world="later"
                      data-edge="end"
                      style={{ left: `${at(side.later.pct)}%` }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3, delay: LEAVES_S + TRAVEL_S + 0.9, ease: EASE }}
                    >
                      <em>
                        {side.later.label} <b className="num">{side.later.pct}%</b>
                      </em>
                    </motion.span>
                  </>
                ) : null}
                {truth !== null ? (
                  <motion.span
                    className="cmp-mark"
                    data-world="true"
                    initial={{ left: `${at(copy)}%`, opacity: 0 }}
                    animate={{ left: `${at(truth)}%`, opacity: 1 }}
                    transition={{ left: { duration: TRAVEL_S, delay: LEAVES_S, ease: TRAVEL }, opacity: { duration: 0.2, delay: LEAVES_S } }}
                  >
                    <em>really</em>
                  </motion.span>
                ) : null}
              </div>
            </div>

            <p className="cmp-cost">{side.cost}</p>
          </motion.article>
        );
      })}
    </div>
  );
}
