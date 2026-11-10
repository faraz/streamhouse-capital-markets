import type { DeskSnapshot } from './data/types';

/** Milliseconds, spoken the way a person would say them. */
export function age(ms: number): string {
  if (ms < 1000) return '&lt;100ms';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}

export const money = (n: number) => Math.round(n).toLocaleString('en-US');

export function clockOf(ms: number): string {
  const d = new Date(ms);
  return [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const tone = (ms: number) => (ms < 90_000 ? 'fresh' : ms < 600_000 ? 'warn' : 'stale');
const $ = (id: string) => document.getElementById(id)!;

export function render(s: DeskSnapshot): void {
  const live = s.mode === 'streamhouse';

  $('wall').textContent = clockOf(s.wallClock);
  $('client-line').textContent = `Client ${s.served.clientId} / limit ${money(s.served.limitUsd)}`;

  // Never decorative: the presenter must always be able to tell, and say, whether what
  // is on screen came from Confluent or from the simulator.
  const origin = $('origin');
  origin.setAttribute('data-origin', s.origin);
  $('origin-text').textContent = s.origin === 'confluent' ? 'live confluent' : 'simulator';

  renderSources(s);
  renderRecord(s, live);
  renderAgentNote(s, live);
  renderEscalations(s);
  renderClocks(s, live);
  renderBook(s);
}

function renderSources(s: DeskSnapshot): void {
  $('shapes').innerHTML =
    s.sources
      .map(
        (x) => `<div class="shape" data-hit="false" data-reject="false">
      <span class="shape-name"><span class="shape-n">${esc(x.name)}</span><span class="shape-k">${esc(x.shape)}</span></span>
      <span class="shape-raw">${esc(x.raw)}</span>
    </div>`,
      )
      .join('') +
    (s.rejected
      ? `<div class="shape" data-reject="true">
      <span class="shape-name"><span class="shape-n">Intraday feed</span><span class="shape-k">Rejected by a Flink guard</span></span>
      <span class="shape-raw">${esc(s.rejected.raw)} &rarr; ${esc(s.rejected.topic)}</span>
    </div>`
      : '');

  $('norm-count').textContent = `${s.sources.length} sources / 1 schema`;
  $('norm-note').innerHTML =
    s.mode === 'streamhouse'
      ? 'Connect turns whatever arrived into one fact with a key, a time and how stale its feed was. The position file is read at source, so the stalest input is <strong>seconds</strong> old instead of a night old.'
      : `Without change data capture the book of record is only read by tonight's extract, so the assembled answer is <strong>${age(
          s.clocks.servedAgeMs,
        )}</strong> old before anyone queries it.`;
}

function renderRecord(s: DeskSnapshot, live: boolean): void {
  const n = s.normalized;
  $('record').innerHTML =
    `<span class="k">client_id</span>     <span class="s">"${esc(n.clientId)}"</span>\n` +
    `<span class="k">symbol</span>        <span class="s">"${esc(n.symbol)}"</span>\n` +
    `<span class="k">quantity</span>      <span class="n2">${n.quantity}</span>\n` +
    `<span class="k">price</span>         <span class="n2">${n.price}</span>\n` +
    `<span class="k">notional_usd</span>  <span class="n2">${money(n.notionalUsd)}</span>\n` +
    `<span class="k">event_time</span>    <span class="s">"${new Date(n.eventTime).toISOString()}"</span>\n` +
    `<span class="k">source</span>        <span class="s">"${esc(n.source)}"</span>\n` +
    `<span class="k">ingest_lag_ms</span> <span class="${live ? 'n2' : ''}" style="${live ? '' : 'color:var(--alert)'}">${n.ageMs}</span>` +
    `  <span class="cmt">// how stale the feed was when captured</span>`;

  $('gov').innerHTML = [
    ['Schema contract', 'true'],
    ['Flink validation / quantity', s.rejected ? 'dlq' : 'true'],
    ['Lineage / last 10 minutes', 'true'],
    ['Governance Essentials', 'true'],
    [live ? 'Change data capture' : 'Nightly extract only', live ? 'true' : 'false'],
  ]
    .map(([label, on]) => `<span class="chip" data-on="${on}">${label}</span>`)
    .join('');
}

function renderAgentNote(s: DeskSnapshot, live: boolean): void {
  $('agent-conn').textContent = live ? 'Connected / 3 tools' : 'No MCP. Reading a copy.';
  $('agent-note').innerHTML = live
    ? 'The engine exposes three generic tools, so the agent writes its own SQL rather than calling a purpose-built endpoint. It lists topics, reads a schema, then queries.'
    : 'In the before-world there is nothing to connect an agent to, so it reads whatever copy was loaded last. It answers confidently and it is wrong, at machine speed.';
}

function renderEscalations(s: DeskSnapshot): void {
  $('esc').innerHTML = s.escalations.length
    ? s.escalations
        .map(
          (e) => `<div class="esc-row" data-tone="${e.tone}">
      <span class="esc-who">${esc(e.who)}</span>
      <span class="esc-what">${esc(e.what)}</span>
    </div>`,
        )
        .join('')
    : '<div class="esc-none">No client within 10% of a limit.</div>';
}

function renderClocks(s: DeskSnapshot, live: boolean): void {
  const a1 = s.clocks.servedAgeMs;
  const a3 = s.clocks.openTableAgeMs;
  const rows = [
    { n: 'Whoever asked', k: live ? 'Lightning Table / SQL and MCP' : 'Overnight copy', a: a1 },
    { n: 'The risk officer', k: live ? 'Same table, whole book' : 'Database fed overnight', a: a1 },
    {
      n: 'Reporting and audit',
      k: live ? (a3 > 0 ? 'Open table / Tableflow' : 'Not enabled yet') : 'ETL, when it ran',
      a: a3 > 0 ? a3 : a1,
    },
  ];
  $('clocks').innerHTML = rows
    .map(
      (r) => `<div class="clk" data-tone="${tone(r.a)}">
    <span class="clk-who"><span class="clk-n">${r.n}</span><span class="clk-k">${r.k}</span></span>
    <span class="clk-age">${age(r.a)}</span></div>`,
    )
    .join('');

  const pct = s.served.limitUtilPct;
  const truePct = (s.trueExposureUsd / s.served.limitUsd) * 100;
  $('limit-meter').innerHTML =
    `<div class="meter-row"><span class="lbl">Served / limit used</span><span class="meter-pct num">${pct.toFixed(1)}%</span></div>` +
    `<div class="meter-track"><div class="meter-fill" style="width:${Math.min(100, pct)}%" data-over="${pct > 100}"></div>` +
    `<div class="meter-true" style="left:${Math.min(100, truePct)}%"></div></div>` +
    `<div class="meter-row"><span class="lbl">White marker / true now</span><span class="meter-pct num">${truePct.toFixed(1)}%</span></div>`;

  $('iso-note').innerHTML =
    s.mode === 'before'
      ? 'Isolation is not a choice here. There is one overnight copy, and it is as old as it is.'
      : "A Lightning Table takes a change in under 100ms. The minute is <strong>Flink's commit</strong>, the price of exactly once.";
}

function renderBook(s: DeskSnapshot): void {
  const top = s.book.slice(0, 10);
  $('book-count').textContent = `${s.book.length} rows, top 10`;
  $('book').innerHTML =
    '<div class="book-head"><span class="lbl">Client</span><span class="lbl">Limit used</span><span class="lbl" style="text-align:right">%</span></div>' +
    top
      .map(
        (r) => `<div class="book-row" data-focus="${r.clientId === s.served.clientId}" data-near="${r.limitUtilPct >= 90}">
      <span>${esc(r.clientId)}</span>
      <span class="book-bar"><span style="width:${Math.min(100, r.limitUtilPct)}%"></span></span>
      <span class="book-util">${r.limitUtilPct.toFixed(0)}%</span>
    </div>`,
      )
      .join('');
}
