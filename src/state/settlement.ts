import { arenaPayout, type Mode, type Stake } from './profile';
import { bracketPayoutSol } from '../tournament/bracket';

/**
 * What a match was worth, computed exactly once.
 *
 * The banner that slams up the instant the last enemy cell dies and the
 * receipt on the result screen are two views of the same fact, and they must
 * never disagree — a celebration that promises more than the settlement pays
 * is the single most damaging bug a wagered game can ship. So neither screen
 * does its own arithmetic: both call this, and `settlement.test.ts` asserts
 * that the figure in the banner is the figure in the receipt.
 *
 * The signed convention follows the brief: a win prints what lands in your
 * wallet (`+◎0.0950`, the post-rake pot), a loss prints what left it
 * (`−◎0.0500`, the stake), and a draw prints neither because nothing moved.
 * Those are also exactly the rows the receipt shows, which is the point.
 */

export type Result = 'win' | 'loss' | 'draw';

export interface Settlement {
  /** VICTORY / DEFEAT / DRAW. */
  headline: string;
  /**
   * The money, as both the banner and the receipt print it. Null when no
   * stake was at risk — the caller substitutes the rating delta there.
   */
  money: string | null;
  /** The bare figure behind `money`, for the receipt's own row. */
  figure: number | null;
  /** Which way it moved, for colour. */
  direction: 'up' | 'down' | 'flat';
  /** One line on how it ended, under the number. */
  sub: string;
}

/** The rating delta, formatted for the slot the money would have occupied. */
export function ratingLine(delta: number): string {
  return `${delta >= 0 ? '+' : '−'}${Math.abs(delta)} rating`;
}

export function settlement(mode: Mode, stake: Stake, result: Result): Settlement {
  const headline = result === 'win' ? 'VICTORY' : result === 'loss' ? 'DEFEAT' : 'DRAW';
  const staked = (mode === 'arena' || mode === 'tournament') && stake > 0;

  if (!staked) {
    return {
      headline,
      money: null,
      figure: null,
      direction: result === 'win' ? 'up' : result === 'loss' ? 'down' : 'flat',
      sub: result === 'draw' ? 'Level at the end.' : 'No stake on this table.',
    };
  }

  if (result === 'draw') {
    return {
      headline,
      money: 'stakes returned — no rake',
      figure: stake,
      direction: 'flat',
      sub: 'A draw costs neither player anything.',
    };
  }

  const pot = arenaPayout(stake);
  if (result === 'win') {
    return {
      headline,
      money: `+◎${pot.toWinner.toFixed(4)}`,
      figure: pot.toWinner,
      direction: 'up',
      sub: `The ◎${pot.pot.toFixed(2)} pot, less the ${(
        (pot.rake / pot.pot) *
        100
      ).toFixed(0)}% rake.`,
    };
  }
  return {
    headline,
    money: `−◎${stake.toFixed(4)}`,
    figure: -stake,
    direction: 'down',
    sub: 'Your stake goes to the winner.',
  };
}

/**
 * A bracket round, which pays nothing yet but locks in a floor.
 *
 * Winning a quarter-final guarantees at least a losing semifinalist's share;
 * winning a semi-final guarantees at least the runner-up's. That is a real
 * number and the honest thing to put on the banner — the alternative is
 * celebrating with a figure the player has not actually secured.
 */
export function roundSettlement(
  stake: Stake,
  round: 'quarter-final' | 'semi-final' | 'final',
  won: boolean,
): Settlement {
  const pay = bracketPayoutSol(stake);
  if (!won) {
    const took =
      round === 'final' ? pay.runnerUp : round === 'semi-final' ? pay.semiLoser : 0;
    return {
      headline: 'KNOCKED OUT',
      money: took > 0 ? `◎${took.toFixed(4)}` : '◎0 — the curve pays the top four',
      figure: took,
      direction: took > 0 ? 'up' : 'down',
      sub:
        round === 'final'
          ? 'Runner-up takes 25% of the pot.'
          : round === 'semi-final'
            ? 'A losing semifinalist takes 10%.'
            : 'Quarter-final losers take nothing.',
    };
  }
  const secured = round === 'quarter-final' ? pay.semiLoser : pay.runnerUp;
  return {
    headline: round === 'quarter-final' ? 'QUARTER-FINAL WON' : 'SEMI-FINAL WON',
    money: `◎${secured.toFixed(4)} secured`,
    figure: secured,
    direction: 'up',
    sub:
      round === 'quarter-final'
        ? 'You cannot finish below a losing semifinalist now.'
        : 'You cannot finish below runner-up now.',
  };
}
