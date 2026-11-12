import { motion } from 'motion/react';
import type { DeskSnapshot, Mode } from '../data/types';
import { wallClock } from './format';
import { useNow } from './useNow';
import { BrandLockup } from './BrandMark';
import { LiveBadge } from './LiveBadge';

interface Props {
  snapshot: DeskSnapshot;
  mode: Mode;
  onMode(m: Mode): void;
  onFill(): void;
  onFatFinger(): void;
  onReset(): void;
  canReset: boolean;
}

const PATHS: Array<{ id: Mode; label: string }> = [
  { id: 'before', label: 'Today' },
  { id: 'streamhouse', label: 'Streamhouse' },
];

/**
 * The bar a desk would recognise: what the tool is, where its numbers come from, the time,
 * and the two narrative events the presenter can cause. The origin badge never lies about
 * who answered: live Confluent, the simulator, or the Before script over the live truth.
 */
export function AppBar(p: Props) {
  const now = useNow();
  const live = p.mode === 'streamhouse';
  const origin = !live ? 'scripted' : p.snapshot.origin;
  // The nightly world is how the question is answered today. It is a script over the live
  // truth, and the tooltip still says so, so the badge never passes one off as the other.
  const label = !live ? 'Today' : origin === 'confluent' ? 'Live / Confluent Cloud' : 'Simulator';
  const title = !live ? 'Scripted: the six legacy systems are a script. What was really true is read live from Confluent.' : undefined;

  return (
    <header className="bar">
      <div className="bar-left">
        <BrandLockup size={22} />
        <span className="bar-crumb">Capital markets / client limit monitor</span>
      </div>

      <div className="bar-right">
        <div className="path" role="radiogroup" aria-label="Data path">
          <span className="path-label">Data path</span>
          <div className="seg">
            {PATHS.map((o) => (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={p.mode === o.id}
                className="seg-btn"
                onClick={() => p.onMode(o.id)}
              >
                {p.mode === o.id ? (
                  <motion.span layoutId="seg-pill" className="seg-pill" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />
                ) : null}
                <span className="seg-text">{o.label}</span>
              </button>
            ))}
          </div>
        </div>

        {origin === 'confluent' ? (
          <LiveBadge compact orbit={false} />
        ) : (
          <span className="origin" data-origin={origin} title={title}>
            <i />
            {label}
          </span>
        )}
        {/* One clock for the whole desk, and it is the data's: every time on screen is UTC. */}
        <span className="clock num">
          {wallClock(now)} <em>UTC</em>
        </span>
        <span className="bar-rule" aria-hidden="true" />
        {/* The before-world hears about trades overnight, so neither event exists in it. */}
        <button
          type="button"
          className="btn"
          disabled={!live}
          onClick={p.onFatFinger}
          title="A trade keyed in at the wrong size: 2,400,000 lots"
        >
          Send a fat finger
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!live || !!p.snapshot.pendingFill}
          onClick={p.onFill}
          title="An order that has just executed: $27.07m for client 4417"
        >
          Send a fill
        </button>
        <button type="button" className="btn btn-quiet" disabled={!p.canReset} onClick={p.onReset} title="Offset every presenter fill at the next commit">
          Reset
        </button>
      </div>
    </header>
  );
}
