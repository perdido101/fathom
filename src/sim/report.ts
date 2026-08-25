import type { MatchOutcomeRecord } from './runner';
import { CARD_IDS, CARDS } from '../engine/cards';
import { SHIPS, SHIP_IDS } from '../engine/ships';
import { BALANCE } from '../engine/balance';
import type { Level } from '../bots/bot';

/**
 * The balance report.
 *
 * Every band below comes straight from the build prompt. Nothing here tunes
 * anything — a failing band prints the number that failed and how far off it
 * is, and that is the end of the machine's involvement. Changing a card is a
 * decision, not a search.
 */

export interface Band {
  name: string;
  ok: boolean;
  detail: string;
  /** Bands that only report a number have no pass/fail. */
  informational?: boolean;
}

export interface PairingReport {
  pairing: string;
  matches: number;
  bands: Band[];
  histogram: { round: number; count: number }[];
  medianRounds: number;
  drawRate: number;
  timeoutRate: number;
  firstBloodWinRate: number;
  medianChargesOnFire: number;
  cardUse: {
    id: string;
    drafted: number;
    fired: number;
    rate: number;
    medianCharges: number;
    /** Win rate of the seat that fired it, over the matches where it fired. */
    winRateWhenFired: number;
    firedCount: number;
  }[];
  shipUse: { id: string; drafted: number; used: number; rate: number }[];
  shipWinRate: { id: string; drafted: number; winRate: number }[];
  prediction: { id: string; fired: number; winRateWhenFired: number; baseline: number }[];
  comebackRate: number;
  comebackSample: number;
  chargeHistogram: { charges: number; count: number }[];
  winRate: [number, number];
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = values.slice().sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function analyse(
  records: MatchOutcomeRecord[],
  levels: [Level, Level],
  /**
   * Whether this pairing drafted blind. Per-ship and per-card win rates only
   * mean anything when every piece had an equal chance of being picked; under
   * the bot's value table four ships are never drafted at all and two cards
   * only ever arrive from the pile, which quietly turns those numbers into a
   * measurement of the bot's opinions.
   */
  unbiasedDraft = false,
): PairingReport {
  // A pairing of unequal bots cannot say anything about the game's balance in
  // the metrics that compare the two seats. Of course the stronger bot wins
  // more after drawing first blood, and of course the weaker one rarely comes
  // back — that is what "stronger" means. Those bands are reported for the
  // mismatch pairings and scored only for the mirrors.
  const symmetric = levels[0] === levels[1];
  const n = records.length;
  const rounds = records.map((r) => r.rounds);
  const med = median(rounds);
  const draws = records.filter((r) => r.result === 'draw').length;
  const mutualDraws = records.filter((r) => r.reason === 'draw:mutual').length;
  const cellDraws = records.filter((r) => r.reason === 'draw:cells').length;
  // How many mutual eliminations were not actually level going into the last
  // round. These are the draws a tiebreak could convert into results.
  const breakableDraws = records.filter(
    (r) => r.reason === 'draw:mutual' && r.hullBeforeLast[0] !== r.hullBeforeLast[1],
  ).length;
  const timeouts = records.filter((r) => r.reason === 'cells' || r.reason === 'draw:cells').length;

  const firstBloodMatches = records.filter((r) => r.firstBlood !== null);
  const firstBloodWins = firstBloodMatches.filter(
    (r) => (r.firstBlood === 0 && r.result === 'p0') || (r.firstBlood === 1 && r.result === 'p1'),
  ).length;

  // Card usage, counted per player-slot: a card drafted by both players in one
  // match is two chances for it to be fired.
  const drafted = new Map<string, number>();
  const fired = new Map<string, number>();
  const chargeSamples = new Map<string, number[]>();
  const allCharges: number[] = [];
  for (const r of records) {
    for (const side of [0, 1] as const) {
      const seenFired = new Set(r.fired[side].map((f) => f.defId));
      for (const id of new Set(r.drafted[side])) {
        drafted.set(id, (drafted.get(id) ?? 0) + 1);
        if (seenFired.has(id)) fired.set(id, (fired.get(id) ?? 0) + 1);
      }
      for (const f of r.fired[side]) {
        allCharges.push(f.charges);
        const list = chargeSamples.get(f.defId) ?? [];
        list.push(f.charges);
        chargeSamples.set(f.defId, list);
      }
    }
  }

  const shipDrafted = new Map<string, number>();
  const shipUsed = new Map<string, number>();
  for (const r of records) {
    for (const side of [0, 1] as const) {
      const used = new Set(r.abilitiesUsed[side]);
      for (const id of r.abilityShips[side]) {
        shipDrafted.set(id, (shipDrafted.get(id) ?? 0) + 1);
        if (used.has(id)) shipUsed.set(id, (shipUsed.get(id) ?? 0) + 1);
      }
    }
  }

  // Win rate of the seat that fired each card. Firing a card at all correlates
  // with having had a good match, so this number is only meaningful read
  // against the other eleven — it is a ranking, not an absolute.
  const seatScoreEarly = (r: MatchOutcomeRecord, side: 0 | 1): number =>
    r.result === 'draw' ? 0.5 : (side === 0) === (r.result === 'p0') ? 1 : 0;
  const firedOutcome = new Map<string, { score: number; count: number }>();
  for (const r of records) {
    for (const side of [0, 1] as const) {
      for (const id of new Set(r.fired[side].map((f) => f.defId))) {
        const cur = firedOutcome.get(id) ?? { score: 0, count: 0 };
        cur.score += seatScoreEarly(r, side);
        cur.count += 1;
        firedOutcome.set(id, cur);
      }
    }
  }

  const cardUse = CARD_IDS.map((id) => {
    const d = drafted.get(id) ?? 0;
    const f = fired.get(id) ?? 0;
    const o = firedOutcome.get(id) ?? { score: 0, count: 0 };
    return {
      id,
      drafted: d,
      fired: f,
      rate: d ? f / d : 0,
      medianCharges: median(chargeSamples.get(id) ?? []),
      winRateWhenFired: o.count ? o.score / o.count : 0.5,
      firedCount: o.count,
    };
  });

  const shipUse = SHIP_IDS.filter((id) => SHIPS[id].type !== 'REACT').map((id) => {
    const d = shipDrafted.get(id) ?? 0;
    const u = shipUsed.get(id) ?? 0;
    return { id, drafted: d, used: u, rate: d ? u / d : 0 };
  });

  const drawRate = draws / n;
  const timeoutRate = timeouts / n;
  const fbRate = firstBloodMatches.length ? firstBloodWins / firstBloodMatches.length : 0;
  const medCharges = median(allCharges);

  // Per-ship win rate, counted only where exactly one side fielded the ship.
  //
  // Counting collisions would be worse than useless: when both players draft
  // the same ship it scores once for the winner and once for the loser, which
  // drags every number towards 50% and, in a pairing where both bots draft
  // identically, pins all twelve at exactly 50% and hides everything.
  const shipWins = new Map<string, { drafted: number; score: number }>();
  for (const r of records) {
    for (const side of [0, 1] as const) {
      const theirs = new Set(r.shipsDrafted[side === 0 ? 1 : 0]);
      const won = (side === 0 && r.result === 'p0') || (side === 1 && r.result === 'p1');
      const score = r.result === 'draw' ? 0.5 : won ? 1 : 0;
      for (const id of r.shipsDrafted[side]) {
        if (theirs.has(id)) continue; // both fielded it; tells us nothing
        const cur = shipWins.get(id) ?? { drafted: 0, score: 0 };
        cur.drafted += 1;
        cur.score += score;
        shipWins.set(id, cur);
      }
    }
  }
  const shipWinRate = SHIP_IDS.map((id) => {
    const cur = shipWins.get(id) ?? { drafted: 0, score: 0 };
    return { id, drafted: cur.drafted, winRate: cur.drafted ? cur.score / cur.drafted : 0.5 };
  });

  // What the prediction cards are actually worth. Measured against the win
  // rate of the same seat over the same sample, so seat advantage cancels.
  const seatScore = seatScoreEarly;
  let baseScore = 0;
  let baseCount = 0;
  for (const r of records) {
    for (const side of [0, 1] as const) {
      baseScore += seatScore(r, side);
      baseCount += 1;
    }
  }
  const baseline = baseCount ? baseScore / baseCount : 0.5;
  const prediction = ['mirror', 'ambush'].map((id) => {
    let score = 0;
    let count = 0;
    for (const r of records) {
      for (const side of [0, 1] as const) {
        if (!r.fired[side].some((f) => f.defId === id)) continue;
        score += seatScore(r, side);
        count += 1;
      }
    }
    return { id, fired: count, winRateWhenFired: count ? score / count : 0, baseline };
  });

  // Comeback rate: of the matches that were uneven at the top of round 8, how
  // often did the player who was behind go on to win?
  let behindWins = 0;
  let behindSample = 0;
  for (const r of records) {
    const [a, b] = r.hullAtRound8;
    if (a === b) continue;
    if (r.rounds < 8) continue; // never reached the midpoint
    behindSample += 1;
    const behind: 0 | 1 = a < b ? 0 : 1;
    if ((behind === 0 && r.result === 'p0') || (behind === 1 && r.result === 'p1')) behindWins += 1;
  }
  const comebackRate = behindSample ? behindWins / behindSample : 0;

  const chargeCounts = new Map<number, number>();
  for (const c of allCharges) chargeCounts.set(c, (chargeCounts.get(c) ?? 0) + 1);
  const chargeHistogram = Array.from(chargeCounts, ([charges, count]) => ({ charges, count })).sort(
    (x, y) => x.charges - y.charges,
  );

  const brokenShips = shipWinRate.filter(
    (sw) => sw.drafted >= 50 && (sw.winRate > 0.58 || sw.winRate < 0.42),
  );

  const deadCards = cardUse.filter((c) => c.drafted > 0 && c.rate < 0.05);
  const deadShips = shipUse.filter((s) => s.drafted > 0 && s.rate < 0.2);

  const bands: Band[] = [
    {
      name: 'Median match length 10-16 rounds',
      ok: med >= 10 && med <= 16,
      detail: `median ${med}, p10 ${percentile(rounds, 0.1)}, p90 ${percentile(rounds, 0.9)}, max ${Math.max(...rounds)}`,
    },
    {
      name: 'Round-20 timeouts under 5%',
      ok: timeoutRate < 0.05,
      detail: `${pct(timeoutRate)} (${timeouts}/${n})`,
    },
    {
      name: 'Draws under 8%',
      ok: drawRate < 0.08,
      // The cause matters more than the rate: mutual elimination is the
      // simultaneous-resolve rule working as designed, while a round-20 draw
      // on equal hull cells is a stalemate nobody enjoyed.
      detail:
        `${pct(drawRate)} (${draws}/${n}) — mutual ${mutualDraws}, round-20 ${cellDraws}; ` +
        `${breakableDraws} of the mutual ones entered the final round with unequal hulls, ` +
        `so a hull-count tiebreak would leave ${pct((draws - breakableDraws) / n)}`,
    },
    {
      name: 'Every card fired in >=5% of matches where drafted',
      ok: deadCards.length === 0,
      detail: deadCards.length
        ? deadCards.map((c) => `${CARDS[c.id].name} ${pct(c.rate)}`).join(', ')
        : 'all twelve clear the bar',
    },
    {
      name: 'Every ACTIVE/NERF used in >=20% of matches where drafted',
      ok: deadShips.length === 0,
      detail: deadShips.length
        ? deadShips.map((s) => `${SHIPS[s.id].name} ${pct(s.rate)}`).join(', ')
        : 'all eight clear the bar',
    },
    {
      name: 'First-blood win rate under 65%',
      ok: !symmetric || fbRate < 0.65,
      informational: !symmetric,
      detail: `${pct(fbRate)} over ${firstBloodMatches.length} decided matches`,
    },
    {
      name: 'Median charges on a card when fired',
      ok: true,
      informational: true,
      detail:
        `median ${medCharges} — ` +
        chargeHistogram.map((h) => `${h.charges}:${pct(h.count / allCharges.length)}`).join(' '),
    },
    {
      name: 'Prediction cards strong but not dominant',
      ok: !unbiasedDraft || prediction.every((p) => p.fired === 0 || p.winRateWhenFired < 0.62),
      informational: !unbiasedDraft,
      detail: prediction
        .map((p) =>
          p.fired === 0
            ? `${CARDS[p.id].name} never fired`
            : `${CARDS[p.id].name} ${pct(p.winRateWhenFired)} over ${p.fired} (baseline ${pct(p.baseline)})`,
        )
        .join(', '),
    },
    {
      name: 'Per-ship win rate inside 42-58%',
      ok: !unbiasedDraft || brokenShips.length === 0,
      informational: !unbiasedDraft,
      detail: brokenShips.length
        ? brokenShips
            .map((sw) => `${SHIPS[sw.id].name} ${pct(sw.winRate)} (n=${sw.drafted})`)
            .join(', ')
        : shipWinRate.every((sw) => sw.drafted < 50)
          ? 'no uncontested sample — both bots draft identically in this pairing, so every ship was fielded by both sides and nothing can be measured'
          : `all twelve inside the band (spread ${pct(Math.min(...shipWinRate.filter((x) => x.drafted >= 50).map((x) => x.winRate)))}-${pct(Math.max(...shipWinRate.filter((x) => x.drafted >= 50).map((x) => x.winRate)))})`,
    },
    {
      name: 'Comeback rate at least 15%',
      ok: !symmetric || comebackRate >= 0.15,
      informational: !symmetric,
      detail: `${pct(comebackRate)} of ${behindSample} matches that were uneven at round 8`,
    },
  ];

  const counts = new Map<number, number>();
  for (const r of rounds) counts.set(r, (counts.get(r) ?? 0) + 1);
  const histogram = Array.from(counts, ([round, count]) => ({ round, count })).sort(
    (a, b) => a.round - b.round,
  );

  return {
    pairing: `L${levels[0]} vs L${levels[1]}`,
    matches: n,
    bands,
    histogram,
    medianRounds: med,
    drawRate,
    timeoutRate,
    firstBloodWinRate: fbRate,
    medianChargesOnFire: medCharges,
    cardUse,
    shipUse,
    shipWinRate,
    prediction,
    comebackRate,
    comebackSample: behindSample,
    chargeHistogram,
    winRate: [
      records.filter((r) => r.result === 'p0').length / n,
      records.filter((r) => r.result === 'p1').length / n,
    ],
  };
}

function percentile(values: number[], q: number): number {
  if (!values.length) return 0;
  const s = values.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

export function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

export function renderMarkdown(reports: PairingReport[]): string {
  const lines: string[] = [];
  lines.push('# Shadow Armada — balance report');
  lines.push('');
  lines.push(
    'Generated by `npm run sim`. Every band below is quoted from the build prompt. No value in',
    '`src/engine/balance.ts` was changed to make a band pass; where a band fails, the number is',
    'reported as measured and a change is proposed in the summary rather than applied.',
  );
  lines.push('');
  lines.push('## Constants in force');
  lines.push('');
  lines.push('| Constant | Value |');
  lines.push('| --- | --- |');
  for (const [k, v] of Object.entries(BALANCE)) lines.push(`| \`${k}\` | ${v} |`);
  lines.push('');

  for (const r of reports) {
    lines.push(`## ${r.pairing} — ${r.matches} matches`);
    lines.push('');
    lines.push('| Band | Result | Measured |');
    lines.push('| --- | --- | --- |');
    for (const b of r.bands) {
      const mark = b.informational ? 'report' : b.ok ? 'PASS' : 'FAIL';
      lines.push(`| ${b.name} | ${mark} | ${b.detail} |`);
    }
    lines.push('');
    lines.push(
      `Win rate: P0 ${pct(r.winRate[0])} / P1 ${pct(r.winRate[1])} / draw ${pct(r.drawRate)}`,
    );
    lines.push('');
    lines.push('### Match length distribution');
    lines.push('');
    lines.push('| Rounds | Matches | |');
    lines.push('| --- | --- | --- |');
    const top = Math.max(...r.histogram.map((h) => h.count), 1);
    for (const h of r.histogram) {
      const bar = '#'.repeat(Math.max(1, Math.round((h.count / top) * 30)));
      lines.push(`| ${h.round} | ${h.count} | \`${bar}\` |`);
    }
    lines.push('');
    lines.push('### Card usage');
    lines.push('');
    lines.push('| Card | Drafted | Fired | Rate | Median charges | Win rate when fired |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const c of r.cardUse.slice().sort((a, b) => b.winRateWhenFired - a.winRateWhenFired)) {
      lines.push(
        `| ${CARDS[c.id].name} | ${c.drafted} | ${c.fired} | ${pct(c.rate)} | ${c.medianCharges} | ${pct(c.winRateWhenFired)} (n=${c.firedCount}) |`,
      );
    }
    lines.push('');
    lines.push('### Per-ship win rate');
    lines.push('');
    lines.push('Counted only where one side fielded the ship and the other did not.');
    lines.push('');
    lines.push('| Ship | Type | Length | Uncontested drafts | Win rate |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const sw of r.shipWinRate.slice().sort((a, b) => b.winRate - a.winRate)) {
      lines.push(
        `| ${SHIPS[sw.id].name} | ${SHIPS[sw.id].type} | ${SHIPS[sw.id].length} | ${sw.drafted} | ${pct(sw.winRate)} |`,
      );
    }
    lines.push('');
    lines.push('### Prediction cards');
    lines.push('');
    lines.push('| Card | Times fired | Win rate when fired | Baseline |');
    lines.push('| --- | --- | --- | --- |');
    for (const p of r.prediction) {
      lines.push(
        `| ${CARDS[p.id].name} | ${p.fired} | ${p.fired ? pct(p.winRateWhenFired) : '-'} | ${pct(p.baseline)} |`,
      );
    }
    lines.push('');
    lines.push('### Charges when fired');
    lines.push('');
    lines.push('| Charges | Share |');
    lines.push('| --- | --- |');
    const totalFires = r.chargeHistogram.reduce((n, h) => n + h.count, 0) || 1;
    for (const h of r.chargeHistogram) {
      lines.push(`| ${h.charges} | ${pct(h.count / totalFires)} |`);
    }
    lines.push('');
    lines.push('### Ship ability usage');
    lines.push('');
    lines.push('| Ship | Type | Drafted | Used | Rate |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const s of r.shipUse.slice().sort((a, b) => a.rate - b.rate)) {
      lines.push(
        `| ${SHIPS[s.id].name} | ${SHIPS[s.id].type} | ${s.drafted} | ${s.used} | ${pct(s.rate)} |`,
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}
