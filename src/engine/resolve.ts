import type {
  CardInstance,
  CellIndex,
  FireSpec,
  MatchState,
  PlacedShip,
  Plan,
  PlayerId,
  PlayerState,
  ResolveEvent,
  Restrictions,
} from './types';
import { BOARD, label, noRestrictions, other, xy } from './types';
import { canFireAt } from './cards';
import { SHIPS } from './ships';
import { BALANCE } from './balance';
import {
  adjacentOccupied,
  columnCount,
  fleetDestroyed,
  hullCellsRemaining,
  occupied,
  rowCount,
  shipAt,
} from './board';
import {
  abilityShot,
  ambushShot,
  cardShot,
  echoReveal,
  specMatchesCard,
  specMatchesShip,
} from './targeting';
import { nextInt, pick, type RngState } from './rng';

/**
 * One round, start to finish.
 *
 * The round is simultaneous, which is the whole reason the resolver is written
 * as a pipeline over a frozen snapshot rather than as two players taking
 * turns. Charge counts, board state and declared targets are all read from the
 * state as it stood at the reveal; nothing either player does this round can
 * change what the other player's plan meant. A ship that dies still fires.
 */

// ---------------------------------------------------------------------------
// A card that is being fired this round, whether normally or through Kiln.
// ---------------------------------------------------------------------------

interface FiredCard {
  by: PlayerId;
  uid: number;
  defId: string;
  /** Locked at reveal — charge theft this round cannot shrink a card in flight. */
  charges: number;
  spec: FireSpec;
  viaKiln: boolean;
}

interface Attack {
  by: PlayerId;
  cells: CellIndex[];
  source: string;
  execute: boolean;
}

interface ChargeClaim {
  by: PlayerId;
  target: PlayerId;
  uid: number;
  amount: number;
  /** Where the charges go, for a steal. Null for a strip. */
  toUid: number | null;
  reason: string;
}

// ---------------------------------------------------------------------------
// Plan validation
// ---------------------------------------------------------------------------

export function findCard(ps: PlayerState, uid: number): CardInstance | null {
  return ps.hand.find((c) => c.uid === uid) ?? null;
}

export function liveShip(ps: PlayerState, defId: string): PlacedShip | null {
  return ps.ships.find((s) => s.defId === defId) ?? null;
}

/** Null when legal, otherwise the reason. Used by the server and the verifier. */
export function validatePlan(ms: MatchState, p: PlayerId, plan: Plan): string | null {
  const ps = ms.players[p];
  const r = ps.restrictions;

  if (plan.chargeTo !== null) {
    if (r.noCharge) return 'blacked out: no charge may be placed';
    if (!findCard(ps, plan.chargeTo)) return 'charge target is not in hand';
  } else if (!r.noCharge && ps.hand.length > 0) {
    return 'a charge must be placed every round';
  }

  if (plan.bonusTo !== null && !findCard(ps, plan.bonusTo)) {
    return 'bonus target is not in hand';
  }

  if (plan.fire) {
    if (r.noFire) return 'pinned: no card may be fired';
    const card = findCard(ps, plan.fire.uid);
    if (!card) return 'fired card is not in hand';
    const chargesAtFire = card.charges + (plan.chargeTo === card.uid ? BALANCE.chargePerRound : 0);
    if (!canFireAt(card.defId, chargesAtFire))
      return `${card.defId} cannot fire at ${chargesAtFire}`;
    if (!specMatchesCard(card.defId, plan.fire.spec)) return 'declaration does not fit the card';
    const specErr = specSane(plan.fire.spec, ms, p);
    if (specErr) return specErr;
  }

  if (plan.ability) {
    const ship = liveShip(ps, plan.ability.defId);
    if (!ship) return 'no such ship in this fleet';
    if (ship.sunk) return 'a sunk ship cannot act';
    if (ship.abilityUsed) return 'that ability is already spent';
    const def = SHIPS[ship.defId];
    if (def.type === 'REACT') return 'REACT abilities are automatic';
    if (!specMatchesShip(ship.defId, plan.ability.spec)) return 'declaration does not fit the ship';
    if (plan.ability.spec.shape === 'kiln') {
      const inner = findCard(ps, plan.ability.spec.uid);
      if (!inner) return 'Kiln target is not in hand';
      if (plan.fire && plan.fire.uid === inner.uid) return 'that card is already being fired';
      if (!specMatchesCard(inner.defId, plan.ability.spec.inner)) {
        return 'Kiln declaration does not fit the card it fires';
      }
    }
    const specErr = specSane(plan.ability.spec, ms, p);
    if (specErr) return specErr;
  }

  if (plan.basic !== null && (plan.basic < 0 || plan.basic >= BOARD * BOARD)) {
    return 'basic attack is off the board';
  }
  return null;
}

function specSane(spec: FireSpec, ms: MatchState, p: PlayerId): string | null {
  const foe = ms.players[other(p)];
  const me = ms.players[p];
  const area = BOARD * BOARD;
  const onBoardCell = (c: CellIndex) => c >= 0 && c < area;
  switch (spec.shape) {
    case 'cells':
      return spec.cells.every(onBoardCell) ? null : 'target off the board';
    case 'cell':
      return onBoardCell(spec.cell) ? null : 'target off the board';
    case 'row':
      return onBoardCell(spec.origin) ? null : 'target off the board';
    case 'line':
      if (!onBoardCell(spec.origin)) return 'target off the board';
      return Math.abs(spec.dir[0]) + Math.abs(spec.dir[1]) === 1
        ? null
        : 'lines are orthogonal only';
    case 'block':
      return onBoardCell(spec.anchor) ? null : 'target off the board';
    case 'beacon':
      if (spec.index < 0 || spec.index >= BOARD) {
        return 'beacon readout is off the board';
      }
      return spec.cells.every(onBoardCell) ? null : 'target off the board';
    case 'strip':
    case 'steal': {
      for (const s of spec.from) {
        if (!findCard(foe, s.uid)) return 'no such enemy card';
        if (s.amount <= 0) return 'charge amounts must be positive';
      }
      if (spec.shape === 'steal' && !findCard(me, spec.toUid)) return 'no such destination card';
      return null;
    }
    case 'kiln':
      return specSane(spec.inner, ms, p);
    case 'none':
      return null;
    default:
      return 'unknown declaration';
  }
}

// ---------------------------------------------------------------------------
// Timer expiry
// ---------------------------------------------------------------------------

/**
 * What a player who let the clock run out actually does: a random unfired
 * shot, a random charge, nothing else. It still counts as a strike.
 */
export function timeoutPlan(ms: MatchState, p: PlayerId): [Plan, RngState] {
  const ps = ms.players[p];
  let st = ms.rng;
  const unfired: CellIndex[] = [];
  for (let c = 0; c < BOARD * BOARD; c++) if (ps.marks[c] === undefined) unfired.push(c);
  let basic: CellIndex | null = null;
  [basic, st] = pick(st, unfired.length ? unfired : [0]);
  let card: CardInstance | null = null;
  [card, st] = pick(st, ps.hand);
  return [
    {
      chargeTo: ps.restrictions.noCharge ? null : (card?.uid ?? null),
      bonusTo: card?.uid ?? null,
      fire: null,
      ability: null,
      basic,
      timedOut: true,
    },
    st,
  ];
}

// ---------------------------------------------------------------------------
// The round
// ---------------------------------------------------------------------------

export interface RoundResult {
  state: MatchState;
  events: ResolveEvent[];
}

export function resolveRound(ms: MatchState, plans: [Plan, Plan]): RoundResult {
  const s: MatchState = structuredClone(ms);
  const events: ResolveEvent[] = [];
  let rng = s.rng;

  // Ruling Q2: if both fleets go down together, the round is decided on who
  // walked into it with more hull left. That has to be measured now, before a
  // single shot lands, because by the end of the round both numbers are zero.
  const hullAtRoundStart: [number, number] = [
    hullCellsRemaining(s.players[0].ships),
    hullCellsRemaining(s.players[1].ships),
  ];

  events.push({ t: 'reveal' });

  // --- Step 0: lock in what every fired card is worth ----------------------
  // Charges are read once, here. A Jam landing in step 2 strips banked
  // charges; it cannot shrink a Salvo that is already in the air.
  const fired: FiredCard[] = [];
  for (const p of [0, 1] as PlayerId[]) {
    const ps = s.players[p];
    const plan = plans[p];
    if (plan.fire) {
      const card = findCard(ps, plan.fire.uid);
      if (card) {
        const bump = plan.chargeTo === card.uid ? BALANCE.chargePerRound : 0;
        fired.push({
          by: p,
          uid: card.uid,
          defId: card.defId,
          charges: card.charges + bump,
          spec: plan.fire.spec,
          viaKiln: false,
        });
      }
    }
    if (plan.ability?.spec.shape === 'kiln') {
      const inner = findCard(ps, plan.ability.spec.uid);
      if (inner) {
        const bump = plan.chargeTo === inner.uid ? BALANCE.chargePerRound : 0;
        fired.push({
          by: p,
          uid: inner.uid,
          defId: inner.defId,
          charges: inner.charges + bump + BALANCE.kilnUplift,
          spec: plan.ability.spec.inner,
          viaKiln: true,
        });
      }
    }
  }

  // --- Step 1: the charge each player places -------------------------------
  // Placed before firing so a card can be topped up and fired in the same
  // round; the charge is then spent along with the rest.
  for (const p of [0, 1] as PlayerId[]) {
    const plan = plans[p];
    if (plan.chargeTo === null) continue;
    const card = findCard(s.players[p], plan.chargeTo);
    if (card) card.charges += BALANCE.chargePerRound;
  }

  // --- Step 2: NERF effects ------------------------------------------------
  const claims: ChargeClaim[] = [];
  const nextRestrictions: [Restrictions, Restrictions] = [noRestrictions(), noRestrictions()];

  for (const p of [0, 1] as PlayerId[]) {
    const foe = other(p);
    const plan = plans[p];

    for (const f of fired.filter((x) => x.by === p)) {
      if (f.defId === 'jam' && f.spec.shape === 'strip') {
        for (const from of spread(f.spec.from, f.charges)) {
          claims.push({
            by: p,
            target: foe,
            uid: from.uid,
            amount: from.amount,
            toUid: null,
            reason: 'Jam',
          });
        }
        events.push({ t: 'nerf', by: p, text: `Jam strips ${f.charges} charges` });
      }
      if (f.defId === 'siphon' && f.spec.shape === 'steal') {
        for (const from of spread(f.spec.from, f.charges)) {
          claims.push({
            by: p,
            target: foe,
            uid: from.uid,
            amount: from.amount,
            toUid: f.spec.toUid,
            reason: 'Siphon',
          });
        }
        events.push({ t: 'nerf', by: p, text: `Siphon steals ${f.charges} charges` });
      }
    }

    const ability = plan.ability;
    if (!ability) continue;
    const ship = liveShip(s.players[p], ability.defId);
    if (!ship || ship.sunk || ship.abilityUsed) continue;

    if (ability.defId === 'leech' && ability.spec.shape === 'steal') {
      for (const from of spread(ability.spec.from, BALANCE.leechSteal)) {
        claims.push({
          by: p,
          target: foe,
          uid: from.uid,
          amount: from.amount,
          toUid: ability.spec.toUid,
          reason: 'Leech',
        });
      }
      events.push({ t: 'nerf', by: p, text: `Leech steals ${BALANCE.leechSteal} charges` });
    }
    if (ability.defId === 'blackout') {
      nextRestrictions[foe].noCharge = true;
      let picked: { uid: number; amount: number }[];
      [picked, rng] = randomCharges(rng, s.players[foe].hand, BALANCE.blackoutStrip);
      for (const q of picked) {
        claims.push({
          by: p,
          target: foe,
          uid: q.uid,
          amount: q.amount,
          toUid: null,
          reason: 'Blackout',
        });
      }
      events.push({ t: 'nerf', by: p, text: 'Blackout: no charge next round, 2 charges lost' });
    }
  }

  applyClaims(s, claims, events);

  // --- Step 3: prediction plays -------------------------------------------
  // Both predictions read the same declarations. A Mirror that fires does not
  // hide its owner's cells from the opposing Ambush — the read happens against
  // what was declared, not against what survives.
  const declared: [Set<CellIndex>, Set<CellIndex>] = [new Set(), new Set()];
  for (const p of [0, 1] as PlayerId[]) {
    for (const c of declaredCells(s, plans[p], fired, p)) declared[p].add(c);
  }

  const nullified: [boolean, boolean] = [false, false];
  const retaliation: Attack[] = [];
  const mirrorGain: [number, number] = [0, 0];

  for (const f of fired) {
    const foe = other(f.by);
    if (f.defId === 'mirror' && f.spec.shape === 'cell') {
      const hit = declared[foe].has(f.spec.cell);
      events.push({ t: 'prediction', by: f.by, card: 'mirror', triggered: hit, cell: f.spec.cell });
      if (hit) {
        nullified[foe] = true;
        mirrorGain[f.by] += f.charges * BALANCE.mirrorGainPerCharge;
      }
    }
    if (f.defId === 'ambush' && f.spec.shape === 'cell') {
      const hit = declared[foe].has(f.spec.cell);
      events.push({ t: 'prediction', by: f.by, card: 'ambush', triggered: hit, cell: f.spec.cell });
      if (hit) {
        const shot = ambushShot(f.charges, f.spec.cell);
        retaliation.push({ by: f.by, cells: shot.cells, source: 'ambush', execute: false });
      }
    }
  }

  // --- Step 4: attacks, all against the same pre-damage board --------------
  const attacks: Attack[] = [];
  for (const p of [0, 1] as PlayerId[]) {
    if (nullified[p]) continue;
    attacks.push(...plannedAttacks(s, plans[p], fired, p));
  }
  attacks.push(...retaliation);

  const snapshot: [PlacedShip[], PlacedShip[]] = [
    structuredClone(s.players[0].ships),
    structuredClone(s.players[1].ships),
  ];
  const damagedBefore: [Set<string>, Set<string>] = [
    new Set(snapshot[0].filter((x) => x.hits.some(Boolean)).map((x) => x.defId)),
    new Set(snapshot[1].filter((x) => x.hits.some(Boolean)).map((x) => x.defId)),
  ];

  const struck = applyAttacks(s, attacks, snapshot, damagedBefore, events);

  // Intel resolves against the same snapshot the shots were scored against.
  rng = resolveIntel(s, fired, plans, snapshot, events, rng);

  // --- Step 5 and 6: sinks, then REACTs, cascading under a cap -------------
  // Thorn always mirrors the salvo that was declared this round. It never
  // mirrors another REACT's output — otherwise two facing Thorns would answer
  // each other and the round would never settle. Ruling checked in Build 2.
  const declaredAttacks = attacks.slice();
  let cascade = 0;
  let pendingAttacks = struck.newlySunk.length
    ? collectReacts(struck.newlySunk, declaredAttacks, events)
    : [];
  rng = struck.rng ?? rng;
  rng = applyReactCharges(s, struck.newlySunk, plans, events, rng, nextRestrictions);

  while (pendingAttacks.length && cascade < BALANCE.reactCascadeLimit) {
    cascade += 1;
    const snap: [PlacedShip[], PlacedShip[]] = [
      structuredClone(s.players[0].ships),
      structuredClone(s.players[1].ships),
    ];
    const dmg: [Set<string>, Set<string>] = [
      new Set(snap[0].filter((x) => x.hits.some(Boolean)).map((x) => x.defId)),
      new Set(snap[1].filter((x) => x.hits.some(Boolean)).map((x) => x.defId)),
    ];
    const r = applyAttacks(s, pendingAttacks, snap, dmg, events);
    // Still the declared attacks, not what the last cascade fired.
    pendingAttacks = r.newlySunk.length ? collectReacts(r.newlySunk, declaredAttacks, events) : [];
    rng = applyReactCharges(s, r.newlySunk, plans, events, rng, nextRestrictions);
  }

  // --- Step 7: charges gained ---------------------------------------------
  for (const p of [0, 1] as PlayerId[]) {
    let gain = 0;
    const reasons: string[] = [];
    const landed = struck.hitsBy[p];
    if (landed > 0) {
      // One charge for connecting, however many cells connected. Ruling Q1.
      gain += BALANCE.hitBonusPerRound;
      reasons.push(`${landed} hit${landed === 1 ? '' : 's'}`);
    }
    if (mirrorGain[p] > 0) {
      gain += mirrorGain[p];
      reasons.push('Mirror');
    }
    if (struck.emberHits[p] > 0) {
      gain += struck.emberHits[p] * BALANCE.emberGainPerHit;
      reasons.push('Ember');
    }
    if (struck.forgeUsed[p] && BALANCE.forgeGain > 0) {
      gain += BALANCE.forgeGain;
      reasons.push('Forge');
    }
    if (gain > 0) {
      grantCharges(s.players[p], gain, plans[p].bonusTo);
      s.players[p].stats.chargesEarned += gain;
      events.push({ t: 'charges', to: p, amount: gain, reason: reasons.join(' + ') });
    }
  }

  // --- Pin's lockout, which depends on whether its shot landed -------------
  for (const p of [0, 1] as PlayerId[]) {
    if (struck.pinLanded[p]) nextRestrictions[other(p)].noFire = true;
  }

  // --- Consume everything that was fired -----------------------------------
  for (const f of fired) {
    const ps = s.players[f.by];
    const idx = ps.hand.findIndex((c) => c.uid === f.uid);
    if (idx >= 0) {
      ps.hand.splice(idx, 1);
      ps.graveyard.push({ defId: f.defId, charges: f.charges, round: s.round });
      ps.stats.cardsFired.push({ defId: f.defId, charges: f.charges });
    }
  }
  for (const p of [0, 1] as PlayerId[]) {
    const ability = plans[p].ability;
    if (!ability) continue;
    const ship = liveShip(s.players[p], ability.defId);
    if (!ship || ship.abilityUsed) continue;
    if (SHIPS[ship.defId].type === 'REACT') continue;
    ship.abilityUsed = true;
    ship.revealed = true;
    s.players[p].stats.abilitiesUsed.push(ship.defId);
  }

  // --- Step 8: draws -------------------------------------------------------
  for (const p of [0, 1] as PlayerId[]) {
    const ps = s.players[p];
    if (ps.hand.length > s.config.drawThreshold) continue;
    if (ps.hand.length >= s.config.handSize) continue;
    if (s.pile.length === 0) continue;
    const defId = s.pile.shift()!;
    ps.hand.push({ uid: s.nextUid++, defId, charges: 0 });
    events.push({ t: 'draw', to: p, count: 1 });
  }

  // --- Timer strikes -------------------------------------------------------
  for (const p of [0, 1] as PlayerId[]) {
    if (!plans[p].timedOut) continue;
    s.players[p].timerStrikes += 1;
    events.push({ t: 'strike', who: p, total: s.players[p].timerStrikes });
  }

  for (const p of [0, 1] as PlayerId[]) s.players[p].restrictions = nextRestrictions[p];
  s.rng = rng;
  s.round += 1;

  const outcome = checkOutcome(s, hullAtRoundStart);
  if (outcome) {
    s.outcome = outcome;
    s.phase = 'over';
    events.push({ t: 'end', outcome });
  }

  for (const e of events)
    s.log.push({ round: ms.round, step: e.t, player: null, text: describe(e) });
  return { state: s, events };
}

// ---------------------------------------------------------------------------
// Attack helpers
// ---------------------------------------------------------------------------

/** Cells a plan declares, used by Mirror and Ambush to make their reads. */
function declaredCells(ms: MatchState, plan: Plan, fired: FiredCard[], p: PlayerId): CellIndex[] {
  const out: CellIndex[] = [];
  if (plan.basic !== null) out.push(plan.basic);
  for (const f of fired.filter((x) => x.by === p)) {
    out.push(...cardShot(f.defId, f.charges, f.spec).cells);
  }
  if (plan.ability) {
    const ship = liveShip(ms.players[p], plan.ability.defId);
    if (ship && !ship.sunk && !ship.abilityUsed) {
      out.push(...abilityShot(plan.ability.defId, plan.ability.spec).cells);
    }
  }
  return out;
}

function plannedAttacks(ms: MatchState, plan: Plan, fired: FiredCard[], p: PlayerId): Attack[] {
  const out: Attack[] = [];
  if (plan.basic !== null)
    out.push({ by: p, cells: [plan.basic], source: 'basic', execute: false });
  for (const f of fired.filter((x) => x.by === p)) {
    const shot = cardShot(f.defId, f.charges, f.spec);
    if (shot.cells.length) {
      out.push({ by: p, cells: shot.cells, source: f.defId, execute: shot.execute });
    }
  }
  if (plan.ability) {
    const ship = liveShip(ms.players[p], plan.ability.defId);
    if (ship && !ship.sunk && !ship.abilityUsed && SHIPS[ship.defId].type !== 'REACT') {
      const shot = abilityShot(plan.ability.defId, plan.ability.spec);
      if (shot.cells.length) {
        out.push({ by: p, cells: shot.cells, source: plan.ability.defId, execute: shot.execute });
      }
    }
  }
  return out;
}

interface StrikeResult {
  hitsBy: [number, number];
  emberHits: [number, number];
  forgeUsed: [boolean, boolean];
  pinLanded: [boolean, boolean];
  newlySunk: { owner: PlayerId; defId: string }[];
  rng?: RngState;
}

/**
 * Score every attack against the frozen board, then write all the damage at
 * once. Nothing here reads the live ships, so a ship that dies to player 0
 * still lands player 1's shots.
 */
function applyAttacks(
  s: MatchState,
  attacks: Attack[],
  snapshot: [PlacedShip[], PlacedShip[]],
  damagedBefore: [Set<string>, Set<string>],
  events: ResolveEvent[],
): StrikeResult {
  const result: StrikeResult = {
    hitsBy: [0, 0],
    emberHits: [0, 0],
    forgeUsed: [false, false],
    pinLanded: [false, false],
    newlySunk: [],
  };
  /** owner -> ship defId -> cell indices newly struck. */
  const damage: [Map<string, Set<number>>, Map<string, Set<number>>] = [new Map(), new Map()];
  const executed: [Set<string>, Set<string>] = [new Set(), new Set()];
  const seen: [Set<CellIndex>, Set<CellIndex>] = [new Set(), new Set()];

  for (const atk of attacks) {
    const target = other(atk.by);
    if (atk.source === 'forge') result.forgeUsed[atk.by] = true;
    for (const cell of atk.cells) {
      const ship = shipAt(snapshot[target], cell);
      const isHit = ship !== null;
      // A cell already scored this round is not scored twice, but every
      // attack still reports its own hit or miss for the animation sequence.
      if (!seen[atk.by].has(cell)) {
        seen[atk.by].add(cell);
        s.players[atk.by].stats.shotsFired += 1;
        if (isHit) {
          result.hitsBy[atk.by] += 1;
          s.players[atk.by].stats.hits += 1;
          if (atk.source === 'ember') result.emberHits[atk.by] += 1;
          if (atk.source === 'pin') result.pinLanded[atk.by] = true;
        }
      }
      s.players[atk.by].marks[cell] = isHit ? 'hit' : 'miss';
      if (!s.players[atk.by].firedAt.includes(cell)) s.players[atk.by].firedAt.push(cell);
      events.push({ t: 'shot', by: atk.by, cell, hit: isHit, source: atk.source });
      if (!ship) continue;
      let set = damage[target].get(ship.defId);
      if (!set) {
        set = new Set();
        damage[target].set(ship.defId, set);
      }
      set.add(cell);
      if (atk.execute && damagedBefore[target].has(ship.defId)) executed[target].add(ship.defId);
    }
  }

  for (const target of [0, 1] as PlayerId[]) {
    for (const ship of s.players[target].ships) {
      const struck = damage[target].get(ship.defId);
      if (struck) {
        ship.cells.forEach((c, i) => {
          if (struck.has(c)) ship.hits[i] = true;
        });
      }
      if (ship.sunk) continue;
      const dead = executed[target].has(ship.defId) || ship.hits.every(Boolean);
      if (!dead) continue;
      ship.sunk = true;
      ship.hits = ship.hits.map(() => true);
      ship.revealed = true;
      result.newlySunk.push({ owner: target, defId: ship.defId });
      s.players[other(target)].sankLengths.push(ship.length);
      events.push({ t: 'sink', owner: target, length: ship.length });
    }
  }

  // First blood is the first hit landed by anyone in the match.
  if (!s.players[0].stats.firstBlood && !s.players[1].stats.firstBlood) {
    if (result.hitsBy[0] > 0 && result.hitsBy[1] === 0) s.players[0].stats.firstBlood = true;
    else if (result.hitsBy[1] > 0 && result.hitsBy[0] === 0) s.players[1].stats.firstBlood = true;
  }
  return result;
}

/** Thorn is the only REACT that shoots; the rest are handled with the charges. */
function collectReacts(
  sunk: { owner: PlayerId; defId: string }[],
  incoming: Attack[],
  events: ResolveEvent[],
): Attack[] {
  const out: Attack[] = [];
  for (const { owner, defId } of sunk) {
    if (defId !== 'thorn') continue;
    const foe = other(owner);
    const cells = incoming.filter((a) => a.by === foe).flatMap((a) => a.cells);
    if (!cells.length) continue;
    out.push({ by: owner, cells: Array.from(new Set(cells)), source: 'thorn', execute: false });
    events.push({ t: 'react', owner, defId: 'thorn', text: 'Thorn fires back along their salvo' });
  }
  return out;
}

/** Dreadnought, Cinder and Spite, all of which move charges rather than shells. */
function applyReactCharges(
  s: MatchState,
  sunk: { owner: PlayerId; defId: string }[],
  plans: [Plan, Plan],
  events: ResolveEvent[],
  rng: RngState,
  nextRestrictions: [Restrictions, Restrictions],
): RngState {
  let st = rng;
  for (const { owner, defId } of sunk) {
    const ps = s.players[owner];
    const foe = s.players[other(owner)];
    if (defId === 'dreadnought') {
      [st] = scatter(st, ps, BALANCE.dreadnoughtScatter);
      ps.stats.chargesEarned += BALANCE.dreadnoughtScatter;
      events.push({ t: 'react', owner, defId, text: 'Dreadnought scatters 4 charges' });
    }
    if (defId === 'cinder') {
      [st] = scatter(st, ps, BALANCE.cinderScatter);
      ps.stats.chargesEarned += BALANCE.cinderScatter;
      // Into next round's restrictions, not the current player state — the
      // end-of-round swap would silently discard a direct write.
      nextRestrictions[other(owner)].noFire = true;
      events.push({ t: 'react', owner, defId, text: 'Cinder scatters 2 and locks their cards for a round' });
    }
    if (defId === 'spite') {
      for (const c of foe.hand) c.charges = 0;
      events.push({ t: 'react', owner, defId, text: 'Spite wipes every enemy charge' });
    }
    void plans;
  }
  return st;
}

// ---------------------------------------------------------------------------
// Intel
// ---------------------------------------------------------------------------

function resolveIntel(
  s: MatchState,
  fired: FiredCard[],
  plans: [Plan, Plan],
  snapshot: [PlacedShip[], PlacedShip[]],
  events: ResolveEvent[],
  rng: RngState,
): RngState {
  for (const f of fired) {
    const me = s.players[f.by];
    const foeShips = snapshot[other(f.by)];
    const shot = cardShot(f.defId, f.charges, f.spec);

    if (f.defId === 'ping') {
      for (const cell of shot.cells) {
        if (occupied(foeShips, cell)) continue;
        const near = adjacentOccupied(foeShips, cell);
        events.push({
          t: 'intel',
          to: f.by,
          text: `Ping at ${label(cell)}: ${near ? 'contact adjacent' : 'nothing adjacent'}`,
        });
        if (!near) for (const n of neighbours(cell)) me.marks[n] = me.marks[n] ?? 'miss';
      }
    }

    if (f.defId === 'echo') {
      const known = new Set<CellIndex>([...me.knownShipCells, ...struckCells(me)]);
      for (const cell of shot.cells) {
        const ship = shipAt(foeShips, cell);
        if (!ship) continue;
        const reveal = echoReveal(ship, known);
        if (reveal === null) continue;
        known.add(reveal);
        if (!me.knownShipCells.includes(reveal)) me.knownShipCells.push(reveal);
        events.push({ t: 'intel', to: f.by, text: `Echo exposes ${label(reveal)}` });
      }
    }

    if (f.defId === 'sounding' && f.spec.shape === 'cell') {
      const [x, y] = xy(f.spec.cell);
      if (f.charges >= 2) {
        const n = columnCount(foeShips, x);
        me.counts.cols[x] = n;
        events.push({
          t: 'intel',
          to: f.by,
          text: `Sounding: column ${String.fromCharCode(65 + x)} holds ${n}`,
        });
      }
      if (f.charges >= 3) {
        const n = rowCount(foeShips, y);
        me.counts.rows[y] = n;
        events.push({ t: 'intel', to: f.by, text: `Sounding: row ${y + 1} holds ${n}` });
      }
    }
  }

  for (const p of [0, 1] as PlayerId[]) {
    const ability = plans[p].ability;
    if (ability?.spec.shape !== 'beacon') continue;
    const ship = liveShip(s.players[p], 'beacon');
    if (!ship || ship.sunk) continue;
    const foeShips = snapshot[other(p)];
    // Build 5 ruling: one readout, the player's choice of axis. Still a
    // scouting ship; no longer also the best attacker in the game.
    if (ability.spec.axis === 'row') {
      const n = rowCount(foeShips, ability.spec.index);
      s.players[p].counts.rows[ability.spec.index] = n;
      events.push({
        t: 'intel',
        to: p,
        text: `Beacon: row ${ability.spec.index + 1} holds ${n}`,
      });
    } else {
      const n = columnCount(foeShips, ability.spec.index);
      s.players[p].counts.cols[ability.spec.index] = n;
      events.push({
        t: 'intel',
        to: p,
        text: `Beacon: column ${String.fromCharCode(65 + ability.spec.index)} holds ${n}`,
      });
    }
  }
  return rng;
}

function struckCells(ps: PlayerState): CellIndex[] {
  return Object.entries(ps.marks)
    .filter(([, v]) => v === 'hit')
    .map(([k]) => Number(k));
}

function neighbours(cell: CellIndex): CellIndex[] {
  const [x, y] = xy(cell);
  const out: CellIndex[] = [];
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && nx < BOARD && ny >= 0 && ny < BOARD) out.push(ny * BOARD + nx);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Charge plumbing
// ---------------------------------------------------------------------------

/** Trim or pad a declared split so it totals exactly `budget`. */
function spread(
  from: { uid: number; amount: number }[],
  budget: number,
): { uid: number; amount: number }[] {
  const out: { uid: number; amount: number }[] = [];
  let left = budget;
  for (const f of from) {
    if (left <= 0) break;
    const take = Math.min(f.amount, left);
    if (take > 0) out.push({ uid: f.uid, amount: take });
    left -= take;
  }
  return out;
}

/**
 * Apply every claim against the same starting charges. When two effects reach
 * for the same card and there is not enough to go round, each claim is scaled
 * down in proportion — nobody receives charges that were never there.
 */
function applyClaims(s: MatchState, claims: ChargeClaim[], events: ResolveEvent[]): void {
  if (!claims.length) return;
  const byCard = new Map<string, ChargeClaim[]>();
  for (const c of claims) {
    const key = `${c.target}:${c.uid}`;
    const list = byCard.get(key) ?? [];
    list.push(c);
    byCard.set(key, list);
  }
  const granted = new Map<ChargeClaim, number>();
  for (const [key, list] of byCard) {
    const [targetStr, uidStr] = key.split(':');
    const target = Number(targetStr) as PlayerId;
    const card = findCard(s.players[target], Number(uidStr));
    const available = card?.charges ?? 0;
    const total = list.reduce((n, c) => n + c.amount, 0);
    if (total <= available) {
      for (const c of list) granted.set(c, c.amount);
    } else {
      let handed = 0;
      const scaled = list.map((c) => Math.floor((c.amount * available) / total));
      scaled.forEach((v, i) => {
        granted.set(list[i], v);
        handed += v;
      });
      // Deterministic remainder: earlier player, then declaration order.
      const order = list.map((c, i) => ({ c, i })).sort((a, b) => a.c.by - b.c.by || a.i - b.i);
      let leftover = available - handed;
      for (const { c } of order) {
        if (leftover <= 0) break;
        granted.set(c, (granted.get(c) ?? 0) + 1);
        leftover -= 1;
      }
    }
    if (card) {
      const taken = list.reduce((n, c) => n + (granted.get(c) ?? 0), 0);
      card.charges = Math.max(0, card.charges - taken);
    }
  }
  for (const c of claims) {
    const amount = granted.get(c) ?? 0;
    if (amount <= 0) continue;
    if (c.toUid !== null) {
      const dest = findCard(s.players[c.by], c.toUid);
      if (dest) dest.charges += amount;
      s.players[c.by].stats.chargesEarned += amount;
    }
    events.push({
      t: 'charges',
      to: c.by,
      amount: c.toUid !== null ? amount : 0,
      reason: c.reason,
    });
  }
}

/**
 * Where charges land when the rules just say "gain". The player nominates a
 * card in their plan; if that card is gone or was never named, the charges go
 * to whichever card is already fullest, which keeps the choice consistent
 * rather than random. See RULINGS.md Q4.
 */
export function grantCharges(ps: PlayerState, amount: number, preferred: number | null): void {
  if (amount <= 0 || ps.hand.length === 0) return;
  const target =
    (preferred !== null ? ps.hand.find((c) => c.uid === preferred) : null) ??
    ps.hand.slice().sort((a, b) => b.charges - a.charges || a.uid - b.uid)[0];
  target.charges += amount;
}

/** Spread `amount` charges one at a time across the hand, at random. */
function scatter(rng: RngState, ps: PlayerState, amount: number): [RngState] {
  let st = rng;
  if (ps.hand.length === 0) return [st];
  for (let i = 0; i < amount; i++) {
    let idx: number;
    [idx, st] = nextInt(st, ps.hand.length);
    ps.hand[idx].charges += 1;
  }
  return [st];
}

/** Pick `amount` charges to destroy, one at a time, weighted by where they are. */
function randomCharges(
  rng: RngState,
  hand: CardInstance[],
  amount: number,
): [{ uid: number; amount: number }[], RngState] {
  let st = rng;
  const pool: number[] = [];
  for (const c of hand) for (let i = 0; i < c.charges; i++) pool.push(c.uid);
  const taken = new Map<number, number>();
  for (let i = 0; i < amount && pool.length > 0; i++) {
    let idx: number;
    [idx, st] = nextInt(st, pool.length);
    const uid = pool[idx];
    pool.splice(idx, 1);
    taken.set(uid, (taken.get(uid) ?? 0) + 1);
  }
  return [Array.from(taken, ([uid, n]) => ({ uid, amount: n })), st];
}

// ---------------------------------------------------------------------------
// Endings
// ---------------------------------------------------------------------------

/**
 * Who won, if anyone.
 *
 * `hullAtRoundStart` is what both fleets were worth before this round's damage
 * was applied. It only matters for the mutual-elimination case: two symmetric
 * fleets hunting with the same information die in the same round often enough
 * that leaving it a draw put the draw rate near 9%. Ruling Q2 breaks that tie
 * on who was ahead going in, and keeps the draw for the genuinely level case.
 */
export function checkOutcome(
  s: MatchState,
  hullAtRoundStart: [number, number] = [0, 0],
): MatchState['outcome'] {
  const dead0 = fleetDestroyed(s.players[0].ships);
  const dead1 = fleetDestroyed(s.players[1].ships);
  if (dead0 && dead1) {
    const [a, b] = hullAtRoundStart;
    if (a === b) return { kind: 'draw', reason: 'mutual' };
    return { kind: 'win', winner: a > b ? 0 : 1, reason: 'mutual' };
  }
  if (dead1) return { kind: 'win', winner: 0, reason: 'fleet' };
  if (dead0) return { kind: 'win', winner: 1, reason: 'fleet' };

  for (const p of [0, 1] as PlayerId[]) {
    if (s.players[p].timerStrikes >= s.config.timerStrikeLimit) {
      return { kind: 'win', winner: other(p), reason: 'timeout-strikes' };
    }
    if (!s.players[p].connected) {
      return { kind: 'win', winner: other(p), reason: 'disconnect' };
    }
  }

  if (s.round > s.config.roundCap) {
    const a = hullCellsRemaining(s.players[0].ships);
    const b = hullCellsRemaining(s.players[1].ships);
    if (a === b) return { kind: 'draw', reason: 'cells' };
    return { kind: 'win', winner: a > b ? 0 : 1, reason: 'cells' };
  }
  return null;
}

function describe(e: ResolveEvent): string {
  switch (e.t) {
    case 'reveal':
      return 'Plans revealed.';
    case 'nerf':
      return `P${e.by}: ${e.text}`;
    case 'prediction':
      return `P${e.by} ${e.card} on ${label(e.cell)}: ${e.triggered ? 'read' : 'missed'}`;
    case 'shot':
      return `P${e.by} ${e.source} -> ${label(e.cell)} ${e.hit ? 'HIT' : 'miss'}`;
    case 'sink':
      return `${e.length} SUNK`;
    case 'react':
      return `${e.defId}: ${e.text}`;
    case 'charges':
      return `P${e.to} +${e.amount} (${e.reason})`;
    case 'intel':
      return e.text;
    case 'draw':
      return `P${e.to} draws ${e.count}`;
    case 'strike':
      return `P${e.who} timer strike ${e.total}`;
    case 'end':
      return e.outcome.kind === 'draw' ? 'DRAW' : `P${e.outcome.winner} wins (${e.outcome.reason})`;
    default:
      return '';
  }
}
