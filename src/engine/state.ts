import type { CellIntel, FleetClue, MatchConfig, MatchState, PlayerId, PlayerState } from './types';
import { hashString, seedRng, seedName } from './rng';
import { generateMap } from './map/generate';
import { SHIPS, SHIP_IDS } from '../content/ships';
import { CARDS, BASIC_SALVO_ID } from '../content/cards';
import { MODIFIER_IDS } from '../content/modifiers';

export const ENGINE_VERSION = 2;

function emptyIntel(area: number): CellIntel[] {
  return Array.from({ length: area }, () => ({ fired: false, fireCount: 0, mark: null, known: null }));
}

function createPlayer(
  id: PlayerId,
  cfg: MatchConfig['players'][number],
  area: number,
  uidBase: number,
  enemyFleetSize: number,
): PlayerState {
  const trayIds = [BASIC_SALVO_ID, ...cfg.tray];
  // Without draft observations, the enemy fleet is only known by count:
  // every ship could be any hull.
  const clues: FleetClue[] =
    cfg.enemyClues ??
    Array.from({ length: enemyFleetSize }, () => ({ options: SHIP_IDS.slice() }));
  return {
    id,
    name: cfg.name,
    isAI: cfg.isAI,
    fleetToPlace: cfg.fleet.slice(),
    ships: [],
    tray: trayIds.map((typeId, i) => {
      if (!CARDS[typeId]) throw new Error(`Unknown card ${typeId}`);
      return {
        uid: uidBase + i,
        typeId,
        availableFromTurn: 0,
        spent: false,
        // Basic salvo is public from the start: neither player drafted it.
        revealed: typeId === BASIC_SALVO_ID,
      };
    }),
    energy: 0,
    placed: false,
    turnCount: 0,
    hitEnergyThisTurn: 0,
    pendingEnergy: 0,
    empTurns: 0,
    blockadeTurns: 0,
    mines: [],
    decoys: [],
    buoys: [],
    intel: emptyIntel(area),
    reports: [],
    enemyClues: clues,
    enemySunkLengths: [],
    shotsFired: 0,
    hitsScored: 0,
  };
}

export function createMatch(cfg: MatchConfig): MatchState {
  const { gridW, gridH } = cfg;
  const area = gridW * gridH;
  for (const p of cfg.players) {
    for (const shipId of p.fleet) {
      if (!SHIPS[shipId]) throw new Error(`Unknown ship ${shipId}`);
    }
  }
  // Validate the map against the larger fleet so both can always place.
  const totalCells = (fleet: string[]) => fleet.reduce((s, id) => s + SHIPS[id].size, 0);
  const validationFleet =
    totalCells(cfg.players[0].fleet) >= totalCells(cfg.players[1].fleet)
      ? cfg.players[0].fleet
      : cfg.players[1].fleet;
  const terrain = generateMap(cfg.seed, gridW, gridH, validationFleet);

  // One terrain modifier drawn face up at match start, from the seed.
  const modifierId = MODIFIER_IDS[hashString(`${cfg.seed}:modifier`) % MODIFIER_IDS.length];

  const p0 = createPlayer(0, cfg.players[0], area, 1000, cfg.players[1].fleet.length);
  const p1 = createPlayer(1, cfg.players[1], area, 2000, cfg.players[0].fleet.length);

  return {
    version: ENGINE_VERSION,
    seed: cfg.seed,
    seedName: seedName(cfg.seed),
    round: cfg.round,
    voyageLength: cfg.voyageLength,
    gridW,
    gridH,
    terrain,
    modifierId,
    baseIncome: cfg.baseIncome,
    secondPlayerComp: cfg.secondPlayerComp ?? 0,
    hitBonus: cfg.hitBonus ?? 1,
    rng: seedRng(`${cfg.seed}:match`),
    phase: 'placement',
    turn: 0,
    current: cfg.firstPlayer,
    firstPlayer: cfg.firstPlayer,
    winner: null,
    players: [p0, p1],
    log: [],
    stats: {
      firstHitBy: null,
      energySpent: [0, 0],
      peakBank: [0, 0],
      firstEndangeredTurn: null,
      endangeredAt: [null, null],
      oppShotsAtEndangered: [null, null],
      cardPlays: [{}, {}],
    },
    nextUid: 1,
  };
}
