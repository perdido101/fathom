import type { CellIndex, TerrainId } from '../types';
import { cellRC, rcCell, inBounds } from '../types';
import { TERRAIN } from '../../content/terrain';
import { SHIPS } from '../../content/ships';
import type { RngState } from '../rng';
import { nextInt } from '../rng';

export interface Placement {
  typeId: string;
  cells: CellIndex[];
}

/** The four placement axes: horizontal, vertical, and both diagonals. */
export const PLACEMENT_DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

/** Is `cells` a straight contiguous line along one of the legal axes? */
export function isStraightLine(cells: CellIndex[], w: number): boolean {
  if (cells.length === 1) return true;
  const rcs = cells.map((c) => cellRC(c, w));
  for (const [dr, dc] of PLACEMENT_DIRS) {
    for (const flip of [1, -1]) {
      const ok = rcs.every(
        ([r, c], i) => r === rcs[0][0] + dr * i * flip && c === rcs[0][1] + dc * i * flip,
      );
      if (ok) return true;
    }
  }
  return false;
}

/**
 * Is this placement legal? Straight line (orthogonal or diagonal), in bounds,
 * on placeable terrain, no overlap.
 */
export function isLegalPlacement(
  cells: CellIndex[],
  size: number,
  w: number,
  h: number,
  terrain: TerrainId[],
  occupied: Set<CellIndex>,
): boolean {
  if (cells.length !== size) return false;
  for (const cell of cells) {
    const [r, c] = cellRC(cell, w);
    if (!inBounds(r, c, w, h)) return false;
    if (!TERRAIN[terrain[cell]].placeable) return false;
    if (occupied.has(cell)) return false;
  }
  return isStraightLine(cells, w);
}

/** All legal placements for a ship size (all four axes). */
export function legalPlacementsFor(
  size: number,
  w: number,
  h: number,
  terrain: TerrainId[],
  occupied: Set<CellIndex>,
): CellIndex[][] {
  const out: CellIndex[][] = [];
  const dirs = size === 1 ? [PLACEMENT_DIRS[0]] : PLACEMENT_DIRS;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      for (const [dr, dc] of dirs) {
        const endR = r + dr * (size - 1);
        const endC = c + dc * (size - 1);
        if (!inBounds(endR, endC, w, h)) continue;
        const cells: CellIndex[] = [];
        let ok = true;
        for (let i = 0; i < size; i++) {
          const cell = rcCell(r + dr * i, c + dc * i, w);
          if (!TERRAIN[terrain[cell]].placeable || occupied.has(cell)) {
            ok = false;
            break;
          }
          cells.push(cell);
        }
        if (ok) out.push(cells);
      }
    }
  }
  return out;
}

/**
 * Seeded random auto-placement of a whole fleet. Returns null if the fleet
 * cannot be placed (used to validate assembled maps). Places big ships first.
 */
export function autoPlaceFleet(
  fleet: string[],
  w: number,
  h: number,
  terrain: TerrainId[],
  rng: RngState,
): [Placement[] | null, RngState] {
  const ordered = fleet
    .map((typeId, i) => ({ typeId, i, size: SHIPS[typeId].size }))
    .sort((a, b) => b.size - a.size || a.i - b.i);
  const occupied = new Set<CellIndex>();
  const placed: (Placement | null)[] = fleet.map(() => null);
  let st = rng;
  for (const { typeId, i, size } of ordered) {
    const options = legalPlacementsFor(size, w, h, terrain, occupied);
    if (options.length === 0) return [null, st];
    let idx: number;
    [idx, st] = nextInt(st, options.length);
    const cells = options[idx];
    for (const c of cells) occupied.add(c);
    placed[i] = { typeId, cells };
  }
  return [placed as Placement[], st];
}
