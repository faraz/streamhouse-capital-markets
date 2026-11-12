import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Mode } from '../data/types';
import { FALSE_BLOCK, FOLLOWED } from '../data/book';
import { questionsFor, type Analyst } from './useAnalyst';
import Counter from '../reactbits/Counter';
import GooeyNav from '../reactbits/GooeyNav';
import { PALETTE } from './format';
import type { Pillar } from './pillars';

export type PanelId = 'book' | 'client' | 'pipeline' | 'records' | 'analyst' | 'alerts';

interface Desk {
  setMode(m: Mode): void;
  setClient(c: string): void;
  fill(): void;
  fatFinger(): void;
  /** Open the record trace on a real record of each of the six shapes. */
  traceShapes(): void;
  /** Put a question to the analyst once any fill in flight has reached the served figure. */
  askWhenLanded(question: string): void;
}

interface Beat {
  id: string;
  label: string;
  mode: Mode;
  client: string;
  /** The panels the room should look at. Everything else steps back. */
  lit: PanelId[];
  /** Where the caption sits. */
  anchor: PanelId;
  /** Which of the talk's five pillars this beat is showing, if any. */
  pillars?: Pillar[];
  title: string;
  body: string;
  /** What pressing Space does next, in the presenter's words. */
  next: string | null;
  /** A narrative event, fired once on arriving here going forward, never on going back. */
  enter?(desk: Desk, analyst: Analyst): void;
}

const [Q_EXPOSURE, Q_BOOK, Q_CHANGED] = questionsFor(FOLLOWED) as [string, string, string];

/**
 * The run-of-show, as the screen drives it. Each caption says its trade or platform word in
 * plain language the first time it uses it: the room is sellers, and half of them cover
 * wealth, not a trading floor.
 */
/** How long the spotlight stays on a step's panels before the whole desk comes back up. */
const POINT_MS = 4_500;

export const BEATS: Beat[] = [
  {
    id: 'question', label: 'The question', mode: 'before', client: FOLLOWED,
    lit: ['client', 'pipeline'], anchor: 'client',
    title: 'One question, six systems',
    body: "What is this client's exposure right now, across everything? Exposure is what the client owes or could owe. Six systems each hold a piece of it, and each is a different age.",
    next: 'Ask it the way it is asked today',
  },
  {
    id: 'nightly', label: "Today's answer", mode: 'before', client: FOLLOWED,
    lit: ['analyst', 'client', 'alerts'], anchor: 'client',
    title: 'Confident, and a day old',
    body: "With nothing live to ask, the analyst reads last night's copy: 68% of the limit, no action needed. The live figure is 81%. By the next morning it was 103%, and nobody had been told.",
    next: 'Show the other cost',
    enter: (_d, a) => void a.ask(Q_EXPOSURE, { about: FOLLOWED }),
  },
  {
    id: 'false-block', label: 'Wrong both ways', mode: 'before', client: FALSE_BLOCK,
    lit: ['client', 'analyst', 'alerts'], anchor: 'client',
    title: 'Wrong in both directions',
    body: `The same stale copy fails a second client the other way. ${FOLLOWED}'s copy read low, so a breach went unseen. ${FALSE_BLOCK}'s copy reads 98% when the client is really at 77%, so a good trade is refused.`,
    next: 'Flip to Streamhouse',
    // The same question, put about the second client, under the first one's answer: two
    // queries of the same copy, wrong in opposite directions. Arriving here without the step
    // before, the first client's is asked too, so there are always both.
    enter: (_d, a) =>
      void (async () => {
        if (!a.steps.length && !a.busy) await a.ask(Q_EXPOSURE, { about: FOLLOWED });
        await a.ask(questionsFor(FALSE_BLOCK)[0]!, { about: FALSE_BLOCK, queue: true, keep: true });
      })(),
  },
  {
    id: 'streamhouse', label: 'Streamhouse', mode: 'streamhouse', client: FOLLOWED,
    lit: ['pipeline', 'records'], anchor: 'pipeline',
    pillars: ['Connect', 'Stream', 'Process'],
    title: 'The same sources, as a streamhouse',
    body: "Each source is captured as records in its own topic. Flink reshapes them into one governed record and keeps every client's exposure up to date as records arrive. The top lane is the book trading, live.",
    next: 'See six shapes become one',
  },
  {
    id: 'shapes', label: 'Six shapes', mode: 'streamhouse', client: FOLLOWED,
    lit: ['pipeline', 'records'], anchor: 'pipeline',
    pillars: ['Connect', 'Stream', 'Process'],
    title: 'Six shapes, one record',
    body: 'One real record from each source: what arrived in its topic, the Flink SQL that reshapes it, and the governed record that comes out, with how stale its feed was. Step through all six.',
    next: 'Send a fat finger',
    enter: (d) => d.traceShapes(),
  },
  {
    id: 'fat-finger', label: 'Fat finger', mode: 'streamhouse', client: FOLLOWED,
    lit: ['pipeline', 'records', 'client'], anchor: 'pipeline',
    pillars: ['Govern'],
    title: 'A wrong record is turned away',
    body: `A fat finger is a trade keyed in at the wrong size: 2,400,000 lots against a desk bound of 50,000. The Flink guard routes it to a dead letter topic at its next commit, and ${FOLLOWED}'s figure never moves.`,
    next: 'Ask the analyst',
    enter: (d) => d.fatFinger(),
  },
  {
    id: 'analyst', label: 'Analyst', mode: 'streamhouse', client: FOLLOWED,
    lit: ['analyst', 'client'], anchor: 'analyst',
    pillars: ['Query'],
    title: 'Asked in English, answered from the live table',
    body: 'Nobody built this answer in advance. Over MCP the analyst finds the table, reads its columns, writes the SQL itself, and says how current its answer is.',
    next: 'Ask about the whole book',
    enter: (_d, a) => void a.ask(Q_EXPOSURE),
  },
  {
    id: 'book', label: 'The book', mode: 'streamhouse', client: FOLLOWED,
    lit: ['book', 'analyst'], anchor: 'book',
    pillars: ['Query'],
    title: 'The whole book, from the same table',
    body: 'A different question, the same Lightning Table: which of 4,000 clients are nearest their limit, sorted on a stored column.',
    next: 'A trade arrives',
    enter: (_d, a) => void a.ask(Q_BOOK),
  },
  {
    id: 'fill', label: 'A fill lands', mode: 'streamhouse', client: FOLLOWED,
    lit: ['client', 'pipeline'], anchor: 'client',
    pillars: ['Process'],
    title: 'A $27.07m trade lands',
    body: `A fill is an order that has just executed. Flink adds it to ${FOLLOWED}'s running total at its next commit, up to a minute away. That wait is the price of exactly once: a late figure beats a doubled one.`,
    next: 'The risk agent',
    enter: (d) => d.fill(),
  },
  {
    id: 'agent', label: 'Risk agent', mode: 'streamhouse', client: FOLLOWED,
    lit: ['client', 'alerts', 'analyst'], anchor: 'client',
    title: 'Nobody asked. The agent wrote this.',
    body: `Flink saw ${FOLLOWED} cross 85% of its limit and woke the risk agent, which wrote the note for the risk officer. It never touches an order. The analyst, asked what changed, reads the same table.`,
    next: 'Open the desk',
    enter: (d) => d.askWhenLanded(Q_CHANGED),
  },
  {
    id: 'desk', label: 'The desk', mode: 'streamhouse', client: FOLLOWED,
    lit: ['book', 'client', 'pipeline', 'records', 'analyst', 'alerts'], anchor: 'analyst',
    title: 'Everything, live',
    body: 'Pick any client in the book, or ask the analyst anything in English.',
    next: null,
  },
];

/**
 * The run-of-show as the screen's own state: which beat the room is in, which panels are
 * lit, and the presenter's next move. Space goes forward, the arrow keys move either way,
 * a number jumps, and Escape lifts the spotlight without leaving the beat.
 */
export function useTour(desk: Desk, analyst: Analyst) {
  const [index, setIndex] = useState(0);
  const [spotlight, setSpotlight] = useState(true);
  // The spotlight is a gesture, not a state: it points at the panels a step is about for a
  // few seconds and then lets the whole desk back up, so the room is never left reading a
  // dimmed screen.
  const [pointing, setPointing] = useState(false);
  const pointTimer = useRef<number | undefined>(undefined);
  const isPointing = useRef(false);
  const lift = useCallback(() => {
    isPointing.current = false;
    setPointing(false);
    window.clearTimeout(pointTimer.current);
  }, []);
  const point = useCallback(() => {
    isPointing.current = true;
    setPointing(true);
    window.clearTimeout(pointTimer.current);
    pointTimer.current = window.setTimeout(lift, POINT_MS);
  }, [lift]);
  // Escape, or the rail's button: lift it now if it is on, point again if it is not.
  const repoint = useCallback(() => (isPointing.current ? lift() : point()), [lift, point]);
  useEffect(() => () => window.clearTimeout(pointTimer.current), []);
  const fired = useRef(new Set<string>());
  const deskRef = useRef(desk);
  deskRef.current = desk;
  const analystRef = useRef(analyst);
  analystRef.current = analyst;

  const at = useRef(0);
  const go = useCallback((to: number) => {
    const from = at.current;
    const i = Math.max(0, Math.min(BEATS.length - 1, to));
    const beat = BEATS[i]!;
    at.current = i;
    setIndex(i);
    setSpotlight(true);
    point();
    deskRef.current.setMode(beat.mode);
    deskRef.current.setClient(beat.client);
    if (i > from && beat.enter && !fired.current.has(beat.id)) {
      fired.current.add(beat.id);
      // After the mode lands, so a question is put to the world the beat is in.
      window.setTimeout(() => beat.enter!(deskRef.current, analystRef.current), 60);
    }
  }, [point]);

  // The room opens on the first beat, in the before-world, as the run-of-show does.
  useEffect(() => go(0), [go]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === ' ' || e.key === 'ArrowRight') {
        e.preventDefault();
        go(at.current + (e.shiftKey ? -1 : 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(at.current - 1);
      } else if (e.key === 'Escape') {
        repoint();
      } else if (/^[0-9]$/.test(e.key)) {
        // 1 to 9, then 0 for the tenth. The last beat is reached by stepping.
        go(e.key === '0' ? 9 : Number(e.key) - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, repoint]);

  const beat = BEATS[index]!;
  return {
    index,
    beat,
    spotlight: spotlight && beat.id !== 'desk',
    /** True for the few seconds the spotlight is actually on the step's panels. */
    pointing: spotlight && pointing && beat.id !== 'desk',
    /** Point at the step's panels again, as when the desk first comes into view. */
    point,
    go,
    lit: (id: PanelId) => beat.lit.includes(id),
    /** A new run: the narrative events may fire again. */
    rewind: () => {
      fired.current.clear();
      go(0);
    },
    toggleSpotlight: repoint,
  };
}

export type Tour = ReturnType<typeof useTour>;

const EASE = [0.16, 1, 0.3, 1] as const;

/** Which pillars a beat is showing, in the words on the talk's own picture. */
export function BeatPillars({ tour }: { tour: Tour }) {
  if (!tour.beat.pillars?.length) return null;
  return (
    <span className="note-pillars">
      {tour.beat.pillars.map((p) => (
        <i key={p}>{p}</i>
      ))}
    </span>
  );
}

/**
 * Every panel on the desk. When the tour is spotlighting, a panel that is not in the beat
 * steps back and the anchor carries the caption.
 */
export function Panel({
  id, tour, title, meta, className, children,
}: {
  id: PanelId;
  tour: Tour;
  title: ReactNode;
  meta?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const lit = tour.lit(id);
  const about = tour.beat.anchor === id;
  const ref = useRef<HTMLElement>(null);
  // On a phone the desk is one long page, and on a short window the middle column scrolls.
  // Either way the panel a beat is about is brought into view when the beat arrives.
  useEffect(() => {
    const el = ref.current;
    if (!about || !el) return;
    if (window.matchMedia('(max-width: 900px)').matches) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Again once a flip of the data path has changed the heights of the panels above it.
      const id = window.setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 900);
      return () => window.clearTimeout(id);
    }
    if (!el.parentElement?.classList.contains('col-main')) return;
    // Kept in view as it grows: a flip of the data path adds rows after the beat has arrived.
    const show = () => el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const sized = new ResizeObserver(show);
    sized.observe(el);
    return () => sized.disconnect();
  }, [about, tour.index]);
  return (
    <section
      ref={ref}
      className={`panel ${className ?? ''}`}
      data-panel={id}
      data-lit={tour.pointing ? (lit ? 'on' : 'off') : 'all'}
    >
      <header className="panel-head">
        <h2 className="panel-title">{title}</h2>
        {meta ? <span className="panel-meta">{meta}</span> : null}
      </header>
      {children}
    </section>
  );
}

/**
 * The narration, docked above the rail: what this beat is showing, and the way on. It sits
 * in one place at every window size, so it never covers the panel it is talking about and
 * the room always knows where to read.
 */
export function Narration({ tour, onRewind }: { tour: Tour; onRewind(): void }) {
  const next = tour.beat.next;
  return (
    <aside className="narrate" aria-label="This step">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tour.beat.id}
          className="narrate-text"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
          transition={{ duration: 0.35, ease: EASE }}
        >
          <span className="narrate-head">
            <span className="narrate-step">
              {tour.index + 1} / {BEATS.length}
              <BeatPillars tour={tour} />
            </span>
            <strong>{tour.beat.title}</strong>
          </span>
          <p>{tour.beat.body}</p>
        </motion.div>
      </AnimatePresence>
      <div className="narrate-nav">
        <button type="button" className="btn narrate-back" disabled={tour.index === 0} onClick={() => tour.go(tour.index - 1)}>
          Back
        </button>
        <button type="button" className="btn btn-primary narrate-next" onClick={next ? () => tour.go(tour.index + 1) : onRewind}>
          <span>{next ?? 'Start over'}</span>
          {next ? <kbd>Space</kbd> : null}
        </button>
      </div>
    </aside>
  );
}

/**
 * The run-of-show along the foot, as a map: where the room is among the beats. The beat
 * number rolls and the pill slides when a beat changes. Nothing else moves here: when the
 * story moves on, the eye belongs on the panel that just lit, not on the rail.
 */
export function TourRail({ tour }: { tour: Tour }) {
  const items = BEATS.map((b) => ({ label: b.label }));
  const progress = (tour.index + 1) / BEATS.length;
  return (
    <nav className="rail" aria-label="Run of show">
      <motion.span
        className="rail-progress"
        aria-hidden="true"
        initial={false}
        animate={{ scaleX: progress }}
        transition={{ duration: 0.7, ease: EASE }}
      />
      <div className="rail-count" aria-live="polite">
        <Counter
          value={tour.index + 1}
          minDigits={2}
          fontSize={22}
          fontWeight={600}
          textColor={PALETTE.text}
          tabular
          duration={0.6}
        />
        <span className="rail-of">/ {BEATS.length}</span>
      </div>
      <span className="rail-here">{tour.beat.label}</span>
      <GooeyNav
        className="rail-gooey"
        items={items}
        activeIndex={tour.index}
        onChange={(i) => tour.go(i)}
        size="sm"
        frame={false}
        theme="dark"
        color={PALETTE.text}
        activeTextColor={PALETTE.ground}
        particleCount={0}
      />
      <div className="rail-next">
        <button type="button" className="rail-spot" aria-pressed={tour.pointing} onClick={tour.toggleSpotlight} title="Point at this step's panels again, or lift the spotlight now">
          Spotlight <kbd>Esc</kbd>
        </button>
      </div>
    </nav>
  );
}
