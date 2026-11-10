import type { ExposureSource, Isolation, Mode } from './data/types';
import { DEFAULT_FILL_LOTS, Simulator } from './data/simulator';
import { LiveSource } from './data/live';
import { FALSE_BLOCK, FOLLOWED } from './data/book';
import { render } from './render';

const GATE = import.meta.env['VITE_DEMO_GATE'] ?? 'local-dev';

/**
 * Polling, not streaming, and only while the tab is visible. The free hosting tier
 * allows 100,000 requests a day, and a demo that sits open all afternoon would otherwise
 * spend that on an empty room.
 */
const POLL_MS = 2_000;

const $ = (id: string) => document.getElementById(id)!;

// A real clock for the running demo. The simulator takes it injected so a test can run a
// whole trading day in milliseconds; here it is wall time since the page opened.
const started = Date.now();
const clock = () => Date.now() - started;

const simulator = new Simulator({ clock, clientCount: 4000 });
const liveSource = new LiveSource({ clock, gate: GATE, clientCount: 4000 });

let source: ExposureSource = liveSource;
let client = FOLLOWED;
let mode: Mode = 'streamhouse';
let isolation: Isolation = 'committed';
let busy = false;

const QUESTIONS = [
  `What is client ${FOLLOWED}'s exposure right now, across everything?`,
  'Which clients are nearest their limit?',
  `Did anything just change for ${FOLLOWED}?`,
];

async function tick(): Promise<void> {
  if (document.hidden) return;
  try {
    render(await source.snapshot(client));
  } catch (e) {
    // A failed live call is not a failed demo: fall back to the simulator and say so,
    // which is the whole reason the simulator is permanent.
    if (source === liveSource) {
      setSource('sim', `live source unavailable: ${e instanceof Error ? e.message : e}`);
    }
  }
}

function setMode(next: Mode): void {
  mode = next;
  $('m-before').setAttribute('aria-pressed', String(next === 'before'));
  $('m-stream').setAttribute('aria-pressed', String(next === 'streamhouse'));
  void source.setMode(next);
  void tick();
}

function setSource(which: 'live' | 'sim', reason?: string): void {
  source = which === 'live' ? liveSource : simulator;
  $('s-live').setAttribute('aria-pressed', String(which === 'live'));
  $('s-sim').setAttribute('aria-pressed', String(which === 'sim'));
  void source.setMode(mode);
  void source.setIsolation(isolation);
  if (reason) console.warn(reason);
  void tick();
}

function setClient(next: string): void {
  client = next;
  document.querySelectorAll<HTMLButtonElement>('.c-btn').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset['client'] === next));
  });
  void tick();
}

/* ---------- the agent ---------- */

type Step = { kind: string; tag: string; meta?: string; code?: string; body?: string };

function renderTape(steps: Step[], thinking: boolean): void {
  if (!steps.length && !thinking) {
    $('tape').innerHTML =
      '<div class="tape-empty"><span class="lbl">Real-Time Context Engine / MCP</span>' +
      '<p>Three tools are on the connection: listTopics, getMetadata and queryData. ' +
      'Ask a question and the agent will pick its own way to the answer.</p></div>';
    return;
  }
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  $('tape').innerHTML =
    steps
      .map((s) => {
        const kind = s.kind === 'error' ? 'wrong' : s.kind;
        return `<div class="step" data-kind="${kind}">
        <div class="step-top"><span class="step-kind">${esc(s.tag)}</span>${
          s.meta ? `<span class="step-meta">${esc(s.meta)}</span>` : ''
        }</div>
        ${s.code ? `<div class="step-code sql">${esc(s.code)}</div>` : ''}
        ${s.body ? `<div class="step-body">${esc(s.body)}</div>` : ''}
      </div>`;
      })
      .join('') +
    (thinking
      ? '<div class="step" data-kind="tool"><div class="step-top"><span class="step-kind">Working</span>' +
        '<span class="thinking"><i></i><i></i><i></i></span></div></div>'
      : '');
  $('tape').scrollTop = $('tape').scrollHeight;
}

async function askAgent(question: string): Promise<void> {
  if (busy) return;
  busy = true;
  renderAsks();
  const steps: Step[] = [{ kind: 'ask', tag: 'Asked', body: question }];
  renderTape(steps, true);

  try {
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-demo-gate': GATE },
      body: JSON.stringify({ question }),
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
          steps.push(JSON.parse(line) as Step);
          renderTape(steps, true);
        } catch {
          // A partial frame is not fatal; the next read completes it.
        }
      }
    }
  } catch (e) {
    steps.push({ kind: 'error', tag: 'Failed', body: e instanceof Error ? e.message : String(e) });
  } finally {
    busy = false;
    renderAsks();
    renderTape(steps, false);
  }
}

function renderAsks(): void {
  $('asks').innerHTML = QUESTIONS.map(
    (q, i) =>
      `<button type="button" class="ask" data-i="${i}"${busy ? ' disabled' : ''}>${q.replace(
        /</g,
        '&lt;',
      )}</button>`,
  ).join('');
  document.querySelectorAll<HTMLButtonElement>('.ask').forEach((b) => {
    b.addEventListener('click', () => void askAgent(QUESTIONS[Number(b.dataset['i'])]!));
  });
  ($('ask-go') as HTMLButtonElement).disabled = busy;
}

/* ---------- wiring ---------- */

$('m-before').addEventListener('click', () => setMode('before'));
$('m-stream').addEventListener('click', () => setMode('streamhouse'));
$('s-live').addEventListener('click', () => setSource('live'));
$('s-sim').addEventListener('click', () => setSource('sim'));
document.querySelectorAll<HTMLButtonElement>('.c-btn').forEach((b) => {
  b.addEventListener('click', () => setClient(b.dataset['client']!));
});
$('fill').addEventListener('click', () => {
  void source.produceFill(client, DEFAULT_FILL_LOTS).then(tick);
});
$('fat').addEventListener('click', () => {
  void source.produceFatFinger(client).then(tick);
});
$('reset').addEventListener('click', () => {
  void source.reset().then(tick);
});
$('ask-go').addEventListener('click', () => {
  const input = $('ask-input') as HTMLInputElement;
  if (input.value.trim()) void askAgent(input.value.trim());
});
$('ask-input').addEventListener('keydown', (e) => {
  if ((e as KeyboardEvent).key !== 'Enter') return;
  const input = $('ask-input') as HTMLInputElement;
  if (input.value.trim()) void askAgent(input.value.trim());
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) void tick();
});

// The mirror case: 7405's stale number reads high, so a good trade gets refused.
document.querySelector<HTMLButtonElement>(`.c-btn[data-client="${FALSE_BLOCK}"]`)?.setAttribute(
  'title',
  'The false block: its stale number reads high, so a good trade gets refused',
);

renderAsks();
renderTape([], false);
setSource('live');
setInterval(() => void tick(), POLL_MS);
