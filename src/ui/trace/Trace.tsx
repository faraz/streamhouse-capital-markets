import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import CountUp from '../../reactbits/CountUp';
import ShinyText from '../../reactbits/ShinyText';
import StarBorder from '../../reactbits/StarBorder';
import type { DeskSnapshot } from '../../data/types';
import { ESCALATE_PCT, PALETTE, age, money } from '../format';
import { useNow } from '../useNow';
import { flinkTime, type TraceModel, type Value } from './build';
import { lineOf, sqlLines, type Op } from './specs';
import { Out, useConsole } from '../console';

const EASE = [0.16, 1, 0.3, 1] as const;
/** The window the trace was drawn for, and how far past it a bigger screen may magnify it. */
const DESIGN_W = 1180;
const DESIGN_H = 720;
const MAX_ZOOM = 2;
const WIRE_S = 0.42;
/** How long a field's name takes to ride its wire: slow enough to read. */
const TOKEN_S = 1.05;
const TOKEN_GAP_S = 0.2;
const STAGGER_S = 0.09;

const OP_LABEL: Record<Op, string> = {
  rename: 'renamed',
  cast: 'cast',
  derive: 'derived',
  const: 'constant',
  time: '$rowtime',
  sign: 'signed by change_type',
  aggregate: 'aggregated',
  join: 'joined',
};

interface Geometry {
  left: Array<{ id: string; d: string; line: number; delay: number; label: string }>;
  right: Array<{ id: string; d: string; to: string; delay: number }>;
  width: number;
  height: number;
}

const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const k = Math.max(24, (x2 - x1) * 0.55);
  return `M${x1},${y1} C${x1 + k},${y1} ${x2 - k},${y2} ${x2},${y2}`;
};

function show(v: Value): { text: string; kind: 'str' | 'num' } {
  return typeof v === 'number'
    ? { text: Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100), kind: 'num' }
    : { text: `"${v}"`, kind: 'str' };
}

/** A small bead that rides a wire once, sampled from the wire's own path. */
/**
 * A field's name, carried along its wire. It leaves the raw record under the name the source
 * gave it, goes into the SQL line that reads it, and comes out the other side under the
 * governed name: the renaming is something the room watches happen to a word.
 */
function Token({ d, delay, color, label }: { d: string; delay: number; color: string; label: string }) {
  const pts = useMemo(() => {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    const len = p.getTotalLength();
    return Array.from({ length: 18 }, (_, i) => p.getPointAtLength((len * i) / 17));
  }, [d]);
  const width = label.length * 6.3 + 12;
  return (
    <motion.g
      initial={{ x: pts[0]!.x, y: pts[0]!.y, opacity: 0 }}
      animate={{ x: pts.map((p) => p.x), y: pts.map((p) => p.y), opacity: [0, 1, 1, 1, 0] }}
      transition={{ duration: TOKEN_S, delay, ease: 'easeInOut', opacity: { duration: TOKEN_S, delay, times: [0, 0.12, 0.5, 0.86, 1] } }}
    >
      <rect className="wire-token" x={-width / 2} y={-9} width={width} height={18} rx={4} style={{ stroke: color }} />
      <text className="wire-token-text" textAnchor="middle" dominantBaseline="central" style={{ fill: color }}>
        {label}
      </text>
    </motion.g>
  );
}

/**
 * One record, followed through the stack: the bytes in the raw topic, the Flink statement
 * that reads them, and what it writes, then the materialized row it moved. Each raw field is
 * wired to the SQL line that reads it and on to the column that line writes, so the room
 * sees the transformation rather than being told about it. The second half waits for the
 * record to actually land, because under exactly-once it does not land at once.
 */
interface Story {
  /** One sentence under the title for a term the room may not know. */
  lede?: string;
  /** What happens at each of the three cards, left to right. */
  steps: [Beat, Beat, Beat];
}
interface Beat {
  title: string;
  body: string;
}

/** The trace in plain words: nobody should need to read SQL to follow what happened. */
function storyFor(model: TraceModel, bound: number): Story {
  if (model.kind === 'fat-finger') {
    const qty = Math.abs(Number(model.raw['qty']));
    return {
      lede: `A fat finger is an order typed wrong. This one asks for ${money(qty)} lots, ${Math.round(qty / bound)} times the largest order the desk allows.`,
      steps: [
        { title: 'The order arrives', body: 'Written to Kafka like any other order. Nothing has judged it yet.' },
        { title: 'Flink checks it', body: `One rule in SQL: a quantity over ${money(bound)} lots is turned away.` },
        { title: 'It is set aside', body: 'It goes to the dead letter topic with the reason. The exposure is never touched.' },
      ],
    };
  }
  if (model.kind === 'fill') {
    return {
      lede: 'A fill is an order that has traded. It changes what the client owes, so the exposure has to move.',
      steps: [
        { title: 'The fill arrives', body: 'The trade as it was reported, written to Kafka.' },
        { title: 'Flink adds it up', body: "The statement that keeps every client's total folds it in, once." },
        { title: 'The total moves', body: 'One row per client in a Lightning Table, served to the desk and the analyst.' },
      ],
    };
  }
  return {
    steps: [
      { title: "One source's shape", body: "This system's own field names and units." },
      { title: 'Flink reshapes it', body: 'Renames, casts and derives, then checks the quantity.' },
      { title: 'The governed record', body: 'The one shape every source ends in, served as a Lightning Table.' },
    ],
  };
}

function Step({ n, beat }: { n: number; beat: Beat }) {
  return (
    <p className="stage-step">
      <b>{n}</b>
      <span>
        <strong>{beat.title}</strong>
        {beat.body}
      </span>
    </p>
  );
}

/** When the tabs' lights start after the trace opens, how long each runs, and the gap between tabs. */
const PICK_START_MS = 500;
const PICK_LAPS_MS = 3_400;
const PICK_STEP_MS = 110;

/**
 * One of the six shapes. When the set first opens a light laps each tab in turn, left to
 * right, so the room sees there are six to step through; then it goes out, and comes back
 * only under the pointer or the keyboard's focus.
 */
function ShapePick({
  label, selected, index, introduce, onPick,
}: {
  label: string;
  selected: boolean;
  index: number;
  introduce: boolean;
  onPick(): void;
}) {
  const [lapping, setLapping] = useState(false);
  useEffect(() => {
    if (!introduce) return;
    const start = PICK_START_MS + index * PICK_STEP_MS;
    const on = window.setTimeout(() => setLapping(true), start);
    const off = window.setTimeout(() => setLapping(false), start + PICK_LAPS_MS);
    return () => {
      clearTimeout(on);
      clearTimeout(off);
    };
  }, [introduce, index]);
  return (
    <StarBorder
      as="button"
      type="button"
      role="tab"
      aria-selected={selected}
      className="trace-pick"
      onClick={onPick}
      color={PALETTE.text}
      trailColor={PALETTE.text}
      backgroundColor={selected ? PALETTE.text : 'rgba(231,234,238,0.07)'}
      textColor={selected ? PALETTE.ground : '#C3C9D1'}
      borderColor={selected ? PALETTE.text : 'rgba(231,234,238,0.26)'}
      radius={8}
      thickness={1}
      duration={2.6}
      stars={1}
      glow={0.6}
      sparkle={false}
      hover={lapping ? 'none' : 'reveal'}
      theme="dark"
    >
      <span className="trace-pick-label">{label}</span>
    </StarBorder>
  );
}

export function Trace({
  model, snapshot, onClose, set, onPick, introduce = false,
}: {
  model: TraceModel;
  snapshot: DeskSnapshot;
  onClose(): void;
  /** The other records this one can be swapped for: one of each shape. */
  set?: TraceModel[];
  onPick?(m: TraceModel): void;
  /** True the first time a set opens, so its tabs announce themselves once and not per pick. */
  introduce?: boolean;
}) {
  const now = useNow();
  const c = useConsole();
  // What the statement runs as in the console: a Flink statement, or a materialized table.
  const runs = 'statement' in model.statement.run
    ? { name: c?.statementName(model.statement.run.statement), href: c?.statement(model.statement.run.statement) }
    : { name: model.statement.run.materialized, href: c?.materialized(model.statement.run.materialized) };
  const st = model.statement;
  const lines = useMemo(() => sqlLines(st), [st]);
  const guardLine = st.guard ? lineOf(lines, st.guard) : -1;
  const rawKeys = Object.keys(model.raw);
  const outFields = st.target.fields;

  // Whether what the statement writes has reached the table the trace ends at.
  const seenPending = useRef(false);
  const seenNoReject = useRef(model.rejectClear ?? false);
  const [landedAt, setLandedAt] = useState<number | null>(model.kind === 'record' ? model.sentAt : null);
  useEffect(() => {
    if (landedAt !== null) return;
    if (model.kind === 'fill') {
      const pending = !!snapshot.pendingFill && snapshot.pendingFill.visibleAtMs !== null;
      if (pending) seenPending.current = true;
      const inFigure = snapshot.served.clientId === model.clientId && snapshot.served.asOf >= model.sentAt;
      if (!pending && (seenPending.current || inFigure)) setLandedAt(Date.now());
    } else if (model.kind === 'fat-finger') {
      // An earlier rehearsal's rejection can still be showing; only one that appears after
      // this send is this record's.
      if (!snapshot.rejected) seenNoReject.current = true;
      if (snapshot.rejected && (seenNoReject.current || Date.now() - model.sentAt > 60_000)) setLandedAt(Date.now());
    }
  }, [snapshot, model, landedAt]);
  const landed = landedAt !== null;

  // The newest escalation to arrive after the fill went in, for the end of the trace.
  const seenAlerts = useRef<Set<string> | null>(null);
  const [alert, setAlert] = useState<DeskSnapshot['escalations'][number] | null>(null);
  useEffect(() => {
    const keys = snapshot.escalations.map((e) => `${e.at}-${e.title}`);
    if (seenAlerts.current === null) {
      seenAlerts.current = new Set(keys);
      return;
    }
    if (model.kind !== 'fill' || alert) return;
    const fresh = snapshot.escalations.find((e) => !seenAlerts.current!.has(`${e.at}-${e.title}`));
    if (fresh) setAlert(fresh);
  }, [snapshot.escalations, model.kind, alert]);

  // The trace was drawn for a laptop. On a larger screen the whole of it is magnified to use
  // the room, type, cards and wires together, rather than sitting at laptop size in a corner
  // of a big monitor. It is laid out at the design size and scaled up, never down.
  const section = useRef<HTMLElement>(null);
  const [zoom, setZoom] = useState(1);
  useLayoutEffect(() => {
    const host = section.current?.parentElement;
    if (!host) return;
    const size = () => {
      const k = Math.min(host.clientWidth / DESIGN_W, host.clientHeight / DESIGN_H);
      setZoom(Math.min(MAX_ZOOM, Math.max(1, Math.round(k * 100) / 100)));
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  // Wires are measured from the rendered rows, so they meet the text they connect exactly.
  const body = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<Geometry | null>(null);
  useLayoutEffect(() => {
    const el = body.current;
    if (!el) return;
    const measure = () => {
      const box = el.getBoundingClientRect();
      // In the body's own coordinates, so the wires stay true if the cards outgrow it and it
      // scrolls, and at whatever scale the trace is on screen: the scale is read off the body
      // itself, as what it measures over what it was laid out at.
      const k = el.offsetWidth ? box.width / el.offsetWidth : 1;
      const px = (x: number) => (x - box.left) / k + el.scrollLeft;
      const py = (y: number) => (y - box.top) / k + el.scrollTop;
      const at = (sel: string) => el.querySelector<HTMLElement>(sel)?.getBoundingClientRect() ?? null;
      const rawCard = at('[data-card="raw"]');
      const sqlCard = at('[data-card="sql"]');
      const outCard = at('[data-card="out"]');
      if (!rawCard || !sqlCard || !outCard) return;
      const left: Geometry['left'] = [];
      const right: Geometry['right'] = [];
      let n = 0;
      st.wires.forEach((w, wi) => {
        const li = lineOf(lines, w.match);
        if (li < 0) return;
        const line = at(`[data-line="${li}"] .sql-n`);
        if (!line) return;
        const ly = py(line.top + line.height / 2);
        for (const f of w.from) {
          const row = at(`[data-raw="${f}"] .json-k`);
          if (!row) continue;
          left.push({
            id: `${wi}-${f}`,
            d: curve(px(rawCard.right), py(row.top + row.height / 2), px(sqlCard.left), ly),
            line: li,
            label: f,
            // Far enough apart that each name can be read on its way in.
            delay: 0.35 + n++ * TOKEN_GAP_S,
          });
        }
        if (w.to) {
          const row = at(`[data-out="${w.to}"] .json-k`);
          if (row) {
            right.push({
              id: `${wi}-${w.to}`,
              d: curve(px(sqlCard.right), ly, px(outCard.left), py(row.top + row.height / 2)),
              to: w.to,
              delay: right.length * STAGGER_S,
            });
          }
        }
      });
      // A record already in the table has nothing to wait for, so its governed names leave only
      // once the source's own names have gone in: the renaming reads left to right.
      if (model.kind === 'record') {
        const after = 0.35 + n * TOKEN_GAP_S + TOKEN_S * 0.45;
        right.forEach((w) => (w.delay += after));
      }
      // Sized to the cards, not to the body's scroll height: the drawing is inside the body,
      // so measuring the body would let a tall drawing keep itself tall after the cards shrank.
      const bottom = Math.max(py(rawCard.bottom), py(sqlCard.bottom), py(outCard.bottom));
      setGeo({ left, right, width: el.clientWidth, height: Math.ceil(bottom) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // The cards too: a value that wraps, or a row that lands, moves every row beneath it.
    el.querySelectorAll('[data-card]').forEach((card) => ro.observe(card));
    void document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [st, lines, model.id, zoom]);

  // Which SQL lines have been reached by a wire, so they light as the record arrives.
  const [lit, setLit] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (!geo) return;
    const timers = geo.left.map((w) => window.setTimeout(() => setLit((s) => new Set(s).add(w.line)), (w.delay + TOKEN_S * 0.86) * 1000));
    return () => timers.forEach(clearTimeout);
  }, [geo]);
  const guardAt = geo ? (Math.max(0, ...geo.left.map((w) => w.delay)) + TOKEN_S + 0.15) * 1000 : null;
  const [judged, setJudged] = useState(false);
  useEffect(() => {
    if (guardAt === null) return;
    const id = window.setTimeout(() => setJudged(true), guardAt);
    return () => clearTimeout(id);
  }, [guardAt]);

  const rejected = model.kind === 'fat-finger';
  // The desk's bound, read off the guard's own SQL so the words can never disagree with it.
  const bound = Number(st.guard?.match(/\d{4,}/)?.[0] ?? 50_000);
  const story = storyFor(model, bound);
  const outValues = outValuesFor(model, snapshot, landed);
  const opFor = (key: string) => st.wires.find((w) => w.to === key)?.op;
  // The row for the event's own client, whoever the screen is following.
  const s = snapshot.served.clientId === model.clientId
    ? snapshot.served
    : snapshot.book.find((c) => c.clientId === model.clientId) ?? snapshot.served;
  const before = model.before;
  const afterPct = s.clientId === model.clientId ? s.limitUtilPct : null;
  const waitS = Math.max(0, Math.round(((landedAt ?? now) - model.sentAt) / 1000));

  return (
    <motion.section
      ref={section}
      className="trace"
      data-kind={model.kind}
      style={{ width: `${100 / zoom}%`, height: `${100 / zoom}%`, scale: zoom, originX: 0, originY: 0 }}
      initial={{ opacity: 0, clipPath: 'inset(0 0 100% 0)' }}
      animate={{ opacity: 1, clipPath: 'inset(0 0 0% 0)' }}
      exit={{ opacity: 0, clipPath: 'inset(0 0 100% 0)', transition: { duration: 0.3, ease: EASE } }}
      transition={{ duration: 0.6, ease: EASE }}
      aria-label="Record trace"
    >
      <header className="trace-head">
        <div className="trace-title">
          <h2>
            {model.kind === 'fill'
              ? `A $${(Number(model.raw['qty']) * Number(model.raw['px']) / 1e6).toFixed(2)}m fill for client ${model.clientId}, added to its running total`
              : model.kind === 'fat-finger'
                ? `A fat finger for client ${model.clientId}, turned away by the Flink guard`
                : `A ${model.label} record, reshaped into the governed record`}
          </h2>
          {/* The sentence for a term the room may not know; otherwise the route, which the
              three cards repeat anyway. */}
          {story.lede ? (
            <p className="trace-lede">{story.lede}</p>
          ) : (
            <span className="trace-route mono">
              {st.source.topic} <i>/</i> {st.file} <i>/</i> {st.target.topic}
            </span>
          )}
        </div>
        <div className="trace-clock">
          <span className="trace-elapsed num" data-landed={landed}>
            {model.kind === 'record'
              ? `in positions since ${utc(model.sentAt)}`
              : landed
                ? `landed in ${age(Math.max(0, (landedAt ?? 0) - model.sentAt))}`
                : `${waitS}s since it entered Kafka`}
          </span>
          <button type="button" className="btn" onClick={onClose}>
            Back to the desk <kbd>Esc</kbd>
          </button>
        </div>
      </header>

      {set && set.length > 1 ? (
        <div className="trace-set" role="tablist" aria-label="The six shapes">
          {set.map((m, i) => (
            <ShapePick
              key={m.id}
              label={m.label}
              selected={m.id === model.id}
              index={i}
              introduce={introduce}
              onPick={() => onPick?.(m)}
            />
          ))}
        </div>
      ) : null}

      <div className="trace-body" ref={body}>
        <svg className="trace-wires" width={geo?.width ?? 0} height={geo?.height ?? 0} aria-hidden="true">
          {geo?.left.map((w) => (
            <g key={w.id}>
              <path d={w.d} className="wire-base" />
              <motion.path
                d={w.d}
                className="wire"
                data-tone={rejected && w.id.endsWith('-qty') ? 'hot' : undefined}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: WIRE_S, delay: w.delay, ease: EASE }}
              />
              <Token d={w.d} delay={w.delay} label={w.label} color={rejected && w.id.endsWith('-qty') ? PALETTE.warn : PALETTE.text} />
            </g>
          ))}
          {geo?.right.map((w) => (
            <g key={w.id}>
              <path d={w.d} className="wire-base" data-waiting={!landed} />
              {landed ? (
                <>
                  <motion.path
                    d={w.d}
                    className="wire"
                    data-tone={rejected ? 'turned' : 'fresh'}
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: WIRE_S, delay: w.delay, ease: EASE }}
                  />
                  <Token d={w.d} delay={w.delay} label={w.to} color={rejected ? PALETTE.warn : PALETTE.fresh} />
                </>
              ) : null}
            </g>
          ))}
        </svg>

        <div className="stage-card" data-card="raw">
          <Step n={1} beat={story.steps[0]} />
          <div className="stage-head">
            <span className="stage-name">
              <em className="stage-pillar">Stream</em>
              Kafka topic
            </span>
            <span className="stage-status" data-tone="fresh">
              <i />
              {model.kind === 'record' ? 'event time' : 'written'} {utc(model.sentAt)}
            </span>
          </div>
          <div className="stage-meta mono">
            <Out href={c?.topic(st.source.topic)} title="This topic's records, in the console">{st.source.topic}</Out>{' '}
            <span>/ {st.source.format}</span>
          </div>
          <div className="json">
            <span className="json-brace">{'{'}</span>
            {rawKeys.map((k, i) => {
              const value = model.raw[k];
              const v = value === null || value === undefined ? { text: 'not kept', kind: 'none' as const } : show(value);
              const type = st.source.fields.find((f) => f.key === k)?.type;
              return (
                <motion.div
                  key={k}
                  className="json-row"
                  data-raw={k}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.35, delay: 0.05 + i * 0.04, ease: EASE }}
                >
                  <span className="json-k">"{k}"</span>
                  <span className="json-colon">:</span>
                  <span className="json-v" data-kind={v.kind} data-hot={rejected && k === 'qty'}>
                    {v.text}
                    {i < rawKeys.length - 1 ? ',' : ''}
                  </span>
                  {type ? <span className="json-t">{type}</span> : null}
                </motion.div>
              );
            })}
            <span className="json-brace">{'}'}</span>
          </div>
          {model.exact ? null : (
            <p className="stage-foot">
              Shape from {st.source.schema}, with the values this record carries. Raw topics are not served.
            </p>
          )}
        </div>

        <div className="stage-card" data-card="sql">
          <Step n={2} beat={story.steps[1]} />
          <div className="stage-head">
            <span className="stage-name">
              <em className="stage-pillar">{rejected ? 'Govern' : 'Process'}</em>
              Flink SQL
            </span>
            <span className="stage-status" data-tone={judged && !rejected ? 'fresh' : undefined}>
              <i />
              {st.target.kind === 'materialized' ? 'materialized table' : 'SQL statement'}
            </span>
          </div>
          <div className="stage-meta mono">
            {st.file}
            {c ? (
              <>
                {' '}
                <span>/ runs as</span>{' '}
                <Out href={runs.href} title="This statement, in Flink management">{runs.name}</Out>
              </>
            ) : null}
          </div>
          <ol className="sql">
            {lines.map((l, i) => {
              const isGuard = i === guardLine;
              return (
                <li
                  key={i}
                  className="sql-line"
                  data-line={i}
                  data-lit={lit.has(i)}
                  data-gap={l.n === null ? 'true' : undefined}
                  data-guard={isGuard ? (judged ? (rejected ? 'routed' : 'pass') : 'wait') : undefined}
                  title={l.text.trim()}
                >
                  <span className="sql-n">{l.n ?? ''}</span>
                  <code>{l.text}</code>
                  {isGuard && judged ? (
                    <motion.span
                      className="guard-verdict"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3, ease: EASE }}
                    >
                      {rejected ? `${money(Number(model.raw['qty']))} lots is over the bound` : 'within the bound'}
                    </motion.span>
                  ) : null}
                </li>
              );
            })}
          </ol>
          {rejected ? (
            <p className="stage-foot">
              The guard reads only the quantity; the kind field is this demo's own label.
            </p>
          ) : null}
        </div>

        <div className="stage-card" data-card="out" data-landed={landed}>
          <Step n={3} beat={story.steps[2]} />
          <div className="stage-head">
            <span className="stage-name">
              <em className="stage-pillar">{rejected ? 'Govern' : 'Query'}</em>
              <Out href={c?.lightningTable(st.target.topic)} title="This Lightning Table, in the console">{st.target.topic}</Out>
            </span>
            {landed ? (
              <span className="stage-status" data-tone={rejected ? 'warn' : 'fresh'}>
                <i />
                {rejected ? 'dead letter written' : st.target.kind === 'materialized' ? 'row upserted' : 'record appended'}
              </span>
            ) : (
              <span className="stage-status waiting">
                <ShinyText text="waiting for Flink's next commit" color={PALETTE.dim} shineColor={PALETTE.text} speed={1.6} />
              </span>
            )}
          </div>
          <div className="json">
            <span className="json-brace">{'{'}</span>
            {outFields.map((f, i) => {
              const raw = outValues?.[f.key];
              const v = raw === undefined ? null : show(raw);
              const op = opFor(f.key);
              const prior = model.kind === 'fill' && before ? priorFor(f.key, before) : undefined;
              return (
                <div key={f.key} className="json-row" data-out={f.key} data-ready={landed}>
                  <span className="json-k">"{f.key}"</span>
                  <span className="json-colon">:</span>
                  <span className="json-v" data-kind={v?.kind ?? 'none'}>
                    {landed && typeof prior === 'number' && raw !== undefined && prior !== raw ? (
                      <s className="json-was">{show(prior).text}</s>
                    ) : null}
                    {landed && v ? (
                      <motion.span
                        initial={{ opacity: 0, filter: 'blur(4px)' }}
                        animate={{ opacity: 1, filter: 'blur(0px)' }}
                        transition={{ duration: 0.4, delay: 0.25 + i * 0.05, ease: EASE }}
                      >
                        {v.text}
                      </motion.span>
                    ) : (
                      <span className="json-pending">{v?.text ?? '…'}</span>
                    )}
                    {i < outFields.length - 1 ? ',' : ''}
                  </span>
                  <span className="json-t">
                    {f.key === 'ingest_lag_ms' && typeof raw === 'number' && raw > 0 ? <b>{age(raw)} stale</b> : null}
                    {f.type}
                    {op ? <em data-op={op}>{OP_LABEL[op]}</em> : null}
                  </span>
                </div>
              );
            })}
            <span className="json-brace">{'}'}</span>
          </div>
        </div>
      </div>

      <footer className="trace-foot">
        <div className="mat">
          <span className="mat-k">
            <Out href={c?.materialized('client_exposure')} title="The materialized table, in the console">client_exposure</Out> / {model.clientId}
          </span>
          {model.kind === 'fill' && before ? (
            <div className="mat-row">
              <span className="mat-was num">{before.limitUtilPct.toFixed(1)}%</span>
              <span className="mat-arrow" aria-hidden="true">
                <svg width="28" height="10" viewBox="0 0 28 10"><path d="M0 5h25M21 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>
              </span>
              <span className="mat-now num" data-tone={landed && afterPct !== null && afterPct >= ESCALATE_PCT ? 'warn' : undefined}>
                {landed && afterPct !== null ? (
                  <CountUp from={before.limitUtilPct} to={Math.round(afterPct * 10) / 10} decimals={1} suffix="%" duration={1.2} trigger="load" />
                ) : (
                  <ShinyText text="next commit" color={PALETTE.dim} shineColor={PALETTE.text} speed={1.6} />
                )}
              </span>
              <span className="mat-note">
                {landed
                  ? `+$${money(Number(model.raw['qty']) * Number(model.raw['px']))} added at the commit; the Lightning Table had it within a second`
                  : 'The figure waits for Flink to commit, so it is never counted twice.'}
              </span>
            </div>
          ) : model.kind === 'fat-finger' ? (
            <div className="mat-row">
              <span className="mat-now num">{s.limitUtilPct.toFixed(1)}%</span>
              {landed ? <span className="mat-kept">exposure unchanged</span> : null}
              <span className="mat-note">{landed ? 'The figure never saw the order.' : 'The guard runs before anything is added up.'}</span>
            </div>
          ) : (
            <div className="mat-row">
              <span className="mat-now num">{s.clientId === model.clientId ? `$${money(s.exposureUsd)}` : 'one of 4,000 rows'}</span>
              <span className="mat-note">One of the records Flink adds up into this client&rsquo;s exposure.</span>
            </div>
          )}
        </div>

        <AnimatePresence>
          {alert ? (
            <motion.div
              className="trace-alert"
              initial={{ opacity: 0, x: 16, filter: 'blur(6px)' }}
              animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
              transition={{ duration: 0.5, ease: EASE }}
            >
              <span className="trace-alert-by">
                client_escalations /{' '}
                <Out href={alert.author === 'risk-agent' ? c?.agent('risk_agent') : null}>{alert.author === 'risk-agent' ? 'risk agent' : alert.author}</Out>
              </span>
              <span>{alert.what}</span>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </footer>
    </motion.section>
  );
}

/** Every time on the desk is the data's own: UTC, and labelled. */
const utc = (ms: number) => `${flinkTime(ms).slice(11, 19)} UTC`;

/** What the table ends up holding, once there is something to show. */
function outValuesFor(model: TraceModel, snap: DeskSnapshot, landed: boolean): Record<string, Value> | null {
  if (model.kind !== 'fill') return model.out;
  const s = snap.served.clientId === model.clientId
    ? snap.served
    : snap.book.find((c) => c.clientId === model.clientId);
  if (!landed || !s) return model.before ? rowOf(model.before) : null;
  return rowOf(s);
}

function rowOf(c: DeskSnapshot['served']): Record<string, Value> {
  return {
    client_id: c.clientId,
    exposure_usd: Math.round(c.exposureUsd),
    limit_usd: Math.round(c.limitUsd),
    limit_util_pct: Math.round(c.limitUtilPct * 100) / 100,
    // The simulator keeps its own trading day, not the epoch.
    as_of: c.asOf > 1e12 ? flinkTime(c.asOf) : 'simulator clock',
  };
}

function priorFor(key: string, before: DeskSnapshot['served']): Value | undefined {
  return rowOf(before)[key];
}
