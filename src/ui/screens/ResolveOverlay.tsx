import { useEffect, useMemo, useRef, type ReactElement } from 'react';
import type { ResolveEvent } from '../../engine/types';
import { label } from '../../engine/types';
import { CARDS } from '../../engine/cards';
import { SHIPS } from '../../engine/ships';
import { useStore } from '../../state/store';
import { Icon } from '../art/Icon';
import { STEP_TITLES, stepMs } from '../feedback/timing';

/**
 * The resolve sequence, in the order the rules resolve it.
 *
 * The whole point of the strict order in the rulebook is that a player can see
 * *why* something happened: the theft landed before the shots, the ship that
 * died still fired, the read triggered before either. So the overlay walks the
 * engine's own event list rather than summarising it, and every beat says in
 * plain words what it did — "MIRROR TRIGGERED — their whole attack missed",
 * not "prediction resolved".
 *
 * Total budget is three to four seconds. A player who has seen it enough turns
 * on fast resolve and gets the same beats in about one.
 */

export function ResolveOverlay(): ReactElement | null {
  const playback = useStore((s) => s.playback);
  const advance = useStore((s) => s.advancePlayback);
  const finish = useStore((s) => s.finishPlayback);
  const fast = useStore((s) => s.settings.fastResolve);
  const you = useStore((s) => s.view()?.you ?? 0);
  const frame = useRef<HTMLDivElement>(null);

  const current = playback ? playback.events[playback.index] : null;
  // Fast resolve keeps every beat but compresses the whole sequence to about a
  // second, so nothing is hidden from a player who already knows the rules.
  // The timings live beside the feedback layer's, which schedules its floaters
  // against them — they drifted apart twice while they were two lists.
  const delay = current ? stepMs(current.t, fast) : 0;

  useEffect(() => {
    if (!playback) return undefined;
    const id = setTimeout(advance, delay);
    return () => clearTimeout(id);
  }, [playback, advance, delay]);

  // A hit shakes the frame, harder for a bigger salvo, capped so a nine-cell
  // Burst does not throw the screen off the table.
  useEffect(() => {
    if (!current || current.t !== 'shot' || !current.hit || !frame.current) return;
    const el = frame.current;
    el.style.setProperty('--jolt', '3px');
    el.classList.remove('jolt');
    void el.offsetWidth;
    el.classList.add('jolt');
  }, [current]);

  const shown = useMemo(() => {
    if (!playback) return [];
    return playback.events
      .slice(0, playback.index + 1)
      .filter((e) => (e.t === 'intel' ? e.to === you : true))
      .slice(-9);
  }, [playback, you]);

  if (!playback || !current) return null;
  const bigMoment = current.t === 'prediction' && current.triggered;
  const sinking = current.t === 'sink';

  return (
    <div className="overlay" onClick={finish} ref={frame}>
      {bigMoment && <div className="prediction-wash" />}
      {current.t === 'nerf' && <ChargeTheft />}

      {sinking && (
        <div
          className="banner big-num"
          style={{ textAlign: 'center', fontSize: 'var(--fs-hero)', color: 'var(--danger)' }}
        >
          {current.length} SUNK
        </div>
      )}

      {/* The beats sit on their own light panel, the board still visible
          behind so the shots land where they are described. */}
      <div
        className="panel"
        style={{
          width: 'min(620px, 90%)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <h3>{STEP_TITLES[current.t] ?? 'resolving'}</h3>
        {shown.map((e, i) => {
          const last = i === shown.length - 1;
          const loud = last && e.t === 'prediction' && e.triggered;
          return (
            <div
              key={i}
              className={loud ? 'prediction' : last ? 'beat' : ''}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: loud ? 'var(--fs-sub)' : last ? 'var(--fs-lead)' : 'var(--fs-fine)',
                color: loud ? undefined : last ? 'var(--ink)' : 'var(--ink-faint)',
                fontWeight: last ? 800 : 600,
              }}
            >
              {iconFor(e) && <Icon name={iconFor(e)!} size={loud ? 22 : 16} />}
              <span>{describe(e, you)}</span>
            </div>
          );
        })}
      </div>

      <p style={{ textAlign: 'center', fontSize: 'var(--fs-fine)', color: 'rgba(255,255,255,0.9)', fontWeight: 700 }}>
        click to skip
      </p>
    </div>
  );
}

/**
 * Charges changing hands, shown as charges changing hands.
 *
 * Jam, Siphon, Leech and Blackout all move the same resource, and in a game
 * where that resource is the whole economy, "your bank went down by three" is
 * not something a player should have to notice by comparing two numbers
 * between rounds. The pips arc from the top of the screen to the bottom, which
 * is the direction the charges actually travel on the battle screen.
 */
function ChargeTheft(): ReactElement {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className="stealing gem small"
          style={{
            position: 'absolute',
            left: `${18 + i * 16}%`,
            top: '22%',
            fontSize: 'var(--fs-body)',
            // Fanned rather than parallel, so five pips read as a handful
            // moving instead of one pip drawn five times.
            ['--dx' as string]: `${(i - 2) * 14}px`,
            ['--dy' as string]: '210px',
            animationDelay: `${i * 55}ms`,
          }}
        >
          +
        </span>
      ))}
    </div>
  );
}

function iconFor(e: ResolveEvent): string | null {
  switch (e.t) {
    case 'shot':
      return e.hit ? 'ui.hit' : 'ui.miss';
    case 'sink':
      return 'ui.sunk';
    case 'charges':
      return 'ui.charge';
    case 'prediction':
      return e.card === 'mirror' ? 'card.mirror' : 'card.ambush';
    case 'nerf':
      return 'ui.locked';
    case 'intel':
      return 'ui.contact';
    case 'react':
      return `ship.${e.defId}`;
    default:
      return null;
  }
}

/**
 * Plain language, always. A player mid-match should never have to work out
 * what "nullified" meant or which of them "P0" was.
 */
function describe(e: ResolveEvent, you: number): string {
  const yours = (p: number) => p === you;
  switch (e.t) {
    case 'reveal':
      return 'Both plans turn face up.';
    case 'nerf':
      return yours(e.by) ? `You: ${e.text}` : `They: ${e.text}`;
    case 'prediction': {
      const name = CARDS[e.card]?.name.toUpperCase() ?? e.card;
      if (!e.triggered) {
        return yours(e.by)
          ? `You guessed ${label(e.cell)} — nothing came that way`
          : `They guessed ${label(e.cell)} — nothing came that way`;
      }
      if (e.card === 'mirror') {
        return yours(e.by)
          ? `${name} TRIGGERED — their whole attack missed`
          : `${name} TRIGGERED — your whole attack missed`;
      }
      return yours(e.by)
        ? `${name} TRIGGERED — you fire back at ${label(e.cell)}`
        : `${name} TRIGGERED — they fire back at ${label(e.cell)}`;
    }
    case 'shot': {
      const src = sourceName(e.source);
      return yours(e.by)
        ? `Your ${src} at ${label(e.cell)} — ${e.hit ? 'HIT' : 'miss'}`
        : `Their ${src} at ${label(e.cell)} — ${e.hit ? 'HIT' : 'miss'}`;
    }
    case 'sink':
      return yours(e.owner)
        ? `Your ${e.length}-length ship is gone`
        : `Their ${e.length}-length ship is gone`;
    case 'react': {
      const name = SHIPS[e.defId]?.name.toUpperCase() ?? e.defId;
      if (e.defId === 'spite') {
        return yours(e.owner)
          ? `${name} — all their charges lost`
          : `${name} — all your charges lost`;
      }
      return `${name} — ${e.text}`;
    }
    case 'charges':
      if (e.amount <= 0) return e.reason;
      return yours(e.to)
        ? `You gain ${e.amount} charges (${e.reason})`
        : `They gain ${e.amount} charges`;
    case 'intel':
      return e.text;
    case 'draw':
      return yours(e.to) ? 'You draw a card' : 'They draw a card';
    case 'strike':
      return yours(e.who)
        ? `You missed the timer — strike ${e.total} of 3`
        : `They missed the timer — strike ${e.total} of 3`;
    case 'end':
      if (e.outcome.kind === 'draw') {
        return e.outcome.reason === 'mutual'
          ? 'Both fleets gone, level going in. Draw.'
          : 'Round twenty, level on hull. Draw.';
      }
      return e.outcome.winner === you ? 'Their fleet is gone.' : 'Your fleet is gone.';
    default:
      return '';
  }
}

function sourceName(source: string): string {
  if (source === 'basic') return 'deck gun';
  return CARDS[source]?.name ?? SHIPS[source]?.name ?? source;
}
