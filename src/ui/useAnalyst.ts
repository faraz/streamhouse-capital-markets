import { useCallback, useRef, useState } from 'react';
import type { DeskSnapshot, Mode } from '../data/types';
import { age, money } from './format';

export interface Step {
  kind: 'ask' | 'tool' | 'result' | 'answer' | 'error';
  tag: string;
  meta?: string;
  code?: string;
  body?: string;
}

export const questionsFor = (client: string) => [
  `What is client ${client}'s exposure right now, across everything?`,
  'Which clients are nearest their limit?',
  `What just changed for ${client}?`,
  'Which clients just traded, and how old is each answer?',
];

const GATE = import.meta.env['VITE_DEMO_GATE'] ?? 'local-dev';
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The analyst in the before-world. There is no MCP and no live table to connect it to, so it
 * reads the copy that was loaded overnight, and that is scripted: the six legacy systems do
 * not exist. What was really true is not. It is the live figure, from the snapshot, so the
 * correction the room hears is Confluent's number.
 */
function beforeSteps(s: DeskSnapshot): Step[] {
  const { clientId, exposureUsd, limitUsd, limitUtilPct } = s.served;
  const truePct = (s.trueExposureUsd / limitUsd) * 100;
  const readHigh = exposureUsd > s.trueExposureUsd;
  return [
    {
      kind: 'tool',
      tag: 'Tool call',
      meta: 'nightly_copy',
      code: `SELECT client_id, exposure_usd, limit_usd, as_of\nFROM nightly_copy\nWHERE client_id = '${clientId}'`,
    },
    {
      kind: 'result',
      tag: 'Result',
      meta: 'nightly_copy',
      code: `exposure_usd  ${money(exposureUsd)}\nlimit_usd     ${money(limitUsd)}\nas_of         ${age(s.clocks.servedAgeMs)} ago`,
    },
    {
      kind: 'answer',
      tag: 'Answer',
      meta: `the number is ${age(s.clocks.servedAgeMs)} old`,
      body: `Client ${clientId} is at ${limitUtilPct.toFixed(1)}% of its limit, with $${money(limitUsd - exposureUsd)} of headroom. ${limitUtilPct >= 95 ? 'New trades should be refused.' : 'No action needed.'}`,
    },
    {
      kind: 'error',
      tag: 'What was true',
      meta: 'read live from Confluent',
      body: readHigh
        ? `Exposure was actually $${money(s.trueExposureUsd)}, or ${truePct.toFixed(1)}% of the limit: ${(limitUtilPct - truePct).toFixed(0)} points less than the copy said. A good trade would have been refused.`
        : `Exposure was actually $${money(s.trueExposureUsd)}, or ${truePct.toFixed(1)}% of the limit: ${(truePct - limitUtilPct).toFixed(0)} points more than the copy said. The analyst answered from last night's file, and nobody was told.`,
    },
  ];
}

/**
 * The star of the demo. The engine exposes three generic tools and no mechanism for a
 * purpose-built one, so the analyst lists topics, reads a schema, then writes its own SQL,
 * and every one of those steps appears as it happens. Lifted out of the panel so the tour can
 * put the scripted spine to it on cue.
 */
export function useAnalyst(snapshot: DeskSnapshot | null, mode: Mode, beside: DeskSnapshot | null = null) {
  const [steps, setSteps] = useState<Step[]>([]);
  // What is on screen, kept in step with every write and not only with every render: a
  // question put the instant the one before it finishes must still see its last line.
  const shown = useRef(steps);
  const put = useCallback((next: Step[]) => {
    shown.current = next;
    setSteps(next);
  }, []);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const snap = useRef(snapshot);
  snap.current = snapshot;
  const want = useRef(mode);
  want.current = mode;
  // A second client the desk is reading beside the followed one, where a step shows two.
  const also = useRef(beside);
  also.current = beside;

  /**
   * `about` names the client a scripted question is put about, so it is answered from that
   * client's read and never from whichever one happened to be on screen when it was asked.
   * `queue` waits for an answer still arriving instead of dropping the question, and `keep`
   * puts this question under the conversation so far instead of starting a new one.
   */
  const ask = useCallback(async (q: string, opts: { about?: string; queue?: boolean; keep?: boolean } = {}) => {
    if (!q.trim() || !snap.current) return;
    for (let waited = 0; opts.queue && busyRef.current && waited < 20_000; waited += 100) await pause(100);
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    // A beat that flips the data path, or the client, asks in the same breath, before the
    // next poll has brought back what it asked for. Wait for it, so the nightly script never
    // answers for the live desk, nor one client's figures for another's question.
    const fits = (x: DeskSnapshot | null) =>
      !!x && x.mode === want.current && (!opts.about || x.served.clientId === opts.about);
    const read = () => [snap.current, also.current].find(fits) ?? null;
    for (let waited = 0; !read() && waited < 6_000; waited += 100) await pause(100);
    const s = read() ?? snap.current!;
    const prior = opts.keep ? shown.current : [];
    const collected: Step[] = [{ kind: 'ask', tag: 'Asked', body: q }];
    put([...prior, ...collected]);
    // An answer belongs to the world it was asked in. If the data path flips while it is still
    // arriving, it stops there: the nightly script never finishes its sentence on the live desk.
    const gone = () => want.current !== s.mode;

    if (s.mode === 'before') {
      // Paced like a tool call returning, so the wrong answer lands with the same confidence.
      for (const step of beforeSteps(s)) {
        await pause(step.kind === 'error' ? 2_600 : 700);
        if (gone()) break;
        collected.push(step);
        put([...prior, ...collected]);
      }
      busyRef.current = false;
      setBusy(false);
      return;
    }

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-demo-gate': GATE },
        body: JSON.stringify({ question: q }),
      });
      if (!res.ok || !res.body) throw new Error(`the analyst's route returned ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (gone()) {
          void reader.cancel();
          break;
        }
        buf += dec.decode(value, { stream: true });
        const frames = buf.split('\n\n');
        buf = frames.pop() ?? '';
        for (const frame of frames) {
          const line = frame.replace(/^data:\s*/, '').trim();
          if (!line || line === '[DONE]') continue;
          try {
            collected.push(JSON.parse(line) as Step);
            put([...prior, ...collected]);
          } catch {
            // A partial frame is not fatal; the next read completes it.
          }
        }
      }
    } catch (e) {
      if (gone()) return;
      collected.push({ kind: 'error', tag: 'Failed', body: e instanceof Error ? e.message : String(e) });
      put([...prior, ...collected]);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [put]);

  const clear = useCallback(() => put([]), [put]);
  return { steps, busy, ask, clear };
}

export type Analyst = ReturnType<typeof useAnalyst>;
