import { useEffect, useRef, useState } from 'react';
import AnimatedContent from '../reactbits/AnimatedContent';
import ShinyText from '../reactbits/ShinyText';
import BlurText from '../reactbits/BlurText';
import BorderGlow from '../reactbits/BorderGlow';
import CountUp from '../reactbits/CountUp';
import DecryptedText from '../reactbits/DecryptedText';
import GradualBlur from '../reactbits/GradualBlur';
import type { DeskSnapshot } from '../data/types';
import { PALETTE } from './format';
import { Panel, type Tour } from './Tour';
import { questionsFor, type Analyst as AnalystState, type Step } from './useAnalyst';
import { Out, useConsole } from './console';

/** A tool's result, cut to what a person can read at a glance. */
function clip(code: string, lines = 3): string {
  const all = code.split('\n');
  return all.length <= lines ? code : `${all.slice(0, lines).join('\n')}\n+${all.length - lines} more`;
}

/** One thing the analyst did on the way to an answer, as the rail shows it. */
type Move =
  | { kind: 'query'; key: string; tool: Step; result?: Step }
  | { kind: 'answer'; key: string; step: Step }
  | { kind: 'truth'; key: string; step: Step }
  | { kind: 'error'; key: string; step: Step };

interface Exchange {
  key: string;
  ask?: Step;
  moves: Move[];
}

/**
 * The flat run of steps, as exchanges: a question and everything done to answer it. A tool
 * call and what it returned are one move, because they are one act.
 */
function exchanges(steps: Step[]): Exchange[] {
  const out: Exchange[] = [];
  steps.forEach((step, i) => {
    if (step.kind === 'ask' || !out.length) out.push({ key: `x${i}`, moves: [] });
    const x = out.at(-1)!;
    if (step.kind === 'ask') x.ask = step;
    else if (step.kind === 'tool') x.moves.push({ kind: 'query', key: `m${i}`, tool: step });
    else if (step.kind === 'result') {
      const open = x.moves.at(-1);
      if (open?.kind === 'query' && !open.result) open.result = step;
      else x.moves.push({ kind: 'query', key: `m${i}`, tool: step });
    } else if (step.kind === 'answer') x.moves.push({ kind: 'answer', key: `m${i}`, step });
    else x.moves.push({ kind: step.figures ? 'truth' : 'error', key: `m${i}`, step });
  });
  return out;
}

/**
 * A query. Against the nightly copy it is one line, what was asked for and what came back,
 * with the SQL a click away: there is nothing clever in it to show. Against the streamhouse
 * it stays open, because the analyst finding the table and writing its own SQL is the point.
 */
function Query({ tool, result, folded }: { tool: Step; result?: Step; folded: boolean }) {
  const [open, setOpen] = useState(false);
  const code = tool.code && tool.code !== '{}' ? tool.code : null;
  if (folded && tool.summary) {
    return (
      <div className="q">
        <button type="button" className="q-line" aria-expanded={open} onClick={() => setOpen((o) => !o)} title={open ? 'Hide the query' : 'Show the query'}>
          <span className="q-name">{tool.meta ?? tool.tag}</span>
          <span className="q-sum">{tool.summary}</span>
          <svg className="q-caret" viewBox="0 0 10 10" width="9" height="9" aria-hidden="true">
            <path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {open ? (
          <div className="q-body">
            {code ? <pre className="call-code">{code}</pre> : null}
            {result?.code ? <pre className="call-code q-returned">{result.code}</pre> : null}
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div className="q q--open">
      <span className="q-name">{tool.kind === 'tool' ? tool.meta ?? tool.tag : 'returned'}</span>
      {code ? <pre className="call-code">{tool.kind === 'result' ? clip(code) : code}</pre> : null}
      {result?.code && result.code !== '{}' ? <pre className="call-code q-returned">{clip(result.code)}</pre> : null}
    </div>
  );
}

function Answer({ step }: { step: Step }) {
  return (
    <div className="answer">
      {/* The one red thing about an answer from the copy, attached to the sentence it is true of. */}
      {step.stale ? (
        <span className="answer-from">
          <i aria-hidden="true" />
          <DecryptedText text="from last night's copy" animateOn="view" sequential speed={18} revealDirection="start" useOriginalCharsOnly />
          <span className="num">/ {step.stale} old</span>
        </span>
      ) : null}
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
      {!step.stale && step.meta ? <span className="answer-meta">{step.meta}</span> : null}
    </div>
  );
}

const tenth = (n: number) => Math.round(n * 10) / 10;

/**
 * What was true, read live: the figures first, then the sentence. It is the live number, so
 * it wears the colour of a live number; the red belongs to the answer it corrects.
 */
function Truth({ step }: { step: Step }) {
  const { said, was } = step.figures!;
  const gap = Math.abs(tenth(was) - tenth(said));
  return (
    <div className="truth">
      <span className="truth-tag">
        {step.tag}
        {step.meta ? ` / ${step.meta}` : ''}
      </span>
      <div className="truth-row">
        <span className="truth-said">
          <b className="num">{said.toFixed(1)}%</b> said
        </span>
        <svg width="22" height="10" viewBox="0 0 22 10" aria-hidden="true">
          <path d="M0 5h19M15 1.5L19 5l-4 3.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="truth-was">
          <b className="num">
            <CountUp from={tenth(said)} to={tenth(was)} decimals={1} suffix="%" duration={1.1} delay={0.25} trigger="load" />
          </b>{' '}
          true
        </span>
        <span className="truth-gap">
          <b className="num">{gap.toFixed(1)}</b> points {was > said ? 'low' : 'high'}
        </span>
      </div>
      <p>{step.body}</p>
    </div>
  );
}

function Failure({ step }: { step: Step }) {
  return (
    <div className="correction">
      <span className="correction-tag">
        {step.tag}
        {step.meta ? ` / ${step.meta}` : ''}
      </span>
      <p>{step.body}</p>
    </div>
  );
}

/**
 * The analyst, over MCP through the Real-Time Context Engine. A question and everything done
 * to answer it are one unit, down a thin rail: the queries, the answer, and in today's world
 * what was actually true. Each move arrives as it happens; only the answer resolves in word
 * by word, so the room reads it as it lands rather than waiting on a cursor.
 */
export function Analyst({ snapshot, tour, analyst }: { snapshot: DeskSnapshot; tour: Tour; analyst: AnalystState }) {
  const [q, setQ] = useState('');
  const c = useConsole();
  const tape = useRef<HTMLDivElement>(null);
  const live = snapshot.mode === 'streamhouse';
  // The step that puts the same question about two clients shows both answers at once, so
  // each is set compactly and the suggested questions give up their room.
  const compact = !live && tour.beat.id === 'false-block';
  const spine = questionsFor(snapshot.served.clientId).slice(0, 3);
  const talk = exchanges(analyst.steps);

  // Pinned to the newest line while the answer arrives and when the panel changes size,
  // unless the presenter has scrolled up to point at an earlier step.
  useEffect(() => {
    const el = tape.current;
    if (!el) return;
    let pinned = true;
    const onScroll = () => {
      pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    };
    const stick = () => {
      if (pinned) el.scrollTop = el.scrollHeight;
    };
    const follow = new MutationObserver(stick);
    follow.observe(el, { childList: true, subtree: true, characterData: true });
    const sized = new ResizeObserver(stick);
    sized.observe(el);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      follow.disconnect();
      sized.disconnect();
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
      <div className="tape-wrap">
        {/* Older exchanges soften as they pass under the panel's head, and only when there are any. */}
        <GradualBlur position="top" height={30} strength={0.7} layers={5} autoHide zIndex={3} />
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
          {talk.map((x) => (
            <article key={x.key} className="xchg">
              {x.ask ? (
                <AnimatedContent className="xchg-ask" trigger="mount" distance={8} duration={0.35} blur={4}>
                  <div className="ask-bubble">{x.ask.body}</div>
                </AnimatedContent>
              ) : null}
              {x.moves.length ? (
                <ol className="xchg-moves">
                  {x.moves.map((m) => (
                    <li key={m.key} className="move" data-kind={m.kind} data-stale={m.kind === 'answer' && !!m.step.stale}>
                      <AnimatedContent trigger="mount" distance={8} duration={0.35} blur={4}>
                        {m.kind === 'query' ? (
                          <Query tool={m.tool} result={m.result} folded={!live} />
                        ) : m.kind === 'answer' ? (
                          <Answer step={m.step} />
                        ) : m.kind === 'truth' ? (
                          <Truth step={m.step} />
                        ) : (
                          <Failure step={m.step} />
                        )}
                      </AnimatedContent>
                    </li>
                  ))}
                </ol>
              ) : null}
            </article>
          ))}
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
