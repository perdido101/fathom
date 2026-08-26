import { useState, type ReactElement } from 'react';
import { useStore } from '../../state/store';
import { CARDS } from '../../engine/cards';
import { SHIPS } from '../../engine/ships';
import { GameCard, ShipCard } from '../components/GameCard';
import { Sound } from '../sfx/SoundManager';

/**
 * Both drafts, one screen shape: four large cards in a row, centre screen.
 *
 * The moment worth building the screen around is the collision. Both players
 * see the same four cards, both pick in secret, and if they reached for the
 * same one they both get it — the only information either side leaks all
 * draft. It lands as a full-screen beat, not a footnote.
 */
export function Draft({ kind }: { kind: 'ship' | 'card' }): ReactElement | null {
  const view = useStore((s) => s.view());
  const submitShip = useStore((s) => s.submitShipPick);
  const submitCard = useStore((s) => s.submitCardPick);
  const [pending, setPending] = useState<string | null>(null);
  const [collision, setCollision] = useState<{ hit: boolean } | null>(null);

  const ds = kind === 'ship' ? view?.shipDraft : view?.cardDraft;
  if (!view || !ds) return null;
  const packIndex = ds.done ? ds.packs.length - 1 : ds.index;
  const pack = ds.packs[packIndex] ?? [];
  const picked = ds.myPicks.filter(Boolean) as string[];

  function choose(id: string): void {
    if (pending) return;
    setPending(id);
    const before = ds!.index;
    if (kind === 'ship') submitShip(id);
    else submitCard(id);
    setTimeout(() => {
      const now = useStore.getState().view();
      const after = kind === 'ship' ? now?.shipDraft : now?.cardDraft;
      const hit = after?.collisions[before] ?? false;
      setCollision({ hit });
      Sound.play(hit ? 'prediction-triggered' : 'charge-placed');
      setTimeout(() => setCollision(null), 1300);
      setPending(null);
    }, 120);
  }

  return (
    <div className="screen centered" style={{ gap: 26, position: 'relative' }}>
      <div className="col" style={{ alignItems: 'center', gap: 6 }}>
        <h1 style={{ color: '#ffffff', textShadow: '0 3px 0 rgba(18,58,94,0.3)' }}>
          {kind === 'ship' ? 'Ship draft' : 'Card draft'}
        </h1>
        <div className="row" style={{ gap: 8 }}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                width: 34,
                height: 8,
                borderRadius: 4,
                background:
                  i < packIndex || ds.done
                    ? 'var(--gold)'
                    : i === packIndex
                      ? 'rgba(255,255,255,0.95)'
                      : 'rgba(255,255,255,0.4)',
              }}
            />
          ))}
        </div>
        <p style={{ color: 'rgba(255,255,255,0.92)', fontWeight: 700 }}>
          {kind === 'ship'
            ? 'Both fleets end up one 4, one 3 and one 2 — only the abilities differ. Pick in secret; if you both pick the same ship, you both get it.'
            : 'Three picks become your opening hand. Everything nobody takes becomes the shared draw pile.'}
        </p>
      </div>

      <div className="row" style={{ gap: 26, alignItems: 'stretch' }}>
        {pack.map((id) =>
          kind === 'ship' ? (
            <button
              key={id}
              onClick={() => choose(id)}
              disabled={pending !== null}
              className="panel draft-pick"
              style={{
                width: 250,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                alignItems: 'center',
                textAlign: 'center',
                opacity: pending && pending !== id ? 0.5 : 1,
                borderTop: `6px solid ${
                  SHIPS[id].type === 'ACTIVE'
                    ? 'var(--confirm)'
                    : SHIPS[id].type === 'NERF'
                      ? 'var(--control)'
                      : 'var(--predict)'
                }`,
                transition: 'transform var(--t-fast), box-shadow var(--t-fast)',
              }}
            >
              <ShipCard defId={id} length={SHIPS[id].length} size="md" />
              <p style={{ fontSize: 13.5, fontWeight: 700, minHeight: 70 }}>{SHIPS[id].text}</p>
              <span className="pill">
                {SHIPS[id].type} · length {SHIPS[id].length}
              </span>
            </button>
          ) : (
            <div key={id} className="draft-pick" style={{ display: 'flex' }}>
              <GameCard
                defId={id}
                charges={0}
                size="lg"
                disabled={pending !== null}
                selected={pending === id}
                onClick={() => choose(id)}
              />
            </div>
          ),
        )}
      </div>

      <div className="row" style={{ gap: 10 }}>
        <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 800, fontSize: 13 }}>
          Taken so far:
        </span>
        {picked.length === 0 && (
          <span style={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700, fontSize: 13 }}>
            nothing yet
          </span>
        )}
        {picked.map((id, i) => (
          <span key={i} className="pill">
            {kind === 'ship' ? SHIPS[id].name : CARDS[id].name}
            {ds.collisions[i] ? ' · both!' : ''}
          </span>
        ))}
      </div>

      {collision && (
        <div className="overlay" style={{ justifyContent: 'center', alignItems: 'center' }}>
          {collision.hit && <div className="prediction-wash" />}
          <div className="panel beat" style={{ textAlign: 'center', padding: '36px 60px' }}>
            <h1
              className={collision.hit ? 'prediction' : ''}
              style={{ color: collision.hit ? undefined : 'var(--ink-dim)' }}
            >
              {collision.hit ? 'BOTH TOOK IT!' : 'PICKS DIFFER'}
            </h1>
            <p style={{ marginTop: 10, fontWeight: 700 }}>
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
