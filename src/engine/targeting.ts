import type { CellIndex, FireSpec, PlacedShip } from './types';
import { BOARD, cellAt, xy } from './types';
import { CARDS } from './cards';
import { SHIPS } from './ships';
import { block, orthLine, rowRun, wholeRow } from './board';

/**
 * Turning a declaration into cells.
 *
 * Every attack in the game — card, ship ability or the free basic shot — ends
 * up as a list of board cells plus a flag saying whether it executes damaged
 * ships outright. Keeping that translation in one place means the resolver,
 * the bots and the verifier can never disagree about what a plan meant.
 */
export interface Shot {
  cells: CellIndex[];
  /** Breaker and Warhead: a hit on an already-damaged ship sinks it. */
  execute: boolean;
}

const NOTHING: Shot = { cells: [], execute: false };

function unique(cells: CellIndex[]): CellIndex[] {
  const seen = new Set<CellIndex>();
  const out: CellIndex[] = [];
  for (const c of cells) {
    if (c < 0 || c >= BOARD * BOARD) continue;
    if (seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

/** Cells a card would fire at, given the charges it holds. */
export function cardShot(defId: string, charges: number, spec: FireSpec): Shot {
  const c = charges;
  switch (defId) {
    case 'salvo':
      return spec.shape === 'cells' ? { cells: unique(spec.cells).slice(0, c), execute: false } : NOTHING;
    case 'ping':
    case 'echo':
      return spec.shape === 'cells' ? { cells: unique(spec.cells).slice(0, c), execute: false } : NOTHING;
    case 'lance':
      return spec.shape === 'line'
        ? { cells: orthLine(spec.origin, spec.dir, c), execute: false }
        : NOTHING;
    case 'burst':
      if (spec.shape !== 'block' || c < 2) return NOTHING;
      return { cells: block(spec.anchor, c >= 4 ? 3 : 2), execute: false };
    case 'breaker':
      if (spec.shape !== 'block' || c < 3) return NOTHING;
      return { cells: block(spec.anchor, 2), execute: true };
    case 'rake':
      return spec.shape === 'row'
        ? { cells: rowRun(spec.origin, 3 + Math.max(0, c - 1)), execute: false }
        : NOTHING;
    case 'sounding':
      return spec.shape === 'cell' ? { cells: [spec.cell], execute: false } : NOTHING;
    default:
      // Jam, Siphon, Mirror and Ambush do not fire in the attack step.
      return NOTHING;
  }
}

/** Ambush's retaliation, once its named cell has been confirmed. */
export function ambushShot(charges: number, cell: CellIndex): Shot {
  const [x, y] = xy(cell);
  if (charges >= 3) return { cells: wholeRow(y), execute: false };
  if (charges >= 2) {
    const cells = [cell];
    if (x - 1 >= 0) cells.push(cellAt(x - 1, y));
    if (x + 1 < BOARD) cells.push(cellAt(x + 1, y));
    return { cells: unique(cells), execute: false };
  }
  return { cells: [cell], execute: false };
}

/** Cells a ship ability would fire at. */
export function abilityShot(defId: string, spec: FireSpec): Shot {
  switch (defId) {
    case 'forge':
      return spec.shape === 'line'
        ? { cells: orthLine(spec.origin, spec.dir, 3), execute: false }
        : NOTHING;
    case 'warhead':
      return spec.shape === 'block' ? { cells: block(spec.anchor, 2), execute: true } : NOTHING;
    case 'ember':
      return spec.shape === 'cells' ? { cells: unique(spec.cells).slice(0, 4), execute: false } : NOTHING;
    case 'pin':
      return spec.shape === 'cell' ? { cells: [spec.cell], execute: false } : NOTHING;
    case 'beacon':
      return spec.shape === 'beacon' ? { cells: unique(spec.cells).slice(0, 4), execute: false } : NOTHING;
    default:
      return NOTHING;
  }
}

/** Does the declaration match the shape the card or ship expects? */
export function specMatchesCard(defId: string, spec: FireSpec): boolean {
  const def = CARDS[defId];
  if (!def) return false;
  return spec.shape === def.shape;
}

export function specMatchesShip(defId: string, spec: FireSpec): boolean {
  const def = SHIPS[defId];
  if (!def) return false;
  return spec.shape === def.shape;
}

/** Which of a ship's cells to surrender to Echo: the lowest not already known. */
export function echoReveal(ship: PlacedShip, alreadyKnown: Set<CellIndex>): CellIndex | null {
  const options = ship.cells
    .filter((c, i) => !ship.hits[i] && !alreadyKnown.has(c))
    .sort((a, b) => a - b);
  return options.length ? options[0] : null;
}
