import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useStore } from '../../state/store';
import { CARDS } from '../../engine/cards';
import { SHIPS } from '../../engine/ships';
import { CardBack, GameCard, ShipCard } from '../components/GameCard';
import { Sound } from '../sfx/SoundManager';
import { artUrl } from '../art/dropin';
import { useFeedback } from '../feedback/store';

/**
 * Both drafts, one screen shape: four large cards in a row, centre screen.
 *
 * The moment worth building the screen around is the collision. Both players
 * see the same four cards, both pick in secret, and if they reached for the
 * same one they both get it — the only information either side leaks all
 * draft. It lands as a full-screen beat.
 *
 * The absence of a collision does not. Build 6 deleted the "PICKS DIFFER"
 * screen outright: it announced the absence of information, which is the
 * default state of every pack and therefore not news. A player who sees no
 * collision already knows the picks differed, and silence carries it.
 *
 * What did need saying is the mechanism. Blind simultaneous picking with
 * legal duplicates is unusual and was never taught, so it is now taught three
 * ways: a first-run coach on pack one, a permanent line under the pack, and a
 * step in How to Play.
 */

/** The beats of a pick, in milliseconds from the click. */
const BEAT = {
  /** Their card back slides in beside yours. The tension beat. */
  theirs: 430,
  /** Face up together, or quietly away. */
  resolve: 1050,
  /** How long a collision holds its slam. */
  slam: 1250,
  /** How long a non-collision takes to clear. Nothing is announced. */
  quiet: 380,
};

interface Sequence {
  pack: string[];
  packIndex: number;
  picked: string;
  stage: 'lift' | 'theirs' | 'resolve';
  hit: boolean;
}

const COACH_KEY = 'coach:draft';

export function Draft({ kind }: { kind: 'ship' | 'card' }): ReactElement | null {
  const view = useStore((s) => s.view());
  const submitShip = useStore((s) => s.submitShipPick);
  const submitCard = useStore((s) => s.submitCardPick);
  const seenOnce = useFeedback((s) => s.seenOnce);
  const markSeen = useFeedback((s) => s.markSeen);

  const [seq, setSeq] = useState<Sequence | null>(null);
  const [coach, setCoach] = useState(() => !seenOnce(COACH_KEY));
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const dealtPack = useRef<number>(-1);

  // Every timer this screen starts is owned here, so leaving mid-sequence —
  // a forfeit, a lapsed timer auto-picking, a disconnect — cannot land a
  // setState on a screen that is no longer mounted.
  useEffect(
    () => () => {
      for (const t of timers.current) clearTimeout(t);
      timers.current = [];
    },
    [],
  );

  const ds = kind === 'ship' ? view?.shipDraft : view?.cardDraft;
  if (!view || !ds) return null;

  const livePackIndex = ds.done ? ds.packs.length - 1 : ds.index;
  /*
   * A pack arriving is one event, so it makes one sound — not four, one per
   * card arcing in. The ref is what makes it once: this runs on every render
   * and the pack index is the only thing that says a *new* pack is on the
   * table.
   */
  if (!ds.done && dealtPack.current !== livePackIndex) {
    const first = dealtPack.current < 0;
    dealtPack.current = livePackIndex;
    Sound.play(first ? 'draft-deal' : 'draft-pack');
  }
  // While a sequence runs, the screen shows the pack the player picked from,
  // not the one the engine has already moved on to.
  const packIndex = seq ? seq.packIndex : livePackIndex;
  const pack = seq ? seq.pack : (ds.packs[packIndex] ?? []);
  const picked = ds.myPicks.filter(Boolean) as string[];
  const reduced =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scale = reduced ? 0.15 : 1;

  function after(ms: number, fn: () => void): void {
    timers.current.push(setTimeout(fn, ms * scale));
  }

  /** Cut the sequence short — a click anywhere during it. */
  function skip(): void {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
    setSeq(null);
  }

  function choose(id: string): void {
    if (seq) return;
    if (coach) {
      markSeen(COACH_KEY);
      setCoach(false);
    }
    const before = livePackIndex;
    const shown = (ds!.packs[before] ?? []).slice();
    setSeq({ pack: shown, packIndex: before, picked: id, stage: 'lift', hit: false });
    Sound.play('draft-pick');
    // The pick goes to the engine now. The beats below are theatre played
    // over a decision already made — holding the engine back for an animation
    // would be holding the opponent back too.
    if (kind === 'ship') submitShip(id);
    else submitCard(id);

    after(BEAT.theirs, () => {
      Sound.play('draft-theirs');
      setSeq((s) => (s ? { ...s, stage: 'theirs' } : s));
    });
    after(BEAT.resolve, () => {
      const now = useStore.getState().view();
      const draft = kind === 'ship' ? now?.shipDraft : now?.cardDraft;
      const hit = draft?.collisions[before] ?? false;
      setSeq((s) => (s ? { ...s, stage: 'resolve', hit } : s));
      Sound.play(hit ? 'draft-collision' : 'draft-resolve');
      after(hit ? BEAT.slam : BEAT.quiet, () => setSeq(null));
    });
  }

  const resolving = seq?.stage === 'resolve';
  const collision = Boolean(resolving && seq?.hit);

  return (
    <div
      className="screen centered draft-screen"
      style={{ gap: 22 }}
      onClick={seq ? skip : undefined}
    >
      {/* The pack counter. Which of three you are on is the one fact the
          phase card cannot carry, because it changes twice while you are
          standing here. */}
      <div className="row" style={{ gap: 8 }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`pack-pip ${i < packIndex || ds.done ? 'done' : i === packIndex ? 'now' : ''}`}
          />
        ))}
      </div>

      <div className="row draft-row" key={packIndex} style={{ gap: 26, alignItems: 'stretch' }}>
        {pack.map((id, i) =>
          kind === 'ship' ? (
            <button
              key={id}
              onClick={() => choose(id)}
              disabled={seq !== null}
              className={`panel draft-pick ${dealClass(seq, id)}`}
              style={{
                width: 250,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                alignItems: 'center',
                textAlign: 'center',
                animationDelay: `${i * 80}ms`,
                borderTop: `6px solid ${
                  SHIPS[id].type === 'ACTIVE'
                    ? 'var(--confirm)'
                    : SHIPS[id].type === 'NERF'
                      ? 'var(--control)'
                      : 'var(--predict)'
                }`,
              }}
            >
              {artUrl(`ships/${id}/hero`) && (
                <img
                  src={artUrl(`ships/${id}/hero`) ?? undefined}
                  alt=""
                  style={{
                    width: 170,
                    height: 170,
                    objectFit: 'cover',
                    borderRadius: 14,
                    boxShadow: 'var(--shadow-soft)',
                  }}
                />
              )}
              <ShipCard defId={id} length={SHIPS[id].length} size="md" />
              <p style={{ fontSize: 'var(--fs-fine)', fontWeight: 700, minHeight: 70 }}>
                {SHIPS[id].text}
              </p>
              <span className="pill">
                {SHIPS[id].type} · length {SHIPS[id].length}
              </span>
            </button>
          ) : (
            <div
              key={id}
              className={`draft-pick ${dealClass(seq, id)}`}
              style={{ display: 'flex', animationDelay: `${i * 80}ms` }}
            >
              <GameCard
                defId={id}
                charges={0}
                size="lg"
                disabled={seq !== null}
                selected={seq?.picked === id}
                onClick={() => choose(id)}
              />
            </div>
          ),
        )}

        {/* Their pick, face down, sitting beside yours. This is the tension
            beat, and until Build 6 it did not exist at all: the screen went
            straight from your click to a verdict. */}
        {seq && seq.stage !== 'lift' && (
          <div className={`their-pick ${collision ? 'flipped' : resolving ? 'away' : ''}`}>
            {collision ? (
              <GameCardOrShip kind={kind} id={seq.picked} />
            ) : (
              <div className="their-back">
                <CardBack label="THEIRS" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* The mechanism, said quietly and permanently. A line, not a panel. */}
      <p className="full draft-rule">
        {kind === 'ship'
          ? 'Both fleets end up one 4, one 3 and one 2 — only the abilities differ. Pick in secret; if you both pick the same ship, you both get it.'
          : 'Three picks become your opening hand. Pick in secret; a shared pick goes to both of you. Everything nobody takes becomes the shared draw pile.'}
      </p>

      <div className="row" style={{ gap: 10 }}>
        <span className="draft-taken-label">Taken so far:</span>
        {picked.length === 0 && <span className="draft-taken-none">nothing yet</span>}
        {picked.map((id, i) => (
          <span key={i} className="pill">
            {kind === 'ship' ? SHIPS[id].name : CARDS[id].name}
            {ds.collisions[i] ? ' · both!' : ''}
          </span>
        ))}
      </div>

      {/* The first-run coach. Pack one only, dismisses itself on the first
          pick, and never returns. */}
      {coach && packIndex === 0 && !seq && (
        <div className="draft-coach beat">
          <strong>You both see these four.</strong> Pick in secret. If you both reach for the same
          one, you both get it — and you both find out.
        </div>
      )}

      {/* A collision is the only thing a draft ever tells you, so it is the
          only thing that interrupts. */}
      {collision && seq && (
        <div className="overlay" style={{ justifyContent: 'center', alignItems: 'center' }}>
          <div className="prediction-wash" />
          <div
            className="panel banner"
            style={{
              textAlign: 'center',
              padding: '42px 72px',
              border: '5px solid var(--gold)',
              boxShadow: '0 0 0 8px rgba(255,197,49,0.35), var(--shadow-deep)',
            }}
          >
            <h1 className="big-num" style={{ color: 'var(--gold)', fontSize: 'var(--fs-hero)' }}>
              COLLISION!
            </h1>
            <p style={{ marginTop: 10, fontWeight: 700 }}>
              You reached for the same one. You both get it — and you both know it.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/** Which of the deal-in / lift / recede states a card in the pack is in. */
function dealClass(seq: Sequence | null, id: string): string {
  if (!seq) return 'dealt';
  if (seq.picked === id) return 'chosen';
  return 'receded';
}

function GameCardOrShip({ kind, id }: { kind: 'ship' | 'card'; id: string }): ReactElement {
  return kind === 'ship' ? (
    <ShipCard defId={id} length={SHIPS[id].length} size="md" />
  ) : (
    <GameCard defId={id} charges={0} size="lg" />
  );
}
