import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import type { DeskSnapshot } from '../data/types';
import { ESCALATE_PCT, age, baseTime } from './format';
import { LADDER_CLIENTS, Ladder } from './Ladder';
import { Panel, type Tour } from './Tour';
import { useNow } from './useNow';
import { Out, useConsole } from './console';

const ROWS = 12;
const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * The book, ranked by limit used from the same served table. Rows carry a layout
 * animation, so when a fill reorders the sort a client visibly moves rather than
 * teleporting; that movement is the only reason the list animates at all.
 */
export function Book({
  snapshot, tour, onClient, handle, also = null,
}: {
  snapshot: DeskSnapshot;
  tour: Tour;
  onClient(c: string): void;
  /** The drag handle on this panel's edge. */
  handle?: ReactNode;
  /** A second client on screen beside the followed one, marked here too. */
  also?: string | null;
}) {
  const now = useNow();
  const c = useConsole();
  const s = snapshot;
  const live = s.mode === 'streamhouse';
  const base = live ? baseTime(s, now) : s.wallClock;
  const near = s.book.filter((c) => c.limitUtilPct >= ESCALATE_PCT).length;
  const focus = s.served.clientId;

  return (
    <Panel id="book" tour={tour} className="book" title="Book" meta={<><Out href={c?.lightningTable('client_exposure')} title="This Lightning Table, in the console">client_exposure</Out> / 4,000 clients</>}>
      {handle}
      <div className="heat-wrap">
        <Ladder book={s.book} focus={focus} also={also} onClient={onClient} />
        <div className="heat-legend">
          <span>Top {Math.min(LADDER_CLIENTS, s.book.length)} by limit used</span>
          <span data-tone={near ? 'warn' : undefined}>
            {near} above {ESCALATE_PCT}%
          </span>
        </div>
      </div>

      <div className="table book-table" role="table" aria-label="Clients nearest their limit">
        <div className="tr th" role="row">
          <span role="columnheader">Client</span>
          <span role="columnheader">Limit used</span>
          <span role="columnheader" className="r">%</span>
          {/* In the streamhouse this is when the figure last moved, which is not staleness. */}
          <span role="columnheader" className="r">{live ? 'Changed' : 'Age'}</span>
        </div>
        {s.book.slice(0, ROWS).map((c) => {
          const pct = c.limitUtilPct;
          const tone = pct >= 100 ? 'stale' : pct >= ESCALATE_PCT ? 'warn' : undefined;
          const a = Math.max(0, base - c.asOf);
          return (
            <motion.button
              layout="position"
              type="button"
              role="row"
              key={c.clientId}
              className="tr"
              data-selected={c.clientId === focus}
              data-beside={c.clientId === also}
              onClick={() => onClient(c.clientId)}
              transition={{ layout: { duration: 0.6, ease: EASE } }}
            >
              <span className="mono">{c.clientId}</span>
              <span className="bar-track">
                <motion.span
                  className="bar-fill"
                  data-tone={tone}
                  initial={false}
                  animate={{ scaleX: Math.min(100, pct) / 100 }}
                  transition={{ duration: 0.7, ease: EASE }}
                />
              </span>
              <span className="r num" data-tone={tone}>{pct.toFixed(1)}</span>
              <span className="r num age" data-tone={live ? undefined : 'stale'}>{age(a)}</span>
            </motion.button>
          );
        })}
      </div>
    </Panel>
  );
}
