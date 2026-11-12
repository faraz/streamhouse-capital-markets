import { useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';

const EASE = [0.16, 1, 0.3, 1] as const;
/** How long the route stays on the desk, and the beat between one stop and the next. */
const HOLD_MS = 16_000;
const STEP_S = 0.45;

interface Stop {
  x: number;
  y: number;
  says: string;
}

/** Where a fill shows up on the desk, in the order it gets there. */
const STOPS: Array<{ find: string; says: string; at: (r: DOMRect) => [number, number] }> = [
  { find: '.flow-node', says: 'Flink commits the fill', at: (r) => [r.left - 13, r.top + r.height / 2] },
  { find: '.fig-v', says: 'the figure moves', at: (r) => [r.left - 12, r.top + r.height / 2] },
  { find: '.book-table .tr[data-selected="true"]', says: 'the book re-ranks', at: (r) => [r.left + 3, r.top + r.height / 2] },
  { find: '.alert', says: 'the risk agent escalates', at: (r) => [r.left, r.top + 16] },
];

/**
 * One fill's route across the desk. When a fill lands, each place it changes is numbered in
 * the order it gets there, one after another, with the same numbers spelled out once at the
 * foot: cause and effect across four panels, which the panels cannot show on their own. A
 * line joining them was tried and cut through every table on the way. The stops appear in
 * turn, stay long enough to be read aloud, and go.
 */
export function Itinerary({ tick }: { tick: number }) {
  const svg = useRef<SVGSVGElement>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [gone, setGone] = useState(false);

  useLayoutEffect(() => {
    const stage = svg.current?.parentElement;
    if (!stage) return;
    const measure = () => {
      const box = stage.getBoundingClientRect();
      const found: Stop[] = [];
      for (const stop of STOPS) {
        const r = stage.querySelector(stop.find)?.getBoundingClientRect();
        // A panel scrolled out of the column, or an alert that has not been written yet.
        if (!r || !r.width || r.top < box.top || r.bottom > box.bottom) continue;
        const [x, y] = stop.at(r);
        found.push({ x: Math.max(10, x - box.left), y: y - box.top, says: stop.says });
      }
      setStops(found);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [tick]);

  useLayoutEffect(() => {
    const id = window.setTimeout(() => setGone(true), HOLD_MS);
    return () => clearTimeout(id);
  }, []);

  if (stops.length < 2) return <svg ref={svg} className="route" aria-hidden="true" />;
  return (
    <>
      <motion.svg
        ref={svg}
        className="route"
        aria-hidden="true"
        initial={false}
        animate={{ opacity: gone ? 0 : 1 }}
        transition={{ duration: 0.6, ease: EASE }}
      >
        {stops.map((s, i) => (
          <motion.g
            key={s.says}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, delay: i * STEP_S, ease: EASE }}
            style={{ transformOrigin: `${s.x}px ${s.y}px` }}
          >
            <circle className="route-stop" cx={s.x} cy={s.y} r={9} />
            <text className="route-n" x={s.x} y={s.y} textAnchor="middle" dominantBaseline="central">
              {i + 1}
            </text>
          </motion.g>
        ))}
      </motion.svg>
      <motion.ol
        className="route-key"
        aria-label="Where the fill went"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: gone ? 0 : 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
      >
        {stops.map((s, i) => (
          <li key={s.says}>
            <b>{i + 1}</b>
            {s.says}
          </li>
        ))}
      </motion.ol>
    </>
  );
}
