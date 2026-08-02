import type { Board, CellIndex } from './types';
import { rcCell, cellRC, inBounds, DIRECTIONS } from './types';
import { GRID_CARDS, GRID_CARD_SIZE, localCoord, symbolAt, type MatchSize } from '../content/grids';
import { canDeployOn, type SymbolId } from '../content/symbols';
import { shuffle, type RngState } from '../engine/rng';

/**
 * Deal the sea. Grid cards are shuffled, the match size is dealt, and the
 * same layout is built for both players — identical cards, same orientation,
 * so the printed coordinates read the same way on both boards. Cards are
 * never rotated.
 */
export function dealBoard(rng: RngState, size: MatchSize): [Board, RngState] {
  const [deck, st] = shuffle(rng, GRID_CARDS);
  const dealt = deck.slice(0, size.gridCards);
  const gridW = size.gridW;
  const gridH = size.gridH;
  const symbols = new Array<SymbolId>(gridW * gridH).fill('OPEN');
  const cardIds = new Array<number>(gridW * gridH).fill(0);
  const locals = new Array<string>(gridW * gridH).fill('');

  for (let cardRow = 0; cardRow < size.cardsDown; cardRow++) {
    for (let cardCol = 0; cardCol < size.cardsAcross; cardCol++) {
      const card = dealt[cardRow * size.cardsAcross + cardCol];
      for (let r = 0; r < GRID_CARD_SIZE; r++) {
        for (let c = 0; c < GRID_CARD_SIZE; c++) {
          const local = localCoord(c, r);
          const cell = rcCell(cardRow * GRID_CARD_SIZE + r, cardCol * GRID_CARD_SIZE + c, gridW);
          symbols[cell] = symbolAt(card, local);
          cardIds[cell] = card.id;
          locals[cell] = local;
        }
      }
    }
  }
  return [{ gridW, gridH, symbols, cardIds, locals }, st];
}

// ---------------------------------------------------------------------------
// Deployment legality
// ---------------------------------------------------------------------------

/**
 * A hull occupies a straight run of cells in any of the eight orientations.
 * Hulls may not overlap and may not run off the board. No cell may sit on
 * reef; every other symbol is legal, wreckage included — which is exactly
 * what makes a hit on wreckage ambiguous.
 *
 * Hulls may touch: adjacent hulls read as one long ship until they don't.
 */
export function runFrom(
  start: CellIndex,
  length: number,
  dir: readonly [number, number],
  board: Board,
): CellIndex[] | null {
  const [dr, dc] = dir;
  const [r0, c0] = cellRC(start, board.gridW);
  const cells: CellIndex[] = [];
  for (let i = 0; i < length; i++) {
    const r = r0 + dr * i;
    const c = c0 + dc * i;
    if (!inBounds(r, c, board.gridW, board.gridH)) return null;
    cells.push(rcCell(r, c, board.gridW));
  }
  return cells;
}

export function isLegalPlacement(
  cells: CellIndex[],
  length: number,
  board: Board,
  occupied: Set<CellIndex>,
): boolean {
  if (cells.length !== length) return false;
  if (new Set(cells).size !== cells.length) return false;
  for (const cell of cells) {
    if (cell < 0 || cell >= board.gridW * board.gridH) return false;
    if (!canDeployOn(board.symbols[cell])) return false;
    if (occupied.has(cell)) return false;
  }
  if (length === 1) return true;
  // Must be a straight run in one of the eight directions.
  const [r0, c0] = cellRC(cells[0], board.gridW);
  const [r1, c1] = cellRC(cells[1], board.gridW);
  const dir = [r1 - r0, c1 - c0] as const;
  if (Math.abs(dir[0]) > 1 || Math.abs(dir[1]) > 1) return false;
  const expected = runFrom(cells[0], length, dir, board);
  return expected !== null && expected.every((c, i) => c === cells[i]);
}

/** Every legal run for a hull of this length, given what is already placed. */
export function legalPlacements(
  length: number,
  board: Board,
  occupied: Set<CellIndex>,
): CellIndex[][] {
  const out: CellIndex[][] = [];
  const seen = new Set<string>();
  const area = board.gridW * board.gridH;
  for (let start = 0; start < area; start++) {
    if (length === 1) {
      if (isLegalPlacement([start], 1, board, occupied)) out.push([start]);
      continue;
    }
    for (const dir of DIRECTIONS) {
      const cells = runFrom(start, length, dir, board);
      if (!cells) continue;
      if (!isLegalPlacement(cells, length, board, occupied)) continue;
      // A run and its reverse are the same placement.
      const key = [...cells].sort((a, b) => a - b).join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(cells);
    }
  }
  return out;
}

/**
 * Extra demands a terrain card can place on a layout. Convoy requires every
 * hull to touch another; Shoal Water requires every hull to sit on at least
 * one symbol. They are satisfied by construction here rather than checked
 * afterwards, so auto-deploy never proposes a layout the rules reject.
 */
export interface DeployConstraints {
  /** Convoy. */
  mustTouch?: boolean;
  /** Shoal Water. */
  mustSitOnSymbol?: boolean;
}

/** Do these two cells touch, counting diagonals? */
export function touching(a: CellIndex, b: CellIndex, board: Board): boolean {
  if (a === b) return false;
  const [ar, ac] = cellRC(a, board.gridW);
  const [br, bc] = cellRC(b, board.gridW);
  return Math.abs(ar - br) <= 1 && Math.abs(ac - bc) <= 1;
}

/**
 * Seeded auto-deployment, largest hull first. Returns null when the fleet
 * cannot be placed — which is how a terrain pair that makes deployment
 * impossible gets caught.
 *
 * Placing the largest hulls first is not just tidiness: the big runs are the
 * scarce ones, and a greedy small-first pass strands them.
 */
export function autoDeploy(
  fleet: { defId: string; length: number }[],
  board: Board,
  rng: RngState,
  constraints: DeployConstraints = {},
): [{ defId: string; cells: CellIndex[] }[] | null, RngState] {
  const ordered = fleet
    .map((h, i) => ({ ...h, i }))
    .sort((a, b) => b.length - a.length || a.i - b.i);
  let st = rng;

  // Convoy can strand a layout that was legal cell-by-cell, so retry the
  // whole arrangement rather than backtracking one hull at a time.
  const tries = constraints.mustTouch || constraints.mustSitOnSymbol ? 60 : 1;
  for (let attempt = 0; attempt < tries; attempt++) {
    const occupied = new Set<CellIndex>();
    const placedCells: CellIndex[][] = [];
    const placed: ({ defId: string; cells: CellIndex[] } | null)[] = fleet.map(() => null);
    let ok = true;

    for (const h of ordered) {
      let options = legalPlacements(h.length, board, occupied);
      if (constraints.mustSitOnSymbol) {
        options = options.filter((cells) => cells.some((c) => board.symbols[c] !== 'OPEN'));
      }
      // The first hull has nothing to touch yet; every later one must reach
      // something already down.
      if (constraints.mustTouch && placedCells.length > 0) {
        options = options.filter((cells) =>
          cells.some((c) => placedCells.some((prev) => prev.some((pc) => touching(c, pc, board)))),
        );
      }
      if (options.length === 0) {
        ok = false;
        break;
      }
      let picked: CellIndex[][];
      [picked, st] = shuffle(st, options);
      const cells = picked[0];
      for (const c of cells) occupied.add(c);
      placedCells.push(cells);
      placed[h.i] = { defId: h.defId, cells };
    }
    if (ok) return [placed as { defId: string; cells: CellIndex[] }[], st];
  }
  return [null, st];
}

/**
 * Can a fleet of these lengths be deployed on this board at all? Used to
 * reject a terrain pair that makes deployment impossible, rather than
 * consulting a hardcoded list of bad pairs.
 */
export function deploymentPossible(
  lengths: number[],
  board: Board,
  rng: RngState,
  constraints: DeployConstraints = {},
  attempts = 20,
): boolean {
  let st = rng;
  const fleet = lengths.map((length, i) => ({ defId: `probe${i}`, length }));
  for (let i = 0; i < attempts; i++) {
    let result;
    [result, st] = autoDeploy(fleet, board, st, constraints);
    if (result !== null) return true;
  }
  return false;
}
