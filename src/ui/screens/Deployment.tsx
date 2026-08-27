import { useMemo, useState, type ReactElement } from 'react';
import type { CellIndex } from '../../engine/types';
import { BOARD, cellAt, xy } from '../../engine/types';
import { useStore } from '../../state/store';
import { SHIPS } from '../../engine/ships';
import { placementLegal, type Placement } from '../../engine/board';
import { Board } from '../components/Board';
import { ShipCard } from '../components/GameCard';
import { Sound } from '../sfx/SoundManager';
import { WhyNot } from '../feedback/Feedback';
import { whyCannotDeploy } from '../feedback/reasons';

/**
 * Deployment at 16:9: the board centred and large, the fleet in a side tray.
 *
 * Pick a ship from the tray, hover the board to preview exactly where it
 * would sit, click to place. Orthogonal only, and hulls may touch — two side
 * by side read as one long ship for several rounds, which is a real choice.
 */
export function Deployment(): ReactElement | null {
  const view = useStore((s) => s.view());
  const submit = useStore((s) => s.submitDeployment);
  const clock = useStore((s) => s.clock);

  const ids = view?.me.draftedShips ?? [];
  const [placed, setPlaced] = useState<Record<string, CellIndex[]>>({});
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  const [vertical, setVertical] = useState(false);
  const [hover, setHover] = useState<CellIndex | null>(null);

  const occupied = useMemo(() => {
    const set = new Set<CellIndex>();
    for (const [id, cells] of Object.entries(placed)) {
      if (id === active) continue;
      for (const c of cells) set.add(c);
    }
    return set;
  }, [placed, active]);

  if (!view) return null;

  function cellsFor(cell: CellIndex): CellIndex[] | null {
    if (!active) return null;
    const length = SHIPS[active].length;
    const [x, y] = xy(cell);
    const cells: CellIndex[] = [];
    for (let i = 0; i < length; i++) {
      const nx = vertical ? x : x + i;
      const ny = vertical ? y + i : y;
      if (nx >= BOARD || ny >= BOARD) return null;
      cells.push(cellAt(nx, ny));
    }
    return placementLegal(cells, length, occupied) ? cells : null;
  }

  function tryPlace(cell: CellIndex): void {
    const cells = cellsFor(cell);
    if (!cells || !active) return;
    setPlaced({ ...placed, [active]: cells });
    Sound.play('charge-placed');
    const next = ids.find((id) => id !== active && !placed[id]);
    if (next) setActive(next);
  }

  const preview = hover !== null ? (cellsFor(hover) ?? []) : [];
  const hulls = Object.entries(placed).map(([, cells]) => ({
    cells,
    hits: cells.map(() => false),
    sunk: false,
  }));
  const placedCount = ids.filter((id) => placed[id]?.length === SHIPS[id].length).length;
  const complete = placedCount === ids.length;

  function confirm(): void {
    submit(ids.map((defId) => ({ defId, cells: placed[defId] }) as Placement));
  }

  function auto(): void {
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
    <div className="screen" style={{ flexDirection: 'row', gap: 30, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 'min(62vh, 640px)' }}>
        {/* Your water, in your water's colour. This is where the game first
            teaches the tint: the board you place on here is the same green
            that sits under the division for the rest of the match. */}
        <Board
          side="mine"
          marks={{}}
          hulls={hulls}
          aim={preview}
          onCell={tryPlace}
          onHoverCell={setHover}
        />
      </div>

      <div className="col" style={{ width: 380, gap: 14 }}>
        {/* A permanent "Deploy" header stood here. The phase card says it once
            on the way in, which is where a player actually needs telling. */}
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <p className="full" style={{ color: 'rgba(255,255,255,0.92)', fontWeight: 700 }}>
            Orthogonal only. Hulls may touch — two side by side read as one long ship.
          </p>
          <span className="pill num">{clock}s</span>
        </div>

        <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* "Your fleet" labelled three of your own ship cards. */}
          {ids.map((id) => (
            <ShipCard
              key={id}
              defId={id}
              length={SHIPS[id].length}
              selected={active === id}
              used={false}
              onClick={() => setActive(id)}
              className={placed[id] ? '' : ''}
            />
          ))}
          <div className="row" style={{ marginTop: 4 }}>
            <button className="btn small" style={{ flex: 1 }} onClick={() => setVertical(!vertical)}>
              {vertical ? 'Vertical ↓' : 'Horizontal →'}
            </button>
            <button className="btn small" style={{ flex: 1 }} onClick={auto}>
              Auto
            </button>
            <button className="btn small ghost" style={{ flex: 1 }} onClick={() => setPlaced({})}>
              Clear
            </button>
          </div>
        </div>

        {/* The paragraph explaining the commitment hash used to sit under
            this button. It now has its own beat, on the way out of this
            screen, where the two hashes are actually shown sealing. */}
        <WhyNot reason={whyCannotDeploy(placedCount, ids.length)}>
          <button
            className="btn go huge"
            style={{ width: '100%' }}
            disabled={!complete}
            onClick={confirm}
          >
            Commit fleet
          </button>
        </WhyNot>
      </div>
    </div>
  );
}
