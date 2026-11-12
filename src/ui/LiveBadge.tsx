import StarBorder from '../reactbits/StarBorder';
import { PALETTE } from './format';

/**
 * The live connection, the same on the hero and the desk. On the hero one slow light runs
 * around the capsule; on the working desk it sits still, because a light that orbits for
 * nine minutes says nothing the word Live has not already said. Only the live stack gets
 * this; anything else is a plain pill that says what it is.
 */
export function LiveBadge({ compact = false, orbit = true }: { compact?: boolean; orbit?: boolean }) {
  const inner = (
    <>
      <span className="live-beacon" aria-hidden="true">
        <i />
      </span>
      <span className="live-word">Live</span>
      <span className="live-sep" aria-hidden="true" />
      <span className="live-src">Confluent Cloud</span>
      <span className="live-region mono">us-east-1</span>
    </>
  );
  const size = compact ? ' live-cap--compact' : '';
  if (!orbit) return <div className={`live-cap live-cap--still${size}`}>{inner}</div>;
  return (
    <StarBorder
      as="div"
      className={`live-cap${size}`}
      color={PALETTE.fresh}
      trailColor={PALETTE.fresh}
      backgroundColor="rgba(16,19,24,0.72)"
      textColor={PALETTE.text}
      borderColor="rgba(61,214,140,0.22)"
      radius={999}
      thickness={1}
      duration={7}
      stars={1}
      glow={0.35}
      hover="none"
      theme="dark"
    >
      {inner}
    </StarBorder>
  );
}
