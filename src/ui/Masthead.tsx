import DecryptedText from '../reactbits/DecryptedText';
import Aurora from '../reactbits/Aurora';
import ClickSpark from '../reactbits/ClickSpark';
import type { DeskSnapshot, Isolation, Mode } from '../data/types';
import type { Which } from '../useDesk';
import { PALETTE, money, wallClock } from './format';
import { FALSE_BLOCK, FOLLOWED } from '../data/book';

interface Props {
  snapshot: DeskSnapshot;
  which: Which;
  mode: Mode;
  isolation: Isolation;
  onMode(m: Mode): void;
  onWhich(w: Which): void;
  onClient(c: string): void;
  onFill(): void;
  onFatFinger(): void;
  onReset(): void;
}

/**
 * The title decodes in, which is the deck's own device rather than a borrowed one: the
 * slides lock blanks and random letters left to right with no sliding or glow. Aurora
 * sits behind it at low opacity, standing in for the cover's shader.
 */
export function Masthead(p: Props) {
  const s = p.snapshot;
  return (
    <header className="mast">
      <div className="mast-glow" aria-hidden="true">
        <Aurora
          colorStops={[PALETTE.cobalt, '#3B66F0', '#12205E']}
          amplitude={0.7}
          blend={0.6}
          speed={0.3}
          opacity={0.42}
          height={320}
        />
      </div>

      <div className="mast-top">
        <h1>
          <DecryptedText
            text="One governed record, and an agent that can ask anything"
            animateOn="view"
            sequential
            revealDirection="start"
            effect="scramble"
            speed={28}
            useOriginalCharsOnly={false}
            scrambleColor={PALETTE.cobalt}
            parentClassName="decode"
          />
        </h1>
        <div className="wall">
          <span className="lbl">Trading day / wall clock</span>
          <span className="wall-time num">{wallClock(s.wallClock)}</span>
          <span className="lbl">
            Client {s.served.clientId} / limit {money(s.served.limitUsd)}
          </span>
        </div>
      </div>

      <ClickSpark sparkColor={PALETTE.cobalt} sparkCount={8} sparkRadius={18} duration={420}>
        <div className="controls">
          <div className="seg" role="group" aria-label="Architecture">
            <button type="button" aria-pressed={p.mode === 'before'} onClick={() => p.onMode('before')}>
              Before
            </button>
            <button type="button" aria-pressed={p.mode === 'streamhouse'} onClick={() => p.onMode('streamhouse')}>
              Streamhouse
            </button>
          </div>

          <div className="seg" role="group" aria-label="Data source">
            <button type="button" aria-pressed={p.which === 'live'} onClick={() => p.onWhich('live')}>
              Live
            </button>
            <button type="button" aria-pressed={p.which === 'simulator'} onClick={() => p.onWhich('simulator')}>
              Simulator
            </button>
          </div>

          <div className="seg" role="group" aria-label="Client">
            <button
              type="button"
              aria-pressed={s.served.clientId === FOLLOWED}
              onClick={() => p.onClient(FOLLOWED)}
            >
              {FOLLOWED}
            </button>
            <button
              type="button"
              aria-pressed={s.served.clientId === FALSE_BLOCK}
              onClick={() => p.onClient(FALSE_BLOCK)}
              title="The false block: its stale number reads high, so a good trade gets refused"
            >
              {FALSE_BLOCK}
            </button>
          </div>

          <button type="button" className="ghost" onClick={p.onFill}>
            A fill arrives
          </button>
          <button type="button" className="ghost" onClick={p.onFatFinger}>
            Send a fat finger
          </button>
          <button type="button" className="ghost" onClick={p.onReset}>
            Reset
          </button>

          <span className="origin" data-origin={s.origin}>
            <i />
            {s.origin === 'confluent' ? 'live confluent' : 'simulator'}
          </span>
        </div>
      </ClickSpark>
    </header>
  );
}
