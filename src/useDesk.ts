import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DeskSnapshot, ExposureSource, Isolation, Mode } from './data/types';
import { LiveSource } from './data/live';
import { Simulator } from './data/simulator';
import { FOLLOWED } from './data/book';

const POLL_MS = 2_000;
const GATE = import.meta.env['VITE_DEMO_GATE'] ?? 'local-dev';

export type Which = 'live' | 'simulator';

/**
 * Holds the one seam the screen talks to. Polls while the tab is visible only: the free
 * hosting tier allows 100,000 requests a day and a rehearsal left open would spend it on
 * an empty room.
 *
 * A failed live call falls back to the simulator rather than showing a broken screen,
 * and the screen always says which one answered.
 */
export function useDesk() {
  const started = useRef(Date.now());
  const clock = useCallback(() => Date.now() - started.current, []);

  const simulator = useMemo(() => new Simulator({ clock, clientCount: 4000 }), [clock]);
  const live = useMemo(() => new LiveSource({ clock, gate: GATE, clientCount: 4000 }), [clock]);

  const [which, setWhich] = useState<Which>('live');
  const [client, setClient] = useState(FOLLOWED);
  const [mode, setModeState] = useState<Mode>('streamhouse');
  const [isolation, setIsolationState] = useState<Isolation>('committed');
  const [snapshot, setSnapshot] = useState<DeskSnapshot | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const source: ExposureSource = which === 'live' ? live : simulator;

  const refresh = useCallback(async () => {
    if (document.hidden) return;
    try {
      setSnapshot(await source.snapshot(client));
      setNote(null);
    } catch (e) {
      // Fall back for this render only, and keep trying. Latching the toggle to the
      // simulator meant one blip while the server was starting left the screen
      // permanently simulated, with the presenter none the wiser.
      if (which === 'live') {
        try {
          const fallback = await simulator.snapshot(client);
          setSnapshot(fallback);
          setNote(`live source unreachable, showing the simulator: ${e instanceof Error ? e.message : e}`);
        } catch {
          setNote('neither source answered');
        }
      }
    }
  }, [source, simulator, client, which]);

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
    note,
    which,
    client,
    mode,
    isolation,
    setWhich,
    setClient,
    setMode: (m: Mode) => setModeState(m),
    setIsolation: (i: Isolation) => setIsolationState(i),
    fill: async (lots: number) => { await source.produceFill(client, lots); await refresh(); },
    fatFinger: async () => { await source.produceFatFinger(client); await refresh(); },
    reset: async () => { await source.reset(); await refresh(); },
  };
}
