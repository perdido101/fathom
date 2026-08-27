import { useLayoutEffect, useState, type ReactElement } from 'react';
import { FLOATER_MS, useFeedback, type Floater } from './store';

/**
 * The three tiers, rendered.
 *
 * All of it sits above the resolve overlay rather than inside the battle
 * screen, for one reason: a floater has to be able to rise off a board cell
 * while the overlay is narrating the same beat over the top of it. Anchoring
 * by `[data-anchor]` and a screen rectangle keeps the layer ignorant of every
 * layout it draws on, so nothing here has to change when a screen moves.
 */

export function FeedbackLayer(): ReactElement {
  const floaters = useFeedback((s) => s.floaters);
  const named = useFeedback((s) => s.named);
  const explainer = useFeedback((s) => s.explainer);
  const dismiss = useFeedback((s) => s.dismissExplainer);

  return (
    <div className="feedback-layer">
      {floaters.map((f) => (
        <FloaterView key={f.id} f={f} />
      ))}

      {/* Tier 2. One line, fixed position, never more than two deep. */}
      {named.length > 0 && (
        <div className="named-stack">
          {named.map((n) => (
            <span key={n.id} className="named-line">
              {n.text}
            </span>
          ))}
        </div>
      )}

      {/* Tier 3. Once ever, per mechanic, per player. */}
      {explainer && (
        <div className="panel explainer beat">
          <span className="explainer-kicker">
            {explainer.group === 'rule' ? 'First time · rule' : 'First time'}
          </span>
          <strong className="display explainer-title">{explainer.title}</strong>
          <p className="explainer-rule">{explainer.rule}</p>
          <p className="explainer-sowhat">{explainer.soWhat}</p>
          <button className="btn small go" onClick={dismiss}>
            Got it
          </button>
        </div>
      )}
    </div>
  );
}

function FloaterView({ f }: { f: Floater }): ReactElement | null {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const el = document.querySelector(`[data-anchor="${f.anchor}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Measured once. Nothing a floater is anchored to moves during its 600ms,
    // and re-measuring every frame would cost more than the effect is worth.
    setPos({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  }, [f.anchor]);

  if (!pos) return null;
  return (
    <span
      className={`floater floater-${f.kind}`}
      style={{
        left: pos.x,
        top: pos.y,
        animationDelay: `${f.delay}ms`,
        animationDuration: `${FLOATER_MS}ms`,
      }}
    >
      {f.text}
    </span>
  );
}

/**
 * The "why can't I?" affordance.
 *
 * A disabled control that says nothing is the single most confusing thing in
 * the build. Wrapping one in this gives it a reason on hover and costs nothing
 * when the pointer is elsewhere. The wrapper — not the button — carries the
 * pointer events, because a disabled button does not fire them.
 */
export function WhyNot({
  reason,
  children,
}: {
  /** Null when the control is live; a reason when it is inert. */
  reason: string | null;
  children: ReactElement;
}): ReactElement {
  if (!reason) return children;
  return (
    <span className="has-tip whynot">
      {children}
      <span className="tip" role="tooltip">
        {reason}
      </span>
    </span>
  );
}
