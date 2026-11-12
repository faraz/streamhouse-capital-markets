import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import ShinyText from '../reactbits/ShinyText';
import BlurText from '../reactbits/BlurText';
import BorderGlow from '../reactbits/BorderGlow';
import type { DeskSnapshot } from '../data/types';
import { PALETTE } from './format';
import { Panel, type Tour } from './Tour';
import { questionsFor, type Analyst as AnalystState, type Step } from './useAnalyst';
import { Out, useConsole } from './console';

const EASE = [0.16, 1, 0.3, 1] as const;

/** A tool's result, cut to what a person can read at a glance. */
function clip(code: string, lines = 3): string {
  const all = code.split('\n');
  return all.length <= lines ? code : `${all.slice(0, lines).join('\n')}\n+${all.length - lines} more`;
}

function StepView({ step, compact }: { step: Step; compact: boolean }) {
  if (step.kind === 'ask') {
    return <div className="ask-bubble">{step.body}</div>;
  }
  // Two conversations side by side in time: the query is named by the one line that tells
  // them apart, and the rest of it is marked as left out.
  if (compact && step.kind === 'tool' && step.code) {
    return (
      <div className="call call--line" data-kind="tool">
        <span className="call-name">{step.meta ?? step.tag}</span>
        <code className="call-code">
          <i>...</i>
          <b>{step.code.split('\n').pop()}</b>
        </code>
      </div>
    );
  }
  if (step.kind === 'tool' || step.kind === 'result') {
    return (
      <div className="call" data-kind={step.kind}>
        <span className="call-name">
          {step.kind === 'tool' ? step.meta ?? step.tag : 'returned'}
        </span>
        {step.code && step.code !== '{}' ? <pre className="call-code">{step.kind === 'result' ? clip(step.code) : step.code}</pre> : null}
      </div>
    );
  }
  if (step.kind === 'answer') {
    return (
      <div className="answer">
        <BlurText
          className="answer-text"
          text={step.body ?? ''}
          animateBy="words"
          direction="bottom"
          delay={28}
          stepDuration={0.32}
          blur={8}
          distance={6}
          trigger="load"
          color={PALETTE.text}
        />
        {step.meta ? <span className="answer-meta">{step.meta}</span> : null}
      </div>
    );
  }
  return (
    <div className="correction">
      <span className="correction-tag">{step.tag}{step.meta ? ` / ${step.meta}` : ''}</span>
      <p>{step.body}</p>
    </div>
  );
}

/**
 * The analyst, over MCP through the Real-Time Context Engine. Its tool calls land as a
 * ledger the moment they happen, because a call that faded in slowly would read as
 * decoration over something that genuinely took time; only the answer resolves in, word by
 * word out of a blur, so the room reads it as it arrives rather than waiting on a cursor.
 */
export function Analyst({ snapshot, tour, analyst }: { snapshot: DeskSnapshot; tour: Tour; analyst: AnalystState }) {
  // The step that puts the same question about two clients shows both answers at once, so
  // each is set compactly and the suggested questions give up their room.
  const [q, setQ] = useState('');
  const c = useConsole();
  const tape = useRef<HTMLDivElement>(null);
  const live = snapshot.mode === 'streamhouse';
  const compact = !live && tour.beat.id === 'false-block';
  const spine = questionsFor(snapshot.served.clientId).slice(0, 3);

  // Pinned to the newest line while the answer types, unless the presenter has scrolled up
  // to point at an earlier step.
  useEffect(() => {
    const el = tape.current;
    if (!el) return;
    let pinned = true;
    const onScroll = () => {
      pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    };
    const follow = new MutationObserver(() => {
      if (pinned) el.scrollTop = el.scrollHeight;
    });
    follow.observe(el, { childList: true, subtree: true, characterData: true });
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      follow.disconnect();
      el.removeEventListener('scroll', onScroll);
    };
  }, []);

  const submit = (text: string) => {
    if (!text.trim() || analyst.busy) return;
    void analyst.ask(text);
    setQ('');
  };

  return (
    <Panel
      id="analyst"
      tour={tour}
      className={compact ? 'analyst analyst--pair' : 'analyst'}
      title={
        <>
          <span className="agent-mark" aria-hidden="true" />
          Analyst
        </>
      }
      meta={
        live ? (
          <>
            <Out href={c?.lightning} title="Lightning Tables: the topics served to the Real-Time Context Engine">
              Real-Time Context Engine
            </Out>{' '}
            / MCP
          </>
        ) : (
          'No MCP / reading the overnight copy'
        )
      }
    >
      <div className="tape" ref={tape}>
        {analyst.steps.length === 0 && !analyst.busy ? (
          <div className="tape-empty">
            <p>
              {live
                ? 'Ask in English. The analyst finds the right table, reads its columns and writes its own SQL, through three MCP tools.'
                : 'Nothing live to ask. Whatever the analyst says comes from the copy loaded last night.'}
            </p>
          </div>
        ) : null}
        <AnimatePresence initial={false}>
          {analyst.steps.map((s, i) => (
            <motion.div
              key={`${i}-${s.kind}-${s.meta ?? ''}`}
              className="step"
              initial={{ opacity: 0, y: 6, clipPath: 'inset(0 0 100% 0)' }}
              animate={{ opacity: 1, y: 0, clipPath: 'inset(0 0 0% 0)' }}
              transition={{ duration: 0.32, ease: EASE }}
            >
              <StepView step={s} compact={compact} />
            </motion.div>
          ))}
        </AnimatePresence>
        {analyst.busy ? (
          <div className="working">
            <span className="working-dot" />
            <ShinyText
              text={live ? 'Querying the Lightning Table over MCP' : 'Reading the overnight copy'}
              color={PALETTE.dim}
              shineColor={PALETTE.text}
              speed={1.6}
            />
          </div>
        ) : null}
      </div>

      <div className="asks">
        {spine.map((s) => (
          <button key={s} type="button" className="chip" disabled={analyst.busy} onClick={() => submit(s)}>
            {s}
          </button>
        ))}
      </div>
      <BorderGlow
        className="askglow"
        backgroundColor={PALETTE.ground}
        borderRadius={10}
        glowRadius={22}
        glowIntensity={0.8}
        edgeSensitivity={24}
        coneSpread={22}
        glowColor="220 100 66"
        colors={[PALETTE.agent, '#8FB4FF', PALETTE.text]}
        fillOpacity={0.18}
      >
        <form
          className="askbox"
          onSubmit={(e) => {
            e.preventDefault();
            submit(q);
          }}
        >
          <input
            type="text"
            value={q}
            placeholder="Ask about the book, in English"
            autoComplete="off"
            onChange={(e) => setQ(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" disabled={analyst.busy || !q.trim()}>
            Ask
          </button>
        </form>
      </BorderGlow>
    </Panel>
  );
}
