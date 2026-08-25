import type { CellIndex, FireSpec, Plan } from '../engine/types';
import { BOARD, CELLS, cellAt, emptyPlan, xy } from '../engine/types';
import type { ClientView } from '../engine/view';
import type { Placement } from '../engine/board';
import { autoDeploy, block, orthLine, rowRun } from '../engine/board';
import { CARDS, canFireAt } from '../engine/cards';
import { SHIPS } from '../engine/ships';
import { nextInt, pick, shuffle, type RngState } from '../engine/rng';
import {
  bestBlock,
  bestLine,
  bestRowRun,
  cardBelief,
  density,
  emptyOwnCells,
  fleetBelief,
  predictTheirShot,
  remainingLengths,
} from './belief';

/**
 * Four opponents.
 *
 * They all read the same client view a human gets — no bot ever touches the
 * match state, so none of them can cheat by construction. What separates them
 * is how much of the view they bother to use.
 *
 *  1 Deckhand — fires at random and charges at random. A warm body.
 *  2 Mate     — hunts properly and grows one card, but never reads anything.
 *  3 Officer  — values every card at its current charge count and fires when
 *               waiting stops paying. Uses ship abilities on their triggers.
 *  4 Admiral  — all of that, plus a distribution over the enemy's 64 possible
 *               fleets and a model of where they are about to shoot, which is
 *               what makes Mirror and Ambush more than a coin flip.
 */
export type Level = 1 | 2 | 3 | 4;

export const LEVEL_NAMES: Record<Level, string> = {
  1: 'Deckhand',
  2: 'Mate',
  3: 'Officer',
  4: 'Admiral',
};

// ---------------------------------------------------------------------------
// Drafting
// ---------------------------------------------------------------------------

/** Rough desirability, used only to break the draft open at low levels. */
const SHIP_VALUE: Record<string, number> = {
  warhead: 9, forge: 7, blackout: 7, dreadnought: 6,
  kiln: 9, beacon: 7, leech: 7, cinder: 5,
  ember: 8, pin: 6, thorn: 6, spite: 7,
};

const CARD_VALUE: Record<string, number> = {
  salvo: 9, burst: 8, breaker: 8, lance: 7, rake: 7,
  echo: 7, ping: 6, sounding: 5,
  siphon: 7, jam: 6,
  ambush: 6, mirror: 5,
};

export function botShipPick(view: ClientView, level: Level, rng: RngState): [string, RngState] {
  const pack = view.shipDraft.packs[view.shipDraft.index] ?? [];
  if (level === 1) {
    const [choice, st] = pick(rng, pack);
    return [choice ?? pack[0], st];
  }
  const ordered = pack.slice().sort((a, b) => (SHIP_VALUE[b] ?? 0) - (SHIP_VALUE[a] ?? 0));
  // Levels 2 and 3 take the best on the card. The Admiral sometimes takes the
  // second-best, because a fleet nobody can predict is worth a little value.
  if (level === 4) {
    const [roll, st] = nextInt(rng, 4);
    return [ordered[roll === 0 ? 1 : 0] ?? ordered[0], st];
  }
  return [ordered[0], rng];
}

export function botCardPick(view: ClientView, level: Level, rng: RngState): [string, RngState] {
  const pack = view.cardDraft.packs[view.cardDraft.index] ?? [];
  if (level === 1) {
    const [choice, st] = pick(rng, pack);
    return [choice ?? pack[0], st];
  }
  const held = new Set(view.me.draftedCards);
  const ordered = pack
    .slice()
    .sort((a, b) => value(b) - value(a));
  function value(id: string): number {
    let v = CARD_VALUE[id] ?? 5;
    // A second copy of the same trick is worth less than a new one.
    if (held.has(id)) v -= 3;
    return v;
  }
  if (level === 4) {
    const [roll, st] = nextInt(rng, 5);
    return [ordered[roll === 0 ? 1 : 0] ?? ordered[0], st];
  }
  return [ordered[0], rng];
}

// ---------------------------------------------------------------------------
// Deployment
// ---------------------------------------------------------------------------

/**
 * Ships want to sit where a hunter looks last. The prior every density search
 * starts from favours the middle of the board, so a good layout hugs the
 * edges — and lets two hulls touch, which makes one long smear of hits read
 * as a ship that is not there.
 */
export function botDeploy(view: ClientView, level: Level, rng: RngState): [Placement[], RngState] {
  const ids = view.me.draftedShips;
  if (level === 1) return autoDeploy(ids, rng);

  let st = rng;
  let best: Placement[] | null = null;
  let bestScore = -Infinity;
  const tries = level >= 3 ? 40 : 8;
  for (let i = 0; i < tries; i++) {
    let candidate: Placement[];
    [candidate, st] = autoDeploy(ids, st);
    const score = layoutScore(candidate);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return [best ?? (autoDeploy(ids, st)[0] as Placement[]), st];
}

function layoutScore(placements: Placement[]): number {
  const all = placements.flatMap((p) => p.cells);
  let score = 0;
  for (const c of all) {
    const [x, y] = xy(c);
    // Distance from the centre of the board, which is where hunters start.
    score += Math.abs(x - 2.5) + Math.abs(y - 2.5);
  }
  // Reward exactly one touching pair: enough to confuse, not enough to hand
  // over two ships to a single 2x2.
  let touching = 0;
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      if (placements[i].cells.some((a) => placements[j].cells.some((b) => adjacent(a, b)))) touching++;
    }
  }
  score += touching === 1 ? 3 : -2 * touching;
  return score;
}

function adjacent(a: CellIndex, b: CellIndex): boolean {
  const [ax, ay] = xy(a);
  const [bx, by] = xy(b);
  return Math.abs(ax - bx) + Math.abs(ay - by) === 1;
}

// ---------------------------------------------------------------------------
// Planning a round
// ---------------------------------------------------------------------------

interface Options {
  prob: number[];
  ranked: CellIndex[];
  openClusters: CellIndex[][];
  view: ClientView;
  level: Level;
}

export function botPlan(view: ClientView, level: Level, rng: RngState): [Plan, RngState] {
  let st = rng;
  const hand = view.me.hand;
  const plan: Plan = emptyPlan();

  if (hand.length === 0 && view.me.restrictions.noCharge) {
    let cell: CellIndex | null;
    [cell, st] = randomUnfired(view, st);
    return [{ ...plan, basic: cell }, st];
  }

  const alive = remainingLengths(view);
  const d = density(view.me.marks, view.me.knownShipCells, alive, view.me.counts);
  const prob = toProbabilities(view, d.weight, alive);
  const opts: Options = { prob, ranked: d.ranked, openClusters: d.openClusters, view, level };

  // --- Level 1 plays with its eyes shut ------------------------------------
  if (level === 1) {
    let basic: CellIndex | null;
    [basic, st] = randomUnfired(view, st);
    let target: (typeof hand)[number] | null;
    [target, st] = pick(st, hand);
    const firable = hand.filter((c) => canFireAt(c.defId, c.charges));
    let shoot: (typeof hand)[number] | null = null;
    if (!view.me.restrictions.noFire && firable.length) {
      [shoot, st] = pick(st, firable);
    }
    let spec: FireSpec | null = null;
    if (shoot) [spec, st] = randomSpec(shoot.defId, shoot.charges, view, st);
    return [
      {
        ...plan,
        chargeTo: view.me.restrictions.noCharge ? null : target?.uid ?? null,
        bonusTo: target?.uid ?? null,
        basic,
        fire: shoot && spec ? { uid: shoot.uid, spec } : null,
      },
      st,
    ];
  }

  plan.basic = d.ranked[0] ?? (await0(randomUnfired(view, st)) as CellIndex);

  // --- Pick the card to grow, and decide whether to fire it now ------------
  const scored = hand.map((c) => {
    const now = c.charges + 1; // the mandatory charge lands before firing
    return {
      card: c,
      now,
      firable: canFireAt(c.defId, now) && !lockedOut(view, now),
      scoreNow: scoreCard(c.defId, now, opts),
      scoreNext: scoreCard(c.defId, now + 1, opts),
    };
  });

  const growth = scored
    .slice()
    .sort((a, b) => b.scoreNext - b.scoreNow - (a.scoreNext - a.scoreNow) || a.card.uid - b.card.uid);
  const chargeTarget = growth[0]?.card ?? hand[0];

  let firing: (typeof scored)[number] | null = null;
  if (!view.me.restrictions.noFire) {
    const ready = scored.filter((s) => s.firable && s.scoreNow > 0);
    ready.sort((a, b) => b.scoreNow - a.scoreNow || a.card.uid - b.card.uid);
    const candidate = ready[0];
    if (candidate && shouldFire(candidate.scoreNow, candidate.scoreNext, view, level)) {
      firing = candidate;
    }
  }

  // Charging the card you are about to fire is a free extra charge, so the
  // charge follows the shot whenever there is one.
  plan.chargeTo = view.me.restrictions.noCharge ? null : (firing?.card.uid ?? chargeTarget?.uid ?? null);
  if (plan.chargeTo === null && !view.me.restrictions.noCharge && hand.length) {
    plan.chargeTo = hand[0].uid;
  }
  // Charges earned this round should land on whatever is being grown, not on
  // the card that is about to leave the game.
  const bonusHome = hand.find((c) => c.uid !== firing?.card.uid) ?? hand[0];
  plan.bonusTo = bonusHome?.uid ?? null;

  if (firing) {
    const charges = firing.card.charges + (plan.chargeTo === firing.card.uid ? 1 : 0);
    plan.fire = { uid: firing.card.uid, spec: aim(firing.card.defId, charges, opts, view, level) };
  }

  // --- Ship abilities -------------------------------------------------------
  const ability = chooseAbility(view, level, opts, plan);
  if (ability) plan.ability = ability;

  return [plan, st];
}

/** Small helper so the level-1 fallback can reuse the tuple-returning rng. */
function await0<T>(pair: [T, RngState]): T {
  return pair[0];
}

function lockedOut(view: ClientView, charges: number): boolean {
  return view.me.restrictions.chargeLock !== null && view.me.restrictions.chargeLock === charges;
}

/**
 * Scale the raw density weights so they sum to the number of enemy hull cells
 * still unhit. That turns "this cell looks likely" into "this many hits", so a
 * card's score is measured in the only currency that matters.
 */
function toProbabilities(view: ClientView, weight: number[], alive: number[]): number[] {
  const hitsLanded = Object.values(view.me.marks).filter((m) => m === 'hit').length;
  const sunkCells = view.foe.ships.filter((s) => s.sunk).reduce((n, s) => n + s.length, 0);
  const remaining = Math.max(0, alive.reduce((n, l) => n + l, 0) - Math.max(0, hitsLanded - sunkCells));
  let total = 0;
  for (let c = 0; c < CELLS; c++) if (view.me.marks[c] === undefined) total += weight[c];
  const scale = total > 0 ? remaining / total : 0;
  const out = new Array<number>(CELLS).fill(0);
  for (let c = 0; c < CELLS; c++) {
    if (view.me.marks[c] !== undefined) continue;
    out[c] = Math.min(1, weight[c] * scale);
  }
  return out;
}

function sumTop(prob: number[], ranked: CellIndex[], n: number): number {
  let total = 0;
  for (let i = 0; i < n && i < ranked.length; i++) total += prob[ranked[i]];
  return total;
}

/** Expected hits, plus whatever else the card is worth, in hit-equivalents. */
function scoreCard(defId: string, charges: number, o: Options): number {
  if (!canFireAt(defId, charges)) return 0;
  const { prob, ranked, view } = o;
  const enemyCharges = view.foe.hand.reduce((n, c) => n + c.charges, 0);
  const damagedLikely = o.openClusters.length > 0;

  switch (defId) {
    case 'salvo':
      return sumTop(prob, ranked, charges);
    case 'lance': {
      const line = bestLine(prob, charges);
      return orthLine(line.origin, line.dir, charges).reduce((n, c) => n + prob[c], 0);
    }
    case 'burst': {
      const size = charges >= 4 ? 3 : 2;
      return block(bestBlock(prob, size), size).reduce((n, c) => n + prob[c], 0);
    }
    case 'rake': {
      const len = 3 + Math.max(0, charges - 1);
      return rowRun(bestRowRun(prob, len), len).reduce((n, c) => n + prob[c], 0);
    }
    case 'breaker': {
      const cells = block(bestBlock(prob, 2), 2);
      const base = cells.reduce((n, c) => n + prob[c], 0);
      // The execute is the whole point; it is worth roughly a whole ship.
      return base + (damagedLikely ? 2.5 : 0.2);
    }
    case 'ping': {
      const hits = sumTop(prob, ranked, charges);
      return hits + charges * 0.35;
    }
    case 'echo': {
      const hits = sumTop(prob, ranked, charges);
      return hits + hits * 0.9;
    }
    case 'sounding': {
      const hit = prob[ranked[0] ?? 0] ?? 0;
      return hit + (charges >= 3 ? 0.9 : charges >= 2 ? 0.5 : 0);
    }
    case 'jam':
      return Math.min(charges, enemyCharges) * 0.45;
    case 'siphon':
      return Math.min(charges, enemyCharges) * 0.8;
    case 'mirror': {
      if (o.level < 4) return 0.2 * charges;
      const guess = predictTheirShot(view);
      const p = guess.length ? 1 / Math.max(3, guess.length) : 0;
      return p * (1.5 + charges * 0.6);
    }
    case 'ambush': {
      if (o.level < 3) return 0.1;
      const guess = predictTheirShot(view);
      const p = guess.length ? 1 / Math.max(3, guess.length) : 0;
      const shots = charges >= 3 ? 6 : charges >= 2 ? 3 : 1;
      return p * (sumTop(prob, ranked, shots) + 0.3);
    }
    default:
      return 0;
  }
}

/**
 * Waiting is not free: a charge spent waiting is a charge the opponent also
 * banked, and the match ends at round 20. Fire when one more round of growth
 * no longer beats the tempo it costs.
 */
function shouldFire(now: number, next: number, view: ClientView, level: Level): boolean {
  if (now <= 0) return false;
  if (level === 2) return now >= 1.1;
  const lateness = Math.min(1, view.round / view.roundCap);
  const patience = 0.86 - lateness * 0.25;
  // A near-certain finisher always goes now.
  if (now >= 2.4) return true;
  return now >= patience * next;
}

/** Turn a card into a declaration, aimed at the best cells available. */
function aim(defId: string, charges: number, o: Options, view: ClientView, level: Level): FireSpec {
  const { prob, ranked } = o;
  const shape = CARDS[defId].shape;
  switch (shape) {
    case 'cells':
      return { shape: 'cells', cells: ranked.slice(0, Math.max(1, charges)) };
    case 'line': {
      const line = bestLine(prob, charges);
      return { shape: 'line', origin: line.origin, dir: line.dir };
    }
    case 'block':
      return { shape: 'block', anchor: bestBlock(prob, defId === 'burst' && charges >= 4 ? 3 : 2) };
    case 'row':
      return { shape: 'row', origin: bestRowRun(prob, 3 + Math.max(0, charges - 1)) };
    case 'cell': {
      if (defId === 'mirror' || defId === 'ambush') {
        const guess = predictTheirShot(view);
        if (guess.length) return { shape: 'cell', cell: guess[0] };
        const spare = emptyOwnCells(view);
        return { shape: 'cell', cell: spare[0] ?? 0 };
      }
      return { shape: 'cell', cell: ranked[0] ?? 0 };
    }
    case 'strip': {
      const targets = fattest(view, charges);
      return { shape: 'strip', from: targets };
    }
    case 'steal': {
      const targets = fattest(view, charges);
      const dest = keepAlive(view);
      return { shape: 'steal', from: targets, toUid: dest };
    }
    case 'beacon': {
      const { row, col } = bestReadout(view, prob, level);
      return { shape: 'beacon', row, col, cells: ranked.slice(0, 4) };
    }
    default:
      return { shape: 'cell', cell: ranked[0] ?? 0 };
  }
}

/** Their fullest cards, which is where charge theft pays. */
function fattest(view: ClientView, budget: number): { uid: number; amount: number }[] {
  const out: { uid: number; amount: number }[] = [];
  let left = budget;
  for (const c of view.foe.hand.slice().sort((a, b) => b.charges - a.charges)) {
    if (left <= 0) break;
    if (c.charges <= 0) continue;
    const take = Math.min(c.charges, left);
    out.push({ uid: c.uid, amount: take });
    left -= take;
  }
  if (!out.length && view.foe.hand.length) out.push({ uid: view.foe.hand[0].uid, amount: 1 });
  return out;
}

/** Somewhere to put stolen charges: the card that is not about to be spent. */
function keepAlive(view: ClientView): number {
  const sorted = view.me.hand.slice().sort((a, b) => b.charges - a.charges);
  return sorted[0]?.uid ?? view.me.hand[0]?.uid ?? 0;
}

/** The row and column a readout would tell you most about. */
function bestReadout(view: ClientView, prob: number[], level: Level): { row: number; col: number } {
  let bestRow = 0;
  let bestCol = 0;
  let rowScore = -1;
  let colScore = -1;
  for (let i = 0; i < BOARD; i++) {
    if (level >= 3 && view.me.counts.rows[i] !== undefined) continue;
    let r = 0;
    for (let x = 0; x < BOARD; x++) r += prob[cellAt(x, i)];
    if (r > rowScore) {
      rowScore = r;
      bestRow = i;
    }
  }
  for (let i = 0; i < BOARD; i++) {
    if (level >= 3 && view.me.counts.cols[i] !== undefined) continue;
    let c = 0;
    for (let y = 0; y < BOARD; y++) c += prob[cellAt(i, y)];
    if (c > colScore) {
      colScore = c;
      bestCol = i;
    }
  }
  return { row: bestRow, col: bestCol };
}

// ---------------------------------------------------------------------------
// Ship abilities
// ---------------------------------------------------------------------------

function chooseAbility(
  view: ClientView,
  level: Level,
  o: Options,
  plan: Plan,
): { defId: string; spec: FireSpec } | null {
  const ready = view.me.ships.filter(
    (s) => !s.sunk && !s.abilityUsed && SHIPS[s.defId]?.type !== 'REACT',
  );
  if (!ready.length) return null;
  const { prob, ranked } = o;
  const enemyCharges = view.foe.hand.reduce((n, c) => n + c.charges, 0);
  const late = view.round >= view.roundCap - 4;
  const belief = level === 4 ? fleetBelief(view) : null;

  for (const ship of ready) {
    switch (ship.defId) {
      case 'warhead': {
        // Worth holding until something is already damaged, since the execute
        // is what makes it more than a small Burst.
        const anchor = bestBlock(prob, 2);
        const cells = block(anchor, 2);
        const covered = cells.reduce((n, c) => n + prob[c], 0);
        if ((o.openClusters.length > 0 && covered >= 0.8) || (late && covered >= 1)) {
          return { defId: 'warhead', spec: { shape: 'block', anchor } };
        }
        break;
      }
      case 'forge': {
        const line = bestLine(prob, 3);
        const covered = orthLine(line.origin, line.dir, 3).reduce((n, c) => n + prob[c], 0);
        if (covered >= 0.9 || late) {
          return { defId: 'forge', spec: { shape: 'line', origin: line.origin, dir: line.dir } };
        }
        break;
      }
      case 'ember': {
        const covered = sumTop(prob, ranked, 4);
        if (covered >= 1.2 || late) {
          return { defId: 'ember', spec: { shape: 'cells', cells: ranked.slice(0, 4) } };
        }
        break;
      }
      case 'pin': {
        const best = prob[ranked[0] ?? 0] ?? 0;
        if (best >= 0.6 && enemyCharges >= 3) {
          return { defId: 'pin', spec: { shape: 'cell', cell: ranked[0] } };
        }
        break;
      }
      case 'blackout': {
        if (enemyCharges >= 5 || (late && enemyCharges >= 3)) {
          return { defId: 'blackout', spec: { shape: 'none' } };
        }
        break;
      }
      case 'leech': {
        if (enemyCharges >= 4) {
          return {
            defId: 'leech',
            spec: { shape: 'steal', from: fattest(view, 3), toUid: keepAlive(view) },
          };
        }
        break;
      }
      case 'beacon': {
        if (view.round <= 4 || o.openClusters.length === 0) {
          const { row, col } = bestReadout(view, prob, level);
          return { defId: 'beacon', spec: { shape: 'beacon', row, col, cells: ranked.slice(0, 4) } };
        }
        break;
      }
      case 'kiln': {
        // Kiln is worth its ship when it turns a card that is not yet worth
        // firing into one that is.
        const candidates = view.me.hand
          .filter((c) => c.uid !== plan.fire?.uid)
          .map((c) => ({
            c,
            gain: scoreCard(c.defId, c.charges + 3, o) - scoreCard(c.defId, c.charges, o),
            at: scoreCard(c.defId, c.charges + 3, o),
          }))
          .filter((x) => canFireAt(x.c.defId, x.c.charges + 3))
          .sort((a, b) => b.at - a.at);
        const top = candidates[0];
        if (top && (top.at >= 2.2 || (late && top.at >= 1.2))) {
          return {
            defId: 'kiln',
            spec: {
              shape: 'kiln',
              uid: top.c.uid,
              inner: aim(top.c.defId, top.c.charges + 3, o, view, level),
            },
          };
        }
        break;
      }
      default:
        break;
    }
  }

  // The Admiral spends a held ability rather than take it to the bottom of the
  // sea: a fleet one hit from gone has no later.
  if (belief && view.me.ships.filter((s) => !s.sunk).length === 1 && ready.length) {
    const ship = ready[0];
    const shape = SHIPS[ship.defId].shape;
    if (shape === 'none') return { defId: ship.defId, spec: { shape: 'none' } };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Random helpers for level 1
// ---------------------------------------------------------------------------

function randomUnfired(view: ClientView, rng: RngState): [CellIndex | null, RngState] {
  const open: CellIndex[] = [];
  for (let c = 0; c < CELLS; c++) if (view.me.marks[c] === undefined) open.push(c);
  return pick(rng, open.length ? open : [0]);
}

function randomSpec(
  defId: string,
  charges: number,
  view: ClientView,
  rng: RngState,
): [FireSpec, RngState] {
  let st = rng;
  const shape = CARDS[defId].shape;
  const all: CellIndex[] = [];
  for (let c = 0; c < CELLS; c++) all.push(c);
  let shuffled: CellIndex[];
  [shuffled, st] = shuffle(st, all);
  switch (shape) {
    case 'cells':
      return [{ shape: 'cells', cells: shuffled.slice(0, Math.max(1, charges)) }, st];
    case 'line':
      return [{ shape: 'line', origin: shuffled[0], dir: [1, 0] }, st];
    case 'block':
      return [{ shape: 'block', anchor: cellAt(0, 0) }, st];
    case 'row':
      return [{ shape: 'row', origin: shuffled[0] }, st];
    case 'cell':
      return [{ shape: 'cell', cell: shuffled[0] }, st];
    case 'strip':
      return [{ shape: 'strip', from: fattest(view, charges) }, st];
    case 'steal':
      return [{ shape: 'steal', from: fattest(view, charges), toUid: keepAlive(view) }, st];
    case 'beacon':
      return [{ shape: 'beacon', row: 0, col: 0, cells: shuffled.slice(0, 4) }, st];
    default:
      return [{ shape: 'none' }, st];
  }
}

/** Exposed so the sim can report which cards a level actually reaches for. */
export { scoreCard as debugScoreCard };
export { cardBelief };
