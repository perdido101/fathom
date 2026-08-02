import type { RngState } from './rng';

export type PlayerId = 0 | 1;
/** Cell index = row * gridW + col. */
export type CellIndex = number;

export type TerrainId = 'OPEN' | 'REEF' | 'FOG' | 'TRENCH' | 'SHALLOWS';
export type CardTag = 'attack' | 'detect' | 'utility';
export type Tier = 1 | 2 | 3;

export type ShipAbilityId =
  | 'silent'
  | 'swift'
  | 'camouflage'
  | 'supply'
  | 'retaliate'
  | 'deploy'
  | 'array'
  | 'launch'
  | 'armored'
  | 'wake';

export interface ShipDef {
  id: string;
  name: string;
  size: number;
  tier: Tier;
  ability: ShipAbilityId;
  abilityName: string;
  abilityText: string;
}

/**
 * Data-driven card effects. Adding a card means composing one of these in
 * src/content/cards.ts — never touching engine logic.
 */
export type CardEffect =
  | { kind: 'fire_cells'; count: number }
  | { kind: 'fire_scatter'; zone: number; shots: number }
  | { kind: 'fire_plus' }
  | { kind: 'fire_row_sweep' }
  | { kind: 'fire_torpedo' }
  | { kind: 'fire_zone'; zone: number }
  | { kind: 'fire_marked_column' }
  | { kind: 'probe_line'; length: number }
  | { kind: 'fire_probe_adjacent' }
  | { kind: 'probe_delayed' }
  | { kind: 'probe_zone_count'; zone: number }
  | { kind: 'reveal_zone'; zone: number }
  | { kind: 'energy_delayed'; amount: number }
  | { kind: 'decoy'; count: number; turns: number }
  | { kind: 'repair' }
  | { kind: 'emp'; turns: number }
  | { kind: 'blockade'; turns: number; surcharge: number };

export interface CardDef {
  id: string;
  name: string;
  cost: number;
  /** 0 = permanent/undraftable (basic salvo). */
  tier: Tier | 0;
  tags: CardTag[];
  text: string;
  effect: CardEffect;
}

/** Target payload for cards and ship abilities. Fields used depend on effect. */
export interface TargetPayload {
  /** Explicitly chosen cells (fire_cells, probe_line, decoy, repair, launch). */
  cells?: CellIndex[];
  /** Zone top-left cell (scatter, zone fire, zone probes, reveal). */
  origin?: CellIndex;
  /** Line for torpedo / row sweep: axis + index + travel direction. */
  line?: { axis: 'row' | 'col'; index: number; dir: 1 | -1 };
  /** Column index for fire_marked_column. */
  colIndex?: number;
  /** Relocation vector [dr, dc]; unit step, or two cells under Strong Current. */
  shift?: [number, number];
}

export interface PlacedShip {
  uid: number;
  typeId: string;
  cells: CellIndex[];
  /** Damage taken per cell. */
  damage: number[];
  /** Whether each cell is fully destroyed. */
  destroyed: boolean[];
  /** Cells already restored once — a section can only be rebuilt one time. */
  repaired: boolean[];
  sunk: boolean;
  /** Whether the sink was announced (length only). Fog/camouflage suppress. */
  sinkAnnounced: boolean;
  swiftUsed: boolean;
  launchUsed: boolean;
}

export interface CardInstance {
  uid: number;
  typeId: string;
  /**
   * Binary availability: playing a card on your turn T makes it unavailable
   * for turn T+1 and available again from T+2. Stored as the owner's own
   * turn number from which the card may be played again — never a counter
   * that ticks. Basic salvo is exempt and is always available.
   */
  availableFromTurn: number;
  spent: boolean;
  /** Cards become public knowledge the first time they are played. */
  revealed: boolean;
}

export type CardUiState = 'ready' | 'expensive' | 'unavailable' | 'spent';

export interface ProbeReport {
  /** 'count' = N occupied of cells; 'flag' = 1/0 any-occupied. */
  kind: 'count' | 'flag';
  cells: CellIndex[];
  value: number;
  turn: number;
  label: string;
  /** Enemy sinks announced when the report was taken — a later sink stales it. */
  enemySunk: number;
}

export interface CellIntel {
  fired: boolean;
  /** How many times this player has fired at the cell. */
  fireCount: number;
  mark: 'miss' | 'hit' | 'sunk' | null;
  known: 'occupied' | 'empty' | null;
  /** True when the shooter was told the cell held (trench/armor). Fog hides this. */
  partial?: boolean;
}

/**
 * What a player legitimately knows about the enemy fleet's composition:
 * for every enemy draft pick they witnessed, the unordered {kept, burned}
 * pair; for picks made in drafts they did not attend, the tier roster the
 * pack was drawn from. Fleet composition itself is never declared.
 */
export interface FleetClue {
  /** Candidate ship ids — one of these was kept. */
  options: string[];
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  isAI: boolean;
  /** Ship type ids not yet placed. */
  fleetToPlace: string[];
  ships: PlacedShip[];
  tray: CardInstance[];
  energy: number;
  placed: boolean;
  /** Number of turns this player has started. */
  turnCount: number;
  /** Energy earned from hits during the current turn (for the optional cap). */
  hitEnergyThisTurn: number;
  /** Delayed energy (ballast). */
  pendingEnergy: number;
  /** Turns of halved income remaining (EMP). */
  empTurns: number;
  /** Turns of +surcharge on detect cards remaining (blockade). */
  blockadeTurns: number;
  mines: { cell: CellIndex; spent: boolean }[];
  /** Decoys on own grid; active while ownerTurnCount < expiresAt. */
  decoys: { cell: CellIndex; expiresAt: number }[];
  /** Buoys awaiting resolution at start of next turn. */
  buoys: { cell: CellIndex }[];
  /** What this player knows about the ENEMY grid. */
  intel: CellIntel[];
  reports: ProbeReport[];
  /** Clues about the enemy fleet's composition (see FleetClue). */
  enemyClues: FleetClue[];
  /** Lengths of enemy ships whose sinking was announced to this player. */
  enemySunkLengths: number[];
  shotsFired: number;
  hitsScored: number;
}

export interface LogEntry {
  turn: number;
  player: PlayerId;
  text: string;
  kind: 'shot' | 'info' | 'card' | 'system';
}

export interface MatchStats {
  /** Who landed the first real hit of the match (snowball check). */
  firstHitBy: PlayerId | null;
  /** Total energy spent on cards, per player. */
  energySpent: [number, number];
  /** Highest energy bank held at any point, per player. */
  peakBank: [number, number];
  /** Ply at which either side first dropped to 1 alive ship. */
  firstEndangeredTurn: number | null;
  /** Per player: ply at which that player first had ≤1 alive ship. */
  endangeredAt: [number | null, number | null];
  /** Per player: the OPPONENT's shotsFired when that player hit ≤1 ship. */
  oppShotsAtEndangered: [number | null, number | null];
  /** Plays per card id, per player. */
  cardPlays: [Record<string, number>, Record<string, number>];
}

export interface MatchPlayerConfig {
  name: string;
  isAI: boolean;
  /** Ship type ids drafted for this run (true fleet — engine-side only). */
  fleet: string[];
  /** Card type ids drafted (basic salvo is added automatically). */
  tray: string[];
  /** What THIS player knows about the enemy fleet. */
  enemyClues?: FleetClue[];
}

export interface MatchConfig {
  seed: string;
  round: number;
  voyageLength: number;
  gridW: number;
  gridH: number;
  /** Number of 4×4 patches to assemble the board from. */
  patches: number;
  baseIncome: number;
  /** One-off energy grant to the second player on their first turn. */
  secondPlayerComp: number;
  /** Energy granted immediately per cell hit. */
  hitBonus: number;
  firstPlayer: PlayerId;
  players: [MatchPlayerConfig, MatchPlayerConfig];
}

export interface MatchState {
  version: number;
  seed: string;
  seedName: string;
  round: number;
  voyageLength: number;
  gridW: number;
  gridH: number;
  terrain: TerrainId[];
  /** The face-up terrain modifier for this match. */
  modifierId: string;
  baseIncome: number;
  secondPlayerComp: number;
  hitBonus: number;
  rng: RngState;
  phase: 'placement' | 'battle' | 'over';
  /** Total plies (turn starts) elapsed. */
  turn: number;
  current: PlayerId;
  firstPlayer: PlayerId;
  winner: PlayerId | null;
  players: [PlayerState, PlayerState];
  log: LogEntry[];
  stats: MatchStats;
  nextUid: number;
}

export const cellRC = (i: CellIndex, w: number): [number, number] => [Math.floor(i / w), i % w];
export const rcCell = (r: number, c: number, w: number): CellIndex => r * w + c;
export const inBounds = (r: number, c: number, w: number, h: number): boolean =>
  r >= 0 && r < h && c >= 0 && c < w;

export const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);
