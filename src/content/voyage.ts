/**
 * Voyage configuration — campaign length is chosen at creation (3–8 rounds)
 * and everything else derives from it: fleet growth, draft pack sizes, grid
 * dimensions (assembled from 4×4 patches), pool tiers and income.
 *
 * NOTE on the fleet table: the design doc's voyage table is internally
 * inconsistent (3 rounds: start 4, +2/round is stated to end at 10, but
 * 4+2+2 = 8; 4 rounds: 4+2+2+2 = 10, stated 12). The stated intent is that
 * "every voyage ends at a comparable size", so these tables honour the
 * start and final columns and derive the per-round gains. Flagged for review.
 */

export type VoyageLength = 3 | 4 | 5 | 6 | 8;

export const VOYAGE_LENGTHS: VoyageLength[] = [3, 4, 5, 6, 8];

/** Cumulative fleet size after each round's draft, per voyage length. */
const FLEET_TABLES: Record<VoyageLength, number[]> = {
  3: [4, 7, 10],
  4: [4, 7, 10, 12],
  5: [3, 5, 7, 9, 11],
  6: [3, 5, 7, 8, 9, 10],
  8: [3, 4, 5, 6, 7, 8, 9, 10],
};

export interface VoyageRoundConfig {
  round: number;
  voyageLength: VoyageLength;
  /** Total fleet size after this round's draft. */
  fleetSize: number;
  /** Ship keeps this round (pack size = keeps × 2). Card keeps are equal. */
  keeps: number;
  /** Grid dimensions, assembled from 4×4 patches. */
  gridW: number;
  gridH: number;
  /** Number of 4×4 patches on the board. */
  patches: number;
  /** Card/ship tiers available in this round's packs. */
  tiers: number[];
  /** Base energy income per turn. */
  baseIncome: number;
  /** One-off energy grant to the second player on their first turn. */
  secondPlayerComp: number;
  /** Bonus energy per cell hit on the previous turn. */
  hitBonus: number;
}

/**
 * Grid interpolates from 8×8 to 12×12 across the voyage, quantised to patch
 * boards: 4 patches → 8×8, 6 → 8×12, 9 → 12×12. Derived, not hardcoded.
 */
function gridFor(round: number, length: number): { w: number; h: number; patches: number } {
  const f = length === 1 ? 1 : (round - 1) / (length - 1);
  if (f < 1 / 3) return { w: 8, h: 8, patches: 4 };
  if (f < 2 / 3) return { w: 8, h: 12, patches: 6 };
  return { w: 12, h: 12, patches: 9 };
}

/** Tier ladder mapped onto the voyage fraction (mirrors the old 8-round ramp). */
function tiersFor(round: number, length: number): number[] {
  const f = round / length;
  if (f <= 0.25) return [1];
  if (f <= 0.5) return [1, 2];
  if (f <= 0.625) return [2];
  if (f <= 0.875) return [2, 3];
  return [3];
}

/**
 * Flat base income. Energy is now the only brake on a turn's throughput, so
 * it does not scale with the voyage — bigger boards are paid for by the
 * instant hit income, not by a bigger allowance.
 */
function incomeFor(_round: number, _length: number): number {
  return 2;
}

/** Bonus energy per hit — the anti-turtling lever (tune upward, never cap). */
function hitBonusFor(_round: number, _length: number): number {
  return 1;
}

export function voyageRound(voyageLength: VoyageLength, round: number): VoyageRoundConfig {
  const fleets = FLEET_TABLES[voyageLength];
  const r = Math.min(Math.max(round, 1), voyageLength);
  const fleetSize = fleets[r - 1];
  const prev = r > 1 ? fleets[r - 2] : 0;
  const grid = gridFor(r, voyageLength);
  return {
    round: r,
    voyageLength,
    fleetSize,
    keeps: fleetSize - prev,
    gridW: grid.w,
    gridH: grid.h,
    patches: grid.patches,
    tiers: tiersFor(r, voyageLength),
    baseIncome: incomeFor(r, voyageLength),
    secondPlayerComp: 1,
    hitBonus: hitBonusFor(r, voyageLength),
  };
}

export const DEFAULT_VOYAGE_LENGTH: VoyageLength = 6;

/**
 * "Standard match" — the single-match (practice) format: packs of 10,
 * 5 keeps, full roster in the ship packs, biggest board.
 */
export const STANDARD_MATCH = {
  keeps: 5,
  gridW: 12,
  gridH: 12,
  patches: 9,
  tiers: [1, 2, 3],
  baseIncome: 2,
  secondPlayerComp: 2,
  hitBonus: 2,
};
