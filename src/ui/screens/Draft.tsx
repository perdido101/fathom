import { useEffect, useState, type ReactElement } from 'react';
import { useStore } from '../../state/store';
import { CARDS } from '../../engine/cards';
import { SHIPS } from '../../engine/ships';
import { CardArt, ShipArt } from '../art/registry';
import { Sound } from '../sfx/SoundManager';

/**
 * Both drafts, one component.
 *
 * The mechanism is identical by design — learn it once, use it twice — so
 * duplicating it in two files would be a lie about the game. The only
 * difference is what a pack is made of.
 *
 * The moment worth building the screen around is the collision. Both players
 * see the same four cards, both pick in secret, and if they reached for the
 * same one they both get it. That is the only information either side leaks
 * during the whole draft, so it lands as an event, not a footnote.
 */
export function Draft({ kind }: { kind: 'ship' | 'card' }): ReactElement | null {
  const view = useStore((s) => s.view());
  const submitShip = useStore((s) => s.submitShipPick);
  const submitCard = useStore((s) => s.submitCardPick);
  const [pending, setPending] = useState<string | null>(null);
  const [collision, setCollision] = useState<{ index: number; hit: boolean } | null>(null);

  const ds = kind === 'ship' ? view?.shipDraft : view?.cardDraft;

  useEffect(() => {
    if (!ds || pending === null) return undefined;
    // Show the reveal for a beat before the next pack slides in.
    const settled = ds.myPicks[ds.index] !== null || ds.done;
    if (!settled) return undefined;
    const id = setTimeout(() => setPending(null), 60);
    return () => clearTimeout(id);
  }, [ds, pending]);

  if (!view || !ds) return null;
  const packIndex = ds.done ? ds.packs.length - 1 : ds.index;
  const pack = ds.packs[packIndex] ?? [];

  function choose(id: string): void {
    if (pending) return;
    setPending(id);
    const before = ds!.index;
    if (kind === 'ship') submitShip(id);
    else submitCard(id);
    // The collision flag for this pack is written the moment both picks land.
    setTimeout(() => {
      const now = useStore.getState().view();
      const after = kind === 'ship' ? now?.shipDraft : now?.cardDraft;
      const hit = after?.collisions[before] ?? false;
      setCollision({ index: before, hit });
      Sound.play(hit ? 'prediction-triggered' : 'charge-placed');
      setTimeout(() => setCollision(null), 1300);
      setPending(null);
    }, 120);
  }

  const picked = ds.myPicks.filter(Boolean) as string[];

  return (
    <div className="screen">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>{kind === 'ship' ? 'Ship draft' : 'Card draft'}</h2>
        <span className="pill">
          pack {Math.min(packIndex + 1, 3)} of 3
        </span>
      </div>
      <p>
        {kind === 'ship'
          ? 'Both fleets end up one 4, one 3 and one 2. Only the abilities differ.'
          : 'Three picks become your opening hand. Everything nobody takes becomes the shared draw pile.'}
      </p>

      <div className={kind === 'ship' ? 'col' : 'grid4'} style={{ gap: 10 }}>
        {pack.map((id) =>
          kind === 'ship' ? (
            <button
              key={id}
              className="card-surface row"
              onClick={() => choose(id)}
              disabled={pending !== null}
              style={{ gap: 10, textAlign: 'left', opacity: pending && pending !== id ? 0.4 : 1 }}
            >
              <ShipArt defId={id} length={SHIPS[id].length} size={24} />
              <div className="col" style={{ gap: 2, flex: 1 }}>
                <div className="row" style={{ gap: 6 }}>
                  <strong style={{ fontSize: 14 }}>{SHIPS[id].name}</strong>
                  <span className="pill" style={{ padding: '1px 7px' }}>
                    {SHIPS[id].type}
                  </span>
                  <span className="pill" style={{ padding: '1px 7px' }}>
                    length {SHIPS[id].length}
                  </span>
                </div>
                <span style={{ fontSize: 12, color: 'var(--ink-dim)' }}>{SHIPS[id].text}</span>
              </div>
            </button>
          ) : (
            <CardArt
              key={id}
              defId={id}
              charges={0}
              selected={pending === id}
              disabled={pending !== null}
              onClick={() => choose(id)}
            />
          ),
        )}
      </div>

      <div className="spacer" />
      <h3>Taken so far</h3>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {picked.length === 0 && <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>nothing yet</span>}
        {picked.map((id, i) => (
          <span key={i} className="pill">
            {kind === 'ship' ? SHIPS[id].name : CARDS[id].name}
            {ds.collisions[i] ? ' · both' : ''}
          </span>
        ))}
      </div>

      {collision && (
        <div className="overlay" style={{ justifyContent: 'center', alignItems: 'center' }}>
          <div className="beat" style={{ textAlign: 'center' }}>
            <h1 style={{ color: collision.hit ? 'var(--charge)' : 'var(--ink-dim)' }}>
              {collision.hit ? 'BOTH TOOK IT' : 'PICKS DIFFER'}
            </h1>
            <p style={{ marginTop: 8 }}>
              {collision.hit
                ? 'You reached for the same one. You both get it — and you both know it.'
                : 'They took one of the other three. You will not learn which.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
