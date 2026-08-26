import { describe, expect, it } from 'vitest';
import {
  BRACKET_SEATS,
  FINAL,
  bracketPayoutSol,
  newBracket,
  nextPlayable,
  pathOf,
  reportResult,
  standings,
} from './bracket';
import { bracketPayout } from '../chain/program';
import { STAKE_TIERS } from '../state/profile';

const NAMES = ['You', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'];

describe('bracket structure', () => {
  it('refuses to exist with any seat count but eight — byes are impossible', () => {
    expect(() => newBracket(NAMES.slice(0, 7), 0.05)).toThrow();
    expect(() => newBracket([...NAMES, 'ninth'], 0.05)).toThrow();
    expect(newBracket(NAMES, 0.05).entrants).toHaveLength(BRACKET_SEATS);
  });

  it('runs three rounds to a champion, feeding winners forward', () => {
    let b = newBracket(NAMES, 0.05);
    // Lower seat wins every quarter-final.
    for (const i of [0, 1, 2, 3]) b = reportResult(b, i, i * 2);
    expect(b.matches[4].seats).toEqual([0, 2]);
    expect(b.matches[5].seats).toEqual([4, 6]);
    b = reportResult(b, 4, 0);
    b = reportResult(b, 5, 6);
    expect(b.matches[FINAL].seats).toEqual([0, 6]);
    b = reportResult(b, FINAL, 6);
    expect(standings(b)).toEqual({ champion: 6, runnerUp: 0, semiLosers: [2, 4] });
  });

  it('refuses a result from a seat not in the match, or a second result', () => {
    let b = newBracket(NAMES, 0.05);
    expect(() => reportResult(b, 0, 5)).toThrow();
    b = reportResult(b, 0, 1);
    expect(() => reportResult(b, 0, 0)).toThrow();
  });

  it('always knows which match is playable next', () => {
    let b = newBracket(NAMES, 0.1);
    expect(nextPlayable(b)).toBe(0);
    for (const i of [0, 1, 2, 3]) b = reportResult(b, i, i * 2 + 1);
    expect(nextPlayable(b)).toBe(4);
    b = reportResult(b, 4, 1);
    b = reportResult(b, 5, 5);
    expect(nextPlayable(b)).toBe(FINAL);
    b = reportResult(b, FINAL, 1);
    expect(nextPlayable(b)).toBeNull();
  });

  it('gives every seat a three-match path ending at the final', () => {
    for (let seat = 0; seat < BRACKET_SEATS; seat++) {
      const p = pathOf(seat);
      expect(p).toHaveLength(3);
      expect(p[2]).toBe(FINAL);
    }
  });
});

describe('bracket money', () => {
  it('pays 55/25/10/10 of the post-rake pot, exactly, at every tier', () => {
    for (const stake of STAKE_TIERS) {
      const lamports = BigInt(Math.round(stake * 1e9));
      const p = bracketPayout(lamports);
      expect(p.pot).toBe(lamports * 8n);
      expect(p.rake).toBe((p.pot * 500n) / 10_000n);
      // Conservation: every lamport in the pot is accounted for.
      expect(p.toChampion + p.toRunner + p.toSemi * 2n + p.rake).toBe(p.pot);
      // The champion's share is 55% plus whatever dust integer division left.
      expect(p.toChampion).toBeGreaterThanOrEqual((p.net * 5_500n) / 10_000n);
      expect(p.toChampion - (p.net * 5_500n) / 10_000n).toBeLessThan(4n);
    }
  });

  it('matches the SOL-level display maths the UI shows', () => {
    for (const stake of STAKE_TIERS) {
      const sol = bracketPayoutSol(stake);
      const lam = bracketPayout(BigInt(Math.round(stake * 1e9)));
      expect(Math.round(sol.champion * 1e9)).toBe(Number(lam.toChampion));
      expect(Math.round(sol.runnerUp * 1e9)).toBe(Number(lam.toRunner));
      expect(Math.round(sol.semiLoser * 1e9)).toBe(Number(lam.toSemi));
      expect(Math.round(sol.rake * 1e9)).toBe(Number(lam.rake));
    }
  });
});
