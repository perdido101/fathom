import type { CellIndex, MatchState, PlayerId } from '../engine/types';
import { cellRC, rcCell, inBounds, other } from '../engine/types';
import { hashString } from '../engine/rng';
import { fleetBelief } from '../engine/deduction';
import { zoneCells, zoneFits, modIs, isDetectable } from '../engine/resolve/shot';
import { PLACEMENT_DIRS } from '../engine/fleet/placement';

/**
 * Probability-density hunting under hidden fleet composition. The bot never
 * reads the enemy's true fleet: it maintains a belief over lengths from its
 * draft clue pairs (one of {kept, burned} per observed pick), updated by
 * announced sink lengths, and hunts the expected remaining lengths.
 */

/**
 * Expected number of remaining enemy ships per length: a genuine belief
 * distribution over possible fleets, enumerated from the observed draft
 * pairs and narrowed by every announced sink.
 */
export function expectedSizeCounts(ms: MatchState, p: PlayerId): Map<number, number> {
  const ps = ms.players[p];
  return fleetBelief(ps.enemyClues, ps.enemySunkLengths).expectedBySize;
}

export function isBlockedForPlacement(ms: MatchState, p: PlayerId, cell: CellIndex): boolean {
  const intel = ms.players[p].intel[cell];
  if (ms.terrain[cell] === 'REEF') return true;
  if (intel.known === 'empty') return true;
  if (intel.mark === 'miss' || intel.mark === 'sunk') return true;
  return false;
}

function isUnresolvedHit(ms: MatchState, p: PlayerId, cell: CellIndex): boolean {
  return ms.players[p].intel[cell].mark === 'hit';
}

export function densityGrid(ms: MatchState, p: PlayerId): number[] {
  const w = ms.gridW;
  const h = ms.gridH;
  const area = w * h;
  const intel = ms.players[p].intel;
  const weights = new Array<number>(area).fill(0);
  const expected = expectedSizeCounts(ms, p);
  const sizes = [...expected.entries()].filter(([, e]) => e > 0.05);
  if (sizes.length === 0) return weights;

  // A remaining size-1 ship may be an evasive skiff hiding behind a false
  // miss. A skiff dodges exactly once, so a cell missed twice is truly empty:
  // only single-miss cells are worth a re-check.
  if ((expected.get(1) ?? 0) > 0.3) {
    for (let c = 0; c < area; c++) {
      const ci = intel[c];
      if (ci.fireCount === 1 && ci.mark === 'miss' && ms.terrain[c] !== 'REEF') {
        weights[c] += 0.3;
      }
    }
  }

  // Ship placements along all four axes (diagonals are legal).
  for (const [s, e] of sizes) {
    const strength = Math.min(1, e);
    const dirs = s === 1 ? [PLACEMENT_DIRS[0]] : PLACEMENT_DIRS;
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        for (const [dr, dc] of dirs) {
          const endR = r + dr * (s - 1);
          const endC = c + dc * (s - 1);
          if (!inBounds(endR, endC, w, h)) continue;
          const run: CellIndex[] = [];
          let ok = true;
          let hitsCovered = 0;
          for (let i = 0; i < s; i++) {
            const cell = rcCell(r + dr * i, c + dc * i, w);
            if (isBlockedForPlacement(ms, p, cell)) {
              ok = false;
              break;
            }
            if (isUnresolvedHit(ms, p, cell)) hitsCovered += 1;
            run.push(cell);
          }
          if (!ok) continue;
          const base = (1 + hitsCovered * 25) * strength;
          for (const cell of run) {
            if (!isUnresolvedHit(ms, p, cell)) weights[cell] += base;
          }
        }
      }
    }
  }

  // Direct targets trump statistical hunting:
  for (let c = 0; c < area; c++) {
    const ci = intel[c];
    if (ci.mark === 'sunk' || ci.known === 'empty') continue;
    // Known-occupied cells — unless our shots there have started reporting
    // misses (an unannounced sink leaves stale "occupied" knowledge; one
    // re-check covers a dodged skiff, then we let it go).
    if (
      ci.known === 'occupied' &&
      !(ci.mark === 'hit' && ci.partial === false) &&
      !(ci.mark === 'miss' && ci.fireCount >= 2)
    ) {
      weights[c] = Math.max(weights[c], 5000);
    }
    // A hit that held (trench/armor) needs a second shell.
    if (ci.mark === 'hit' && ci.partial === true) {
      weights[c] = Math.max(weights[c], 4000);
    }
    // A fog hit never says whether the cell held — refire until it wrecks.
    if (ci.mark === 'hit' && ci.partial === undefined) {
      weights[c] = Math.max(weights[c], 3000);
    }
  }

  // Detection reports as constraints. A count report whose zone has been
  // whittled down to exactly `value` plausible cells pins them outright;
  // otherwise the zone gets a boost proportional to its reported density.
  // Reports go stale when another sink is announced.
  const announcedNow = ms.players[p].enemySunkLengths.length;
  for (const rep of ms.players[p].reports) {
    if (rep.enemySunk !== announcedNow || rep.value <= 0) continue;
    const unresolved = rep.cells.filter((c) => {
      const ci = intel[c];
      if (ms.terrain[c] === 'REEF' || ci.mark === 'sunk' || ci.known === 'empty') return false;
      if (ci.mark === 'miss' && ci.fireCount >= 2) return false;
      if (ci.mark === 'hit' && ci.partial === false) return false;
      return true;
    });
    if (unresolved.length === 0) continue;
    if (rep.kind === 'count' && unresolved.length <= rep.value) {
      for (const c of unresolved) weights[c] = Math.max(weights[c], 4500);
    } else if (rep.kind === 'flag' && unresolved.length === 1) {
      weights[unresolved[0]] = Math.max(weights[unresolved[0]], 4500);
    } else if (rep.kind === 'count') {
      const boost = (rep.value / unresolved.length) * 12;
      for (const c of unresolved) {
        if (!isUnresolvedHit(ms, p, c)) weights[c] += boost;
      }
    }
  }

  // Last resort: enemy ships remain but every placement is contradicted.
  // Our intel is lying — repaired cells read as destroyed, evasive skiffs as
  // misses, decoys as hits. Re-check the board, cheapest lies first, with
  // fireCount as memory so the sweep never revisits a double-checked cell
  // while single-checked cells remain.
  if (weights.every((wt) => wt <= 0)) {
    for (let c = 0; c < area; c++) {
      const ci = intel[c];
      if (ms.terrain[c] === 'REEF' || ci.mark === 'sunk') continue;
      const tiebreak = (hashString(`${ms.seed}:recheck:${c}`) % 97) / 1000;
      if (ci.mark === 'hit') weights[c] = 1 / Math.max(1, ci.fireCount) + tiebreak;
      else if (ci.fired && ci.fireCount === 1) weights[c] = 0.5 + tiebreak;
      else if (ci.fired) weights[c] = 0.01 / ci.fireCount + tiebreak / 10;
      else if (ci.known === 'empty') weights[c] = 0.005 + tiebreak / 20; // blinded probes can lie too
    }
  }
  return weights;
}

/** Top N distinct cells by density; ties broken by index for determinism. */
export function topCells(weights: number[], n: number, exclude?: Set<number>): CellIndex[] {
  return weights
    .map((wt, i) => [wt, i] as const)
    .filter(([wt, i]) => wt > 0 && !(exclude && exclude.has(i)))
    .sort((a, b) => b[0] - a[0] || a[1] - b[1])
    .slice(0, n)
    .map(([, i]) => i);
}

/** Best n×n zone origin by summed weight. */
export function bestZone(
  ms: MatchState,
  weights: number[],
  zone: number,
): { origin: CellIndex; score: number } {
  const w = ms.gridW;
  const h = ms.gridH;
  let best = { origin: 0, score: -1 };
  for (let r = 0; r + zone <= h; r++) {
    for (let c = 0; c + zone <= w; c++) {
      const origin = rcCell(r, c, w);
      if (!zoneFits(origin, zone, w, h)) continue;
      let score = 0;
      for (const cell of zoneCells(origin, zone, w)) score += weights[cell];
      if (score > best.score) best = { origin, score };
    }
  }
  return best;
}

/**
 * "Interesting to a probe": an unknown cell, or one whose story is suspect —
 * a single miss could be a dodge, an unsunk hit a repair, a "hit" a decoy.
 * Probes report the truth; they are how lies get burned away.
 */
function probeInterest(ms: MatchState, p: PlayerId, cell: CellIndex): number {
  if (ms.terrain[cell] === 'REEF') return 0;
  if (!isDetectable(ms, cell)) return 0;
  const ci = ms.players[p].intel[cell];
  if (ci.mark === 'sunk') return 0;
  if (!ci.fired && ci.known === null) return 1;
  if (ci.mark === 'hit') return 0.7;
  if (ci.mark === 'miss' && ci.fireCount === 1) return 0.5;
  return 0;
}

/** Best n×n zone by probe interest (for detection cards). */
export function bestUnknownZone(
  ms: MatchState,
  p: PlayerId,
  zone: number,
): { origin: CellIndex; unknown: number } {
  const w = ms.gridW;
  const h = ms.gridH;
  let best = { origin: 0, unknown: -1 };
  for (let r = 0; r + zone <= h; r++) {
    for (let c = 0; c + zone <= w; c++) {
      const origin = rcCell(r, c, w);
      let unknown = 0;
      for (const cell of zoneCells(origin, zone, w)) {
        unknown += probeInterest(ms, p, cell);
      }
      if (unknown > best.unknown) best = { origin, unknown };
    }
  }
  return best;
}

/** Best straight orthogonal segment of `len` for a probe. */
export function bestSegment(
  ms: MatchState,
  p: PlayerId,
  len: number,
): { cells: CellIndex[]; unknown: number } {
  const w = ms.gridW;
  const h = ms.gridH;
  let best: { cells: CellIndex[]; unknown: number } = { cells: [], unknown: -1 };
  const evalRun = (cells: CellIndex[]) => {
    let unknown = 0;
    for (const cell of cells) unknown += probeInterest(ms, p, cell);
    if (unknown > best.unknown) best = { cells, unknown };
  };
  for (let r = 0; r < h; r++) {
    for (let c = 0; c + len <= w; c++) {
      evalRun(Array.from({ length: len }, (_, i) => rcCell(r, c + i, w)));
    }
  }
  for (let c = 0; c < w; c++) {
    for (let r = 0; r + len <= h; r++) {
      evalRun(Array.from({ length: len }, (_, i) => rcCell(r + i, c, w)));
    }
  }
  return best;
}

/** Torpedo lane scoring: expected value of the first meaningful cell reached. */
export function bestTorpedoLane(
  ms: MatchState,
  p: PlayerId,
  weights: number[],
): { line: { axis: 'row' | 'col'; index: number; dir: 1 | -1 }; score: number } {
  const w = ms.gridW;
  const h = ms.gridH;
  const intel = ms.players[p].intel;
  const reefBlocks = !modIs(ms, 'reef_no_line_block');
  let best = { line: { axis: 'row' as 'row' | 'col', index: 0, dir: 1 as 1 | -1 }, score: -1 };
  for (const axis of ['row', 'col'] as const) {
    const laneCount = axis === 'row' ? h : w;
    const laneLen = axis === 'row' ? w : h;
    for (let index = 0; index < laneCount; index++) {
      for (const dir of [1, -1] as const) {
        let score = 0;
        let discount = 1;
        for (let i = 0; i < laneLen; i++) {
          const along = dir === 1 ? i : laneLen - 1 - i;
          const cell = axis === 'row' ? rcCell(index, along, w) : rcCell(along, index, w);
          if (reefBlocks && ms.terrain[cell] === 'REEF') break;
          const ci = intel[cell];
          if (ci.mark === 'miss' || ci.known === 'empty' || ci.mark === 'sunk') continue;
          score += weights[cell] * discount;
          discount *= 0.85;
          if (ci.mark === 'hit' || ci.known === 'occupied') break;
        }
        if (score > best.score) best = { line: { axis, index, dir }, score };
      }
    }
  }
  return best;
}

/** Best barrage row and direction (sum of weight before any blocker). */
export function bestBarrageRow(
  ms: MatchState,
  weights: number[],
): { line: { axis: 'row'; index: number; dir: 1 | -1 }; score: number } {
  const w = ms.gridW;
  const h = ms.gridH;
  const reefBlocks = !modIs(ms, 'reef_no_line_block');
  let best = { line: { axis: 'row' as const, index: 0, dir: 1 as 1 | -1 }, score: -1 };
  for (let index = 0; index < h; index++) {
    for (const dir of [1, -1] as const) {
      let score = 0;
      for (let i = 0; i < w; i++) {
        const c = dir === 1 ? i : w - 1 - i;
        const cell = rcCell(index, c, w);
        if (reefBlocks && ms.terrain[cell] === 'REEF') break;
        score += weights[cell];
      }
      if (score > best.score) best = { line: { axis: 'row', index, dir }, score };
    }
  }
  return best;
}

/** All cells that are still fireable at all (used as a last-resort fallback). */
export function fallbackCells(ms: MatchState, p: PlayerId): CellIndex[] {
  const w = ms.gridW;
  const area = w * ms.gridH;
  const intel = ms.players[p].intel;
  const unfired: CellIndex[] = [];
  const refire: CellIndex[] = [];
  for (let c = 0; c < area; c++) {
    if (ms.terrain[c] === 'REEF') continue;
    const ci = intel[c];
    if (ci.mark === 'sunk' || ci.known === 'empty') continue;
    if (!ci.fired) unfired.push(c);
    else refire.push(c);
  }
  return unfired.length > 0 ? unfired : refire;
}

export function neighborsOf(cell: CellIndex, w: number, h: number): CellIndex[] {
  const [r, c] = cellRC(cell, w);
  const out: CellIndex[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      if (inBounds(r + dr, c + dc, w, h)) out.push(rcCell(r + dr, c + dc, w));
    }
  }
  return out;
}

/** Total expected remaining enemy cells (for pacing decisions). */
export function expectedRemainingCells(ms: MatchState, p: PlayerId): number {
  let total = 0;
  for (const [s, e] of expectedSizeCounts(ms, p)) total += s * e;
  const enemy = ms.players[other(p)];
  void enemy;
  return total;
}
