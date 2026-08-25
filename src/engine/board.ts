import type { CellIndex, PlacedShip } from './types';
import { BOARD, CELLS, ORTH, cellAt, onBoard, xy } from './types';
import { SHIPS } from './ships';
import { shuffle, type RngState } from './rng';

/** The three lengths every fleet fields, largest first. */
export const FLEET_LENGTHS = [4, 3, 2] as const;
export const FLEET_CELLS = 9;

export interface Placement {
  defId: string;
  cells: CellIndex[];
}

/** All cells a ship of this length would occupy from `origin` heading `dir`. */
export function run(origin: CellIndex, length: number, dir: readonly [number, number]): CellIndex[] | null {
  const [x0, y0] = xy(origin);
  const cells: CellIndex[] = [];
  for (let i = 0; i < length; i++) {
    const x = x0 + dir[0] * i;
    const y = y0 + dir[1] * i;
    if (!onBoard(x, y)) return null;
    cells.push(cellAt(x, y));
  }
  return cells;
}

/**
 * Every distinct placement of a length on an empty board. A run and its
 * reverse are the same ship, so only one of the two is kept.
 */
export function allRuns(length: number): CellIndex[][] {
  const out: CellIndex[][] = [];
  const seen = new Set<string>();
  for (let origin = 0; origin < CELLS; origin++) {
    for (const dir of ORTH) {
      const cells = run(origin, length, dir);
      if (!cells) continue;
      const key = [...cells].sort((a, b) => a - b).join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(cells);
    }
  }
  return out;
}

const RUN_CACHE = new Map<number, CellIndex[][]>();
export function runsOfLength(length: number): CellIndex[][] {
  let cached = RUN_CACHE.get(length);
  if (!cached) {
    cached = allRuns(length);
    RUN_CACHE.set(length, cached);
  }
  return cached;
}

/** Ships may touch, but may not overlap or leave the board. */
export function placementLegal(cells: CellIndex[], length: number, occupied: Set<CellIndex>): boolean {
  if (cells.length !== length) return false;
  if (new Set(cells).size !== cells.length) return false;
  for (const c of cells) {
    if (c < 0 || c >= CELLS) return false;
    if (occupied.has(c)) return false;
  }
  if (length === 1) return true;
  const [x0, y0] = xy(cells[0]);
  const [x1, y1] = xy(cells[1]);
  const dir: readonly [number, number] = [x1 - x0, y1 - y0];
  if (Math.abs(dir[0]) + Math.abs(dir[1]) !== 1) return false;
  const expected = run(cells[0], length, dir);
  return expected !== null && expected.every((c, i) => c === cells[i]);
}

/** Is this a legal, complete deployment of exactly these three ships? */
export function deploymentLegal(placements: Placement[], expectedShipIds: string[]): boolean {
  if (placements.length !== expectedShipIds.length) return false;
  const wanted = [...expectedShipIds].sort();
  const got = placements.map((p) => p.defId).sort();
  if (wanted.some((id, i) => id !== got[i])) return false;
  const occupied = new Set<CellIndex>();
  for (const p of placements) {
    const def = SHIPS[p.defId];
    if (!def) return false;
    if (!placementLegal(p.cells, def.length, occupied)) return false;
    for (const c of p.cells) occupied.add(c);
  }
  return occupied.size === FLEET_CELLS;
}

/** A seeded legal deployment, largest ship first. Never fails on a 6x6. */
export function autoDeploy(shipIds: string[], rng: RngState): [Placement[], RngState] {
  const ordered = shipIds
    .map((id, i) => ({ id, i, length: SHIPS[id].length }))
    .sort((a, b) => b.length - a.length);
  let st = rng;
  for (let attempt = 0; attempt < 200; attempt++) {
    const occupied = new Set<CellIndex>();
    const out: (Placement | null)[] = shipIds.map(() => null);
    let ok = true;
    for (const s of ordered) {
      const options = runsOfLength(s.length).filter((cells) =>
        cells.every((c) => !occupied.has(c)),
      );
      if (options.length === 0) {
        ok = false;
        break;
      }
      let picked: CellIndex[][];
      [picked, st] = shuffle(st, options);
      for (const c of picked[0]) occupied.add(c);
      out[s.i] = { defId: s.id, cells: picked[0] };
    }
    if (ok) return [out as Placement[], st];
  }
  throw new Error('auto-deploy failed on an empty 6x6, which should be impossible');
}

export function toShips(placements: Placement[]): PlacedShip[] {
  return placements.map((p) => ({
    defId: p.defId,
    length: SHIPS[p.defId].length,
    cells: p.cells.slice(),
    hits: p.cells.map(() => false),
    sunk: false,
    abilityUsed: false,
    revealed: false,
  }));
}

/** The ship occupying a cell, or null. */
export function shipAt(ships: PlacedShip[], cell: CellIndex): PlacedShip | null {
  for (const s of ships) if (s.cells.includes(cell)) return s;
  return null;
}

export function occupied(ships: PlacedShip[], cell: CellIndex): boolean {
  return shipAt(ships, cell) !== null;
}

export function hullCellsRemaining(ships: PlacedShip[]): number {
  let n = 0;
  for (const s of ships) for (const h of s.hits) if (!h) n++;
  return n;
}

export function fleetDestroyed(ships: PlacedShip[]): boolean {
  return ships.every((s) => s.sunk);
}

/** Ship cells in a column / row — what Sounding and Beacon report. */
export function columnCount(ships: PlacedShip[], col: number): number {
  let n = 0;
  for (let y = 0; y < BOARD; y++) if (occupied(ships, cellAt(col, y))) n++;
  return n;
}

export function rowCount(ships: PlacedShip[], row: number): number {
  let n = 0;
  for (let x = 0; x < BOARD; x++) if (occupied(ships, cellAt(x, row))) n++;
  return n;
}

/** Cells of a 2x2 or 3x3 block anchored at its top-left corner, clipped. */
export function block(anchor: CellIndex, size: number): CellIndex[] {
  const [x0, y0] = xy(anchor);
  const out: CellIndex[] = [];
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      if (onBoard(x0 + dx, y0 + dy)) out.push(cellAt(x0 + dx, y0 + dy));
    }
  }
  return out;
}

/** A horizontal run inside one row, clipped at the board edge. */
export function rowRun(origin: CellIndex, length: number): CellIndex[] {
  const [x0, y] = xy(origin);
  const out: CellIndex[] = [];
  for (let i = 0; i < length; i++) if (onBoard(x0 + i, y)) out.push(cellAt(x0 + i, y));
  return out;
}

export function wholeRow(rowIndex: number): CellIndex[] {
  const out: CellIndex[] = [];
  for (let x = 0; x < BOARD; x++) out.push(cellAt(x, rowIndex));
  return out;
}

export function orthLine(origin: CellIndex, dir: readonly [number, number], length: number): CellIndex[] {
  const [x0, y0] = xy(origin);
  const out: CellIndex[] = [];
  for (let i = 0; i < length; i++) {
    const x = x0 + dir[0] * i;
    const y = y0 + dir[1] * i;
    if (onBoard(x, y)) out.push(cellAt(x, y));
  }
  return out;
}

export function adjacentOccupied(ships: PlacedShip[], cell: CellIndex): boolean {
  const [x, y] = xy(cell);
  for (const [dx, dy] of ORTH) {
    if (!onBoard(x + dx, y + dy)) continue;
    if (occupied(ships, cellAt(x + dx, y + dy))) return true;
  }
  return false;
}
