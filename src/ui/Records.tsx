import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { DeskSnapshot, Position } from '../data/types';
import { age, baseTime, freshness } from './format';
import { Panel, type Tour } from './Tour';
import { useNow } from './useNow';
import { Out, useConsole } from './console';

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * The governed records as they land in positions, newest first. A new row opens its own
 * space and flashes once, the way a blotter marks a print; rows already on screen only move.
 */
export function Records({
  snapshot, tour, onTrace, handle, beside = null,
}: {
  snapshot: DeskSnapshot;
  tour: Tour;
  onTrace?(p: Position): void;
  /** The drag handle on this panel's edge. */
  handle?: ReactNode;
  /** A second client on screen beside the followed one: its extract is listed too, first. */
  beside?: DeskSnapshot | null;
}) {
  const now = useNow();
  const c = useConsole();
  const s = snapshot;
  const live = s.mode === 'streamhouse';
  const base = live ? baseTime(s, now) : s.wallClock;
  // The newest records across the whole book, so the tape moves as the book trades. One
  // client's own records would sit still for as long as that client did.
  const own = live && s.tape.length ? s.tape : s.recent;
  // Where two clients are on screen, the nightly file's rows for both, in the order they stand.
  const both = !live && beside && beside.mode === 'before';
  const rows = (both ? [...beside.recent, ...own] : own).slice(0, 10);
  // Each row's age is measured against the clock of the read it came from, so two rows written
  // at the same moment never show ages a minute apart.
  const baseOf = (i: number) => (both && i < beside.recent.length ? beside.wallClock : base);

  return (
    <Panel
      id="records"
      tour={tour}
      className="records"
      title={live ? 'Governed records' : 'Nightly extract'}
      meta={
        live ? (
          <>
            <Out href={c?.topic('positions')} title="The positions topic's records, in the console">positions</Out> / newest across the book /
            click a row to trace it
          </>
        ) : (
          'position file / written at the close'
        )
      }
    >
      {handle}
      <div className="table tape" role="table">
        <div className="tr th" role="row">
          <span role="columnheader">Event time</span>
          <span role="columnheader">Client</span>
          <span role="columnheader">Symbol</span>
          <span role="columnheader" className="r">Qty</span>
          <span role="columnheader" className="r">Price</span>
          <span role="columnheader">Source</span>
          <span role="columnheader" className="r">Age</span>
        </div>
        <AnimatePresence initial={false}>
          {rows.map((r, i) => {
            const a = Math.max(0, baseOf(i) - r.eventTime);
            const t = new Date(r.eventTime);
            return (
              <motion.div
                layout="position"
                role="row"
                key={`${r.clientId}-${r.eventTime}-${r.quantity}`}
                className="tr"
                data-traceable={!!onTrace}
                onClick={onTrace ? () => onTrace(r) : undefined}
                title={onTrace ? 'Trace this record through Kafka and Flink' : undefined}
                initial={{ opacity: 0, height: 0, backgroundColor: 'rgba(231,234,238,0.10)' }}
                animate={{ opacity: 1, height: 30, backgroundColor: 'rgba(231,234,238,0)' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.5, ease: EASE, backgroundColor: { duration: 1.6 } }}
              >
                <span className="mono dim">{t.toISOString().slice(11, 19)}</span>
                <span className="mono">{r.clientId}</span>
                <span className="mono">{r.symbol}</span>
                <span className="mono r">{r.quantity > 0 ? `+${r.quantity}` : r.quantity}</span>
                <span className="mono r">{r.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span className="mono dim">{r.source}</span>
                <span className="mono r age" data-tone={live ? (freshness(a) === 'fresh' ? 'fresh' : undefined) : 'stale'}>{age(a)}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </Panel>
  );
}
