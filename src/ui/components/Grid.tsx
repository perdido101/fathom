import type { CellIndex, MatchState, PlayerId, TerrainId } from '../../engine/types';
import { cellRC } from '../../engine/types';
import { Art } from '../../art/Art';

export type CellDecoration = {
  marker?: 'hit' | 'miss' | 'sunk' | 'probe' | 'mine' | 'decoy' | null;
  known?: 'occupied' | 'empty' | null;
  ship?: boolean;
  aim?: boolean;
  preview?: 'ok' | 'bad' | null;
};

interface GridProps {
  w: number;
  h: number;
  terrain: TerrainId[];
  decorate: (cell: CellIndex) => CellDecoration;
  onCell?: (cell: CellIndex) => void;
  /** Own grid renders terrain more brightly and shows ships. */
  own?: boolean;
  label?: string;
}

/**
 * The board. Cells are square via aspect-ratio on the wrapper, so the grid
 * scales to any width without measuring — important on a phone where the
 * viewport can change under you.
 */
export function Grid({ w, h, terrain, decorate, onCell, own, label }: GridProps) {
  const cells: JSX.Element[] = [];
  for (let i = 0; i < w * h; i++) {
    const d = decorate(i);
    const t = terrain[i];
    const [r, c] = cellRC(i, w);
    const name = `${String.fromCharCode(65 + c)}${r + 1}`;
    cells.push(
      <button
        key={i}
        className="cell"
        data-terrain={t}
        data-own={own ? 'true' : undefined}
        data-ship={d.ship ? 'true' : undefined}
        data-aim={d.aim ? 'true' : undefined}
        data-preview={d.preview ?? undefined}
        data-known={d.known ?? undefined}
        onClick={onCell ? () => onCell(i) : undefined}
        disabled={!onCell}
        aria-label={`${name}${d.marker ? `, ${d.marker}` : ''}`}
        type="button"
      >
        {t !== 'OPEN' && (
          <span className="cellTerrain" aria-hidden>
            <Art id={`tile.${t.toLowerCase()}`} size={32} />
          </span>
        )}
        {d.marker && (
          <span className="cellMark" aria-hidden>
            <Art id={`marker.${d.marker}`} size={22} />
          </span>
        )}
      </button>,
    );
  }
  return (
    <div className="gridWrap" role="group" aria-label={label ?? 'Grid'}>
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${w}, 1fr)`,
          ['--grid-aspect' as string]: `${w} / ${h}`,
        }}
      >
        {cells}
      </div>
    </div>
  );
}

/** Decoration for the enemy grid, drawn purely from the viewer's own intel. */
export function enemyDecorator(ms: MatchState, viewer: PlayerId, aim: CellIndex[]) {
  const intel = ms.players[viewer].intel;
  return (cell: CellIndex): CellDecoration => ({
    marker: intel[cell].mark,
    known: intel[cell].known,
    aim: aim.includes(cell),
  });
}

/** Decoration for your own grid: your hulls, damage, mines and decoys. */
export function ownDecorator(ms: MatchState, viewer: PlayerId) {
  const me = ms.players[viewer];
  const shipCell = new Map<CellIndex, { destroyed: boolean; sunk: boolean; damaged: boolean }>();
  for (const s of me.ships) {
    s.cells.forEach((c, i) => {
      shipCell.set(c, { destroyed: s.destroyed[i], sunk: s.sunk, damaged: s.damage[i] > 0 });
    });
  }
  const mines = new Set(me.mines.filter((m) => !m.spent).map((m) => m.cell));
  const decoys = new Set(
    me.decoys.filter((d) => me.turnCount < d.expiresAt).map((d) => d.cell),
  );
  return (cell: CellIndex): CellDecoration => {
    const s = shipCell.get(cell);
    let marker: CellDecoration['marker'] = null;
    if (s?.sunk) marker = 'sunk';
    else if (s?.destroyed) marker = 'sunk';
    else if (s?.damaged) marker = 'hit';
    else if (mines.has(cell)) marker = 'mine';
    else if (decoys.has(cell)) marker = 'decoy';
    return { marker, ship: !!s };
  };
}
