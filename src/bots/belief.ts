import type { ClientView } from '../engine/view';
import type { CellIndex } from '../engine/types';
import { BOARD, CELLS, cellAt, orthNeighbours, xy } from '../engine/types';
import { runsOfLength } from '../engine/board';
import { SHIPS } from '../engine/ships';

/**
 * What a bot is allowed to think with.
 *
 * Everything here is derived from the client view and nothing else, which is
 * the point: if a bot could only play well by reading the match state, the
 * hidden-information model would be a lie. The strongest bot sees exactly what
 * a strong human sees — a board full of misses, a handful of hits, three
 * lengths, and four candidates per draft pack.
 */

export interface Density {
  /** Per-cell probability weight, normalised so the maximum is 1. */
  weight: number[];
  /** Cells worth shooting, best first. */
  ranked: CellIndex[];
  /** Hit clusters that have not been closed off yet. */
  openClusters: CellIndex[][];
}

/**
 * Where the enemy's remaining ships can still be.
 *
 * Every legal run for every surviving length is laid over the board and the
 * ones contradicted by a miss are thrown away. Runs that would explain a hit
 * nobody has accounted for are weighted far higher, which is what turns the
 * map from a search into a chase the moment something connects.
 */
export function density(
  marks: Record<CellIndex, 'hit' | 'miss'>,
  knownShipCells: CellIndex[],
  remainingLengths: number[],
  counts?: { rows: Record<number, number>; cols: Record<number, number> },
): Density {
  const weight = new Array<number>(CELLS).fill(0);
  const known = new Set(knownShipCells);
  const clusters = hitClusters(marks);
  const open = clusters.filter((c) => !closed(c, marks));
  const openCells = new Set(open.flat());

  for (const length of remainingLengths) {
    for (const cells of runsOfLength(length)) {
      if (cells.some((c) => marks[c] === 'miss')) continue;
      if (counts && violatesCounts(cells, counts, marks)) continue;
      // A run that covers an open hit is a live lead; one that covers a cell
      // Echo exposed is a certainty.
      let w = 1;
      const coversOpen = cells.filter((c) => openCells.has(c)).length;
      const coversKnown = cells.filter((c) => known.has(c)).length;
      if (coversOpen > 0) w *= 12 * coversOpen;
      if (coversKnown > 0) w *= 20 * coversKnown;
      for (const c of cells) {
        if (marks[c] === 'hit') continue; // already spent
        weight[c] += w;
      }
    }
  }

  const max = Math.max(...weight, 1);
  for (let i = 0; i < weight.length; i++) weight[i] /= max;

  const ranked = weight
    .map((w, i) => ({ w, i }))
    .filter((x) => x.w > 0 && marks[x.i] === undefined)
    .sort((a, b) => b.w - a.w || a.i - b.i)
    .map((x) => x.i);

  return { weight, ranked, openClusters: open };
}

/**
 * Row and column totals from Sounding and Beacon are hard constraints: a run
 * that would put more ship cells in a row than the enemy admitted to cannot be
 * where the ship is.
 */
function violatesCounts(
  cells: CellIndex[],
  counts: { rows: Record<number, number>; cols: Record<number, number> },
  marks: Record<CellIndex, 'hit' | 'miss'>,
): boolean {
  for (const [rowStr, total] of Object.entries(counts.rows)) {
    const row = Number(rowStr);
    if (total !== 0) continue;
    // A row known to be empty cannot hold any part of a ship.
    if (cells.some((c) => Math.floor(c / BOARD) === row && marks[c] !== 'hit')) return true;
  }
  for (const [colStr, total] of Object.entries(counts.cols)) {
    const col = Number(colStr);
    if (total !== 0) continue;
    if (cells.some((c) => c % BOARD === col && marks[c] !== 'hit')) return true;
  }
  return false;
}

/** Orthogonally connected groups of hits. */
export function hitClusters(marks: Record<CellIndex, 'hit' | 'miss'>): CellIndex[][] {
  const hits = new Set(
    Object.entries(marks)
      .filter(([, v]) => v === 'hit')
      .map(([k]) => Number(k)),
  );
  const seen = new Set<CellIndex>();
  const out: CellIndex[][] = [];
  for (const start of hits) {
    if (seen.has(start)) continue;
    const group: CellIndex[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const c = stack.pop()!;
      group.push(c);
      for (const n of orthNeighbours(c)) {
        if (hits.has(n) && !seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
    out.push(group.sort((a, b) => a - b));
  }
  return out;
}

/** A cluster with no unexplored neighbour has nothing left to chase. */
function closed(cluster: CellIndex[], marks: Record<CellIndex, 'hit' | 'miss'>): boolean {
  return cluster.every((c) => orthNeighbours(c).every((n) => marks[n] !== undefined));
}

/** Enemy ship lengths still afloat, from the public sink announcements. */
export function remainingLengths(view: ClientView): number[] {
  return view.foe.ships.filter((s) => !s.sunk).map((s) => s.length);
}

// ---------------------------------------------------------------------------
// Fleet belief
// ---------------------------------------------------------------------------

export interface FleetBelief {
  /** Candidate ship ids per pack, after everything observed is applied. */
  candidates: [string[], string[], string[]];
  /** Probability the enemy fields a given ship. */
  p(shipId: string): number;
  /** How many fleets are still consistent with what has been seen. */
  possibleFleets: number;
}

/**
 * The distribution over the enemy's 64 possible fleets.
 *
 * It starts as four candidates per pack — three if you did not collide, one if
 * you did — and narrows every time a ship reveals itself by acting or dying.
 * A bot that assumes a fixed fleet misplays the endgame: it will happily sink
 * the last two-length ship while sitting on nine banked charges, against an
 * opponent who might be holding Spite.
 */
export function fleetBelief(view: ClientView): FleetBelief {
  const packs = view.shipDraft.packs;
  const revealed = new Set(
    view.foe.ships.map((s) => s.defId).filter((x): x is string => x !== null),
  );

  const candidates = packs.map((pack, i) => {
    const mine = view.shipDraft.myPicks[i];
    // A revealed ship settles its pack outright.
    const known = pack.find((id) => revealed.has(id));
    if (known) return [known];
    if (view.shipDraft.collisions[i] && mine) return [mine];
    const pool = mine ? pack.filter((id) => id !== mine) : pack.slice();
    // A ship of a length that has already sunk without being identified is
    // still in the running: the sink announced a length, not a name.
    return pool;
  }) as [string[], string[], string[]];

  const total = candidates.reduce((n, c) => n * Math.max(1, c.length), 1);
  return {
    candidates,
    possibleFleets: total,
    p(shipId: string) {
      const def = SHIPS[shipId];
      if (!def) return 0;
      const slot = def.pack === 'A' ? 0 : def.pack === 'B' ? 1 : 2;
      const pool = candidates[slot];
      if (!pool.length) return 0;
      return pool.includes(shipId) ? 1 / pool.length : 0;
    },
  };
}

/** Which of their cards you could still be facing, by the same logic. */
export function cardBelief(view: ClientView): { p(cardId: string): number } {
  const packs = view.cardDraft.packs;
  const seen = new Set(view.foe.graveyard.map((g) => g.defId));
  const pools = packs.map((pack, i) => {
    const mine = view.cardDraft.myPicks[i];
    if (view.cardDraft.collisions[i] && mine) return [mine];
    return mine ? pack.filter((id) => id !== mine) : pack.slice();
  });
  return {
    p(cardId: string) {
      // A card already fired is gone for good.
      if (seen.has(cardId)) return 0;
      for (const pool of pools) {
        if (pool.includes(cardId)) return 1 / pool.length;
      }
      return 0;
    },
  };
}

// ---------------------------------------------------------------------------
// Reading the opponent
// ---------------------------------------------------------------------------

/**
 * Where they are most likely to shoot next, computed the same way they would
 * compute it — over your board, from the marks they have made on it. This is
 * what makes Mirror and Ambush playable rather than a coin flip.
 */
export function predictTheirShot(view: ClientView): CellIndex[] {
  const mine = view.me.ships;
  const theirMarks = view.foe.marks;
  const alive = mine.filter((s) => !s.sunk).map((s) => s.length);
  const d = density(theirMarks, [], alive);
  return d.ranked.slice(0, 8);
}

/** Cells of your own fleet that are still whole, for damage-avoidance reads. */
export function myLiveCells(view: ClientView): CellIndex[] {
  const out: CellIndex[] = [];
  for (const s of view.me.ships) {
    if (s.sunk) continue;
    s.cells.forEach((c, i) => {
      if (!s.hits[i]) out.push(c);
    });
  }
  return out;
}

/** A quiet corner of your own water — where a bluffing Ambush belongs. */
export function emptyOwnCells(view: ClientView): CellIndex[] {
  const occupied = new Set(view.me.ships.flatMap((s) => s.cells));
  const out: CellIndex[] = [];
  for (let c = 0; c < CELLS; c++) if (!occupied.has(c)) out.push(c);
  return out;
}

/** Best top-left anchor for a k x k block, by total weight. */
export function bestBlock(weight: number[], size: number): CellIndex {
  let best = 0;
  let bestScore = -1;
  for (let y = 0; y <= BOARD - size; y++) {
    for (let x = 0; x <= BOARD - size; x++) {
      let score = 0;
      for (let dy = 0; dy < size; dy++) {
        for (let dx = 0; dx < size; dx++) score += weight[cellAt(x + dx, y + dy)];
      }
      if (score > bestScore) {
        bestScore = score;
        best = cellAt(x, y);
      }
    }
  }
  return best;
}

/** Best origin and direction for a straight run of `length`. */
export function bestLine(
  weight: number[],
  length: number,
): { origin: CellIndex; dir: [number, number] } {
  let best = { origin: 0, dir: [1, 0] as [number, number] };
  let bestScore = -1;
  for (let c = 0; c < CELLS; c++) {
    for (const dir of [
      [1, 0],
      [0, 1],
    ] as [number, number][]) {
      const [x0, y0] = xy(c);
      let score = 0;
      let ok = true;
      for (let i = 0; i < length; i++) {
        const x = x0 + dir[0] * i;
        const y = y0 + dir[1] * i;
        if (x >= BOARD || y >= BOARD) {
          ok = false;
          break;
        }
        score += weight[cellAt(x, y)];
      }
      if (ok && score > bestScore) {
        bestScore = score;
        best = { origin: c, dir };
      }
    }
  }
  return best;
}

/** Best starting cell for a horizontal run of `length` inside one row. */
export function bestRowRun(weight: number[], length: number): CellIndex {
  let best = 0;
  let bestScore = -1;
  for (let y = 0; y < BOARD; y++) {
    for (let x = 0; x <= Math.max(0, BOARD - length); x++) {
      let score = 0;
      for (let i = 0; i < length && x + i < BOARD; i++) score += weight[cellAt(x + i, y)];
      if (score > bestScore) {
        bestScore = score;
        best = cellAt(x, y);
      }
    }
  }
  return best;
}
