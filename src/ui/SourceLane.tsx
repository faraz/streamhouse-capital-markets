import { AnimatePresence, motion } from 'motion/react';
import type { DeskSnapshot } from '../data/types';
import { age } from './format';

/**
 * Six systems, six shapes, one record. The motion here is arrival: rows land in sequence
 * the first time, and a rejected record drops in beneath them. Nothing loops, because a
 * feed that pulses forever reads as decoration rather than as data moving.
 */
export function SourceLane({ snapshot }: { snapshot: DeskSnapshot }) {
  const s = snapshot;
  const live = s.mode === 'streamhouse';

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">Connect and Govern / six systems, six shapes, one record</span>
        <span className="lbl">{s.sources.length} sources / 1 schema</span>
      </div>

      <div className="norm">
        <div className="shapes">
          {s.sources.map((x, i) => (
            <motion.div
              key={x.name}
              className="shape"
              data-stalest={x.stalest}
              data-live={x.live}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.045, duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="shape-name">
                <span className="shape-n">{x.name}</span>
                <span className="shape-k">{x.shape}</span>
              </span>
              <span className="shape-raw">{x.raw}</span>
              <span className="shape-age num" data-tone={x.live ? 'live' : x.stalest ? 'stalest' : 'plain'}>
                {age(x.ageMs)}
              </span>
            </motion.div>
          ))}

          <AnimatePresence>
            {s.rejected ? (
              <motion.div
                key="rejected"
                className="shape"
                data-reject="true"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
              >
                <span className="shape-name">
                  <span className="shape-n">Rejected</span>
                  <span className="shape-k">Flink validation</span>
                </span>
                <span className="shape-raw">{s.rejected.raw}</span>
                <span className="shape-age num" data-tone="stalest">
                  {s.rejected.topic}
                </span>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <div className="chev" aria-hidden="true">
          <svg width="34" height="18" viewBox="0 0 34 18" fill="none">
            <path d="M1 9h27" stroke="currentColor" strokeWidth="1.4" />
            <path d="M26 3l6 6-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="lbl">Connect</span>
        </div>

        <RecordCard snapshot={s} live={live} />
      </div>

      <p className="panel-note">
        {live
          ? 'Connect turns whatever arrived into one fact with a key, a time and how stale its feed was. The book of record is read at source, so the stalest input is seconds old instead of a night old.'
          : `Without change data capture the book of record waits for tonight's extract, so the assembled answer is ${age(
              s.clocks.servedAgeMs,
            )} old before anyone queries it.`}
      </p>
    </section>
  );
}

/**
 * The record re-keys on its event time, so a new fact replaces the old one field by
 * field rather than the panel re-entering whole. The reveal reads as a record being
 * written, which is what it is.
 */
function RecordCard({ snapshot, live }: { snapshot: DeskSnapshot; live: boolean }) {
  const n = snapshot.normalized;
  const fields: Array<[string, string, string]> = [
    ['client_id', `"${n.clientId}"`, 's'],
    ['symbol', `"${n.symbol}"`, 's'],
    ['quantity', String(n.quantity), 'n2'],
    ['price', String(n.price), 'n2'],
    ['notional_usd', Math.round(n.notionalUsd).toLocaleString('en-US'), 'n2'],
    ['event_time', `"${new Date(n.eventTime).toISOString()}"`, 's'],
    ['source', `"${n.source}"`, 's'],
    ['ingest_lag_ms', String(n.ageMs), live ? 'n2' : 'bad'],
  ];

  return (
    <div className="record-wrap">
      <div className="record" key={n.eventTime}>
        {fields.map(([k, v, cls], i) => (
          <motion.div
            key={k}
            className="record-row"
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="k">{k}</span>
            <span className={cls}>{v}</span>
          </motion.div>
        ))}
      </div>

      <div className="gov">
        {(
          [
            ['Schema contract', 'true'],
            ['Flink validation / quantity', snapshot.rejected ? 'dlq' : 'true'],
            ['Lineage / last 10 minutes', 'true'],
            ['Governance Essentials', 'true'],
            [live ? 'Change data capture' : 'Nightly extract only', live ? 'true' : 'false'],
          ] as const
        ).map(([label, on]) => (
          <span className="chip" data-on={on} key={label}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
