import { describe, expect, it } from 'vitest';
import { ratingLine, roundSettlement, settlement } from './settlement';
import { ARENA_RAKE, arenaPayout, type Stake } from './profile';
import { bracketPayoutSol } from '../tournament/bracket';

/**
 * The celebration and the receipt must state the same number.
 *
 * This is the one rule in the product where a cosmetic bug is a financial
 * one. A banner that slams up "+◎0.0950" over a settlement that pays 0.0900
 * has told the player something untrue about their own money, at the exact
 * moment they are least likely to check. The defence is structural — there is
 * one function — and these tests are what stop a second one appearing.
 */

const STAKES: Stake[] = [0.05, 0.1, 0.25, 0.5];

describe('settlement', () => {
  it('pays a winner exactly what the receipt shows', () => {
    for (const stake of STAKES) {
      const banner = settlement('arena', stake, 'win');
      const receipt = arenaPayout(stake);
      expect(banner.figure).toBe(receipt.toWinner);
      expect(banner.money).toBe(`+◎${receipt.toWinner.toFixed(4)}`);
    }
  });

  it('never announces more than the settlement pays', () => {
    for (const stake of STAKES) {
      const banner = settlement('arena', stake, 'win');
      const receipt = arenaPayout(stake);
      // The whole point, stated as an inequality rather than an equality so
      // it still catches a change that makes the banner *generous* by any
      // amount at all, including a rounding one.
      expect(banner.figure).not.toBeGreaterThan(receipt.toWinner);
      expect(receipt.toWinner).toBeCloseTo(receipt.pot * (1 - ARENA_RAKE), 12);
    }
  });

  it('charges a loser exactly their stake, and says so as a negative', () => {
    for (const stake of STAKES) {
      const banner = settlement('arena', stake, 'loss');
      expect(banner.figure).toBe(-stake);
      expect(banner.money).toBe(`−◎${stake.toFixed(4)}`);
      expect(banner.direction).toBe('down');
    }
  });

  it('takes nothing on a draw, and does not print a signed number', () => {
    for (const stake of STAKES) {
      const banner = settlement('arena', stake, 'draw');
      expect(banner.figure).toBe(stake);
      expect(banner.direction).toBe('flat');
      expect(banner.money).not.toMatch(/[+−]/);
    }
  });

  it('has no money line at all when nothing was staked', () => {
    for (const mode of ['casual', 'ranked'] as const) {
      for (const result of ['win', 'loss', 'draw'] as const) {
        expect(settlement(mode, 0, result).money).toBeNull();
      }
    }
    // Arena at a zero stake is the same case: no stake, no money line.
    expect(settlement('arena', 0 as Stake, 'win').money).toBeNull();
  });

  it('gives every outcome a headline and a reason', () => {
    for (const result of ['win', 'loss', 'draw'] as const) {
      const s = settlement('arena', 0.1, result);
      expect(s.headline).toBe(result === 'win' ? 'VICTORY' : result === 'loss' ? 'DEFEAT' : 'DRAW');
      expect(s.sub.length).toBeGreaterThan(0);
    }
  });

  it('formats a rating delta for the slot the money would have taken', () => {
    expect(ratingLine(18)).toBe('+18 rating');
    expect(ratingLine(-18)).toBe('−18 rating');
    expect(ratingLine(0)).toBe('+0 rating');
  });
});

describe('bracket rounds', () => {
  it('announces only what winning the round actually secures', () => {
    for (const stake of STAKES) {
      const pay = bracketPayoutSol(stake);
      // A quarter-final win cannot finish below a losing semifinalist.
      expect(roundSettlement(stake, 'quarter-final', true).figure).toBe(pay.semiLoser);
      // A semi-final win cannot finish below runner-up.
      expect(roundSettlement(stake, 'semi-final', true).figure).toBe(pay.runnerUp);
    }
  });

  it('never announces the champion share for a round that is not the final', () => {
    for (const stake of STAKES) {
      const pay = bracketPayoutSol(stake);
      for (const round of ['quarter-final', 'semi-final'] as const) {
        const s = roundSettlement(stake, round, true);
        expect(s.figure).toBeLessThan(pay.champion);
      }
    }
  });

  it('tells a knocked-out player the truth, including zero', () => {
    for (const stake of STAKES) {
      const pay = bracketPayoutSol(stake);
      expect(roundSettlement(stake, 'quarter-final', false).figure).toBe(0);
      expect(roundSettlement(stake, 'semi-final', false).figure).toBe(pay.semiLoser);
      expect(roundSettlement(stake, 'final', false).figure).toBe(pay.runnerUp);
    }
  });

  it('gives a loss the same shape of object a win gets', () => {
    // Not a formality: the defeat banner renders from this, and anything
    // missing here is a visually skimped loss.
    for (const round of ['quarter-final', 'semi-final', 'final'] as const) {
      const s = roundSettlement(0.1, round, false);
      expect(s.headline.length).toBeGreaterThan(0);
      expect(s.money).not.toBeNull();
      expect(s.sub.length).toBeGreaterThan(0);
    }
  });
});
