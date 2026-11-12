import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DeskSnapshot, ExposureSource, Isolation, Mode } from './data/types';
import { Simulator } from './data/simulator';
import { LiveSource } from './data/live';
import { FOLLOWED } from './data/book';
import { age } from './ui/format';

const POLL_MS = 2_000;
/** Below this a client's exposure is too small to say anything about on stage. */
const WORTH_FOLLOWING_PCT = 20;
/**
 * Past this age an auto-followed client is swapped for someone fresher. End to end the
 * pipeline runs about 90 seconds under exactly-once (two hops, each waiting for a commit),
 * so a client is already a minute or more old when followed. Two minutes made an idle
 * screen swap clients every minute; five keeps it current without fidgeting.
 */
const STALE_REFOLLOW_MS = 300_000;
/** Two exactly-once commits end to end, with room: how long a live reset can take to show. */
const RESET_LANDS_MS = 120_000;
const GATE = import.meta.env['VITE_DEMO_GATE'] ?? 'local-dev';

/**
 * Holds the one seam the screen talks to, the live stack. Polls while the tab is visible
 * only: the free hosting tier allows 100,000 requests a day and a rehearsal left open would
 * spend it on an empty room.
 *
 * A failed call keeps the last live snapshot on screen and says how long ago it was current,
 * rather than switching to anything that did not come from Confluent.
 */
export function useDesk() {
  const started = useRef(Date.now());
  const clock = useCallback(() => Date.now() - started.current, []);

  // `?source=simulator` previews the screen with no account behind it: a rehearsal of the
  // narrative events that must not touch the live stack. The origin badge says so.
  const source = useMemo<ExposureSource>(
    () =>
      new URLSearchParams(window.location.search).get('source') === 'simulator'
        ? new Simulator({ clock })
        : new LiveSource({ clock, gate: GATE }),
    [clock],
  );
  /** When the screen last had a live answer, so a failure can say how stale it is. */
  const lastGood = useRef<number | null>(null);

  const [client, setClientState] = useState(FOLLOWED);
  // Follow whoever traded most recently, once, on arriving in the live world. Following
  // the freshest client on every poll would move the screen every two seconds under the
  // presenter's hands; following nobody would leave it on a client half an hour stale.
  const pickFreshest = useRef(true);
  // Until the presenter picks a client, the screen keeps itself current: whenever the
  // followed client's answer passes STALE_REFOLLOW_MS it moves to whoever traded most
  // recently. That is what keeps an idle demo from opening on a half-hour-old answer. An
  // explicit pick stops it, so nothing moves under the presenter's hands mid-demo.
  const autoFollow = useRef(true);
  const [mode, setModeState] = useState<Mode>('streamhouse');
  const [isolation, setIsolationState] = useState<Isolation>('committed');
  const [snapshot, setSnapshot] = useState<DeskSnapshot | null>(null);
  // A second client read alongside the followed one, for the step that shows two at once.
  // Read live at every poll like the first, so neither side of a comparison is a memory.
  const [besideId, setBesideId] = useState<string | null>(null);
  const [beside, setBeside] = useState<DeskSnapshot | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // A narrative event that was not sent. Kept apart from the note above, which every poll
  // rewrites: a refused fill would otherwise flash for two seconds and be gone, leaving the
  // presenter waiting on a figure that is never going to move.
  const [eventError, setEventError] = useState<string | null>(null);
  const eventErrorTimer = useRef<number | undefined>(undefined);
  const refused = useCallback((what: string, e: unknown) => {
    setEventError(`${what} was not sent (${e instanceof Error ? e.message : String(e)}). Nothing changed; press it again.`);
    window.clearTimeout(eventErrorTimer.current);
    eventErrorTimer.current = window.setTimeout(() => setEventError(null), 12_000);
  }, []);
  // A live reset lands at the next commit, not at the click, so the screen says it is on its
  // way for as long as that can take. Otherwise the figures sitting still read as a failure.
  const resetAt = useRef<number | null>(null);
  const resetLanding = () => resetAt.current !== null && Date.now() - resetAt.current < RESET_LANDS_MS;

  const refresh = useCallback(async () => {
    if (document.hidden) return;
    try {
      const snap = await source.snapshot(client);
      lastGood.current = Date.now();
      setSnapshot(snap);
      setNote(resetLanding() && snap.origin === 'confluent'
        ? 'Reset sent. The presenter fills are offset at the next commit, about 90 seconds.'
        : null);
      const freshest = snap.active.find((c) => c.limitUtilPct >= WORTH_FOLLOWING_PCT) ?? snap.active[0];
      const live = snap.mode === 'streamhouse' && snap.origin === 'confluent';
      const stale = snap.clocks.servedAgeMs > STALE_REFOLLOW_MS;
      if (live && freshest && autoFollow.current && (pickFreshest.current || stale)) {
        if (freshest.clientId !== client) setClientState(freshest.clientId);
      }
      if (live) pickFreshest.current = false;
      // Its own try: the second read failing must not disturb the desk, which keeps the last
      // one it had.
      if (besideId) {
        try {
          setBeside(await source.snapshot(besideId));
        } catch {
          // The next poll tries again.
        }
      }
    } catch (e) {
      // Keep what is on screen and keep trying: the next poll that answers clears this.
      const why = e instanceof Error ? e.message : String(e);
      setNote(lastGood.current === null
        ? `The live stack is not answering (${why}).`
        : `The live stack is not answering (${why}). These figures are its last answer, ${age(Date.now() - lastGood.current)} ago.`);
    }
  }, [source, client, besideId]);

  useEffect(() => {
    if (!besideId) setBeside(null);
  }, [besideId]);

  useEffect(() => {
    void source.setMode(mode);
    void source.setIsolation(isolation);
    void refresh();
  }, [source, mode, isolation, refresh]);

  useEffect(() => {
    const id = window.setInterval(() => void refresh(), POLL_MS);
    const onVisible = () => void refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  return {
    snapshot,
    beside,
    readBeside: setBesideId,
    note,
    eventError,
    client,
    mode,
    isolation,
    autoFollowing: autoFollow.current,
    // A reset offsets only what has landed, so a second press before the first lands, or a
    // press while a fill is in flight, would offset the wrong amount. Re-read every poll.
    canReset: !resetLanding() && !snapshot?.pendingFill,
    setClient: (c: string) => {
      pickFreshest.current = false;
      autoFollow.current = false;
      setClientState(c);
    },
    setMode: (m: Mode) => {
      // The before-world is simulated around the two clients the story is told with, so
      // going there returns to them; coming back to the live world picks someone fresh.
      if (m === 'before') setClientState(FOLLOWED);
      else {
        pickFreshest.current = true;
        autoFollow.current = true;
      }
      setModeState(m);
    },
    setIsolation: (i: Isolation) => setIsolationState(i),
    // Always 4417, the client the talk follows, and the screen goes with it: auto-following
    // lands on whichever feed client traded last, and a fill there crosses nothing and is
    // not the story.
    fill: async (lots: number) => {
      pickFreshest.current = false;
      autoFollow.current = false;
      setClientState(FOLLOWED);
      try {
        const event = await source.produceFill(FOLLOWED, lots);
        await refresh();
        return event;
      } catch (e) {
        refused('The fill', e);
        return null;
      }
    },
    // 4417 too: nothing else trades it, so the figure standing still is the guard's doing. On
    // a feed client the trades would move it anyway and the point would be lost.
    fatFinger: async () => {
      pickFreshest.current = false;
      autoFollow.current = false;
      setClientState(FOLLOWED);
      try {
        const event = await source.produceFatFinger(FOLLOWED);
        await refresh();
        return event;
      } catch (e) {
        refused('The fat finger', e);
        return null;
      }
    },
    reset: async () => {
      try {
        await source.reset();
        resetAt.current = Date.now();
      } catch (e) {
        setNote(`reset failed: ${e instanceof Error ? e.message : e}`);
        return;
      }
      await refresh();
    },
  };
}
