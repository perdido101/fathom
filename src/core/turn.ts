import type { CellIndex, MatchState, PlayerId, CardInstance } from './types';
import { other, cellAddress } from './types';
import { ACTIONS, BASIC_SALVO_ID } from '../content/actions';
import { HULLS } from '../content/hulls';
import { isLegalPlacement } from './board';
import { hasTerrain } from './state';
import { checkVictory } from './fire';

/**
 * The turn: EARN → SPEND → REPORT.
 *
 * There is no tick step and no cooldown counter. A card played on your turn T
 * carries the turn it straightens on, and EARN simply compares.
 */

function log(ms: MatchState, p: PlayerId, text: string, kind: 'shot' | 'info' | 'card' | 'ability' | 'system' = 'info') {
  ms.log.push({ turn: ms.turn, player: p, text, kind });
}

// ---------------------------------------------------------------------------
// Deployment
// ---------------------------------------------------------------------------

export interface Deployment {
  defId: string;
  cells: CellIndex[];
}

/**
 * Both players deploy simultaneously and in secret. The match begins once
 * both slates are down.
 */
export function deploy(ms: MatchState, p: PlayerId, placements: Deployment[]): void {
  if (ms.phase !== 'deploy') throw new Error('Deployment is over');
  const ps = ms.players[p];
  if (ps.deployed) throw new Error('Already deployed');

  const wanted = ps.toDeploy.slice().sort();
  const got = placements.map((x) => x.defId).sort();
  if (wanted.length !== got.length || wanted.some((w, i) => w !== got[i])) {
    throw new Error('Deployment does not match the drafted fleet');
  }

  const occupied = new Set<CellIndex>();
  for (const pl of placements) {
    const def = HULLS[pl.defId];
    if (!def) throw new Error(`Unknown hull ${pl.defId}`);
    if (!isLegalPlacement(pl.cells, def.length, ms.board, occupied)) {
      throw new Error(`Illegal deployment for ${def.name}`);
    }
    for (const c of pl.cells) occupied.add(c);
  }

  // Convoy: every hull must touch at least one other hull.
  if (hasTerrain(ms, 'convoy') && placements.length > 1) {
    for (const pl of placements) {
      const touches = placements.some(
        (o) => o !== pl && o.cells.some((oc) => pl.cells.some((c) => adjacent8(c, oc, ms.board.gridW, ms.board.gridH))),
      );
      if (!touches) throw new Error(`Convoy: ${HULLS[pl.defId].name} must touch another hull`);
    }
  }
  // Shoal Water: every hull must have at least one cell on a symbol.
  if (hasTerrain(ms, 'shoal_water')) {
    for (const pl of placements) {
      if (!pl.cells.some((c) => ms.board.symbols[c] !== 'OPEN')) {
        throw new Error(`Shoal Water: ${HULLS[pl.defId].name} must sit on a symbol`);
      }
    }
  }

  for (const pl of placements) {
    const def = HULLS[pl.defId];
    ps.hulls.push({
      uid: ms.nextUid++,
      defId: pl.defId,
      length: def.length,
      cells: pl.cells.slice(),
      hits: pl.cells.map(() => 0),
      destroyed: pl.cells.map(() => false),
      sunk: false,
      revealed: false,
      abilitySpent: false,
      usedThisTurn: false,
    });
  }
  ps.toDeploy = [];
  ps.deployed = true;
  log(ms, p, `${ps.name} has deployed.`, 'system');

  if (ms.players[0].deployed && ms.players[1].deployed) {
    ms.phase = 'earn';
    ms.current = ms.firstPlayer;
    log(ms, ms.firstPlayer, `${ms.players[ms.firstPlayer].name} fires first.`, 'system');
    beginTurn(ms, ms.firstPlayer);
  }
}

function adjacent8(a: CellIndex, b: CellIndex, w: number, h: number): boolean {
  const ar = Math.floor(a / w);
  const ac = a % w;
  const br = Math.floor(b / w);
  const bc = b % w;
  void h;
  return Math.abs(ar - br) <= 1 && Math.abs(ac - bc) <= 1 && a !== b;
}

// ---------------------------------------------------------------------------
// EARN
// ---------------------------------------------------------------------------

/** Base income, before terrain cards. */
export function income(ms: MatchState, p: PlayerId): number {
  let n = hasTerrain(ms, 'lean_season') ? 1 : 2;
  // Wolf Season: every third turn, both players' income is doubled.
  if (hasTerrain(ms, 'wolf_season') && ms.players[p].turnCount % 3 === 0) n *= 2;
  return n;
}

/**
 * Start a turn: take income, straighten what has come back, resolve anything
 * that was waiting for this moment.
 */
export function beginTurn(ms: MatchState, p: PlayerId): void {
  const ps = ms.players[p];
  ms.turn += 1;
  ps.turnCount += 1;
  ms.phase = 'earn';

  // Carry last turn's counters over before they are reset.
  ps.statuses.hitsLandedLastTurn = ps.statuses.hitsLandedThisTurn;
  ps.statuses.hitsLandedThisTurn = 0;
  ps.statuses.sankLastTurn = ps.statuses.sankThisTurn;
  ps.statuses.sankThisTurn = false;
  ps.statuses.hitsTakenThisTurn = 0;
  ps.statuses.basicSalvoUsed = 0;
  for (const h of ps.hulls) h.usedThisTurn = false;

  const gained = income(ms, p) + ps.statuses.pendingCubes;
  ps.cubes += gained;
  ms.stats.peakBank[p] = Math.max(ms.stats.peakBank[p], ps.cubes);
  ps.statuses.pendingCubes = 0;
  log(ms, p, `${ps.name} earns ${gained}.`, 'info');

  // Straighten cards that have served their turn out.
  for (const card of ps.hand) {
    if (card.locked) continue;
    if (card.straightensOn > 0 && ps.turnCount >= card.straightensOn) card.straightensOn = 0;
  }

  // Sonar Buoy reports what it learned.
  for (const buoy of ps.statuses.pendingBuoys) {
    ps.annotations.push({
      kind: buoy.hit ? 'occupied' : 'empty',
      cells: [buoy.cell],
      turn: ms.turn,
      source: 'Sonar Buoy',
    });
    log(ms, p, `The buoy at ${cellAddress(ms.board, buoy.cell)} reports: ${buoy.hit ? 'contact' : 'nothing'}.`, 'info');
  }
  ps.statuses.pendingBuoys = [];

  ms.phase = 'spend';
}

/** End the current player's turn and hand over. */
export function endTurn(ms: MatchState, p: PlayerId): void {
  requireTurn(ms, p);
  ms.current = other(p);
  beginTurn(ms, ms.current);
  checkVictory(ms, p);
}

export function requireTurn(ms: MatchState, p: PlayerId): void {
  if (ms.phase !== 'spend') throw new Error(`Nothing to do during ${ms.phase}`);
  if (ms.current !== p) throw new Error('Not your turn');
}

// ---------------------------------------------------------------------------
// Costs and availability
// ---------------------------------------------------------------------------

/** Is this card upright and playable right now? */
export function isReady(ms: MatchState, p: PlayerId, card: CardInstance): boolean {
  const ps = ms.players[p];
  if (card.gone || card.locked) return false;
  if (card.defId === BASIC_SALVO_ID) {
    const allowed = hasTerrain(ms, 'slow_water') ? 2 : 1;
    return ps.statuses.basicSalvoUsed < allowed;
  }
  if (card.playableFrom > ps.turnCount) return false;
  return card.straightensOn === 0;
}

/**
 * What a card actually costs right now, after discounts and surcharges.
 * Terrain, Overcharge, Dead Weight, Powder Store and Static all land here so
 * nothing has to remember them at the call site.
 */
export function cardCost(ms: MatchState, p: PlayerId, defId: string): number {
  const def = ACTIONS[defId];
  const ps = ms.players[p];
  let cost = def.cost;

  // Hard Tack: cards costing 5 or more cost 2 less.
  if (hasTerrain(ms, 'hard_tack') && def.cost >= 5) cost -= 2;
  // Blockade: detection costs 1 more for both players.
  if (hasTerrain(ms, 'blockade') && def.keyword === 'READ') cost += 1;
  // Static: detection costs 2 more if you have a hull in or next to a storm.
  if (hasTerrain(ms, 'static') && def.keyword === 'READ' && nearStorm(ms, p)) cost += 2;
  // Overcharge: your attack cards cost 1 less this turn.
  if (def.keyword === 'AIM' && ps.statuses.attackDiscountTurn === ps.turnCount) cost -= 1;
  // Dead Weight / Powder Store.
  cost += ps.statuses.nextCardSurcharge;
  if (def.keyword === 'AIM') cost += ps.statuses.nextAttackSurcharge;

  return Math.max(0, cost);
}

function nearStorm(ms: MatchState, p: PlayerId): boolean {
  const { gridW, gridH, symbols } = ms.board;
  for (const h of ms.players[p].hulls) {
    if (h.sunk) continue;
    for (const c of h.cells) {
      if (symbols[c] === 'STORM') return true;
      const r = Math.floor(c / gridW);
      const col = c % gridW;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr;
          const nc = col + dc;
          if (nr < 0 || nr >= gridH || nc < 0 || nc >= gridW) continue;
          if (symbols[nr * gridW + nc] === 'STORM') return true;
        }
      }
    }
  }
  return false;
}

/** Ability cost, after Thermal Vent's discount. */
export function abilityCost(ms: MatchState, p: PlayerId, hullUid: number): number {
  const hull = ms.players[p].hulls.find((h) => h.uid === hullUid);
  if (!hull) return Infinity;
  const def = HULLS[hull.defId];
  let cost = def.cost;
  if (hasTerrain(ms, 'thermal_vent') && hull.cells.some((c) => ms.board.symbols[c] === 'UPWELLING')) {
    cost -= 1;
  }
  return Math.max(0, cost);
}

/** Slack Tide: hulls with a cell on shallows cannot activate abilities. */
export function canActivate(ms: MatchState, p: PlayerId, hullUid: number): boolean {
  const hull = ms.players[p].hulls.find((h) => h.uid === hullUid);
  if (!hull || hull.sunk) return false;
  const def = HULLS[hull.defId];
  if (def.trigger !== 'ACT') return false;
  if (def.once && hull.abilitySpent) return false;
  if (def.id === 'dreadnought' && hull.usedThisTurn) return false;
  if (hasTerrain(ms, 'slack_tide') && hull.cells.some((c) => ms.board.symbols[c] === 'SHALLOWS')) {
    return false;
  }
  return ms.players[p].cubes >= abilityCost(ms, p, hullUid);
}

/** Spend cubes, recording it for the economy assertions. */
export function pay(ms: MatchState, p: PlayerId, amount: number): void {
  const ps = ms.players[p];
  if (ps.cubes < amount) throw new Error('Not enough cubes');
  ps.cubes -= amount;
  ms.stats.cubesSpent[p] += amount;
}
