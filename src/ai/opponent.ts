import type { CellIndex, MatchState, PlayerId, TargetPayload } from '../engine/types';
import { rcCell, cellRC, inBounds, other } from '../engine/types';
import type { MatchAction } from '../engine/actions';
import { SHIPS } from '../content/ships';
import { CARDS } from '../content/cards';
import { hashString, nextFloat, nextInt, type RngState } from '../engine/rng';
import { autoPlaceFleet, type Placement } from '../engine/fleet/placement';
import { isAvailable, isCardPlayable } from '../engine/resolve/availability';
import { effectiveCost, tendersAlive } from '../engine/resolve/energy';
import { reduce } from '../engine/reduce';
import type { ShipDraftState } from '../engine/draft/shipDraft';
import type { CardDraftState } from '../engine/draft/cardDraft';
import { canPickCard } from '../engine/draft/cardDraft';
import {
  densityGrid,
  topCells,
  bestZone,
  bestUnknownZone,
  bestSegment,
  bestTorpedoLane,
  bestBarrageRow,
  fallbackCells,
} from './heuristics';

/**
 * Difficulty by round: deliberate error rate per decision. Early rounds play
 * loose, dropping to flawless by the voyage's final stretch. Config table.
 */
export const AI_ERROR_RATE_BY_ROUND: Record<number, number> = {
  1: 0.2,
  2: 0.2,
  3: 0.15,
  4: 0.1,
  5: 0.05,
  6: 0.02,
  7: 0,
  8: 0,
};

export function aiErrorRate(round: number): number {
  return AI_ERROR_RATE_BY_ROUND[Math.min(Math.max(round, 1), 8)] ?? 0;
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

/**
 * Terrain-aware weighted-random placement: sample seeded auto-placements
 * (all four axes, diagonals included) and keep the best-scoring one.
 */
export function aiPlaceFleet(
  ms: MatchState,
  p: PlayerId,
  rng: RngState,
): [{ placements: Placement[]; mines: CellIndex[] }, RngState] {
  const ps = ms.players[p];
  const w = ms.gridW;
  const h = ms.gridH;
  let st = rng;
  let best: Placement[] | null = null;
  let bestScore = -Infinity;
  for (let attempt = 0; attempt < 24; attempt++) {
    let sample: Placement[] | null;
    [sample, st] = autoPlaceFleet(ps.fleetToPlace, w, h, ms.terrain, st);
    if (!sample) continue;
    const occupied = new Set(sample.flatMap((pl) => pl.cells));
    let score = 0;
    for (const pl of sample) {
      const def = SHIPS[pl.typeId];
      for (const cell of pl.cells) {
        const t = ms.terrain[cell];
        if (def.ability === 'armored' && t === 'TRENCH') score += 2;
        if (t === 'TRENCH') score += 0.5;
        if (def.ability === 'camouflage' && (t === 'REEF' || t === 'FOG')) score += 2;
        if (t === 'SHALLOWS') score -= 1.5; // hits here leak information
        const [r, c] = cellRC(cell, w);
        for (const [nr, nc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]] as [number, number][]) {
          if (!inBounds(nr, nc, w, h)) continue;
          const n = rcCell(nr, nc, w);
          if (occupied.has(n) && !pl.cells.includes(n)) score -= 0.4;
        }
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = sample;
    }
  }
  if (!best) throw new Error('AI could not place fleet');

  const minelayers = best.filter((pl) => SHIPS[pl.typeId].ability === 'deploy').length;
  const occupied = new Set(best.flatMap((pl) => pl.cells));
  const mines: CellIndex[] = [];
  const candidates: CellIndex[] = [];
  for (let c = 0; c < w * h; c++) {
    if (occupied.has(c)) continue;
    if (ms.terrain[c] === 'REEF') continue;
    candidates.push(c);
  }
  for (let i = 0; i < minelayers * 2 && candidates.length > 0; i++) {
    let j: number;
    [j, st] = nextInt(st, candidates.length);
    mines.push(candidates.splice(j, 1)[0]);
  }
  return [{ placements: best, mines }, st];
}

// ---------------------------------------------------------------------------
// Draft (keep one, burn one)
// ---------------------------------------------------------------------------

export const SHIP_BASE_VALUE: Record<string, number> = {
  skiff: 3.4, // one cell, one dodge — disproportionately hard to find
  cutter: 2.4,
  reefrunner: 2.6,
  tender: 3.6, // economy compounds
  frigate: 3.2,
  minelayer: 2.8,
  sonarship: 3.4,
  carrier: 3.3,
  dreadnought: 3.8,
  leviathan: 3.5,
};

export const CARD_BASE_VALUE: Record<string, number> = {
  twin_shot: 3.2,
  line_probe: 2.6,
  depth_charge: 3.0,
  scatter: 2.8,
  buoy: 2.2,
  ballast: 2.4,
  cross_salvo: 3.4,
  sonar_sweep: 3.2,
  torpedo: 3.0,
  barrage: 2.9,
  decoy: 2.3,
  repair: 2.5,
  satellite: 3.8,
  saturation: 3.6,
  wolfpack: 3.4,
  emp: 2.6,
  dredge: 2.7,
  blockade: 2.4,
};

/**
 * Ship pick: keep the best hull, burn the strongest of the rest. In a pack of
 * four the burn denies the opponent directly — the two you pass on are the
 * two they choose between — so burning the second-best is the whole point.
 */
export function aiShipPick(
  ds: ShipDraftState,
  p: PlayerId,
  ownedShips: string[],
  seed: string,
  errorRate: number,
): { keepUid: number; burnUid: number } {
  let st: RngState = hashString(`${seed}:ship:${ds.packIndex}:${ds.stage}:${p}`);
  const inFront = ds.current ?? [];
  if (inFront.length < 2) throw new Error('Nothing to pick from');
  const keptHere = ds.keeps[p].map((k) => k.id);

  const scored = inFront
    .map((item) => {
      let v = SHIP_BASE_VALUE[item.id] ?? 2;
      const copies =
        ownedShips.filter((s2) => s2 === item.id).length +
        keptHere.filter((s2) => s2 === item.id).length;
      v -= copies * 0.9;
      let noise: number;
      [noise, st] = nextFloat(st);
      return { item, value: v + noise * 0.4 };
    })
    .sort((a, b) => b.value - a.value);

  let roll: number;
  [roll, st] = nextFloat(st);
  if (roll < errorRate && inFront.length >= 2) {
    let i: number;
    let j: number;
    [i, st] = nextInt(st, inFront.length);
    [j, st] = nextInt(st, inFront.length - 1);
    if (j >= i) j += 1;
    return { keepUid: inFront[i].uid, burnUid: inFront[j].uid };
  }
  return { keepUid: scored[0].item.uid, burnUid: scored[1].item.uid };
}

/**
 * Open-row card pick: value with need adjustments, plus denial — when its own
 * need is marginal the bot takes the pick the opponent most wants. The row is
 * public, so denial is a legitimate read rather than a guess.
 */
export function aiCardPick(
  ds: CardDraftState,
  p: PlayerId,
  ownedCards: string[],
  seed: string,
  errorRate: number,
): string {
  let st: RngState = hashString(`${seed}:card:${ds.idx}:${p}`);
  const hasDetect = ownedCards.some((id) => CARDS[id]?.tags.includes('detect'));
  const attackCount = ownedCards.filter((id) => CARDS[id]?.tags.includes('attack')).length;

  const options = [...new Set(ds.pool)]
    .filter((id) => canPickCard(ds, p, id))
    .map((id) => {
      let v = CARD_BASE_VALUE[id] ?? 2;
      const def = CARDS[id];
      if (def?.tags.includes('detect') && !hasDetect) v += 1.4;
      if (def?.tags.includes('attack') && attackCount >= 4) v -= 0.4;
      v -= ownedCards.filter((c) => c === id).length * 0.5;
      let noise: number;
      [noise, st] = nextFloat(st);
      return { id, value: v + noise * 0.4 };
    })
    .sort((a, b) => b.value - a.value);

  if (options.length === 0) throw new Error('No legal card pick');

  let roll: number;
  [roll, st] = nextFloat(st);
  if (roll < errorRate) {
    let i: number;
    [i, st] = nextInt(st, options.length);
    return options[i].id;
  }
  // Denial: when our top two are near-equal, take whichever the opponent
  // would want more.
  if (options.length >= 2 && options[0].value - options[1].value < 0.35) {
    const byRaw = options
      .slice(0, 3)
      .sort((a, b) => (CARD_BASE_VALUE[b.id] ?? 0) - (CARD_BASE_VALUE[a.id] ?? 0));
    return byRaw[0].id;
  }
  return options[0].id;
}

// ---------------------------------------------------------------------------
// Turn play
// ---------------------------------------------------------------------------

interface Candidate {
  action: MatchAction;
  score: number;
  label: string;
}

/**
 * Greedy utility per playable card: expected damage plus expected information
 * in "expected hits" units, softened by sqrt(cost). Diminishing returns per
 * card keep any one card from dominating. Banks when nothing scores.
 */
function candidateFor(
  ms: MatchState,
  p: PlayerId,
  cardUid: number,
  typeId: string,
  weights: number[],
): Candidate | null {
  const def = CARDS[typeId];
  const ps = ms.players[p];
  const cost = Math.max(1, effectiveCost(ms, ps, def));
  const effect = def.effect;
  const w = ms.gridW;
  const h = ms.gridH;
  const priorPlays = ms.stats.cardPlays[p][typeId] ?? 0;
  const variety = def.id === 'basic_salvo' ? 1 : 1 / (1 + 0.25 * priorPlays);
  // Endgame: with 1–2 enemy ships left, finding beats shooting — probes
  // localise the survivor far cheaper than a blind sweep.
  const enemyRemaining = ms.players[other(p)].ships.length - ps.enemySunkLengths.length;
  // Hunting one small survivor, a zero-count sweep is worth far more than a
  // shot: it clears nine cells from the search for the price of three.
  const probeBoost = enemyRemaining <= 1 ? 2 : enemyRemaining <= 2 ? 1.6 : 1;
  const mk = (target: TargetPayload, raw: number): Candidate => ({
    action: { type: 'PLAY_CARD', player: p, cardUid, target },
    score: (raw * variety) / Math.sqrt(cost),
    label: def.id,
  });
  const maxW = Math.max(1, ...weights);
  const norm = (wt: number) => wt / maxW;
  const sumVal = (cells: number[]) => cells.reduce((s, c) => s + norm(weights[c]), 0);

  switch (effect.kind) {
    case 'fire_cells': {
      const cells = topCells(weights, effect.count);
      if (cells.length < effect.count) {
        const fb = fallbackCells(ms, p);
        while (cells.length < effect.count && fb.length > 0) {
          const c = fb.find((x) => !cells.includes(x));
          if (c === undefined) break;
          cells.push(c);
        }
      }
      if (cells.length < effect.count) return null;
      return mk({ cells }, sumVal(cells) || 0.1);
    }
    case 'fire_scatter': {
      const zone = bestZone(ms, weights, effect.zone);
      if (zone.score <= 0) return null;
      const mean = norm(zone.score) / (effect.zone * effect.zone);
      return mk({ origin: zone.origin }, mean * effect.shots);
    }
    case 'fire_plus': {
      let best: { centre: number; raw: number } | null = null;
      for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c++) {
          const cells: number[] = [rcCell(r, c, w)];
          if (r > 0) cells.push(rcCell(r - 1, c, w));
          if (r < h - 1) cells.push(rcCell(r + 1, c, w));
          if (c > 0) cells.push(rcCell(r, c - 1, w));
          if (c < w - 1) cells.push(rcCell(r, c + 1, w));
          const raw = sumVal(cells);
          if (!best || raw > best.raw) best = { centre: rcCell(r, c, w), raw };
        }
      }
      if (!best || best.raw <= 0) return null;
      return mk({ origin: best.centre }, best.raw);
    }
    case 'fire_row_sweep': {
      const row = bestBarrageRow(ms, weights);
      if (row.score <= 0) return null;
      return mk({ line: row.line }, norm(row.score) * 0.75);
    }
    case 'fire_torpedo': {
      const lane = bestTorpedoLane(ms, p, weights);
      if (lane.score <= 0) return null;
      return mk({ line: lane.line }, Math.min(2.5, norm(lane.score) * 1.5 + 0.3));
    }
    case 'fire_zone': {
      const zone = bestZone(ms, weights, effect.zone);
      if (zone.score <= 0) return null;
      return mk({ origin: zone.origin }, norm(zone.score));
    }
    case 'fire_marked_column': {
      let best: { col: number; score: number } | null = null;
      for (let col = 0; col < w; col++) {
        let fired = false;
        let score = 0;
        for (let r = 0; r < h; r++) {
          const cell = rcCell(r, col, w);
          if (ps.intel[cell].fired) fired = true;
          score += weights[cell];
        }
        if (fired && (!best || score > best.score)) best = { col, score };
      }
      if (!best || best.score <= 0) return null;
      return mk({ colIndex: best.col }, norm(best.score));
    }
    case 'probe_line': {
      const seg = bestSegment(ms, p, effect.length);
      if (seg.unknown <= 1) return null;
      return mk({ cells: seg.cells }, seg.unknown * 0.55 * probeBoost);
    }
    case 'fire_probe_adjacent': {
      const cells = topCells(weights, 1);
      if (cells.length === 0) return null;
      return mk({ cells }, norm(weights[cells[0]]) + 0.5);
    }
    case 'probe_delayed': {
      const cells = topCells(weights, 1);
      if (cells.length === 0) return null;
      return mk({ cells }, 0.65 * probeBoost);
    }
    case 'probe_zone_count': {
      const zone = bestUnknownZone(ms, p, effect.zone);
      if (zone.unknown <= 2) return null;
      return mk({ origin: zone.origin }, zone.unknown * 0.4 * probeBoost);
    }
    case 'reveal_zone': {
      const zone = bestUnknownZone(ms, p, effect.zone);
      if (zone.unknown <= 3) return null;
      return mk({ origin: zone.origin }, zone.unknown * 0.52 * probeBoost);
    }
    case 'energy_delayed':
      return mk({}, ps.energy <= 4 ? 0.9 : 0.2);
    case 'decoy': {
      const occupied = new Set(ps.ships.flatMap((s) => s.cells));
      const empties: CellIndex[] = [];
      for (let c = 0; c < w * h; c++) {
        if (!occupied.has(c) && ms.terrain[c] !== 'REEF') empties.push(c);
      }
      if (empties.length < effect.count || ps.decoys.length > 0) return null;
      // A decoy is worth roughly the shots it wastes: most valuable while the
      // enemy is still sweeping wide and cheap shots are landing on us.
      const beingHunted = ms.players[other(p)].shotsFired;
      const decoyValue = beingHunted >= 3 && ps.turnCount <= 10 ? 2.4 : 0.5;
      let st: RngState = hashString(`${ms.seed}:decoy:${ms.turn}`);
      const cells: CellIndex[] = [];
      while (cells.length < effect.count) {
        let i: number;
        [i, st] = nextInt(st, empties.length);
        const c = empties[i];
        if (!cells.includes(c)) cells.push(c);
      }
      return mk({ cells }, decoyValue);
    }
    case 'repair': {
      for (const ship of ps.ships) {
        if (ship.sunk) continue;
        for (let i = 0; i < ship.cells.length; i++) {
          if (ship.damage[i] > 0 && !ship.repaired[i]) {
            // Rebuilding a destroyed section is worth more than patching a
            // dented one: it takes a cell back off the enemy's ledger.
            return mk({ cells: [ship.cells[i]] }, ship.destroyed[i] ? 2.6 : 2.0);
          }
        }
      }
      return null;
    }
    case 'emp': {
      // The enemy's remaining ship COUNT is public via announced sinks.
      const enemyAlive =
        ms.players[other(p)].ships.length - ps.enemySunkLengths.length;
      return mk({}, enemyAlive >= 2 && ms.players[other(p)].empTurns === 0 ? 1.25 + 0.12 * enemyAlive : 0.1);
    }
    case 'blockade': {
      const foe = ms.players[other(p)];
      if (foe.blockadeTurns > 0) return mk({}, 0.05);
      // Only REVEALED enemy cards are knowable — trays are hidden until
      // played — so a seen detect card is strong evidence, not a precondition.
      const seenDetect = foe.tray.some(
        (c) => c.revealed && CARDS[c.typeId].tags.includes('detect') && !c.spent,
      );
      // Our own losses tell us how well they are finding us.
      const ourCellsLost = ps.ships.reduce(
        (n, s2) => n + s2.destroyed.filter(Boolean).length,
        0,
      );
      const stillHunting = ourCellsLost >= 2;
      return mk({}, (seenDetect ? 1.6 : 0.8) + (stillHunting ? 0.8 : 0));
    }
    default:
      return null;
  }
}

/** One AI decision: the next action to take, or END_TURN. */
export function aiNextAction(ms: MatchState, p: PlayerId): MatchAction {
  const ps = ms.players[p];
  const weights = densityGrid(ms, p);
  const errorRate = aiErrorRate(ms.round);
  let st: RngState = hashString(`${ms.seed}:turn:${ms.turn}:${ps.energy}:${ps.shotsFired}`);

  const candidates: Candidate[] = [];
  // Cards we could afford next turn or the one after, scored as if affordable
  // — this is what makes saving up for an expensive card a real plan rather
  // than something that never happens.
  const aspirational: Candidate[] = [];
  const nextIncome = ms.baseIncome + tendersAlive(ps);
  for (const card of ps.tray) {
    if (card.spent || !isAvailable(ps, card)) continue;
    const cand = candidateFor(ms, p, card.uid, card.typeId, weights);
    if (!cand) continue;
    if (isCardPlayable(ms, ps, card)) {
      candidates.push(cand);
      continue;
    }
    const cost = effectiveCost(ms, ps, CARDS[card.typeId]);
    const turnsAway = Math.ceil((cost - ps.energy) / Math.max(1, nextIncome));
    // Waiting costs tempo, so discount by how long the wait is.
    if (turnsAway <= 3) aspirational.push({ ...cand, score: cand.score / (1 + turnsAway) });
  }

  // Carrier launch: a free 3-cell line is nearly always worth it.
  for (const ship of ps.ships) {
    if (ship.sunk || ship.launchUsed) continue;
    if (SHIPS[ship.typeId].ability !== 'launch') continue;
    const seg = bestSegment(ms, p, 3);
    if (seg.cells.length === 3) {
      candidates.push({
        action: { type: 'SHIP_ABILITY', player: p, shipUid: ship.uid, target: { cells: seg.cells } },
        score: 2.5,
        label: 'launch',
      });
    }
  }

  if (candidates.length === 0) return { type: 'END_TURN', player: p };

  candidates.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));

  let roll: number;
  [roll, st] = nextFloat(st);
  let chosen = candidates[0];
  if (roll < errorRate && candidates.length > 1) {
    let i: number;
    [i, st] = nextInt(st, candidates.length);
    chosen = candidates[i];
  }

  // Banking: hold when saving for a card beats anything playable right now,
  // even after the tempo discount. The discount bounds the wait, so the bot
  // cannot sit on its energy indefinitely.
  aspirational.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  if (aspirational.length > 0 && aspirational[0].score > chosen.score) {
    return { type: 'END_TURN', player: p };
  }
  return chosen.action;
}

/** Drive a full AI turn: apply actions until the AI ends its turn. */
export function aiPlayTurn(ms: MatchState): MatchState {
  let state = ms;
  const p = state.current;
  let guard = 0;
  while (state.phase === 'battle' && state.current === p && guard++ < 30) {
    const action = aiNextAction(state, p);
    try {
      state = reduce(state, action);
    } catch {
      state = reduce(state, { type: 'END_TURN', player: p });
      break;
    }
    if (action.type === 'END_TURN') break;
  }
  if (state.phase === 'battle' && state.current === p) {
    state = reduce(state, { type: 'END_TURN', player: p });
  }
  return state;
}
