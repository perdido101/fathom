import { useGame, remainingToPlace, lineFrom } from '../../game/store';
import { useState } from 'react';
import { SHIPS } from '../../content/ships';
import { MODIFIERS } from '../../content/modifiers';
import { Grid, type CellDecoration } from '../components/Grid';
import { Art } from '../../art/Art';

const ORIENTATIONS = ['Across', 'Down', 'Down-right', 'Down-left'];

export function PlacementScreen() {
  const {
    battle, placement, humanSide, placeAt, rotate, undoPlacement, autoPlace,
    confirmPlacement, selectShipToPlace,
  } = useGame();
  const [hover, setHover] = useState<number | null>(null);

  if (!battle || !placement) return null;
  const queue = remainingToPlace(battle, humanSide, placement);
  const current = queue[placement.selected] ?? queue[0];
  const def = current ? SHIPS[current] : null;
  const mod = MODIFIERS[battle.modifierId];

  const occupied = new Set(placement.placed.flatMap((p) => p.cells));
  const preview = hover !== null && def
    ? lineFrom(hover, def.size, placement.orientation, battle.gridW, battle.gridH)
    : null;
  const previewOk =
    preview !== null &&
    preview.every((c) => !occupied.has(c) && battle.terrain[c] !== 'REEF');

  const decorate = (cell: number): CellDecoration => {
    const isShip = occupied.has(cell);
    const inPreview = preview?.includes(cell) ?? false;
    return {
      ship: isShip,
      preview: inPreview ? (previewOk ? 'ok' : 'bad') : null,
    };
  };

  return (
    <div className="screen">
      <div className="topbar">
        <h1>Deploy</h1>
        <span className="chip">{queue.length} left</span>
      </div>

      <div className="scroll">
        <div className="panel" style={{ padding: 6 }}>
          <Grid
            w={battle.gridW}
            h={battle.gridH}
            terrain={battle.terrain}
            decorate={decorate}
            onCell={(c) => {
              setHover(c);
              placeAt(c);
            }}
            own
            label="Your waters"
          />
        </div>

        <div className="panel">
          <div className="statRow" style={{ marginBottom: 6 }}>
            <span className="tiny dim">Conditions</span>
            <strong style={{ color: 'var(--violet)' }}>{mod?.name}</strong>
          </div>
          <p className="small dim">{mod?.text}</p>
        </div>

        {def && (
          <div className="panel">
            <h2>Placing</h2>
            <div className="shipRow">
              <Art id={`ship.${current}`} size={26} />
              <div>
                <strong>{def.name}</strong> <span className="mono dim">·{def.size}</span>
                <div className="tiny dim" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Art id={`icon.ability.${current}`} size={12} />
                  {def.abilityName}
                </div>
              </div>
            </div>
            <p className="small faint" style={{ marginTop: 6 }}>{def.abilityText}</p>
            <div className="btnRow" style={{ marginTop: 8 }}>
              <button className="btn small" onClick={rotate}>
                {ORIENTATIONS[placement.orientation]}
              </button>
              <button className="btn small" onClick={undoPlacement} disabled={placement.placed.length === 0}>
                Undo
              </button>
            </div>
          </div>
        )}

        {queue.length > 1 && (
          <div className="panel">
            <h2>Still to deploy</h2>
            <div className="chipRow">
              {queue.map((id, i) => (
                <button
                  key={i}
                  className="chip"
                  data-on={i === placement.selected ? 'true' : undefined}
                  onClick={() => selectShipToPlace(i)}
                  type="button"
                >
                  {SHIPS[id].name} · {SHIPS[id].size}
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="small faint">
          Ships lie in a straight line — across, down, or on either diagonal. Reef cannot be built on.
        </p>
      </div>

      <div className="bottombar">
        <div className="btnRow">
          <button className="btn" onClick={autoPlace}>
            Auto-deploy
          </button>
          <button className="btn primary" onClick={confirmPlacement} disabled={queue.length > 0}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
