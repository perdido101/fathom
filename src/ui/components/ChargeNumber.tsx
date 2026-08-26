import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';

/**
 * The charge count, which is the loudest thing on the battle screen because
 * it is the game.
 *
 * It does two jobs beyond printing a number. It counts *up* rather than
 * jumping, so a player watching the resolve sequence sees where the charges
 * went; and it pops when it grows, so a charge landing is felt at the edge of
 * vision while the player is reading the board.
 *
 * A drop is deliberately not animated the same way. Losing charges to Jam or
 * Spite already has its own beat in the resolve overlay, and doubling it here
 * made the number feel unreliable — it should read as a fact, not a fight.
 */
export function ChargeNumber({
  value,
  size = 26,
  style,
  animate = true,
}: {
  value: number;
  size?: number;
  style?: CSSProperties;
  animate?: boolean;
}): ReactElement {
  const [shown, setShown] = useState(value);
  const [bumping, setBumping] = useState(false);
  const previous = useRef(value);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    if (!animate || from === value) {
      setShown(value);
      return undefined;
    }
    if (value < from) {
      // Losses land immediately; the overlay already explains them.
      setShown(value);
      return undefined;
    }

    // Count up one charge at a time, fast enough to stay inside a resolve beat.
    const step = Math.max(60, Math.min(140, 340 / Math.max(1, value - from)));
    for (let n = from + 1; n <= value; n++) {
      const at = (n - from) * step;
      timers.current.push(
        setTimeout(() => {
          setShown(n);
          setBumping(true);
          timers.current.push(setTimeout(() => setBumping(false), 340));
        }, at),
      );
    }
    const copy = timers.current;
    return () => {
      for (const t of copy) clearTimeout(t);
      timers.current = [];
      setShown(value);
      setBumping(false);
    };
  }, [value, animate]);

  return (
    <span
      className={`charges${bumping ? ' bump' : ''}`}
      style={{ fontSize: size, lineHeight: 1, display: 'inline-block', ...style }}
      aria-label={`${value} charges`}
    >
      {shown}
    </span>
  );
}
