import type { CellIndex, MatchState, PlayerId, PlacedHull } from './types';
import { other, cellAddress, orthNeighbours } from './types';
import { HULLS } from '../content/hulls';
import { hasTerrain } from './state';
import { nextInt } from '../engine/rng';

/**
 * Shot resolution. Everything that fires goes through here, so the eight
 * symbols, the terrain cards and the report rules behave identically no
 * matter which card or ability pulled the trigger.
 */
export type ShotResult =
  | 'hit'          // struck a hull cell
  | 'wreck-hit'    // empty wreckage, which always answers "hit"
  | 'miss'
  | 'blocked'      // reef stopped a line effect before this cell
  | 'negated';     // Bulkheads or Vesper ate the damage

export interface FireOpts {
  /** Named for the log — "Torpedo", "Harpoon", "the strike wing". */
  source: string;
  /** Suppress the per-cell log line; aggregate effects log once. */
  quiet?: boolean;
  /** Hit income is credited unless this is explicitly false. */
  income?: boolean;
}

function log(ms: MatchState, p: PlayerId, text: string, kind: 'shot' | 'info' | 'card' | 'ability' | 'system' = 'shot') {
  ms.log.push({ turn: ms.turn, player: p, text, kind });
}

/** Is this cell part of a hull that is still afloat? */
export function hullAt(ms: MatchState, owner: PlayerId, cell: CellIndex): PlacedHull | null {
  return ms.players[owner].hulls.find((h) => !h.sunk && h.cells.includes(cell)) ?? null;
}

/** Ground truth: does a living hull occupy this cell? */
export function isOccupied(ms: MatchState, owner: PlayerId, cell: CellIndex): boolean {
  return hullAt(ms, owner, cell) !== null;
}

/**
 * Hits a cell needs before it is destroyed. Trench cells take two — unless a
 * terrain card says otherwise.
 */
export function hitsRequired(ms: MatchState, cell: CellIndex): number {
  return ms.board.symbols[cell] === 'TRENCH' ? 2 : 1;
}

/**
 * Fire one cell of the defender's board.
 *
 * Order matters: a hit credits its cube immediately, mid-resolution, so a
 * cheap probe can fund the card that follows it in the same turn.
 */
export function fireCell(
  ms: MatchState,
  shooter: PlayerId,
  cell: CellIndex,
  opts: FireOpts,
): ShotResult {
  const defender = other(shooter);
  const sp = ms.players[shooter];
  const dp = ms.players[defender];
  const board = ms.board;
  const addr = cellAddress(board, cell);
  const symbol = board.symbols[cell];

  sp.shotsFired += 1;

  // Sheet Anchor: every hit on their fleet costs the shooter a cube. Charged
  // on the hit itself, below.
  const hull = hullAt(ms, defender, cell);

  // ---- Empty wreckage always answers "hit" ----
  if (!hull && symbol === 'WRECKAGE') {
    dp.discs[cell] = { kind: 'red', cube: false };
    if (!opts.quiet) log(ms, shooter, `${opts.source} at ${addr} — hit.`);
    // A phantom wreck pays nothing: no hull was struck.
    return 'wreck-hit';
  }

  if (!hull) {
    if (dp.discs[cell] === null) dp.discs[cell] = { kind: 'white' };
    if (!opts.quiet) log(ms, shooter, `${opts.source} at ${addr} — miss.`);
    return 'miss';
  }

  // ---- A hull is here ----
  // Vesper: for two turns their shots are answered honestly but destroy
  // nothing. The disc goes red — the answer is honest — but no damage lands.
  if (dp.statuses.vesperUntil >= dp.turnCount) {
    dp.discs[cell] = { kind: 'red', cube: false };
    if (!opts.quiet) log(ms, shooter, `${opts.source} at ${addr} — hit.`);
    return 'negated';
  }

  // Bulkheads: the first hit each turn on your fleet is negated.
  if (dp.statuses.bulkheadsUntil >= dp.turnCount && dp.statuses.hitsTakenThisTurn === 0) {
    dp.statuses.hitsTakenThisTurn += 1;
    dp.discs[cell] = { kind: 'red', cube: false };
    if (!opts.quiet) log(ms, shooter, `${opts.source} at ${addr} — hit, but the bulkheads hold.`);
    return 'negated';
  }

  const ci = hull.cells.indexOf(cell);
  if (hull.destroyed[ci]) {
    // Already gone; the disc is already red and nothing further happens.
    if (!opts.quiet) log(ms, shooter, `${opts.source} at ${addr} — wreckage.`);
    return 'wreck-hit';
  }

  hull.hits[ci] += 1;
  dp.statuses.hitsTakenThisTurn += 1;
  sp.hitsScored += 1;
  sp.statuses.hitsLandedThisTurn += 1;
  if (ms.stats.firstHitBy === null) ms.stats.firstHitBy = shooter;

  const required = hitsRequired(ms, cell);
  const destroyed = hull.hits[ci] >= required;
  if (destroyed) hull.destroyed[ci] = true;

  // Trench: first hit shows a red disc with a cube on it; the second removes it.
  dp.discs[cell] = { kind: 'red', cube: required > 1 && !destroyed };

  if (!opts.quiet) {
    const inFog = board.symbols[cell] === 'FOG';
    if (inFog) log(ms, shooter, `${opts.source} at ${addr} — hit, somewhere in the fog.`);
    else if (!destroyed) log(ms, shooter, `${opts.source} at ${addr} — hit, and it holds.`);
    else log(ms, shooter, `${opts.source} at ${addr} — hit.`);
  }

  // ---- Income and reactions, in order ----
  if (opts.income !== false) grantHitCube(ms, shooter, cell);

  // Upwelling pays the hull's owner when they are hit there.
  if (board.symbols[cell] === 'UPWELLING') {
    dp.cubes += 2;
    log(ms, defender, `The upwelling at ${addr} boils — ${dp.name} takes 2 cubes.`, 'info');
  }
  // Salvage Yards: destroying a hull cell on wreckage pays the shooter.
  if (destroyed && board.symbols[cell] === 'WRECKAGE' && hasTerrain(ms, 'salvage_yards')) {
    sp.cubes += 3;
    log(ms, shooter, `Salvage yards — ${sp.name} takes 3 cubes.`, 'info');
  }
  // Sheet Anchor: every hit costs the shooter a cube.
  if (dp.statuses.sheetAnchorUntil >= dp.turnCount) {
    sp.cubes = Math.max(0, sp.cubes - 1);
    log(ms, shooter, `The sheet anchor drags — ${sp.name} loses a cube.`, 'info');
  }

  // Shallows: a hit here also reveals the four orthogonal neighbours.
  if (board.symbols[cell] === 'SHALLOWS' && !hasTerrain(ms, 'slack_tide')) {
    const neigh = orthNeighbours(cell, board.gridW, board.gridH);
    const occupied = neigh.filter((n) => isOccupied(ms, defender, n));
    const empty = neigh.filter((n) => !occupied.includes(n));
    if (occupied.length) {
      sp.annotations.push({ kind: 'occupied', cells: occupied, turn: ms.turn, source: 'Shallows' });
    }
    if (empty.length) {
      sp.annotations.push({ kind: 'empty', cells: empty, turn: ms.turn, source: 'Shallows' });
    }
    log(ms, shooter, `The shallows at ${addr} betray what surrounds them.`, 'info');
  }

  // Hull REACT abilities that fire on being hit.
  onHullHit(ms, defender, hull);

  if (destroyed && hull.destroyed.every(Boolean)) sinkHull(ms, shooter, hull);
  return 'hit';
}

/** A cube per hit, credited immediately and spendable this same turn. */
export function grantHitCube(ms: MatchState, shooter: PlayerId, _cell: CellIndex): void {
  const sp = ms.players[shooter];
  // Lean Season: every hit pays 2 cubes instead of 1.
  const pay = hasTerrain(ms, 'lean_season') ? 2 : 1;
  sp.cubes += pay;
  ms.stats.peakBank[shooter] = Math.max(ms.stats.peakBank[shooter], sp.cubes);
}

/** REACT abilities that trigger when this hull is hit. */
function onHullHit(ms: MatchState, owner: PlayerId, hull: PlacedHull): void {
  const def = HULLS[hull.defId];
  if (def.trigger !== 'REACT') return;
  const op = ms.players[owner];
  const foe = ms.players[other(owner)];

  switch (def.id) {
    case 'salvager':
      hull.revealed = true;
      op.cubes += 3;
      log(ms, owner, `Salvager — ${op.name} takes 3 cubes.`, 'ability');
      break;
    case 'saboteur':
      hull.revealed = true;
      foe.statuses.nextCardSurcharge += 2;
      log(ms, owner, `Saboteur — their next card costs 2 more.`, 'ability');
      break;
    case 'boarder': {
      hull.revealed = true;
      if (op.hand.length > 0 && foe.hand.length > 0) {
        let i: number;
        let j: number;
        [i, ms.rng] = nextInt(ms.rng, op.hand.length);
        [j, ms.rng] = nextInt(ms.rng, foe.hand.length);
        const mine = op.hand[i];
        op.hand[i] = foe.hand[j];
        foe.hand[j] = mine;
        log(ms, owner, `Boarder — cards change hands.`, 'ability');
      }
      break;
    }
    default:
      break;
  }
}

/**
 * A hull dies. When-sunk reactions resolve BEFORE the sink is announced, and
 * a hull that dies inside fog sinks in silence — the owner says only "hit".
 */
export function sinkHull(ms: MatchState, shooter: PlayerId, hull: PlacedHull): void {
  const owner = other(shooter);
  const op = ms.players[owner];
  const sp = ms.players[shooter];
  const def = HULLS[hull.defId];
  hull.sunk = true;
  ms.stats.sinkTurns[owner].push(ms.turn);

  // --- When-sunk reactions, before the announcement ---
  if (def.trigger === 'REACT') {
    hull.revealed = true;
    switch (def.id) {
      case 'magazine':
        op.cubes += 5;
        log(ms, owner, `Magazine detonates — ${op.name} takes 5 cubes.`, 'ability');
        break;
      case 'wrecker':
        if (sp.hand.length > 0) {
          let i: number;
          [i, ms.rng] = nextInt(ms.rng, sp.hand.length);
          const [removed] = sp.hand.splice(i, 1);
          removed.gone = true;
          log(ms, owner, `Wrecker takes a card down with it.`, 'ability');
        }
        break;
      case 'bastion': {
        // Repeat every hit they landed this turn onto their board.
        const repeats = sp.statuses.hitsLandedThisTurn;
        if (repeats > 0) {
          log(ms, owner, `Bastion answers — ${repeats} hit${repeats === 1 ? '' : 's'} returned.`, 'ability');
          const targets = livingCells(ms, shooter).slice(0, repeats);
          for (const c of targets) {
            fireCell(ms, owner, c, { source: 'Bastion', income: false, quiet: true });
          }
        }
        break;
      }
      default:
        break;
    }
  }

  // Prize Money: sinking pays cubes equal to the hull's length.
  if (hasTerrain(ms, 'prize_money')) {
    sp.cubes += def.length;
    log(ms, shooter, `Prize money — ${sp.name} takes ${def.length} cubes.`, 'info');
  }

  sp.statuses.sankThisTurn = true;

  // --- The announcement: length only, and silence inside fog ---
  const allInFog = hull.cells.every((c) => ms.board.symbols[c] === 'FOG');
  if (allInFog) {
    log(ms, shooter, `A hit, and then nothing. Something went down out there.`, 'info');
  } else {
    sp.sunkLengths.push(def.length);
    log(ms, shooter, `${def.length} sunk.`, 'info');
  }

  checkVictory(ms, shooter);
}

/** Every cell of a player's still-living hulls. */
export function livingCells(ms: MatchState, p: PlayerId): CellIndex[] {
  const out: CellIndex[] = [];
  for (const h of ms.players[p].hulls) {
    if (h.sunk) continue;
    h.cells.forEach((c, i) => {
      if (!h.destroyed[i]) out.push(c);
    });
  }
  return out;
}

export function aliveHulls(ms: MatchState, p: PlayerId): number {
  return ms.players[p].hulls.filter((h) => !h.sunk).length;
}

export function checkVictory(ms: MatchState, actor: PlayerId): void {
  if (ms.phase === 'over') return;
  const foeDead = aliveHulls(ms, other(actor)) === 0;
  const selfDead = aliveHulls(ms, actor) === 0;
  if (!foeDead && !selfDead) return;
  ms.phase = 'over';
  ms.winner = foeDead ? actor : other(actor);
  log(ms, ms.winner, `${ms.players[ms.winner].name} takes it — the last fleet afloat.`, 'system');
}
