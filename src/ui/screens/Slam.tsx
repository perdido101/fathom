import { useEffect, type ReactElement } from 'react';
import { useStore } from '../../state/store';

/**
 * The moment a match ends.
 *
 * There was a result *screen* and no result *moment*: the instant the last
 * enemy cell died, the game cut straight to an analytical page of fleets,
 * ratings and receipts. This is the beat in between — the verdict at display
 * scale, and immediately beneath it the one number the player actually cares
 * about, which is what their balance just did.
 *
 * Two rules hold it honest:
 *
 *   The number comes from `settlement()`, the same call the receipt makes.
 *   A banner that promises more than the settlement pays is the worst bug a
 *   wagered game can ship, and the only reliable defence is that there is no
 *   second place for the arithmetic to live.
 *
 *   A defeat is built as carefully as a victory. Same scale, same timing,
 *   different colour and a different sound. Most players lose about half
 *   their matches, and a loss that is visually skimped reads as the product
 *   being embarrassed by it.
 */

const HOLD_MS = 2000;
const FAST_MS = 700;

export function Slam(): ReactElement | null {
  const slam = useStore((s) => s.slam);
  const dismiss = useStore((s) => s.dismissSlam);
  const fast = useStore((s) => s.settings.fastResolve);

  useEffect(() => {
    if (!slam) return undefined;
    const id = setTimeout(dismiss, fast ? FAST_MS : HOLD_MS);
    return () => clearTimeout(id);
  }, [slam, dismiss, fast]);

  if (!slam) return null;
  const { headline, money, direction, sub } = slam;

  return (
    <div className={`overlay slam slam-${direction}`} onClick={dismiss}>
      <div className={`slam-wash slam-wash-${direction}`} />
      <span className={`banner slam-headline slam-headline-${direction}`}>{headline}</span>
      {money && <span className={`slam-money slam-money-${direction}`}>{money}</span>}
      <span className="slam-sub">{sub}</span>
    </div>
  );
}
