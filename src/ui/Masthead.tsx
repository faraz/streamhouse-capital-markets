import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import DecryptedText from '../reactbits/DecryptedText';
import Aurora from '../reactbits/Aurora';
import ClickSpark from '../reactbits/ClickSpark';
import type { DeskSnapshot, Isolation, Mode } from '../data/types';
import { PALETTE, age, freshness, money, wallClock } from './format';
import { FALSE_BLOCK, FOLLOWED } from '../data/book';

/**
 * A client this far below its limit almost certainly entered the book on its first trade:
 * it has a limit but no opening balance. Shown as new rather than as a percentage.
 */
const NEW_CLIENT_PCT = 5;

interface Props {
  snapshot: DeskSnapshot;
  selected: string;
  autoFollowing: boolean;
  mode: Mode;
  isolation: Isolation;
  onMode(m: Mode): void;
  onClient(c: string): void;
  onFill(): void;
  onFatFinger(): void;
  onReset(): void;
  canReset: boolean;
}

/**
 * Ages tick every second rather than every poll, because an age that sits still for two
 * seconds and then jumps reads as a stale screen, which is the one impression this demo
 * cannot afford to give.
 */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/**
 * The title decodes in, which is the deck's own device rather than a borrowed one. Aurora
 * sits behind it at low opacity, standing in for the cover's shader.
 */
export function Masthead(p: Props) {
  const s = p.snapshot;
  const now = useNow();
  const live = s.mode === 'streamhouse';
  // Live rows carry real timestamps, so their ages are measured against real time. The
  // simulator keeps its own trading day, so its ages are measured against that.
  const base = s.origin === 'confluent' ? now : s.wallClock;
  const story = new Set([FOLLOWED, FALSE_BLOCK]);

  return (
    <header className="mast">
      <div className="mast-glow" aria-hidden="true">
        <Aurora
          colorStops={[PALETTE.cobalt, '#3B66F0', '#12205E']}
          amplitude={0.7}
          blend={0.6}
          speed={0.3}
          opacity={0.42}
          height={320}
        />
      </div>

      <div className="mast-top">
        <h1>
          <DecryptedText
            text="One governed record, and an agent that can ask anything"
            animateOn="view"
            sequential
            revealDirection="start"
            effect="scramble"
            speed={28}
            useOriginalCharsOnly={false}
            scrambleColor={PALETTE.cobalt}
            parentClassName="decode"
          />
        </h1>
        <div className="wall">
          <span className="lbl">Wall clock</span>
          <span className="wall-time num">{wallClock(now)}</span>
          <span className="lbl">
            {p.autoFollowing && live ? 'Auto-following' : 'Following'} {p.selected} / limit{' '}
            {money(s.served.limitUsd)}
          </span>
        </div>
      </div>

      <ClickSpark sparkColor={PALETTE.cobalt} sparkCount={8} sparkRadius={18} duration={420}>
        <div className="controls">
          <div className="seg" role="group" aria-label="Architecture">
            <button type="button" aria-pressed={p.mode === 'before'} onClick={() => p.onMode('before')}>
              Before
            </button>
            <button type="button" aria-pressed={p.mode === 'streamhouse'} onClick={() => p.onMode('streamhouse')}>
              Streamhouse
            </button>
          </div>

          <div className="seg" role="group" aria-label="The two clients in the story">
            <button
              type="button"
              aria-pressed={p.selected === FOLLOWED}
              onClick={() => p.onClient(FOLLOWED)}
              title="The breach: its stale number reads low"
            >
              {FOLLOWED}
            </button>
            <button
              type="button"
              aria-pressed={p.selected === FALSE_BLOCK}
              onClick={() => p.onClient(FALSE_BLOCK)}
              title="The false block: its stale number reads high, so a good trade gets refused"
            >
              {FALSE_BLOCK}
            </button>
          </div>

          {/* The before-world hears about trades overnight, so neither event exists in it. */}
          <button type="button" className="ghost" disabled={!live} onClick={p.onFill}>
            A fill arrives
          </button>
          <button type="button" className="ghost" disabled={!live} onClick={p.onFatFinger}>
            Send a fat finger
          </button>
          <button type="button" className="ghost" disabled={!p.canReset} onClick={p.onReset}>
            Reset
          </button>

          {/* Before is a script over the live truth, and the badge says both halves. */}
          <span className="origin" data-origin={live ? s.origin : 'scripted'}>
            <i />
            {!live ? 'scripted / truth live' : s.origin === 'confluent' ? 'live confluent' : 'simulator'}
          </span>
        </div>
      </ClickSpark>

      {live && s.active.length ? (
        <div className="live-strip" role="group" aria-label="Clients who just traded">
          <span className="lbl">Just traded</span>
          <div className="ticks">
            <AnimatePresence initial={false} mode="popLayout">
              {s.active.slice(0, 6).map((c) => {
                const a = Math.max(0, base - c.asOf);
                return (
                  <motion.button
                    layout
                    type="button"
                    key={c.clientId}
                    className="tick"
                    aria-pressed={p.selected === c.clientId}
                    onClick={() => p.onClient(c.clientId)}
                    title={`Follow client ${c.clientId}`}
                    initial={{ opacity: 0, x: -14 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 14 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <span className="tick-id num">{c.clientId}</span>
                    <span className="tick-age num" data-tone={freshness(a)}>
                      {age(a)}
                    </span>
                    {c.limitUtilPct < NEW_CLIENT_PCT ? (
                      <span className="tick-new">new</span>
                    ) : (
                      <span className="tick-util num">{c.limitUtilPct.toFixed(0)}%</span>
                    )}
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>
          {story.has(p.selected) ? (
            <span className="strip-note">
              {p.selected} trades only when you make it. Pick someone who just traded to show
              an answer seconds old.
            </span>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
