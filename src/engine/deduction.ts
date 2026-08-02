import type { FleetClue } from './types';
import { SHIPS, SHIP_IDS } from '../content/ships';

/**
 * Fleet deduction from draft observations. Each pair clue means "the enemy
 * kept exactly one of these two hulls"; wildcard clues (unwitnessed drafts)
 * could be anything. Announced sink lengths rule branches out: a possible
 * fleet must be able to account for every announced length.
 *
 * Used by the AI (belief-weighted hunting) and by the UI (the draft-history
 * deduction aid with struck-out branches).
 */

export interface FleetBelief {
  /** Expected remaining enemy ship count per length. */
  expectedBySize: Map<number, number>;
  /** Per clue, per option: is this option still possible? */
  possibleOptions: boolean[][];
  /** Number of fleet hypotheses consistent with everything observed. */
  consistentCount: number;
}

const ROSTER_SIZE_FRAC: Map<number, number> = (() => {
  const m = new Map<number, number>();
  for (const id of SHIP_IDS) {
    const s = SHIPS[id].size;
    m.set(s, (m.get(s) ?? 0) + 1 / SHIP_IDS.length);
  }
  return m;
})();

export function fleetBelief(clues: FleetClue[], sunkLengths: number[]): FleetBelief {
  const pairClues: { index: number; options: string[] }[] = [];
  let wildcards = 0;
  clues.forEach((clue, index) => {
    if (clue.options.length <= 2) pairClues.push({ index, options: clue.options });
    else wildcards += 1;
  });

  const sunk = new Map<number, number>();
  for (const len of sunkLengths) sunk.set(len, (sunk.get(len) ?? 0) + 1);

  const nPair = pairClues.length;
  const combos = 1 << Math.min(nPair, 16);
  const expected = new Map<number, number>();
  const possible: boolean[][] = clues.map((c) => c.options.map(() => false));
  let consistent = 0;

  for (let mask = 0; mask < combos; mask++) {
    // Count lengths chosen by this hypothesis.
    const count = new Map<number, number>();
    for (let i = 0; i < nPair; i++) {
      const pick = (mask >> i) & 1;
      const id = pairClues[i].options[Math.min(pick, pairClues[i].options.length - 1)];
      const s = SHIPS[id].size;
      count.set(s, (count.get(s) ?? 0) + 1);
    }
    // Announced sinks must be attributable to chosen hulls or wildcards.
    let deficit = 0;
    for (const [len, n] of sunk) {
      deficit += Math.max(0, n - (count.get(len) ?? 0));
    }
    if (deficit > wildcards) continue;
    consistent += 1;

    // Remaining ships under this hypothesis.
    const wildcardsLeft = wildcards - deficit;
    for (const [len, n] of count) {
      const remaining = Math.max(0, n - (sunk.get(len) ?? 0));
      expected.set(len, (expected.get(len) ?? 0) + remaining);
    }
    if (wildcardsLeft > 0) {
      for (const [len, frac] of ROSTER_SIZE_FRAC) {
        expected.set(len, (expected.get(len) ?? 0) + wildcardsLeft * frac);
      }
    }
    // Mark options used by this consistent hypothesis.
    for (let i = 0; i < nPair; i++) {
      const pick = (mask >> i) & 1;
      const clue = pairClues[i];
      possible[clue.index][Math.min(pick, clue.options.length - 1)] = true;
    }
  }

  if (consistent > 0) {
    for (const [len, sum] of expected) expected.set(len, sum / consistent);
  } else {
    // Contradiction (shouldn't happen with honest data): fall back to priors.
    for (const clue of clues) {
      const per = 1 / Math.max(1, clue.options.length);
      for (const id of clue.options) {
        const s = SHIPS[id].size;
        expected.set(s, (expected.get(s) ?? 0) + per);
      }
    }
    for (const [len, n] of sunk) {
      expected.set(len, Math.max(0, (expected.get(len) ?? 0) - n));
    }
  }
  // Wildcard clues: every option stays possible.
  clues.forEach((clue, index) => {
    if (clue.options.length > 2) possible[index] = clue.options.map(() => true);
  });

  return { expectedBySize: expected, possibleOptions: possible, consistentCount: consistent };
}
