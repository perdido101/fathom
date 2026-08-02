import type { MatchState } from '../types';
import type { ShipAbilityAction } from '../actions';
import { cellRC, rcCell, inBounds } from '../types';
import { SHIPS } from '../../content/ships';
import { TERRAIN } from '../../content/terrain';
import { isStraightLine } from './placement';
import { applyShot, cellName, modIs } from '../resolve/shot';

/**
 * Active ship abilities usable on your own turn:
 * - Carrier "Launch": once per match, fire a free 3-cell line.
 * - Cutter "Swift": once per match, relocate one cell in any of the eight
 *   directions (two cells across open water under Strong Current; ships
 *   sitting in a trench cannot relocate under Silted Up).
 * Passive abilities live in shot/energy resolution.
 */
export function handleShipAbility(ms: MatchState, action: ShipAbilityAction): void {
  const ps = ms.players[action.player];
  const ship = ps.ships.find((s) => s.uid === action.shipUid);
  if (!ship) throw new Error('No such ship');
  if (ship.sunk) throw new Error('That ship is sunk');
  const def = SHIPS[ship.typeId];
  const w = ms.gridW;
  const h = ms.gridH;

  if (def.ability === 'launch') {
    if (ship.launchUsed) throw new Error('Launch already used');
    const cells = action.target.cells;
    if (!cells || cells.length !== 3) throw new Error('Launch fires a 3-cell line');
    if (!isStraightLine(cells, w)) throw new Error('Launch line must be straight');
    for (const c of cells) {
      const [r, col] = cellRC(c, w);
      if (!inBounds(r, col, w, h)) throw new Error('Launch line leaves the grid');
    }
    ship.launchUsed = true;
    ms.log.push({
      turn: ms.turn,
      player: action.player,
      text: `A strike wing lifts off.`,
      kind: 'card',
    });
    for (const c of cells) applyShot(ms, action.player, c, { source: 'The strike wing' });
    return;
  }

  if (def.ability === 'swift') {
    if (ship.swiftUsed) throw new Error('Swift already used');
    // Silted Up: ships in a trench cannot be relocated.
    if (modIs(ms, 'trench_single_hit') && ship.cells.some((c) => ms.terrain[c] === 'TRENCH')) {
      throw new Error('The silt holds the ship fast');
    }
    const shift = action.target.shift;
    if (!shift) throw new Error('Swift needs a direction');
    const [dr, dc] = shift;
    const stepR = Math.sign(dr);
    const stepC = Math.sign(dc);
    const dist = Math.max(Math.abs(dr), Math.abs(dc));
    if (dist === 0 || (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc))) {
      throw new Error('Swift moves along one of eight directions');
    }
    const maxDist = modIs(ms, 'open_swift_two') ? 2 : 1;
    if (dist > maxDist) throw new Error('Swift cannot move that far');
    // Each step of the move must land on legal cells for the whole hull.
    let cells = ship.cells;
    for (let step = 1; step <= dist; step++) {
      const next = cells.map((c) => {
        const [r, col] = cellRC(c, w);
        return [r + stepR, col + stepC] as [number, number];
      });
      for (const [r, c] of next) {
        if (!inBounds(r, c, w, h)) throw new Error('Swift would leave the grid');
        const cell = rcCell(r, c, w);
        if (!TERRAIN[ms.terrain[cell]].placeable) throw new Error('Swift cannot enter reef');
        if (dist === 2 && ms.terrain[cell] !== 'OPEN') {
          throw new Error('Only open water allows a two-cell dash');
        }
        const blocked = ps.ships.some((s2) => s2.uid !== ship.uid && s2.cells.includes(cell));
        if (blocked) throw new Error('Swift is blocked by a friendly ship');
      }
      cells = next.map(([r, c]) => rcCell(r, c, w));
    }
    ship.cells = cells;
    ship.swiftUsed = true;
    ms.log.push({
      turn: ms.turn,
      player: action.player,
      text: `A ship slips to a new position near ${cellName(ship.cells[0], w)}.`,
      kind: 'card',
    });
    return;
  }

  throw new Error(`${def.name} has no activated ability`);
}
