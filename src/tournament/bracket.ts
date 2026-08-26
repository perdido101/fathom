import type { Stake } from '../state/profile';

/**
 * An 8-seat single-elimination bracket, as data.
 *
 * The bracket is deliberately dumb: seats, matches, results. It knows nothing
 * about the game — matches resolve elsewhere (the real engine for the player's
 * own games, the sim for the rest) and report a winner here. Keeping it pure
 * means the same shape drives the client bracket screen, the payout maths and
 * the on-chain settle call, and can be unit-tested without a board in sight.
 *
 * Byes cannot exist by construction: a bracket is created with exactly eight
 * entrants or not at all, which mirrors the escrow rule that a bracket only
 * starts once the eighth stake lands.
 */

export const BRACKET_SEATS = 8;

/** Matches 0–3 are quarter-finals, 4–5 semi-finals, 6 the final. */
export const QF = [0, 1, 2, 3] as const;
export const SF = [4, 5] as const;
export const FINAL = 6;

export interface BracketMatch {
  /** Seat indices, null until the feeding matches decide them. */
  seats: [number | null, number | null];
  /** Winning seat, null while unplayed. */
  winner: number | null;
}

export interface Bracket {
  stake: Stake;
  /** Display names, seat order. Seat 0 is always the local player. */
  entrants: string[];
  matches: BracketMatch[];
}

export function newBracket(entrants: string[], stake: Stake): Bracket {
  if (entrants.length !== BRACKET_SEATS) {
    throw new Error(`a bracket seats exactly ${BRACKET_SEATS}, got ${entrants.length}`);
  }
  const matches: BracketMatch[] = [
    { seats: [0, 1], winner: null },
    { seats: [2, 3], winner: null },
    { seats: [4, 5], winner: null },
    { seats: [6, 7], winner: null },
    { seats: [null, null], winner: null },
    { seats: [null, null], winner: null },
    { seats: [null, null], winner: null },
  ];
  return { stake, entrants: entrants.slice(), matches };
}

/** Where a match's winner advances to: [match index, slot]. */
function feeds(index: number): [number, number] | null {
  if (index < 4) return [4 + (index >> 1), index & 1];
  if (index < 6) return [FINAL, index - 4];
  return null;
}

/** Record a result and advance the winner. Pure — returns a new bracket. */
export function reportResult(b: Bracket, index: number, winnerSeat: number): Bracket {
  const m = b.matches[index];
  if (!m) throw new Error(`no match ${index}`);
  if (m.winner !== null) throw new Error(`match ${index} already decided`);
  if (!m.seats.includes(winnerSeat)) {
    throw new Error(`seat ${winnerSeat} is not playing match ${index}`);
  }
  const next = {
    ...b,
    matches: b.matches.map((x, i) => (i === index ? { ...x, winner: winnerSeat } : { ...x })),
  };
  const to = feeds(index);
  if (to) next.matches[to[0]].seats[to[1]] = winnerSeat;
  return next;
}

/** The next unplayed match both of whose seats are known, if any. */
export function nextPlayable(b: Bracket): number | null {
  for (let i = 0; i < b.matches.length; i++) {
    const m = b.matches[i];
    if (m.winner === null && m.seats[0] !== null && m.seats[1] !== null) return i;
  }
  return null;
}

export function roundOf(index: number): 'quarter-final' | 'semi-final' | 'final' {
  return index < 4 ? 'quarter-final' : index < 6 ? 'semi-final' : 'final';
}

/** The seat's path: the match indices this seat plays or would play. */
export function pathOf(seat: number): number[] {
  const qf = seat >> 1;
  return [qf, 4 + (qf >> 1), FINAL];
}

export interface Standings {
  champion: number;
  runnerUp: number;
  /** The two losing semifinalists, in match order. */
  semiLosers: [number, number];
}

/** Final standings, only once the final has been played. */
export function standings(b: Bracket): Standings | null {
  const final = b.matches[FINAL];
  if (final.winner === null) return null;
  const champion = final.winner;
  const runnerUp = final.seats.find((s) => s !== champion);
  const semiLosers = SF.map((i) => {
    const m = b.matches[i];
    return m.seats.find((s) => s !== m.winner);
  });
  if (runnerUp == null || semiLosers.some((s) => s == null)) return null;
  return { champion, runnerUp, semiLosers: [semiLosers[0]!, semiLosers[1]!] };
}

/**
 * The payout curve in SOL, mirroring the on-chain integer maths (which runs
 * in lamports and gives the division dust to the champion — at these stakes
 * the shares divide exactly, so the display never lies).
 */
export function bracketPayoutSol(stake: Stake): {
  pot: number;
  rake: number;
  net: number;
  champion: number;
  runnerUp: number;
  semiLoser: number;
} {
  const lam = (sol: number) => BigInt(Math.round(sol * 1e9));
  const pot = lam(stake) * 8n;
  const rake = (pot * 500n) / 10_000n;
  const net = pot - rake;
  const runnerUp = (net * 2_500n) / 10_000n;
  const semiLoser = (net * 1_000n) / 10_000n;
  const champion = net - runnerUp - semiLoser * 2n;
  const sol = (l: bigint) => Number(l) / 1e9;
  return {
    pot: sol(pot),
    rake: sol(rake),
    net: sol(net),
    champion: sol(champion),
    runnerUp: sol(runnerUp),
    semiLoser: sol(semiLoser),
  };
}
