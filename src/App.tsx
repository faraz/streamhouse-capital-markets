import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useDesk } from './useDesk';
import { DEFAULT_FILL_LOTS } from './data/simulator';
import { FOLLOWED } from './data/book';
import { AppBar } from './ui/AppBar';
import { Book } from './ui/Book';
import { Client } from './ui/Client';
import { Pipeline } from './ui/Pipeline';
import { Records } from './ui/Records';
import { Analyst } from './ui/Analyst';
import { Alerts } from './ui/Alerts';
import { Narration, TourRail, useTour } from './ui/Tour';
import { useAnalyst } from './ui/useAnalyst';
import { Hero } from './ui/Hero';
import { Trace } from './ui/trace/Trace';
import { fromEvent, fromPosition, type TraceModel } from './ui/trace/build';
import type { Position } from './data/types';
import { BrandLockup } from './ui/BrandMark';
import { Splitter } from './ui/Splitter';
import { useLayout } from './ui/useLayout';
import { ConsoleContext, consoleLinks } from './ui/console';
import { Itinerary } from './ui/Itinerary';

/** How long after a fill lands its route across the desk is still worth drawing. */
const ROUTE_FRESH_MS = 180_000;

/**
 * A risk workstation a desk would recognise, with the talk's run-of-show laid over it as a
 * tour. The product is always the whole screen; a beat only decides which panels the room
 * looks at and what the presenter's next key press does.
 */
export default function App() {
  const desk = useDesk();
  const analyst = useAnalyst(desk.snapshot, desk.mode, desk.beside);
  const { layout, set: setLayout } = useLayout();
  const gridRef = useRef<HTMLElement>(null);
  const sizeOf = (selector: string, side: 'width' | 'height') =>
    gridRef.current?.querySelector<HTMLElement>(selector)?.getBoundingClientRect()[side] ?? 0;
  // The middle column is never dragged below what the figure and the flow need.
  const roomFor = (other: string) => Math.max(240, (gridRef.current?.clientWidth ?? 1440) - sizeOf(other, 'width') - 460);

  // A narrative event opens its own trace, with the exact bytes the Worker wrote to Kafka
  // and the served figure as it stood the moment before.
  const [trace, setTrace] = useState<TraceModel | null>(null);
  // The records the open trace can be swapped for: one real record of each of the six shapes.
  const [traceSet, setTraceSet] = useState<TraceModel[] | null>(null);
  // Whether the open set has been stepped through yet: its tabs announce themselves once.
  const [picked, setPicked] = useState(false);
  const openTrace = useCallback((t: TraceModel | null, set: TraceModel[] | null = null) => {
    setTrace(t);
    setTraceSet(set);
    setPicked(false);
  }, []);
  // Asked for before the streamhouse snapshot has arrived: opened as soon as it has.
  const [wantShapes, setWantShapes] = useState<string | null>(null);
  // A question waiting for the fill in flight to reach the served figure. Asked any sooner,
  // the analyst reads the table before Flink's commit and reports the last thing, not this.
  const [askLater, setAskLater] = useState<string | null>(null);
  const snapRef = useRef(desk.snapshot);
  snapRef.current = desk.snapshot;
  const deskRef = useRef(desk);
  deskRef.current = desk;
  // The served row of the client an event is for, which is not always the one on screen: the
  // presenter may be following someone else when they press the button, and the trace must
  // show the figure the event will move.
  const rowFor = (clientId: string) => {
    const snap = snapRef.current;
    if (!snap) return null;
    return snap.served.clientId === clientId ? snap.served : snap.book.find((c) => c.clientId === clientId) ?? null;
  };
  const tourDesk = useMemo(
    () => ({
      setMode: (m: Parameters<typeof desk.setMode>[0]) => deskRef.current.setMode(m),
      setClient: (c: string) => deskRef.current.setClient(c),
      fill: () => {
        const before = rowFor(FOLLOWED);
        void deskRef.current.fill(DEFAULT_FILL_LOTS).then((ev) => {
          if (ev && before) openTrace(fromEvent(ev, before));
        });
      },
      fatFinger: () => {
        const before = rowFor(FOLLOWED);
        // Whether the desk was clear of an earlier rejection as this one was sent: if it was,
        // the next rejection the trace sees is this order's, however soon it shows.
        const rejectClear = !snapRef.current?.rejected;
        void deskRef.current.fatFinger().then((ev) => {
          if (ev && before) openTrace({ ...fromEvent(ev, before), rejectClear });
        });
      },
      // The custodial file first: fixed-width cents and units become a price and a notional,
      // which is the reshaping at its most visible.
      traceShapes: () => setWantShapes('custodial'),
      askWhenLanded: (question: string) => setAskLater(question),
    }),
    [openTrace],
  );
  const traceRecord = useCallback((p: Position) => {
    const t = fromPosition(p, snapRef.current?.served ?? null);
    if (t) openTrace(t);
  }, [openTrace]);
  const tour = useTour(tourDesk, analyst);

  useEffect(() => {
    const snap = desk.snapshot;
    if (!wantShapes || !snap || snap.mode !== 'streamhouse' || !snap.shapes.length) return;
    const set = snap.shapes
      .map((p) => fromPosition(p, null))
      .filter((m): m is TraceModel => !!m);
    const first = set.find((m) => m.id.startsWith(`record-${wantShapes}-`)) ?? set[0];
    setWantShapes(null);
    if (first) openTrace(first, set);
  }, [wantShapes, desk.snapshot, openTrace]);

  const { ask: askAnalyst, busy: analystBusy } = analyst;
  useEffect(() => {
    const snap = desk.snapshot;
    if (!askLater || !snap || analystBusy) return;
    const inFlight = !!snap.pendingFill && snap.pendingFill.visibleAtMs !== null;
    if (inFlight) return;
    setAskLater(null);
    void askAnalyst(askLater);
  }, [askLater, desk.snapshot, analystBusy, askAnalyst]);

  // The false block shows the followed client beside the one it is about, so that client is
  // read live for as long as the step is on screen.
  const { readBeside } = desk;
  const besideStep = tour.beat.id === 'false-block';
  useEffect(() => readBeside(besideStep ? FOLLOWED : null), [besideStep, readBeside]);

  // Moving to another beat puts the desk back; a beat that fires an event opens its own.
  useEffect(() => openTrace(null), [tour.index, openTrace]);
  useEffect(() => {
    if (!trace) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      openTrace(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [trace]);
  // The hero sits over the desk, which is already polling underneath, so the room never
  // watches the desk load. Starting a run over brings the hero back.
  const [entered, setEntered] = useState(false);
  const { point } = tour;
  // The first step's spotlight ran out behind the hero, so it is given again as the desk appears.
  const enter = useCallback(() => {
    setEntered(true);
    point();
  }, [point]);
  const rewind = useCallback(() => {
    tour.rewind();
    setEntered(false);
  }, [tour]);

  // A conversation belongs to the world it was had in: flipping the data path starts afresh,
  // so the nightly answer never sits beside the live one as if they were the same kind.
  const { clear } = analyst;
  useEffect(() => clear(), [desk.mode, clear]);

  // The two narrative events get a mark in the pipeline at the moment they land: the fill
  // when the served figure has it, the fat finger when the guard's rejection shows.
  const s = desk.snapshot;
  const [fillAt, setFillAt] = useState<number | null>(null);
  const [rejectAt, setRejectAt] = useState<number | null>(null);
  const hadPending = useRef(false);
  const hadReject = useRef(false);
  useEffect(() => {
    if (!s) return;
    const pending = !!s.pendingFill && s.pendingFill.visibleAtMs !== null;
    if (hadPending.current && !pending) setFillAt(Date.now());
    hadPending.current = pending;
    const rejected = !!s.rejected;
    if (!hadReject.current && rejected) setRejectAt(Date.now());
    hadReject.current = rejected;
  }, [s]);

  // Console addresses exist only for the live streamhouse: the simulator has no console, and
  // the before-world's six systems are a script.
  const live = s?.mode === 'streamhouse' ? s.console : undefined;
  const links = useMemo(
    () => (live ? consoleLinks(live) : null),
    [live?.environmentId, live?.clusterId, live?.cloud, live?.region],
  );

  const hero = (
    <AnimatePresence>{entered ? null : <Hero key="hero" snapshot={s} onEnter={enter} />}</AnimatePresence>
  );

  if (!s) {
    if (!entered) return hero;
    return (
      <div className="boot">
        <BrandLockup size={32} className="brand--boot" />
        <p>Reading the served tables</p>
      </div>
    );
  }

  return (
    <ConsoleContext.Provider value={links}>
    <div className="ws" data-mode={s.mode} data-spotlight={tour.spotlight}>
      <AppBar
        snapshot={s}
        mode={desk.mode}
        onMode={desk.setMode}
        onFill={tourDesk.fill}
        onFatFinger={tourDesk.fatFinger}
        onReset={() => {
          void desk.reset();
          rewind();
        }}
        canReset={desk.canReset}
      />

      <div className="notes">
        <AnimatePresence>
          {desk.eventError ?? desk.note ? (
            <motion.p
              className="note"
              role="status"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              {desk.eventError ?? desk.note}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="stage">
        <main
          className="grid"
          ref={gridRef}
          style={{
            ...(layout.book !== null ? { '--w-book': `${layout.book}px` } : {}),
            ...(layout.agent !== null ? { '--w-agent': `${layout.agent}px` } : {}),
            ...(layout.records !== null ? { '--h-records': `${layout.records}px` } : {}),
          } as React.CSSProperties}
        >
          <Book
            snapshot={s}
            tour={tour}
            onClient={desk.setClient}
            also={besideStep && s.served.clientId !== FOLLOWED ? FOLLOWED : null}
            handle={
              <Splitter
                axis="x"
                label="Resize the book"
                grows={1}
                min={200}
                max={Math.min(480, roomFor('.col-agent'))}
                measure={() => sizeOf('[data-panel="book"]', 'width')}
                onChange={(px) => setLayout({ book: px })}
                onReset={() => setLayout({ book: null })}
              />
            }
          />
          <div className="col col-main">
            <Client snapshot={s} tour={tour} beside={desk.beside} />
            <Pipeline
              snapshot={s}
              tour={tour}
              rejectAt={rejectAt}
              fillAt={fillAt}
              onTraceSource={(id) => setWantShapes(id)}
              onTraceShapes={() => setWantShapes('custodial')}
            />
            <Records
              snapshot={s}
              tour={tour}
              onTrace={s.mode === 'streamhouse' ? traceRecord : undefined}
              beside={besideStep && s.served.clientId !== FOLLOWED ? desk.beside : null}
              handle={
                <Splitter
                  axis="y"
                  label="Resize the records"
                  grows={-1}
                  min={110}
                  max={460}
                  measure={() => sizeOf('[data-panel="records"]', 'height')}
                  onChange={(px) => setLayout({ records: px })}
                  onReset={() => setLayout({ records: null })}
                />
              }
            />
          </div>
          <div className="col col-agent">
            <Splitter
              axis="x"
              label="Resize the analyst"
              grows={-1}
              min={300}
              max={Math.min(640, roomFor('[data-panel="book"]'))}
              measure={() => sizeOf('.col-agent', 'width')}
              onChange={(px) => setLayout({ agent: px })}
              onReset={() => setLayout({ agent: null })}
            />
            <Analyst snapshot={s} tour={tour} analyst={analyst} />
            <Alerts snapshot={s} tour={tour} attention={tour.spotlight && tour.beat.id === 'agent'} />
          </div>
        </main>
        {/* A fill's route across the desk, once it has landed and the desk is in view. */}
        {fillAt && !trace && s.mode === 'streamhouse' && Date.now() - fillAt < ROUTE_FRESH_MS ? (
          <Itinerary key={fillAt} tick={s.escalations.length} />
        ) : null}
        <AnimatePresence>
          {trace ? (
            <Trace
              key={trace.id}
              model={trace}
              snapshot={s}
              onClose={() => openTrace(null)}
              set={traceSet ?? undefined}
              introduce={!picked}
              onPick={(m) => {
                openTrace(m, traceSet);
                setPicked(true);
              }}
            />
          ) : null}
        </AnimatePresence>
      </div>

      <Narration tour={tour} onRewind={rewind} />
      <TourRail tour={tour} />
      {hero}
    </div>
    </ConsoleContext.Provider>
  );
}
