import { useEffect, useState, type ReactElement } from 'react';
import { useStore, type Beat } from '../../state/store';
import { SHIPS } from '../../engine/ships';
import { ShipCard } from '../components/GameCard';
import { Icon } from '../art/Icon';
import { Sound } from '../sfx/SoundManager';

/**
 * The beats between phases.
 *
 * A match used to jump-cut: you pressed a button and were standing in pack
 * one with no idea who you were facing. These are the moments in between —
 * short, skippable, and each one carrying a fact the player needed anyway.
 * The phase cards in particular are not decoration: they replaced the static
 * headers that sat permanently on the draft and deploy screens, so the game
 * says "DEPLOY" once, loudly, instead of forever, quietly.
 *
 * Everything here is off by one Settings toggle, and a click skips any beat.
 */

const PHASE_COPY: Record<string, { title: string; line: string; icon: string }> = {
  shipDraft: {
    title: 'SHIP DRAFT',
    line: 'Three packs of four. Pick in secret — a shared pick goes to both of you.',
    icon: 'ui.anchor',
  },
  cardDraft: {
    title: 'CARD DRAFT',
    line: 'Three more picks. Everything nobody takes becomes the shared pile.',
    icon: 'ui.target',
  },
  deploy: {
    title: 'DEPLOY',
    line: 'Place three hulls. Once committed, they cannot move for the rest of the match.',
    icon: 'ui.contact',
  },
  battle: {
    title: 'BATTLE',
    line: 'Twenty seconds a round. Both plans resolve at once.',
    icon: 'ui.hit',
  },
};

/** How long each beat holds before it steps aside. */
const HOLD_MS = 1500;

/**
 * Dev builds let the screenshot sweep hold a beat open. A beat that steps
 * aside after 1.5s is right for a player and hopeless for a harness trying to
 * photograph it — the alternative was a sweep full of races.
 */
function holdMs(): number {
  if (!import.meta.env.DEV) return HOLD_MS;
  const override = (window as unknown as { __beatHold?: number }).__beatHold;
  return typeof override === 'number' && override > 0 ? override : HOLD_MS;
}

export function PhaseBeats(): ReactElement | null {
  const beats = useStore((s) => s.beats);
  const advance = useStore((s) => s.advanceBeat);
  const beat = beats[0] ?? null;
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (!beat) return undefined;
    setKey((k) => k + 1);
    // A card raising is a discrete event: something changed phase. The
    // match-found beat has its own cue from the store and skips this one.
    if (beat.kind !== 'matchFound') Sound.play('phase-card', { gain: 0.7 });
    const id = setTimeout(advance, holdMs());
    return () => clearTimeout(id);
  }, [beat, advance]);

  if (!beat) return null;
  return (
    <div className="overlay beat-screen" onClick={advance} key={key}>
      {render(beat)}
      <span className="beat-skip">click to skip</span>
    </div>
  );
}

function render(beat: Beat): ReactElement {
  switch (beat.kind) {
    case 'matchFound':
      return <MatchFound beat={beat} />;
    case 'fleet':
      return <FleetAssembled ships={beat.ships} />;
    case 'committed':
      return <BothCommitted mine={beat.mine} theirs={beat.theirs} />;
    default:
      return <PhaseCard kind={beat.kind} />;
  }
}

function PhaseCard({ kind }: { kind: string }): ReactElement {
  const copy = PHASE_COPY[kind] ?? { title: kind.toUpperCase(), line: '', icon: 'ui.anchor' };
  return (
    <div className="beat-card">
      <Icon name={copy.icon} size={54} style={{ color: 'var(--gold)' }} />
      <span className="banner beat-title">{copy.title}</span>
      <p className="full beat-line">{copy.line}</p>
    </div>
  );
}

/**
 * Who you are facing, and for how much. A player thrown straight into pack
 * one has no idea either of those things, and both change how they draft.
 */
function MatchFound({
  beat,
}: {
  beat: Extract<Beat, { kind: 'matchFound' }>;
}): ReactElement {
  return (
    <div className="beat-card">
      <span className="beat-kicker">Match found</span>
      <div className="row beat-vs">
        <span className="beat-name">You</span>
        <span className="beat-versus">vs</span>
        <span className="beat-name">{beat.opponent}</span>
      </div>
      <div className="row" style={{ gap: 10, justifyContent: 'center' }}>
        <span className="pill">{beat.subtitle}</span>
        {beat.stake > 0 ? (
          <span className="pill gold">◎ {beat.stake} staked each</span>
        ) : (
          <span className="pill">no stake</span>
        )}
      </div>
    </div>
  );
}

/**
 * The moment a player understands what they drafted.
 *
 * Three ships picked one pack at a time never appeared together anywhere —
 * you found out what your fleet actually was by playing it.
 */
function FleetAssembled({ ships }: { ships: string[] }): ReactElement {
  return (
    <div className="beat-card wide">
      <span className="beat-kicker">Your fleet</span>
      <div className="row" style={{ gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
        {ships.map((id, i) => (
          <div
            key={id}
            className="col fleet-slot"
            style={{ gap: 8, animationDelay: `${i * 130}ms` }}
          >
            <ShipCard defId={id} length={SHIPS[id].length} />
            <p style={{ fontSize: 'var(--fs-fine)', fontWeight: 700, maxWidth: 210 }}>
              {SHIPS[id].text}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The honesty claim, made visible.
 *
 * Two hashes, written before a shot is fired and checkable afterwards by
 * anyone. It is the thing the whole product rests on and it had no moment.
 */
function BothCommitted({ mine, theirs }: { mine: string | null; theirs: string | null }): ReactElement {
  const [sealed, setSealed] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSealed(true), 620);
    return () => clearTimeout(id);
  }, []);
  return (
    <div className="beat-card wide">
      <span className="beat-kicker">Both fleets committed</span>
      <div className="row" style={{ gap: 16, justifyContent: 'center' }}>
        {[
          ['You', mine],
          ['Them', theirs],
        ].map(([who, hash]) => (
          <div
            key={who}
            className={`seal ${sealed ? 'shut' : ''} ${who === 'You' ? 'seal-own' : ''}`}
          >
            <span className="seal-who">{who}</span>
            <span className="mono seal-hash">{(hash ?? '').slice(0, 24) || '—'}…</span>
          </div>
        ))}
      </div>
      <p className="full beat-line">
        Written before the first shot and unchangeable after it. At the end of the match both
        layouts are revealed and replayed against these two hashes.
      </p>
    </div>
  );
}
