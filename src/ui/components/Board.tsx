import type { ReactElement } from 'react';
import type { CellIndex } from '../../engine/types';
import { BOARD, CELLS, label } from '../../engine/types';
import { Icon } from '../art/Icon';

/**
 * Both boards are the same component.
 *
 * The enemy board shows what you have learned — hits, misses, and the cells
 * Echo exposed. Your own board shows your hulls and where they have been
 * struck. Neither ever renders anything the client view did not hand over, so
 * a leak would have to happen upstream in the engine, not here.
 */

export interface BoardProps {
  marks: Record<CellIndex, 'hit' | 'miss'>;
  /** Your own hulls, when this is your water. */
  hulls?: { cells: CellIndex[]; hits: boolean[]; sunk: boolean }[];
  /** Cells revealed as occupied without being hit. */
  known?: CellIndex[];
  /** Cells the current declaration would fire at. */
  aim?: CellIndex[];
  /** A single highlighted cell, for the basic attack. */
  pick?: CellIndex | null;
  onCell?: (cell: CellIndex) => void;
  /** Desktop hover: previews land through this before anything locks in. */
  onHoverCell?: (cell: CellIndex | null) => void;
  /** Cells that flashed this round, for the resolve replay. */
  flash?: { cell: CellIndex; hit: boolean }[];
  /** Cells of a ship that went down this round, pulsed bow to stern. */
  sinking?: CellIndex[];
  compact?: boolean;
}

export function Board({
  marks,
  hulls = [],
  known = [],
  aim = [],
  pick = null,
  onCell,
  onHoverCell,
  flash = [],
  sinking = [],
  compact = false,
}: BoardProps): ReactElement {
  const aimSet = new Set(aim);
  const knownSet = new Set(known);
  const hullCell = new Map<CellIndex, { struck: boolean; sunk: boolean }>();
  for (const h of hulls) {
    h.cells.forEach((c, i) => hullCell.set(c, { struck: h.hits[i], sunk: h.sunk }));
  }
  const flashMap = new Map(flash.map((f) => [f.cell, f.hit]));
  // Bow to stern, so a four-length hull reads as one ship going down rather
  // than four cells changing colour at once.
  const sinkOrder = new Map(sinking.map((c, i) => [c, i]));

  const cells: ReactElement[] = [];
  for (let c = 0; c < CELLS; c++) {
    const mark = marks[c];
    const hull = hullCell.get(c);
    const classes = ['cell'];
    if (hull) classes.push('mine');
    if (hull?.struck) classes.push('struck');
    if (mark === 'hit') classes.push('hit');
    else if (mark === 'miss') classes.push('miss');
    if (knownSet.has(c) && mark === undefined) classes.push('known');
    if (aimSet.has(c)) classes.push('aim');
    if (pick === c) classes.push('pick');
    const flashed = flashMap.get(c);
    const sinkIndex = sinkOrder.get(c);
    if (sinkIndex !== undefined) classes.push('sinking');
    cells.push(
      <button
        key={c}
        className={classes.join(' ')}
        onClick={onCell ? () => onCell(c) : undefined}
        onMouseEnter={onHoverCell ? () => onHoverCell(c) : undefined}
        aria-label={`${label(c)}${mark ? ` ${mark}` : ''}`}
        style={{
          fontSize: compact ? 9 : 11,
          color: 'var(--ink-faint)',
          animationDelay: sinkIndex !== undefined ? `${sinkIndex * 90}ms` : undefined,
        }}
      >
        {mark === undefined && !hull && <span className="cell-label">{label(c)}</span>}
        {/* Hit and miss are distinguished by shape as well as colour, so the
            board still reads for a player who cannot tell the two apart. */}
        {mark === 'hit' && <Icon name="ui.hit" size={compact ? 12 : 20} title="hit" />}
        {mark === 'miss' && (
          <Icon name="ui.miss" size={compact ? 10 : 16} style={{ opacity: 0.55 }} title="miss" />
        )}
        {mark === undefined && knownSet.has(c) && (
          <Icon name="ui.contact" size={compact ? 10 : 16} title="contact" />
        )}
        {hull?.sunk && <Icon name="ui.sunk" size={compact ? 11 : 18} title="sunk" />}
        {flashed !== undefined && <i className={`flare ${flashed ? 'hitfx' : 'missfx'}`} />}
        {flashed === true && <i className="shockwave" />}
      </button>,
    );
  }

  return (
    <div
      className={`board ${compact ? 'compact' : ''}`}
      onMouseLeave={onHoverCell ? () => onHoverCell(null) : undefined}
      style={{ gap: compact ? 3 : 5, padding: compact ? 6 : 10 }}
    >
      {cells}
    </div>
  );
}

export const COLUMNS = Array.from({ length: BOARD }, (_, i) => String.fromCharCode(65 + i));
export const ROWS = Array.from({ length: BOARD }, (_, i) => i + 1);
