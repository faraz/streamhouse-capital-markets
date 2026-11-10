import { AnimatePresence, motion } from 'motion/react';
import CountUp from '../reactbits/CountUp';
import ElectricBorder from '../reactbits/ElectricBorder';
import type { DeskSnapshot, EscalationAuthor } from '../data/types';
import { PALETTE, age, freshness, money } from './format';

/**
 * Escalations arrive; they do not pulse. A breach gets the electric border, once, because
 * it is the only thing on the screen that means someone has to act. Spending that device
 * anywhere else would spend its meaning.
 *
 * Every row names who wrote it, coloured as the origin badge is: the risk agent is live
 * Confluent, the simulator is the fallback, and the threshold check is the Worker standing
 * in. Rows are the same shape whoever wrote them, so a fallback changes only the label.
 */
const AUTHOR: Record<EscalationAuthor, string> = {
  'risk-agent': 'Risk agent',
  'threshold-check': 'Threshold check',
  simulator: 'Simulator',
};

export function Escalations({ snapshot }: { snapshot: DeskSnapshot }) {
  const rows = snapshot.escalations.slice(0, 4);
  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">Escalations</span>
        <span className="lbl">Watching every client</span>
      </div>

      <div className="esc">
        {rows.length === 0 ? (
          <div className="esc-none">No client has just crossed 85% of its limit.</div>
        ) : (
          <AnimatePresence initial={false}>
            {rows.map((e, i) => {
              const row = (
                <motion.div
                  className="esc-row"
                  data-tone={e.tone}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                >
                  <span className="esc-top">
                    <span className="esc-title">{e.title}</span>
                    <span className="esc-by" data-author={e.author}>
                      {AUTHOR[e.author]}
                    </span>
                  </span>
                  <span className="esc-what">{e.what}</span>
                </motion.div>
              );
              return e.tone === 'bad' ? (
                <ElectricBorder
                  key={`${e.at}-${i}`}
                  color={PALETTE.alert}
                  glowColor={PALETTE.alert}
                  thickness={1}
                  speed={0.6}
                  chaos={0.35}
                  glow={0.5}
                  borderRadius={5}
                  theme="dark"
                >
                  {row}
                </ElectricBorder>
              ) : (
                <div key={`${e.at}-${i}`}>{row}</div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      <p className="panel-note">The risk agent never touches an order. It gets a person there in time.</p>
    </section>
  );
}

/**
 * The three clocks, and the figure. The exposure counts to its new value when a fill
 * lands, which is the one number on the screen whose change is the story; the ages tick
 * plainly, because an age that animated would be lying about what it measures.
 */
export function Clocks({ snapshot }: { snapshot: DeskSnapshot }) {
  const s = snapshot;
  const live = s.mode === 'streamhouse';
  const a1 = s.clocks.servedAgeMs;
  const a3 = s.clocks.openTableAgeMs;
  const pct = s.served.limitUtilPct;
  const truePct = (s.trueExposureUsd / s.served.limitUsd) * 100;

  const rows = [
    { n: 'Whoever asked', k: live ? 'Lightning Table / SQL and MCP' : 'Overnight copy', a: a1 },
    { n: 'The risk officer', k: live ? 'Same table, whole book' : 'Database fed overnight', a: a1 },
    {
      n: 'Reporting and audit',
      k: live ? (a3 > 0 ? 'Open table / Tableflow' : 'Not enabled yet') : 'ETL, when it ran',
      a: a3 > 0 ? a3 : a1,
    },
  ];

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">How old the answer is</span>
        <span className="lbl">Three clocks</span>
      </div>

      <div className="figure">
        <span className="figure-val num">
          <CountUp to={s.served.exposureUsd} duration={0.9} separator="," decimals={0} trigger="load" />
        </span>
        <span className="figure-sub">Exposure / USD</span>
      </div>

      <div className="clocks">
        {rows.map((r) => (
          <div className="clk" data-tone={freshness(r.a)} key={r.n}>
            <span className="clk-who">
              <span className="clk-n">{r.n}</span>
              <span className="clk-k">{r.k}</span>
            </span>
            <span className="clk-age num">{age(r.a)}</span>
          </div>
        ))}
      </div>

      <div className="meter">
        <div className="meter-row">
          <span className="lbl">Served / limit used</span>
          <span className="meter-pct num">{pct.toFixed(1)}%</span>
        </div>
        <div className="meter-track">
          <motion.div
            className="meter-fill"
            data-over={pct > 100}
            animate={{ width: `${Math.min(100, pct)}%` }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          />
          <motion.div
            className="meter-true"
            animate={{ left: `${Math.min(100, truePct)}%` }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
        <div className="meter-row">
          <span className="lbl">White marker / true now</span>
          <span className="meter-pct num">{truePct.toFixed(1)}%</span>
        </div>
      </div>

      <p className="panel-note">
        {live
          ? "A Lightning Table takes a change in under 100ms. The minute is Flink's commit, the price of exactly once."
          : 'Isolation is not a choice here. There is one overnight copy, and it is as old as it is.'}
      </p>
    </section>
  );
}

/**
 * The book. Rows carry a layout animation, so when utilisation changes and the sort
 * reorders, a client visibly moves rather than teleporting. That movement is the only
 * reason this panel animates at all.
 */
export function BookPanel({ snapshot }: { snapshot: DeskSnapshot }) {
  const top = snapshot.book.slice(0, 6);
  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">The book</span>
        <span className="lbl">{snapshot.book.length} rows, top 6</span>
      </div>

      <div className="book">
        <div className="book-head">
          <span className="lbl">Client</span>
          <span className="lbl">Limit used</span>
          <span className="lbl" style={{ textAlign: 'right' }}>
            %
          </span>
        </div>
        {top.map((r) => (
          <motion.div
            layout
            key={r.clientId}
            className="book-row"
            data-focus={r.clientId === snapshot.served.clientId}
            data-near={r.limitUtilPct >= 90}
            transition={{ layout: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } }}
          >
            <span className="num">{r.clientId}</span>
            <span className="book-bar">
              <motion.span
                animate={{ width: `${Math.min(100, r.limitUtilPct)}%` }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              />
            </span>
            <span className="book-util num">{r.limitUtilPct.toFixed(0)}%</span>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
