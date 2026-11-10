import { useDesk } from './useDesk';
import { Masthead } from './ui/Masthead';
import { SourceLane } from './ui/SourceLane';
import { AgentPanel } from './ui/AgentPanel';
import { BookPanel, Clocks, Escalations } from './ui/RightRail';
import { DEFAULT_FILL_LOTS } from './data/simulator';

export default function App() {
  const desk = useDesk();

  if (!desk.snapshot) {
    return (
      <div className="wrap">
        <div className="booting">
          <span className="lbl">Exposure desk</span>
          <p>Reading the served tables.</p>
        </div>
      </div>
    );
  }

  const s = desk.snapshot;

  return (
    <div className="wrap">
      <Masthead
        snapshot={s}
        selected={desk.client}
        autoFollowing={desk.autoFollowing}
        mode={desk.mode}
        isolation={desk.isolation}
        onMode={desk.setMode}
        onClient={desk.setClient}
        onFill={() => void desk.fill(DEFAULT_FILL_LOTS)}
        onFatFinger={() => void desk.fatFinger()}
        onReset={() => void desk.reset()}
        canReset={desk.canReset}
      />

      {desk.note ? <p className="banner">{desk.note}</p> : null}

      <div className="desk">
        <div className="rail-col">
          <SourceLane snapshot={s} />
          <BookPanel snapshot={s} />
        </div>
        <AgentPanel snapshot={s} />
        <div className="rail-col">
          <Escalations snapshot={s} />
          <Clocks snapshot={s} />
        </div>
      </div>

      <footer className="foot">
        <span className="lbl">
          Capital markets / exposure across desks, venues, custodians and entities
        </span>
        <span className="lbl">Figures are synthetic. No client, venue or custodian is named.</span>
      </footer>
    </div>
  );
}
