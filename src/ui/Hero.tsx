import { useEffect } from 'react';
import { motion } from 'motion/react';
import RotatingText from '../reactbits/RotatingText';
import SplitFlapText from '../reactbits/SplitFlapText';
import SpecularButton from '../reactbits/SpecularButton';
import StarBorder from '../reactbits/StarBorder';
import type { DeskSnapshot } from '../data/types';
import { FOLLOWED } from '../data/book';
import { ESCALATE_PCT, PALETTE, age, baseTime, freshness, money, tableAsOf, wallClock } from './format';
import { HeroGround } from './gl/HeroGround';
import { useNow } from './useNow';
import { BrandLockup } from './BrandMark';
import { LiveBadge } from './LiveBadge';

const EASE = [0.16, 1, 0.3, 1] as const;
const ACROSS = ['desks', 'venues', 'custodians', 'entities', 'everything'];

/** The talk this desk is the middle act of. */
const SLIDES_URL = 'https://faraz.github.io/talks/s/streamhouse-sellers?play=1&p=1';

/**
 * The first thing the room sees, before the desk. Behind it, a dot matrix lit by six
 * currents that come in apart and leave as one: the product's mechanism as a material. In
 * front, the question, and the proof that is not a claim but the live figure, read from
 * client_exposure and set on a split-flap board, the trading floor's way of saying a number
 * just changed. The six feeds the currents stand for are listed with their real ages.
 */
export function Hero({ snapshot, onEnter }: { snapshot: DeskSnapshot | null; onEnter(): void }) {
  const now = useNow();
  const s = snapshot;
  // The truth, whichever world the desk opens in: Before is a script over this same figure.
  const exposure = s ? s.trueExposureUsd : null;
  const limit = s?.served.limitUsd ?? null;
  const pct = exposure !== null && limit ? (exposure / limit) * 100 : null;
  const live = s?.origin === 'confluent';

  // Enter or Space opens the desk. Caught before the tour's own keys, so the first press
  // in the room is never also the first beat.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A control that opens something of its own keeps its keys: Enter on the slides link
      // opens the slides, not the desk.
      if ((e.target as Element | null)?.closest?.('[data-own-keys]')) return;
      const open = e.key === 'Enter' || e.key === ' ';
      // The tour's other keys are held too: a beat must never fire behind the hero.
      if (!open && !/^([0-9]|Arrow(Left|Right))$/.test(e.key)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (open) onEnter();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onEnter]);

  return (
    <motion.div
      className="hero"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.015, filter: 'blur(8px)', transition: { duration: 0.5, ease: EASE } }}
      transition={{ duration: 0.8, ease: EASE }}
    >
      <div className="hero-ground" aria-hidden="true">
        <HeroGround />
      </div>
      <div className="hero-scrim" aria-hidden="true" />

      <header className="hero-bar">
        <BrandLockup size={44} className="brand--hero" />
        <div className="hero-bar-right">
          {/* Somewhere else to go, so it sits with the bar's other fixtures and leaves the row
              below to the one thing this page asks for. A raised grey button, lighter than the
              bar it sits on; its edge brightens only as the pointer comes near. */}
          <SpecularButton
            className="hero-slides"
            data-own-keys
            size="sm"
            radius={8}
            tint={PALETTE.text}
            tintOpacity={0.14}
            textColor={PALETTE.text}
            lineColor="#FFFFFF"
            baseColor="#6B7482"
            idleIntensity={0}
            thickness={1}
            glow={0}
            proximity={160}
            title="Open the talk's slides in a new tab"
            onClick={() => window.open(SLIDES_URL, '_blank', 'noopener,noreferrer')}
          >
            Slides
            <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
              <path d="M4 3h5v5M9 3L3 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </SpecularButton>
          {live ? (
            <LiveBadge />
          ) : (
            <span className="origin" data-origin={s ? 'simulator' : 'scripted'}>
              <i />
              {s ? 'Simulator' : 'Connecting'}
            </span>
          )}
          <span className="clock num">
            {wallClock(now)} <em>UTC</em>
          </span>
        </div>
      </header>

      <main className="hero-main">
        <motion.h1
          className="hero-title"
          initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.15 }}
        >
          What is this client&rsquo;s exposure right now, across{' '}
          <RotatingText
            texts={ACROSS}
            loop={false}
            rotationInterval={1100}
            staggerDuration={0.018}
            staggerFrom="first"
            effect="slide"
            splitBy="characters"
            mainClassName="hero-rotate"
            transition={{ type: 'spring', damping: 30, stiffness: 400 }}
          />
          ?
        </motion.h1>

        <motion.p
          className="hero-sub"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EASE, delay: 0.35 }}
        >
          Six sources in six shapes, captured as they change and reshaped by Flink into one
          governed record that knows its own age. An analyst agent answers questions about it in
          English over MCP, and a risk agent watches every client without being asked.
        </motion.p>

        <motion.div
          className="ticket"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EASE, delay: 0.55 }}
        >
          <div className="ticket-head">
            <span className="ticket-client">
              Client <b className="mono">{FOLLOWED}</b>
            </span>
            <span className="ticket-src">
              <i />
              {s && live && s.mode === 'streamhouse'
                ? `client_exposure / current to ${age(Math.max(0, baseTime(s, now) - tableAsOf(s)))} ago`
                : 'read live from client_exposure'}
            </span>
          </div>
          <div className="ticket-body">
            <div className="ticket-figure">
              <span className="ticket-k">Limit used</span>
              <SplitFlapText
                text={pct === null ? '--.-%' : `${pct.toFixed(1)}%`}
                charset="0123456789.-%"
                padTo={5}
                fontSize={52}
                tileColor="#14181E"
                textColor={PALETTE.text}
                tileRadius={5}
                gap={3}
                flipDuration={0.08}
                stagger={0.05}
                flipsPerChar={6}
                tileStyle="board"
                glare={0.25}
                depth={0.6}
                loop={false}
              />
            </div>
            <div className="ticket-facts">
              <span className="ticket-line num">
                {exposure === null ? 'Reading the served tables' : `$${money(exposure)}`}
                <em>of ${money(limit ?? 0)}</em>
              </span>
              <div className="ticket-bar" aria-hidden="true">
                <motion.span
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: pct === null ? 0 : Math.min(100, pct) / 100 }}
                  transition={{ duration: 1.2, ease: EASE, delay: 0.9 }}
                />
                <i style={{ left: `${ESCALATE_PCT}%` }} />
              </div>
              <span className="ticket-note">{ESCALATE_PCT}% escalates to the risk officer</span>
            </div>
          </div>
        </motion.div>

        <motion.div
          className="hero-actions"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EASE, delay: 0.7 }}
        >
          <StarBorder
            as="button"
            type="button"
            className="hero-cta"
            onClick={onEnter}
            color={PALETTE.text}
            trailColor={PALETTE.fresh}
            backgroundColor={PALETTE.text}
            textColor={PALETTE.ground}
            borderColor="rgba(231,234,238,0.25)"
            radius={10}
            thickness={1}
            duration={5}
            stars={1}
            glow={0.5}
            hover="brighten"
            theme="dark"
          >
            Open the desk <kbd>Enter</kbd>
          </StarBorder>
          <span className="hero-run">
            A demo risk desk on a streamhouse, running on Confluent Cloud. Eleven steps, about nine minutes.
          </span>
        </motion.div>
      </main>

      {s ? (
        <motion.aside
          className="feeds"
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.8 }}
          aria-label="The six feeds"
        >
          <span className="feeds-k">Six sources, six ages, today</span>
          <ol>
            {s.sources.map((x, i) => (
              <motion.li
                key={x.name}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, ease: EASE, delay: 0.95 + i * 0.06 }}
              >
                <span className="feeds-name">{x.name}</span>
                <span className="feeds-age num" data-tone={x.stalest ? 'stale' : freshness(x.ageMs)}>
                  {age(x.ageMs)}
                </span>
              </motion.li>
            ))}
          </ol>
          <span className="feeds-one">
            <i />
            Streamhouse: one record, with its age
          </span>
        </motion.aside>
      ) : null}

      <footer className="hero-foot">
        <span className="stack">
          {['Connect', 'Stream', 'Process', 'Govern', 'Query'].map((x, i, all) => (
            <span key={x} className="stack-step">
              {x}
              {i < all.length - 1 ? (
                <svg width="14" height="8" viewBox="0 0 14 8" aria-hidden="true">
                  <path d="M0 4h11M8 1l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              ) : null}
            </span>
          ))}
        </span>
        <span>Figures are synthetic. No client, venue or custodian is named.</span>
      </footer>
    </motion.div>
  );
}
