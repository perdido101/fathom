import { useMemo, useState, type ReactElement } from 'react';
import type { CellIndex } from '../../engine/types';
import { BOARD, cellAt, xy } from '../../engine/types';
import { useStore } from '../../state/store';
import { SHIPS } from '../../engine/ships';
import { placementLegal, type Placement } from '../../engine/board';
import { Board } from '../components/Board';
import { ShipArt } from '../art/registry';
import { Sound } from '../sfx/SoundManager';

/**
 * Deployment.
 *
 * Tap a hull, tap where its bow goes, tap again to rotate. Ships are
 * orthogonal only and may touch, which matters more than it sounds: two hulls
 * side by side read as one long ship for several rounds, and that is a real
 * defensive choice rather than an oversight.
 *
 * The layout is committed as a hash the moment it is confirmed, so it cannot
 * be edited afterwards even by the server holding it.
 */
export function Deployment(): ReactElement | null {
  const view = useStore((s) => s.view());
  const submit = useStore((s) => s.submitDeployment);
  const clock = useStore((s) => s.clock);

  const ids = view?.me.draftedShips ?? [];
  const [placed, setPlaced] = useState<Record<string, CellIndex[]>>({});
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  const [vertical, setVertical] = useState(false);

  const occupied = useMemo(() => {
    const set = new Set<CellIndex>();
    for (const [id, cells] of Object.entries(placed)) {
      if (id === active) continue;
      for (const c of cells) set.add(c);
    }
    return set;
  }, [placed, active]);

  if (!view) return null;

  function tryPlace(cell: CellIndex): void {
    if (!active) return;
    const length = SHIPS[active].length;
    const [x, y] = xy(cell);
    const cells: CellIndex[] = [];
    for (let i = 0; i < length; i++) {
      const nx = vertical ? x : x + i;
      const ny = vertical ? y + i : y;
      if (nx >= BOARD || ny >= BOARD) return;
      cells.push(cellAt(nx, ny));
    }
    if (!placementLegal(cells, length, occupied)) return;
    setPlaced({ ...placed, [active]: cells });
    Sound.play('charge-placed');
    const next = ids.find((id) => id !== active && !placed[id]);
    if (next) setActive(next);
  }

  const hulls = Object.entries(placed).map(([id, cells]) => ({
    cells,
    hits: cells.map(() => false),
    sunk: false,
    id,
  }));
  const complete = ids.every((id) => placed[id]?.length === SHIPS[id].length);

  function confirm(): void {
    const placements: Placement[] = ids.map((defId) => ({ defId, cells: placed[defId] }));
    submit(placements);
  }

  function auto(): void {
    // A legal layout in one tap, for anyone about to run out of clock.
    const next: Record<string, CellIndex[]> = {};
    const used = new Set<CellIndex>();
    for (const id of ids) {
      const length = SHIPS[id].length;
      outer: for (let y = 0; y < BOARD; y++) {
        for (let x = 0; x + length <= BOARD; x++) {
          const cells = Array.from({ length }, (_, i) => cellAt(x + i, y));
          if (cells.some((c) => used.has(c))) continue;
          for (const c of cells) used.add(c);
          next[id] = cells;
          break outer;
        }
      }
    }
    setPlaced(next);
  }

  return (
    <div className="screen">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>Deploy</h2>
        <span className="pill mono">{clock}s</span>
      </div>
      <p>Orthogonal only. Hulls may touch — two side by side read as one long ship.</p>

      <Board
        marks={{}}
        hulls={hulls}
        aim={active && placed[active] ? placed[active] : []}
        onCell={tryPlace}
      />

      <div className="row" style={{ gap: 6 }}>
        {ids.map((id) => (
          <button
            key={id}
            className="card-surface col"
            onClick={() => setActive(id)}
            style={{
              flex: 1,
              gap: 4,
              padding: 8,
              borderColor: active === id ? 'var(--charge)' : 'var(--panel-edge)',
              opacity: placed[id] ? 0.6 : 1,
            }}
          >
            <ShipArt defId={id} length={SHIPS[id].length} size={13} />
            <span style={{ fontSize: 11 }}>{SHIPS[id].name}</span>
            <span style={{ fontSize: 9, color: 'var(--ink-faint)' }}>
              {placed[id] ? 'placed' : `length ${SHIPS[id].length}`}
            </span>
          </button>
        ))}
      </div>

      <div className="row">
        <button className="btn" style={{ flex: 1 }} onClick={() => setVertical(!vertical)}>
          {vertical ? 'vertical' : 'horizontal'}
        </button>
        <button className="btn" style={{ flex: 1 }} onClick={auto}>
          auto
        </button>
        <button className="btn ghost" style={{ flex: 1 }} onClick={() => setPlaced({})}>
          clear
        </button>
      </div>

      <div className="spacer" />
      <button className="btn go" disabled={!complete} onClick={confirm}>
        commit fleet
      </button>
      <p style={{ fontSize: 11, textAlign: 'center' }}>
        Your layout is hashed and written before the first shot. It cannot change after this.
      </p>
    </div>
  );
}
