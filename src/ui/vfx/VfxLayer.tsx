import { useLayoutEffect, useState, type CSSProperties, type ReactElement } from 'react';
import { useVfx, type Vfx } from './store';

/**
 * Every live effect, drawn over the game and under nothing.
 *
 * Same anchoring contract as the feedback layer: an effect names a
 * `[data-anchor]` and this resolves it to a screen rectangle once, at mount.
 * Nothing an effect is pinned to moves during its lifetime, and re-measuring
 * per frame would cost more than the accuracy is worth.
 *
 * Effects that travel — a tracer, a carried charge — take a second anchor and
 * animate the delta between the two as a CSS custom property, so the keyframe
 * itself is static and the browser can still run it off the main thread.
 */
export function VfxLayer(): ReactElement {
  const fx = useVfx((s) => s.fx);
  return (
    <div className="vfx-layer" aria-hidden>
      {fx.map((v) => (
        <VfxView key={v.id} v={v} />
      ))}
    </div>
  );
}

/** The centre of an anchored element, in screen coordinates. */
function centreOf(anchor: string): { x: number; y: number; w: number; h: number } | null {
  const el = document.querySelector(`[data-anchor="${anchor}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
}

function VfxView({ v }: { v: Vfx }): ReactElement | null {
  const [style, setStyle] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    const to = centreOf(v.anchor);
    if (!to) return;
    const from = v.from ? centreOf(v.from) : null;
    const origin = from ?? to;

    // A tracer starts at the shooter's water and ends on the cell; everything
    // else simply happens where it happens.
    const base: CSSProperties = {
      left: origin.x,
      top: origin.y,
      // The vector the travelling effects animate along, and the fan angle
      // the scattering ones use. Both are read by the keyframes as custom
      // properties so no effect needs a keyframe of its own.
      ['--dx' as string]: `${to.x - origin.x}px`,
      ['--dy' as string]: `${to.y - origin.y}px`,
      ['--w' as string]: `${v.weight}`,
      ['--i' as string]: `${v.index ?? 0}`,
      ['--spread' as string]: `${((v.index ?? 0) * 137.5) % 360}deg`,
      animationDuration: `${v.life}ms`,
    };

    // The cell-sized effects size themselves off the thing they land on, so a
    // compact board's impacts are not the same 64px as a full board's.
    if (v.kind === 'impact' || v.kind === 'shock' || v.kind === 'splash' || v.kind === 'ripple' || v.kind === 'douse' || v.kind === 'slick' || v.kind === 'blocked') {
      base.width = to.w;
      base.height = to.h;
    }
    setStyle(base);
  }, [v.anchor, v.from, v.kind, v.life, v.weight, v.index]);

  if (!style) return null;
  return <i className={`vfx vfx-${v.kind}`} style={style} />;
}
