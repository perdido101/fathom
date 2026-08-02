import type { Board, MatchState, PlayerId, PlayerState, Statuses, CardInstance } from './types';
import { deploymentPossible, dealBoard } from './board';
import { HULLS } from '../content/hulls';
import { BASIC_SALVO_ID } from '../content/actions';
import { TERRAIN_CARD_IDS, TERRAIN_CARDS } from '../content/terrainCards';
import { MATCH_SIZES, type MatchSize } from '../content/grids';
import { seedRng, seedName, shuffle, nextInt, type RngState } from '../engine/rng';

export const CORE_VERSION = 3;

export interface MatchSetup {
  seed: string;
  size: MatchSize['id'];
  /** Skip terrain cards entirely — the rulebook's first-game variant. */
  useTerrainCards?: boolean;
  players: [{ name: string; isAI: boolean }, { name: string; isAI: boolean }];
}

function freshStatuses(): Statuses {
  return {
    pendingCubes: 0,
    attackDiscountTurn: -1,
    nextCardSurcharge: 0,
    nextAttackSurcharge: 0,
    vesperUntil: -1,
    bulkheadsUntil: -1,
    sheetAnchorUntil: -1,
    stormChaserTurn: -1,
    reefRunnerArmed: false,
    doubleNextRead: false,
    standing: [],
    hitsTakenThisTurn: 0,
    hitsLandedLastTurn: 0,
    hitsLandedThisTurn: 0,
    sankLastTurn: false,
    sankThisTurn: false,
    basicSalvoUsed: 0,
    pendingCopy: null,
    pendingBuoys: [],
  };
}

function makePlayer(
  id: PlayerId,
  cfg: { name: string; isAI: boolean },
  board: Board,
  uidBase: number,
): PlayerState {
  const basicSalvo: CardInstance = {
    uid: uidBase,
    defId: BASIC_SALVO_ID,
    faceUp: true, // never drafted, always in play
    straightensOn: 0,
    gone: false,
    locked: false,
    playableFrom: 0,
  };
  return {
    id,
    name: cfg.name,
    isAI: cfg.isAI,
    cubes: 0,
    toDeploy: [],
    hulls: [],
    hand: [],
    basicSalvo,
    discs: new Array(board.gridW * board.gridH).fill(null),
    annotations: [],
    sunkLengths: [],
    draftClues: [],
    statuses: freshStatuses(),
    turnCount: 0,
    shotsFired: 0,
    hitsScored: 0,
    deployed: false,
  };
}

/**
 * Flip two terrain cards. They apply to both players all match. If the pair
 * conflicts or makes deployment impossible, one is discarded and redrawn.
 *
 * Legality is checked, not looked up: a pair is rejected when the board it
 * produces cannot actually accommodate a full fleet, or when the two cards
 * make contradictory demands about the same thing.
 */
export function drawTerrainPair(
  rng: RngState,
  board: Board,
  fleetLengths: number[],
): [string[], RngState] {
  let st = rng;
  for (let attempt = 0; attempt < 40; attempt++) {
    let order: string[];
    [order, st] = shuffle(st, TERRAIN_CARD_IDS);
    const pair = order.slice(0, 2);
    if (terrainPairLegal(pair, board, fleetLengths, st)) return [pair, st];
  }
  // Nothing legal found — play without terrain cards rather than deadlock.
  return [[], st];
}

/** Reasons a pair is rejected, so the harness can report them. */
export function terrainPairConflict(
  pair: string[],
  board: Board,
  fleetLengths: number[],
  rng: RngState,
): string | null {
  const [a, b] = pair;
  if (!a || !b) return null;
  const ids = new Set(pair);

  // Two cards that both rewrite the hull count pull in opposite directions.
  if (ids.has('full_roster') && ids.has('skeleton_crews')) {
    return 'full_roster and skeleton_crews both rewrite how many hulls are dealt';
  }
  // Deployment constraints can each be satisfiable alone but not together,
  // so they are checked by attempting real layouts under both at once.
  const constraints = {
    mustTouch: ids.has('convoy'),
    mustSitOnSymbol: ids.has('shoal_water'),
  };
  if (!deploymentPossible(fleetLengths, board, rng, constraints)) {
    const named = [
      constraints.mustTouch ? 'convoy' : null,
      constraints.mustSitOnSymbol ? 'shoal_water' : null,
    ].filter(Boolean);
    return named.length
      ? `${named.join(' + ')} makes deployment impossible on this sea`
      : 'the sea cannot accommodate a full fleet';
  }
  return null;
}

export function terrainPairLegal(
  pair: string[],
  board: Board,
  fleetLengths: number[],
  rng: RngState,
): boolean {
  return terrainPairConflict(pair, board, fleetLengths, rng) === null;
}

/**
 * Build a match up to the point of deployment: sea dealt, terrain flipped,
 * first player chosen. Fleets and hands are filled in by the drafts, which
 * run before this in the real sequence and are passed in here.
 */
export function createMatch(
  setup: MatchSetup,
  drafted: [{ hulls: string[]; hand: string[] }, { hulls: string[]; hand: string[] }],
  clues: [string[][], string[][]],
  burnPile: string[],
): MatchState {
  const size = MATCH_SIZES[setup.size];
  let st: RngState = seedRng(`${setup.seed}:sea`);
  let board: Board;
  [board, st] = dealBoard(st, size);

  const fleetLengths = drafted[0].hulls.map((id) => HULLS[id].length);
  let terrainCards: string[] = [];
  if (setup.useTerrainCards !== false) {
    [terrainCards, st] = drawTerrainPair(st, board, fleetLengths);
  }

  const p0 = makePlayer(0, setup.players[0], board, 1000);
  const p1 = makePlayer(1, setup.players[1], board, 2000);
  p0.toDeploy = drafted[0].hulls.slice();
  p1.toDeploy = drafted[1].hulls.slice();
  p0.draftClues = clues[0];
  p1.draftClues = clues[1];
  p0.hand = drafted[0].hand.map((defId, i) => makeCard(1100 + i, defId));
  p1.hand = drafted[1].hand.map((defId, i) => makeCard(2100 + i, defId));

  // War Chest: both players begin with 6 banked cubes.
  if (terrainCards.includes('war_chest')) {
    p0.cubes = 6;
    p1.cubes = 6;
  }

  let firstRoll: number;
  [firstRoll, st] = nextInt(st, 2);
  const firstPlayer = firstRoll as PlayerId;

  return {
    version: CORE_VERSION,
    seed: setup.seed,
    seedName: seedName(setup.seed),
    board,
    terrainCards,
    phase: 'deploy',
    turn: 0,
    current: firstPlayer,
    firstPlayer,
    winner: null,
    players: [p0, p1],
    burnPile: burnPile.slice(),
    rng: st,
    log: [
      {
        turn: 0,
        player: firstPlayer,
        text: terrainCards.length
          ? `The sea is dealt. Conditions: ${terrainCards.map((t) => TERRAIN_CARDS[t].name).join(' and ')}.`
          : 'The sea is dealt. Clear conditions.',
        kind: 'system',
      },
    ],
    stats: {
      firstHitBy: null,
      cubesSpent: [0, 0],
      peakBank: [0, 0],
      cardPlays: [{}, {}],
      abilityUses: [{}, {}],
      sinkTurns: [[], []],
      shotsAtPenultimate: [null, null],
    },
    nextUid: 1,
  };
}

function makeCard(uid: number, defId: string): CardInstance {
  return {
    uid,
    defId,
    faceUp: false, // hidden in hand until first played
    straightensOn: 0,
    gone: false,
    locked: false,
    playableFrom: 0,
  };
}

/** Is this terrain card in play? */
export function hasTerrain(ms: MatchState, id: string): boolean {
  return ms.terrainCards.includes(id);
}
