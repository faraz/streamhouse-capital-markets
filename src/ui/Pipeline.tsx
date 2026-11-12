import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { DeskSnapshot } from '../data/types';
import { age, baseTime, freshness, tableAsOf } from './format';
import { AgeRuler } from './AgeRuler';
import { Extracts } from './Extracts';
import { FlowField, type Lane } from './gl/FlowField';
import { PILLARS } from './pillars';
import { Panel, type Tour } from './Tour';
import { useNow } from './useNow';
import { Out, useConsole } from './console';

const EASE = [0.16, 1, 0.3, 1] as const;
const LANE_TONE = { fresh: 0, warn: 0.5, stale: 1 } as const;
/** How long the bead runs along a lane before its record's trace opens. */
const FOLLOW_MS = 700;

interface Row {
  id: string;
  name: string;
  shape: string;
  /** What the right-hand figure says, and how it is toned. */
  figure: string;
  /** The same figure as a duration, for the age ruler. */
  ms: number;
  tone?: 'fresh' | 'warn' | 'stale';
  /** Producing records right now. */
  flowing: boolean;
  /** Whether there is a real record of this shape to follow. */
  traceable: boolean;
  stalest: boolean;
}

/**
 * The same six sources in both worlds. Today they are a pipeline: six extracts of six ages
 * that never meet. In a streamhouse each is a lane into Flink, under the five pillar names
 * the talk has just taught. Each row is level with its lane, and a lane only moves while
 * its source is really producing: the live trade feed flows, and a quiet source's row can be
 * clicked to follow the record it holds.
 */
export function Pipeline({
  snapshot, tour, rejectAt, fillAt, onTraceSource, onTraceShapes,
}: {
  snapshot: DeskSnapshot;
  tour: Tour;
  rejectAt: number | null;
  fillAt: number | null;
  /** Follow the newest governed record of one shaped source through Kafka and Flink. */
  onTraceSource?: (sourceId: string) => void;
  onTraceShapes?: () => void;
}) {
  const now = useNow();
  const c = useConsole();
  // Each pillar is also a section of the console, so its name opens that section.
  const pillarPage: Record<string, string> | null = c
    ? { Connect: c.connectors, Stream: c.topics, Process: c.statements, Govern: c.schemaRegistry, Query: c.lightning }
    : null;
  const s = snapshot;
  const live = s.mode === 'streamhouse';
  const [pulse, setPulse] = useState<{ lane: number; at: number } | null>(null);

  const shaped: Row[] = s.sources.map((x) => {
    const record = s.shapes.find((p) => p.source === x.id);
    const flowing = live && s.flowing.includes(x.id);
    if (!live) {
      const tone = x.stalest ? 'stale' : freshness(x.ageMs);
      return { id: x.id, name: x.name, shape: x.shape, figure: age(x.ageMs), ms: x.ageMs, tone, flowing: true, traceable: false, stalest: x.stalest };
    }
    // The lag its own Flink statement stamps on every record: a property of the feed, which a
    // streamhouse writes down rather than hides.
    const lag = record?.ingestLagMs ?? x.ageMs;
    return {
      id: x.id,
      name: x.name,
      shape: x.shape,
      figure: age(lag),
      ms: lag,
      tone: flowing ? 'fresh' : undefined,
      flowing,
      traceable: !!record,
      stalest: false,
    };
  });

  const tradesFlowing = live && s.flowing.includes('trade');
  // The newest record in positions, which is where the trade feed lands first.
  const tradeMs = Math.max(0, baseTime(s, now) - (s.tape[0]?.eventTime ?? tableAsOf(s)));
  // How old the answer is: how far the served table trails live, or the nightly copy's age.
  const answerMs = Math.max(0, live ? baseTime(s, now) - tableAsOf(s) : s.clocks.servedAgeMs);
  const rows: Row[] = live
    ? [
        {
          id: 'trade',
          name: 'Trade feed',
          shape: 'The book trading, live',
          figure: age(tradeMs),
          ms: tradeMs,
          tone: tradesFlowing ? 'fresh' : undefined,
          flowing: tradesFlowing,
          traceable: false,
          stalest: false,
        },
        ...shaped,
      ]
    : shaped;

  const lanes: Lane[] = rows.map((r) => ({
    tone: !live ? LANE_TONE[r.tone ?? 'warn'] : r.flowing ? 0 : 0.5,
    flow: r.flowing,
  }));

  const follow = (row: Row, lane: number) => {
    if (!row.traceable || !onTraceSource) return;
    setPulse({ lane, at: Date.now() });
    window.setTimeout(() => onTraceSource(row.id), FOLLOW_MS);
  };

  return (
    <Panel
      id="pipeline"
      tour={tour}
      className="pipeline"
      title={live ? 'Streamhouse' : 'Pipeline'}
      meta={
        live ? (
          <span className="pipe-meta">
            {c ? (
              <Out href={c.lineage('client_exposure')} title="Stream lineage for client_exposure, in the console">
                Lineage
              </Out>
            ) : null}
            {onTraceShapes && s.shapes.length ? (
              <button type="button" className="btn btn-trace" onClick={onTraceShapes}>
                Trace the six shapes
              </button>
            ) : null}
          </span>
        ) : (
          '6 systems / nightly extracts / one copy, no age'
        )
      }
    >
      <div className="flow-body">
      {live ? (
        <ol className="pillars" aria-label="The five pillars">
          {PILLARS.map((p) => (
            <li key={p.id} className="pillar" data-on={tour.spotlight && tour.beat.pillars?.includes(p.id)}>
              <strong>
                <Out href={pillarPage?.[p.id]}>{p.id}</Out>
              </strong>
              <span>{p.does}</span>
            </li>
          ))}
        </ol>
      ) : null}

      <div className="flow">
        <ol className="sources" data-live={live}>
          {rows.map((r, i) => (
            <li key={r.id}>
              <button
                type="button"
                className="source"
                data-stalest={r.stalest}
                data-flowing={live ? r.flowing : undefined}
                disabled={!r.traceable}
                onClick={() => follow(r, i)}
                title={
                  r.traceable
                    ? `Follow the ${r.name.toLowerCase()} record through Kafka and Flink`
                    : live && r.id === 'trade'
                      ? 'The newest trade record in positions'
                      : undefined
                }
              >
                <span className="source-name">
                  {live ? <i className="source-dot" aria-hidden="true" /> : null}
                  <span className="source-label">{r.name}</span>
                </span>
                <span className="source-shape">{r.shape}</span>
                <span className="source-age num" data-tone={r.tone}>
                  {live ? <em>{r.id === 'trade' ? 'newest' : 'feed lag'}</em> : null}
                  {r.figure}
                </span>
              </button>
            </li>
          ))}
        </ol>

        {live ? (
          <div className="flow-stage">
            <FlowField converged lanes={lanes} rejectAt={rejectAt} fillAt={fillAt} pulse={pulse} />
            <span className="flow-tag flow-node" data-live>
              <Out href={c?.statements} title="The running statements, in Flink management">Flink SQL</Out>
            </span>
            <span className="flow-tag flow-out" data-live>
              <Out href={c?.materialized('client_exposure')} title="The materialized table, in the console">client_exposure</Out>
            </span>
            <span className="flow-tag flow-dlq" data-hit={!!s.rejected}>
              <Out href={c?.topic('positions_dlq')} title="The dead letter topic's records, in the console">
                {s.rejected ? 'positions_dlq / new record' : 'positions_dlq'}
              </Out>
            </span>
          </div>
        ) : (
          // Today nothing flows, so nothing is drawn flowing: six extracts, each as old as it
          // is, and the one copy made from them.
          <div className="flow-stage flow-stage--today">
            <Extracts rows={rows.map((r) => ({ id: r.id, name: r.name, ms: r.ms, tone: r.tone, stalest: r.stalest }))} copyMs={answerMs} />
          </div>
        )}
      </div>

      {/* In today's world the stage above is already a chart of ages, on this same scale. */}
      {live ? <AgeRuler sources={rows.map((r) => ({ id: r.id, name: r.name, ms: r.ms }))} answerMs={answerMs} live /> : null}

      <AnimatePresence>
        {s.rejected ? (
          <motion.div
            className="reject"
            initial={{ opacity: 0, height: 0, y: -6 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.45, ease: EASE }}
          >
            <span className="reject-tag">Turned away by the Flink guard</span>
            <code className="reject-raw">{s.rejected.raw}</code>
            <span className="reject-why">{s.rejected.reason}</span>
          </motion.div>
        ) : null}
      </AnimatePresence>
      </div>
    </Panel>
  );
}
