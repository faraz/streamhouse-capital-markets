import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import ElectricBorder from '../reactbits/ElectricBorder';
import { FALSE_BLOCK } from '../data/book';
import type { DeskSnapshot, Escalation, EscalationAuthor } from '../data/types';
import { ESCALATE_PCT, PALETTE, wallClock } from './format';
import { Panel, type Tour } from './Tour';
import { Out, useConsole } from './console';

const EASE = [0.16, 1, 0.3, 1] as const;
/** How long a new escalation's border burns before it settles to a plain edge. */
const BURN_MS = 3_200;

const AUTHOR: Record<EscalationAuthor, string> = {
  'risk-agent': 'Risk agent / Flink Streaming Agent',
  'threshold-check': 'Threshold check / Worker',
  simulator: 'Simulator',
  scripted: 'Scripted',
};

/**
 * The other way a stale copy fails, as the desk would have met it: a client held at a figure
 * that was not true. Scripted like the breach beside it, with the figures the story states.
 */
const BLOCKED: Escalation = {
  at: 0,
  title: 'Blocked on a stale number',
  what: `Client ${FALSE_BLOCK} was held at 98% of limit and a trade was refused. The client was at 77%.`,
  tone: 'bad',
  author: 'scripted',
};

/**
 * Escalations arrive; they do not pulse. A new one gets the electric border for a few
 * seconds, because it is the only thing on the screen that means a person has to act, then
 * settles. Every row names who wrote it, so a fallback changes the label rather than passing
 * one writer off as another.
 */
export function Alerts({ snapshot, tour, attention = false }: { snapshot: DeskSnapshot; tour: Tour; attention?: boolean }) {
  // In today's world the panel follows the story a step at a time. Nothing has been found out
  // while the question is still being asked; the breach is found at the next step; and where
  // the two failures are shown together, the refused trade arrives above it.
  const today = snapshot.mode === 'before';
  const quiet = today && tour.beat.id === 'question';
  const pair = today && tour.beat.id === 'false-block';
  const told = quiet ? [] : snapshot.escalations.slice(0, 3);
  const rows = pair ? [BLOCKED, ...told].slice(0, 3) : told;
  const c = useConsole();
  const already = snapshot.book.filter((c) => c.limitUtilPct >= ESCALATE_PCT).length;
  const seen = useRef<Set<string> | null>(null);
  const [burning, setBurning] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const signature = rows.map((e) => `${e.at}-${e.title}`).join('|');

  useEffect(() => {
    const keys = signature ? signature.split('|') : [];
    // Whatever is on screen at first load is history, not news.
    if (seen.current === null) {
      seen.current = new Set(keys);
      return;
    }
    const fresh = keys.find((k) => !seen.current!.has(k));
    keys.forEach((k) => seen.current!.add(k));
    if (!fresh) return;
    setBurning(fresh);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setBurning(null), BURN_MS);
  }, [signature]);

  // When the story turns to this panel, the newest note burns again: it may have arrived
  // while the room was looking at something else.
  useEffect(() => {
    const newest = signature.split('|')[0];
    if (!attention || !newest) return;
    setBurning(newest);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setBurning(null), BURN_MS);
  }, [attention, signature]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <Panel id="alerts" tour={tour} className={pair ? 'alerts alerts--pair' : 'alerts'} title="Alerts" meta={c ? (<><Out href={c.agent('risk_agent')} title="The Streaming Agent, in the console">risk_agent</Out> / <Out href={c.materialized('exposure_crossings')} title="The crossings Flink detects, in the console">exposure_crossings</Out></>) : 'Risk agent / watching every client'}>
      <div className="alert-list">
        {rows.length === 0 ? (
          <div className="alert-empty">
            <i />
            {today ? (
              'Nothing escalated. The risk agent reads the same copy.'
            ) : (
              <>
                No new crossing of {ESCALATE_PCT}% this session.
                {already ? ` ${already} ${already === 1 ? 'client was' : 'clients were'} already above it.` : ''}
              </>
            )}
          </div>
        ) : null}
        <AnimatePresence initial={false}>
          {rows.map((e) => {
            const k = `${e.at}-${e.title}`;
            const card = (
              <div className="alert" data-tone={e.tone} data-author={e.author}>
                <div className="alert-top">
                  <span className="alert-title">
                    <i />
                    {e.title}
                  </span>
                  {/* A scripted discovery has no moment of its own; a real note has, in UTC like the rest. */}
                  {e.at > 0 ? (
                    <span className="mono dim">{e.at > 86_400_000 ? new Date(e.at).toISOString().slice(11, 19) : wallClock(e.at)}</span>
                  ) : pair ? (
                    // Two alerts share the panel: who wrote each sits here, not on a line of its own.
                    <span className="alert-by">{AUTHOR[e.author]}</span>
                  ) : null}
                </div>
                <p className="alert-what">{e.what}</p>
                {pair && e.at <= 0 ? null : <span className="alert-by">{AUTHOR[e.author]}</span>}
              </div>
            );
            return (
              <motion.div
                key={k}
                layout="position"
                initial={{ opacity: 0, y: -12, filter: 'blur(6px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5, ease: EASE }}
              >
                {burning === k ? (
                  <ElectricBorder
                    color={e.tone === 'bad' ? PALETTE.stale : PALETTE.warn}
                    glowColor={e.tone === 'bad' ? PALETTE.stale : PALETTE.warn}
                    thickness={1}
                    speed={0.7}
                    chaos={0.3}
                    glow={0.55}
                    borderRadius={8}
                    theme="dark"
                  >
                    {card}
                  </ElectricBorder>
                ) : (
                  card
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </Panel>
  );
}
