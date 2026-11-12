import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import CountUp from '../reactbits/CountUp';
import DecryptedText from '../reactbits/DecryptedText';
import ShinyText from '../reactbits/ShinyText';
import type { DeskSnapshot } from '../data/types';
import { ESCALATE_PCT, PALETTE, age, baseTime, freshness, seconds, tableAsOf, usdM } from './format';
import { Panel, type Tour } from './Tour';
import { useNow } from './useNow';
import { Out, useConsole } from './console';
import { History } from './History';
import { Compare } from './Compare';
import { FALSE_BLOCK } from '../data/book';

const EASE = [0.16, 1, 0.3, 1] as const;
/** How long the last commit's change stays beside the figure's label. */
const DELTA_SHOWN_MS = 12_000;

/**
 * The client the screen follows: the figure, its limit, and how old the answer is. The
 * figure rolls digit by digit when a commit moves it, the way a desk's own screens do; it
 * is the one number whose change is the story. Everything else updates in place.
 */
export function Client({ snapshot, tour, beside }: { snapshot: DeskSnapshot; tour: Tour; beside?: DeskSnapshot | null }) {
  const now = useNow();
  const links = useConsole();
  const s = snapshot;
  const live = s.mode === 'streamhouse';
  const c = s.served;
  const base = baseTime(s, now);
  // Two different things, kept apart on purpose. How old the answer is: how far the served
  // table trails live. When this client's figure last moved: a fact about the client, and no
  // sign of staleness. Showing the second as the first painted a current figure red.
  const lastChange = Math.max(0, base - c.asOf);
  const a = Math.max(0, live ? base - tableAsOf(s) : s.clocks.servedAgeMs);
  const tone = live ? freshness(a) : 'stale';
  const pct = c.limitUtilPct;
  const headroom = c.limitUsd - c.exposureUsd;
  // Pending until the served figure has it; a landed fill has no visibleAtMs.
  const pending = s.pendingFill && s.pendingFill.visibleAtMs !== null ? s.pendingFill : null;
  const pctTone = pct >= 100 ? 'stale' : pct >= ESCALATE_PCT ? 'warn' : undefined;

  // When a commit moves the figure by something a risk desk would notice, half a percent of
  // the limit or more, the change is shown as a number beside the label for a few seconds: a
  // fill, not the book's ordinary drift. Not when the presenter follows another client, and
  // not when the data path flips, which changes what the number is, not its value.
  const prevFig = useRef({ id: c.clientId, usd: Math.round(c.exposureUsd), live });
  const [delta, setDelta] = useState<{ usd: number; at: number } | null>(null);
  useEffect(() => {
    const p = prevFig.current;
    const usd = Math.round(c.exposureUsd);
    const same = live && p.live && p.id === c.clientId;
    if (same && Math.abs(usd - p.usd) >= c.limitUsd * 0.005) setDelta({ usd: usd - p.usd, at: Date.now() });
    if (!same) setDelta(null);
    prevFig.current = { id: c.clientId, usd, live };
  }, [c.clientId, c.exposureUsd, c.limitUsd, live]);
  useEffect(() => {
    if (!delta) return;
    const id = window.setTimeout(() => setDelta(null), DELTA_SHOWN_MS);
    return () => clearTimeout(id);
  }, [delta]);

  // The false block is told against the breach: the followed client stays and this one joins
  // it, so nobody has to notice that a small id changed to know there are two clients.
  const comparing = !live && tour.beat.id === 'false-block' && c.clientId === FALSE_BLOCK;

  return (
    <Panel
      id="client"
      tour={tour}
      className={comparing ? 'client client--compare' : 'client'}
      title={
        comparing ? (
          <span className="cmp-title">One nightly copy, two clients</span>
        ) : (
          <>
            <span className="mono client-id">{c.clientId}</span>
            <span className="client-desc">Exposure across desks, venues, custodians and entities</span>
          </>
        )
      }
      meta={
        <span className="pill" data-tone={tone}>
          <i />
          {/* Only the words decode, once per world or client. The age beside them ticks every
              second, and a decode that restarted with it never finished. */}
          <DecryptedText
            key={`${s.mode}-${c.clientId}`}
            text={live ? 'current to' : 'nightly copy /'}
            animateOn="view"
            sequential
            speed={22}
            revealDirection="start"
            useOriginalCharsOnly
          />
          <span className="num">{age(a)}</span>
          {live ? 'ago' : 'old'}
        </span>
      }
    >
      {comparing ? <Compare snapshot={s} beside={beside ?? null} /> : (
      <div className="client-body">
      <div className="figures">
        <div className="fig fig-main">
          <span className="fig-k">
            Exposure
            <AnimatePresence>
              {delta ? (
                <motion.em
                  key={delta.at}
                  className="fig-delta num"
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, ease: EASE }}
                >
                  {delta.usd > 0 ? '+' : '-'}${Math.abs(delta.usd).toLocaleString('en-US')}
                </motion.em>
              ) : null}
            </AnimatePresence>
          </span>
          <span className="fig-v num">
            <span className="fig-cur">$</span>
            <CountUp key={c.clientId} to={Math.round(c.exposureUsd)} decimals={0} separator="," mode="roll" duration={1.1} trigger="load" />
          </span>
        </div>
        <div className="fig">
          <span className="fig-k">Limit</span>
          <span className="fig-v2 num">
            <span className="fig-cur">$</span>
            {Math.round(c.limitUsd).toLocaleString('en-US')}
          </span>
        </div>
        <div className="fig">
          <span className="fig-k">Headroom</span>
          <span className="fig-v2 num">
            <span className="fig-cur">$</span>
            <CountUp key={c.clientId} to={Math.max(0, Math.round(headroom))} decimals={0} separator="," duration={0.9} trigger="load" />
          </span>
        </div>
        <div className="fig">
          <span className="fig-k">Limit used</span>
          <span className="fig-v2 num strong" data-tone={pctTone}>
            <CountUp key={c.clientId} to={Math.round(pct * 10) / 10} decimals={1} suffix="%" duration={0.9} trigger="load" />
          </span>
        </div>
      </div>

      <History snapshot={s} />

      <div className="stamps">
        {live ? (
          <>
            <span className="stamp">
              <em>Query</em>
              <Out href={links?.lightningTable('client_exposure')} title="This Lightning Table, in the console">
                Lightning Table
              </Out>
            </span>
            {s.query ? (
              <span className="stamp">
                {s.query.count} queries answered in <b className="num">{seconds(s.query.ms)}</b>
              </span>
            ) : null}
            <span className="stamp">
              last change <b className="num">{age(lastChange)}</b> ago
            </span>
          </>
        ) : (
          <span className="stamp" data-tone="stale">
            No age on the answer. It is as old as its stalest input.
          </span>
        )}
      </div>

      <AnimatePresence>
        {pending ? (
          <motion.div
            className="pending"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
          >
            <span className="pending-dot" />
            <ShinyText
              text={`Fill sent / ${usdM(pending.notionalUsd)} on ${c.clientId} / waiting for Flink's next commit`}
              color={PALETTE.dim}
              shineColor={PALETTE.text}
              speed={1.8}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
      </div>
      )}
    </Panel>
  );
}
