import { useState } from 'react';
import { useGame } from '../../game/store';
import { SHIPS } from '../../content/ships';
import { Art } from '../../art/Art';

/**
 * Ship draft: packs of four, keep one and burn one, pass two on.
 *
 * The pack trail below the picker is the deduction aid — it shows which hulls
 * passed through each pack and who opened it, so a player can reason about
 * what the opponent might be holding. Burned hulls are never shown.
 */
export function DraftShipsScreen() {
  const { shipDraft, submitShipPick, humanSide, tournament } = useGame();
  const [keep, setKeep] = useState<number | null>(null);
  const [burn, setBurn] = useState<number | null>(null);

  if (!shipDraft || !tournament) return null;
  const yourTurn = shipDraft.toAct === humanSide && !shipDraft.done;
  const inFront = shipDraft.current ?? [];
  const opened = shipDraft.stage === 'first';

  const confirm = () => {
    if (keep === null || burn === null) return;
    submitShipPick(keep, burn);
    setKeep(null);
    setBurn(null);
  };

  const choose = (uid: number) => {
    if (keep === null) setKeep(uid);
    else if (keep === uid) setKeep(null);
    else if (burn === uid) setBurn(null);
    else setBurn(uid);
  };

  return (
    <div className="screen">
      <div className="topbar">
        <h1>Hulls · pack {shipDraft.packIndex + 1} of {shipDraft.packCount}</h1>
        <span className="chip">{shipDraft.keeps[humanSide].length} kept</span>
      </div>

      <div className="scroll">
        <div className="panel">
          <h2>{opened ? 'Fresh pack — four hulls' : 'Passed to you — two hulls'}</h2>
          <p className="small dim">
            Keep one, burn one. {opened
              ? 'The two you do not touch pass to your opponent.'
              : 'Your opponent kept one of the two you never saw.'}{' '}
            A burned hull leaves the match for good, and nobody is told which it was.
          </p>

          {!yourTurn ? (
            <p className="small faint">Waiting on your opponent…</p>
          ) : (
            <>
              <div className="packGrid">
                {inFront.map((item) => {
                  const def = SHIPS[item.id];
                  const mode = keep === item.uid ? 'keep' : burn === item.uid ? 'burn' : undefined;
                  return (
                    <button
                      key={item.uid}
                      className="pick"
                      data-mode={mode}
                      onClick={() => choose(item.uid)}
                      type="button"
                    >
                      <span className="shipRow">
                        <Art id={`ship.${item.id}`} size={22} />
                      </span>
                      <div style={{ marginTop: 4 }}>
                        <strong>{def.name}</strong>{' '}
                        <span className="mono dim">·{def.size}</span>
                      </div>
                      <div className="tiny dim" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <Art id={`icon.ability.${item.id}`} size={12} />
                        {def.abilityName}
                      </div>
                      <div className="small faint" style={{ marginTop: 2 }}>
                        {def.abilityText}
                      </div>
                      {mode && (
                        <div className="tiny" style={{ marginTop: 4, color: mode === 'keep' ? 'var(--green)' : 'var(--red)' }}>
                          {mode === 'keep' ? 'Keeping' : 'Burning'}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="btnRow" style={{ marginTop: 10 }}>
                <button
                  className="btn primary"
                  disabled={keep === null || burn === null}
                  onClick={confirm}
                >
                  {keep === null ? 'Choose a keep' : burn === null ? 'Choose a burn' : 'Confirm'}
                </button>
              </div>
            </>
          )}
        </div>

        <PackTrail />
      </div>
    </div>
  );
}

/** The public record: which hulls passed through each pack, and who opened it. */
function PackTrail() {
  const { shipDraft, humanSide } = useGame();
  if (!shipDraft || shipDraft.records.length === 0) return null;
  return (
    <div className="panel">
      <h2>Pack trail</h2>
      <p className="small dim">
        What you have seen change hands. When you open a pack, your opponent chooses between the
        two you pass on — so you know one of that pair is in their fleet.
      </p>
      {shipDraft.records.map((rec, i) => {
        const mine = rec.firstPlayer === humanSide;
        return (
          <div key={i} style={{ marginBottom: 8 }}>
            <div className="tiny dim">
              Pack {rec.packIndex + 1} · {mine ? 'you opened' : 'they opened'}
            </div>
            <div className="chipRow">
              {rec.passed.map((id, j) => (
                <span key={j} className="chip" data-on={mine ? 'true' : undefined}>
                  {SHIPS[id].name} · {SHIPS[id].size}
                </span>
              ))}
            </div>
            <div className="small faint">
              {mine
                ? 'They kept one of these two.'
                : 'You saw these two; they kept one of the other two.'}
            </div>
          </div>
        );
      })}
    </div>
  );
}
