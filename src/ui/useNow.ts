import { useEffect, useState } from 'react';

/**
 * Ages tick every second rather than every poll, because an age that sits still for two
 * seconds and then jumps reads as a stale screen, which is the one impression this demo
 * cannot afford to give.
 */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}
