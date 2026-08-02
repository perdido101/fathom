import type { MatchRecord } from './harness';
import { DRAFTABLE_CARD_IDS, BASIC_SALVO_ID } from '../content/cards';
import { SHIP_IDS } from '../content/ships';
import { MODIFIER_IDS } from '../content/modifiers';

export interface BalanceBands {
  matchLengthMedian: [number, number];
  firstPlayerWinRate: [number, number];
  /** Share of draftable-card plays per card, in matches where it was drafted. */
  cardUsageShare: [number, number];
  cardUsageMinSample: number;
  shipWinRateMax: number;
  shipWinRateMinSample: number;
  endgameDragMedianMax: number;
  stalemateCapPlies: number;
  /** Median shots to sink the final ship (diagonal-specific canary). */
  shotsToFinalShipMedianMax: number;
  /** Max win-rate shift by modifier for the more-detection player, in points. */
  modifierNeutralityMaxShift: number;
  modifierMinSample: number;
  /** Median distinct cards played per match, for players who drafted 5. */
  distinctCardsMedianMin: number;
  /** Median energy spent per turn. */
  energyPerTurn: [number, number];
  /** Median peak energy bank. */
  peakBankMedianMax: number;
  /** Win rate of the player who lands the first hit. */
  firstHitWinRateMax: number;
}

export const DEFAULT_BANDS: BalanceBands = {
  matchLengthMedian: [18, 34],
  firstPlayerWinRate: [0.47, 0.53],
  cardUsageShare: [0.03, 0.4],
  cardUsageMinSample: 30,
  shipWinRateMax: 0.6,
  shipWinRateMinSample: 30,
  endgameDragMedianMax: 6,
  stalemateCapPlies: 120,
  shotsToFinalShipMedianMax: 12,
  modifierNeutralityMaxShift: 0.06,
  modifierMinSample: 150,
  distinctCardsMedianMin: 4,
  energyPerTurn: [2, 5],
  peakBankMedianMax: 14,
  firstHitWinRateMax: 0.62,
};

export interface CardStat {
  id: string;
  draftedIn: number;
  plays: number;
  totalDraftablePlays: number;
  share: number | null;
}

export interface ShipStat {
  id: string;
  draftedIn: number;
  wins: number;
  winRate: number | null;
}

export interface ModifierStat {
  id: string;
  matches: number;
  /** Matches where one side had strictly more detection cards. */
  detectionSkewed: number;
  /** Win rate of the more-detection player in those matches. */
  detectionWinRate: number | null;
}

export interface SimSummary {
  matches: number;
  stalemates: number;
  medianPlies: number;
  pliesByRound: Record<number, number>;
  firstPlayerWinRate: number;
  endgameDragMedian: number;
  shotsToFinalShipMedian: number;
  maxPlies: number;
  burnLeaks: number;
  /** Median distinct cards played by players who drafted 5 cards. */
  distinctCardsMedian: number;
  distinctCardsSample: number;
  medianEnergyPerTurn: number;
  medianPeakBank: number;
  firstHitWinRate: number | null;
  firstHitSample: number;
  cards: CardStat[];
  ships: ShipStat[];
  modifiers: ModifierStat[];
  /** Overall win rate of the more-detection player (baseline for neutrality). */
  detectionWinRateOverall: number | null;
}

export interface AssertionResult {
  name: string;
  pass: boolean;
  detail: string;
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function summarize(records: MatchRecord[]): SimSummary {
  const plies = records.map((r) => r.plies);
  const byRound: Record<number, number> = {};
  for (const round of new Set(records.map((r) => r.round))) {
    byRound[round] = median(records.filter((r) => r.round === round).map((r) => r.plies));
  }
  const fpWins = records.filter((r) => r.winner === r.firstPlayer).length;
  const drags = records.map((r) => r.endgameDrag).filter((d): d is number => d !== null);
  const finals = records.map((r) => r.shotsToFinalShip).filter((d): d is number => d !== null);

  const cards: CardStat[] = DRAFTABLE_CARD_IDS.map((id) => {
    let draftedIn = 0;
    let plays = 0;
    let totalDraftablePlays = 0;
    for (const r of records) {
      for (const p of [0, 1] as const) {
        if (!r.drafted[p].cards.includes(id)) continue;
        draftedIn += 1;
        plays += r.cardPlays[p][id] ?? 0;
        for (const [cid, n] of Object.entries(r.cardPlays[p])) {
          if (cid !== BASIC_SALVO_ID) totalDraftablePlays += n;
        }
      }
    }
    return {
      id,
      draftedIn,
      plays,
      totalDraftablePlays,
      share: totalDraftablePlays > 0 ? plays / totalDraftablePlays : null,
    };
  });

  const ships: ShipStat[] = SHIP_IDS.map((id) => {
    let draftedIn = 0;
    let wins = 0;
    for (const r of records) {
      for (const p of [0, 1] as const) {
        if (!r.drafted[p].ships.includes(id)) continue;
        draftedIn += 1;
        if (r.winner === p) wins += 1;
      }
    }
    return { id, draftedIn, wins, winRate: draftedIn > 0 ? wins / draftedIn : null };
  });

  // Modifier neutrality: win rate of the player who drafted more detection.
  let skewedAll = 0;
  let skewedWinsAll = 0;
  const modifiers: ModifierStat[] = MODIFIER_IDS.map((id) => {
    const ofMod = records.filter((r) => r.modifierId === id);
    let skewed = 0;
    let wins = 0;
    for (const r of ofMod) {
      const [d0, d1] = r.detectCounts;
      if (d0 === d1) continue;
      skewed += 1;
      const moreDetect = d0 > d1 ? 0 : 1;
      if (r.winner === moreDetect) wins += 1;
    }
    skewedAll += skewed;
    skewedWinsAll += wins;
    return {
      id,
      matches: ofMod.length,
      detectionSkewed: skewed,
      detectionWinRate: skewed > 0 ? wins / skewed : null,
    };
  });

  // Card diversity: only players who drafted a full 5-card tray count.
  const distinctCounts: number[] = [];
  const energyPerTurn: number[] = [];
  const peaks: number[] = [];
  let firstHitWins = 0;
  let firstHitSample = 0;
  for (const r of records) {
    for (const p of [0, 1] as const) {
      if (r.drafted[p].cards.length >= 5) {
        distinctCounts.push(
          Object.keys(r.cardPlays[p]).filter((id) => id !== BASIC_SALVO_ID).length,
        );
      }
      if (r.turnsTaken[p] > 0) energyPerTurn.push(r.energySpent[p] / r.turnsTaken[p]);
      peaks.push(r.peakBank[p]);
    }
    if (r.firstHitBy !== null && !r.stalemate) {
      firstHitSample += 1;
      if (r.winner === r.firstHitBy) firstHitWins += 1;
    }
  }

  return {
    matches: records.length,
    stalemates: records.filter((r) => r.stalemate).length,
    distinctCardsMedian: median(distinctCounts),
    distinctCardsSample: distinctCounts.length,
    medianEnergyPerTurn: Math.round(median(energyPerTurn) * 100) / 100,
    medianPeakBank: median(peaks),
    firstHitWinRate: firstHitSample > 0 ? firstHitWins / firstHitSample : null,
    firstHitSample,
    medianPlies: median(plies),
    pliesByRound: byRound,
    firstPlayerWinRate: records.length > 0 ? fpWins / records.length : 0,
    endgameDragMedian: median(drags),
    shotsToFinalShipMedian: median(finals),
    maxPlies: Math.max(0, ...plies),
    burnLeaks: records.reduce((s, r) => s + r.burnLeaks, 0),
    cards,
    ships,
    modifiers,
    detectionWinRateOverall: skewedAll > 0 ? skewedWinsAll / skewedAll : null,
  };
}

export function assertBands(summary: SimSummary, bands: BalanceBands = DEFAULT_BANDS): AssertionResult[] {
  const out: AssertionResult[] = [];
  const [lenLo, lenHi] = bands.matchLengthMedian;
  out.push({
    name: 'Match length',
    pass: summary.medianPlies >= lenLo && summary.medianPlies <= lenHi,
    detail: `median ${summary.medianPlies} plies (band ${lenLo}–${lenHi})`,
  });
  const [fpLo, fpHi] = bands.firstPlayerWinRate;
  out.push({
    name: 'Draft symmetry / first player',
    pass: summary.firstPlayerWinRate >= fpLo && summary.firstPlayerWinRate <= fpHi,
    detail: `first player wins ${(summary.firstPlayerWinRate * 100).toFixed(1)}% (band ${fpLo * 100}–${fpHi * 100}%)`,
  });
  const [useLo, useHi] = bands.cardUsageShare;
  for (const c of summary.cards) {
    if (c.draftedIn < bands.cardUsageMinSample || c.share === null) continue;
    out.push({
      name: `Card usage: ${c.id}`,
      pass: c.share >= useLo && c.share <= useHi,
      detail: `${(c.share * 100).toFixed(1)}% of draftable plays where drafted (band ${useLo * 100}–${useHi * 100}%), n=${c.draftedIn}`,
    });
  }
  for (const s of summary.ships) {
    if (s.draftedIn < bands.shipWinRateMinSample || s.winRate === null) continue;
    out.push({
      name: `Ship win rate: ${s.id}`,
      pass: s.winRate <= bands.shipWinRateMax,
      detail: `${(s.winRate * 100).toFixed(1)}% (max ${bands.shipWinRateMax * 100}%), n=${s.draftedIn}`,
    });
  }
  out.push({
    name: 'Endgame drag',
    pass: summary.endgameDragMedian < bands.endgameDragMedianMax,
    detail: `median ${summary.endgameDragMedian} plies from last-ship to match over (max ${bands.endgameDragMedianMax})`,
  });
  out.push({
    name: 'Profile sufficiency',
    pass: summary.shotsToFinalShipMedian < bands.shotsToFinalShipMedianMax,
    detail: `median ${summary.shotsToFinalShipMedian} shots to sink the final ship (max ${bands.shotsToFinalShipMedianMax})`,
  });
  out.push({
    name: 'No stalemates',
    pass: summary.stalemates === 0 && summary.maxPlies <= bands.stalemateCapPlies,
    detail: `${summary.stalemates} stalemates, longest match ${summary.maxPlies} plies (cap ${bands.stalemateCapPlies})`,
  });
  if (summary.distinctCardsSample > 0) {
    out.push({
      name: 'Card diversity',
      pass: summary.distinctCardsMedian >= bands.distinctCardsMedianMin,
      detail: `median ${summary.distinctCardsMedian} distinct cards played per match by full-tray players (min ${bands.distinctCardsMedianMin}), n=${summary.distinctCardsSample}`,
    });
  }
  const [spendLo, spendHi] = bands.energyPerTurn;
  out.push({
    name: 'Economy shape: spend',
    pass: summary.medianEnergyPerTurn >= spendLo && summary.medianEnergyPerTurn <= spendHi,
    detail: `median ${summary.medianEnergyPerTurn} energy spent per turn (band ${spendLo}–${spendHi})`,
  });
  out.push({
    name: 'Economy shape: bank',
    pass: summary.medianPeakBank < bands.peakBankMedianMax,
    detail: `median peak bank ${summary.medianPeakBank} (max ${bands.peakBankMedianMax})`,
  });
  if (summary.firstHitWinRate !== null) {
    out.push({
      name: 'Snowball check',
      pass: summary.firstHitWinRate < bands.firstHitWinRateMax,
      detail: `first-hit player wins ${(summary.firstHitWinRate * 100).toFixed(1)}% (max ${bands.firstHitWinRateMax * 100}%), n=${summary.firstHitSample}`,
    });
  }
  out.push({
    name: 'Burn integrity',
    pass: summary.burnLeaks === 0,
    detail: `${summary.burnLeaks} burned-card leaks in client-visible draft state`,
  });
  const base = summary.detectionWinRateOverall;
  for (const m of summary.modifiers) {
    if (base === null || m.detectionSkewed < bands.modifierMinSample || m.detectionWinRate === null) {
      continue;
    }
    const shift = Math.abs(m.detectionWinRate - base);
    out.push({
      name: `Modifier neutrality: ${m.id}`,
      pass: shift <= bands.modifierNeutralityMaxShift,
      detail: `detection-player win rate ${(m.detectionWinRate * 100).toFixed(1)}% vs baseline ${(base * 100).toFixed(1)}% (shift ${(shift * 100).toFixed(1)}pt, max ${bands.modifierNeutralityMaxShift * 100}pt), n=${m.detectionSkewed}`,
    });
  }
  return out;
}
