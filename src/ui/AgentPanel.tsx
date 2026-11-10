import { useCallback, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import SpotlightCard from '../reactbits/SpotlightCard';
import TextType from '../reactbits/TextType';
import type { DeskSnapshot } from '../data/types';
import { FOLLOWED } from '../data/book';
import { PALETTE } from './format';

export interface Step {
  kind: 'ask' | 'tool' | 'result' | 'answer' | 'error';
  tag: string;
  meta?: string;
  code?: string;
  body?: string;
}

const QUESTIONS = [
  `What is client ${FOLLOWED}'s exposure right now, across everything?`,
  'Which clients are nearest their limit?',
  `Did anything just change for ${FOLLOWED}?`,
];

const GATE = import.meta.env['VITE_DEMO_GATE'] ?? 'local-dev';

/**
 * The star of the demo. The engine exposes three generic tools and no mechanism for a
 * purpose-built one, so the agent lists topics, reads a schema, then writes its own SQL,
 * and every one of those steps appears as it happens.
 *
 * The answer is typed rather than revealed, because an agent speaking to a desk is the
 * thing being shown. Everything before it lands instantly: a tool call that faded in
 * slowly would read as decoration over something that genuinely took time.
 */
export function AgentPanel({ snapshot }: { snapshot: DeskSnapshot }) {
  const [steps, setSteps] = useState<Step[]>([]);
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState('');
  const tape = useRef<HTMLDivElement>(null);
  const live = snapshot.mode === 'streamhouse';

  const ask = useCallback(async (q: string) => {
    if (busy || !q.trim()) return;
    setBusy(true);
    const collected: Step[] = [{ kind: 'ask', tag: 'Asked', body: q }];
    setSteps([...collected]);

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-demo-gate': GATE },
        body: JSON.stringify({ question: q }),
      });
      if (!res.ok || !res.body) throw new Error(`the agent route returned ${res.status}`);

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const frames = buf.split('\n\n');
        buf = frames.pop() ?? '';
        for (const frame of frames) {
          const line = frame.replace(/^data:\s*/, '').trim();
          if (!line || line === '[DONE]') continue;
          try {
            collected.push(JSON.parse(line) as Step);
            setSteps([...collected]);
            requestAnimationFrame(() => {
              if (tape.current) tape.current.scrollTop = tape.current.scrollHeight;
            });
          } catch {
            // A partial frame is not fatal; the next read completes it.
          }
        }
      }
    } catch (e) {
      collected.push({ kind: 'error', tag: 'Failed', body: e instanceof Error ? e.message : String(e) });
      setSteps([...collected]);
    } finally {
      setBusy(false);
    }
  }, [busy]);

  return (
    <SpotlightCard
      className="panel agent"
      spotlightColor={PALETTE.cobalt}
      intensity={0.1}
      spotlightSize={320}
      borderGlow={0.5}
      theme="dark"
    >
      <div className="panel-head">
        <span className="panel-title">
          The risk agent / asking over MCP through the Real-Time Context Engine
        </span>
        <span className="lbl">{live ? 'Connected / 3 tools' : 'No MCP. Reading a copy.'}</span>
      </div>

      <div className="asks">
        {QUESTIONS.map((q) => (
          <button type="button" className="ask" key={q} disabled={busy} onClick={() => void ask(q)}>
            {q}
          </button>
        ))}
      </div>

      <div className="askbox">
        <input
          type="text"
          value={question}
          placeholder="Ask anything about the book, in English"
          autoComplete="off"
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void ask(question);
          }}
        />
        <button type="button" disabled={busy} onClick={() => void ask(question)}>
          Ask
        </button>
      </div>

      <div className="tape" ref={tape}>
        {steps.length === 0 && !busy ? (
          <div className="tape-empty">
            <span className="lbl">Real-Time Context Engine / MCP</span>
            <p>
              Three tools are on the connection: listTopics, getMetadata and queryData. Ask a
              question and the agent will pick its own way to the answer.
            </p>
          </div>
        ) : null}

        <AnimatePresence initial={false}>
          {steps.map((s, i) => (
            <motion.div
              key={`${i}-${s.tag}-${s.meta ?? ''}`}
              className="step"
              data-kind={s.kind === 'error' ? 'wrong' : s.kind}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="step-top">
                <span className="step-kind">{s.tag}</span>
                {s.meta ? <span className="step-meta">{s.meta}</span> : null}
              </div>
              {s.code ? <div className="step-code sql">{s.code}</div> : null}
              {s.body ? (
                s.kind === 'answer' ? (
                  <div className="step-body">
                    <TextType
                      text={s.body}
                      typingSpeed={12}
                      initialDelay={80}
                      showCursor
                      cursorStyle="bar"
                      cursorColor={PALETTE.mint}
                      typeEffect="fade"
                      loop={false}
                    />
                  </div>
                ) : (
                  <div className="step-body">{s.body}</div>
                )
              ) : null}
            </motion.div>
          ))}
        </AnimatePresence>

        {busy ? (
          <div className="step" data-kind="tool">
            <div className="step-top">
              <span className="step-kind">Working</span>
              <span className="thinking">
                <i />
                <i />
                <i />
              </span>
            </div>
          </div>
        ) : null}
      </div>

      <p className="panel-note">
        {live
          ? 'The engine exposes three generic tools, so the agent writes its own SQL rather than calling a purpose-built endpoint.'
          : 'In the before-world there is nothing to connect an agent to, so it reads whatever copy was loaded last. It answers confidently and it is wrong, at machine speed.'}
      </p>
    </SpotlightCard>
  );
}
