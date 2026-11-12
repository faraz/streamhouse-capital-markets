import { useCallback, useEffect, useState } from 'react';

/** The three sizes the presenter can drag. Null means the design's own, which still responds to the window. */
export interface Layout {
  book: number | null;
  agent: number | null;
  records: number | null;
}

const KEY = 'exposure-desk.layout';
const DEFAULT: Layout = { book: null, agent: null, records: null };

function load(): Layout {
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as Partial<Layout> | null;
    return { ...DEFAULT, ...(saved ?? {}) };
  } catch {
    // Private windows and locked-down browsers refuse storage; the layout still works unsaved.
    return DEFAULT;
  }
}

/**
 * Panel sizes the presenter has set by dragging, kept for the next visit: a laptop mirrored
 * to a projector wants different proportions from the laptop alone, and nobody wants to set
 * them again in front of a room.
 */
export function useLayout() {
  const [layout, setLayout] = useState<Layout>(load);

  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(layout));
    } catch {
      // Nothing to do: the sizes simply last for this visit.
    }
  }, [layout]);

  const set = useCallback((part: Partial<Layout>) => setLayout((l) => ({ ...l, ...part })), []);
  return { layout, set };
}
