/**
 * Rating, modes and the season payout curve.
 *
 * One rating covers ranked and arena. A new account is provisional for its
 * first ten rated matches: it moves faster, matches against a wider band, and
 * cannot enter arena above the lowest stake — which is the cheapest way to
 * stop a strong player farming beginners from a fresh wallet.
 */

export type Mode = 'casual' | 'ranked' | 'arena';
export type Stake = 0 | 0.05 | 0.1 | 0.25 | 0.5;

export const STAKE_TIERS: Stake[] = [0.05, 0.1, 0.25, 0.5];
export const SEASON_ENTRY_SOL = 0.1;
export const ARENA_RAKE = 0.05;
export const PROVISIONAL_MATCHES = 10;

export interface MatchHistoryEntry {
  result: 'win' | 'loss' | 'draw';
  delta: number;
  rounds: number;
  mode: Mode;
  stake: Stake;
}

export interface Profile {
  name: string;
  rating: number;
  provisionalMatches: number;
  wins: number;
  losses: number;
  draws: number;
  history: MatchHistoryEntry[];
  seasonEntry: boolean;
}

export function isProvisional(p: Profile): boolean {
  return p.provisionalMatches < PROVISIONAL_MATCHES;
}

/** Stakes a profile may sit down at. Provisional accounts get the low table. */
export function allowedStakes(p: Profile): Stake[] {
  return isProvisional(p) ? [STAKE_TIERS[0]] : STAKE_TIERS;
}

/** Elo, with a wide K while provisional so a new rating finds its level fast. */
export function ratingDelta(
  p: Profile,
  result: 'win' | 'loss' | 'draw',
  opponentRating = 1200,
): number {
  const k = isProvisional(p) ? 48 : 24;
  const expected = 1 / (1 + 10 ** ((opponentRating - p.rating) / 400));
  const score = result === 'win' ? 1 : result === 'draw' ? 0.5 : 0;
  return Math.round(k * (score - expected));
}

/**
 * Season payouts on a curve, not winner-takes-all.
 *
 * The shape has two jobs: make the top of the ladder worth chasing, and make
 * the top tenth at least whole again. A flat split kills the chase; a
 * winner-takes-all kills the entries that fund it.
 */
export interface PayoutBand {
  label: string;
  /** Upper bound of the band, as a fraction of the field. */
  topFraction: number;
  /** Share of the pool this whole band receives. */
  poolShare: number;
}

export const PAYOUT_CURVE: PayoutBand[] = [
  { label: 'Top 1%', topFraction: 0.01, poolShare: 0.3 },
  { label: 'Top 2-5%', topFraction: 0.05, poolShare: 0.25 },
  { label: 'Top 6-10%', topFraction: 0.1, poolShare: 0.18 },
  { label: 'Top 11-25%', topFraction: 0.25, poolShare: 0.17 },
  { label: 'Top 26-50%', topFraction: 0.5, poolShare: 0.1 },
];

export interface SeasonView {
  daysRemaining: number;
  fieldSize: number;
  poolSol: number;
  yourRank: number;
  yourFraction: number;
  yourBand: PayoutBand | null;
  projectedSol: number;
  entered: boolean;
}

/**
 * A local projection of where a profile stands. The real numbers come from the
 * leaderboard service; this keeps the screen honest and testable offline.
 */
export function seasonState(p: Profile, now = 0): SeasonView {
  const fieldSize = 4800;
  const poolSol = fieldSize * SEASON_ENTRY_SOL;
  // Rank is derived from rating against a notional normal field.
  const z = (p.rating - 1200) / 220;
  const percentile = 1 - cdf(z);
  const yourRank = Math.max(1, Math.round(percentile * fieldSize));
  const yourFraction = yourRank / fieldSize;
  const band = PAYOUT_CURVE.find((b) => yourFraction <= b.topFraction) ?? null;

  let projected = 0;
  if (band && p.seasonEntry) {
    const lower = PAYOUT_CURVE[PAYOUT_CURVE.indexOf(band) - 1]?.topFraction ?? 0;
    const bandSize = Math.max(1, Math.round((band.topFraction - lower) * fieldSize));
    projected = (poolSol * band.poolShare) / bandSize;
  }

  return {
    daysRemaining: Math.max(0, 28 - (now % 28)),
    fieldSize,
    poolSol,
    yourRank,
    yourFraction,
    yourBand: band,
    projectedSol: projected,
    entered: p.seasonEntry,
  };
}

/** Normal CDF, good enough for a projection. */
function cdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const prob =
    d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - prob : prob;
}

/** What the winner of an arena match actually receives. */
export function arenaPayout(stake: Stake): { pot: number; rake: number; toWinner: number } {
  const pot = stake * 2;
  const rake = pot * ARENA_RAKE;
  return { pot, rake, toWinner: pot - rake };
}
