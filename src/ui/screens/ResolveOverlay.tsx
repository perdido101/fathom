import { useEffect, useMemo, type ReactElement } from 'react';
import type { ResolveEvent } from '../../engine/types';
import { label } from '../../engine/types';
import { CARDS } from '../../engine/cards';
import { SHIPS } from '../../engine/ships';
import { useStore } from '../../state/store';

/**
 * The resolve sequence, in the order the rules resolve it.
 *
 * The whole point of the strict order in the rulebook is that the player can
 * see *why* something happened: the theft landed before the shots, the ship
 * that died still fired, the read triggered before either. So the overlay
 * walks the same event list the engine emitted rather than summarising it, and
 * groups it into the numbered steps.
 *
 * Total budget is roughly three to four seconds; players who have seen it
 * enough can turn it off in settings.
 */

const STEP_TITLES: Record<string, string> = {
  reveal: '1 · Reveal',
  nerf: '2 · Interference',
  prediction: '3 · Predictions',
  shot: '4 · Attacks',
  sink: '5 · Sinks',
  react: '6 · Reactions',
  charges: '7 · Charges',
  intel: '7 · Intel',
  draw: '8 · Draw',
  strike: '— Timer',
  end: '— Result',
};

const STEP_MS: Record<string, number> = {
  reveal: 500,
  nerf: 420,
  prediction: 520,
  shot: 190,
  sink: 700,
  react: 620,
  charges: 320,
  intel: 420,
  draw: 260,
  strike: 400,
  end: 900,
};

export function ResolveOverlay(): ReactElement | null {
  const playback = useStore((s) => s.playback);
  const advance = useStore((s) => s.advancePlayback);
  const finish = useStore((s) => s.finishPlayback);
  const you = useStore((s) => s.view()?.you ?? 0);

  const current = playback ? playback.events[playback.index] : null;
  const delay = current ? STEP_MS[current.t] ?? 300 : 0;

  useEffect(() => {
    if (!playback) return undefined;
    const id = setTimeout(advance, delay);
    return () => clearTimeout(id);
  }, [playback, advance, delay]);

  const shown = useMemo(() => {
    if (!playback) return [];
    return playback.events
      .slice(0, playback.index + 1)
      .filter((e) => (e.t === 'intel' ? e.to === you : true))
      .slice(-9);
  }, [playback, you]);

  if (!playback || !current) return null;

  return (
    <div className="overlay" onClick={finish}>
      <h3>{STEP_TITLES[current.t] ?? 'resolving'}</h3>
      <div className="col" style={{ gap: 6 }}>
        {shown.map((e, i) => (
          <div
            key={i}
            className={i === shown.length - 1 ? 'beat' : ''}
            style={{
              fontSize: i === shown.length - 1 ? 17 : 13,
              color: i === shown.length - 1 ? 'var(--ink)' : 'var(--ink-faint)',
              fontWeight: i === shown.length - 1 ? 700 : 400,
            }}
          >
            {describe(e, you)}
          </div>
        ))}
      </div>
      <div className="spacer" />
      <p style={{ textAlign: 'center', fontSize: 12 }}>tap to skip</p>
    </div>
  );
}

function describe(e: ResolveEvent, you: number): string {
  const side = (p: number) => (p === you ? 'You' : 'They');
  switch (e.t) {
    case 'reveal':
      return 'Both plans turn face up.';
    case 'nerf':
      return `${side(e.by)}: ${e.text}`;
    case 'prediction':
      return e.triggered
        ? `${side(e.by)} read ${label(e.cell)} — ${CARDS[e.card].name} triggers`
        : `${side(e.by)} guessed ${label(e.cell)} — nothing there`;
    case 'shot':
      return `${side(e.by)} ${sourceName(e.source)} at ${label(e.cell)} — ${e.hit ? 'HIT' : 'miss'}`;
    case 'sink':
      return `${e.length} SUNK${e.owner === you ? ' (yours)' : ''}`;
    case 'react':
      return `${SHIPS[e.defId]?.name ?? e.defId} — ${e.text}`;
    case 'charges':
      return e.amount > 0 ? `${side(e.to)} +${e.amount} charges (${e.reason})` : `${e.reason}`;
    case 'intel':
      return e.text;
    case 'draw':
      return `${side(e.to)} draw a card`;
    case 'strike':
      return `${side(e.who)} missed the timer — strike ${e.total} of 3`;
    case 'end':
      return e.outcome.kind === 'draw'
        ? 'Both fleets gone. Draw.'
        : e.outcome.winner === you
          ? 'Their fleet is gone.'
          : 'Your fleet is gone.';
    default:
      return '';
  }
}

function sourceName(source: string): string {
  if (source === 'basic') return 'deck gun';
  return CARDS[source]?.name ?? SHIPS[source]?.name ?? source;
}
