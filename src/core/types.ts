import type { SymbolId } from '../content/symbols';
import type { Keyword } from '../content/actions';
import type { RngState } from '../engine/rng';

export type PlayerId = 0 | 1;
/** Cell index = row * gridW + col. */
export type CellIndex = number;

export const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

/**
 * Both players' boards are built from the same dealt grid cards in the same
 * orientation, so terrain is public and identical. Only the hulls differ.
 */
export interface Board {
  gridW: number;
  gridH: number;
  /** Symbol per cell. */
  symbols: SymbolId[];
  /** Printed grid-card id per cell, for `cardId-local` addressing. */
  cardIds: number[];
  /** Local coordinate per cell ("B3"). */
  locals: string[];
}

/** A shot disc, as it sits on the board being fired at. */
export type Disc =
  | { kind: 'white' }
  /** Red disc; `cube` marks a trench cell that has taken its first hit. */
  | { kind: 'red'; cube: boolean };

// ---------------------------------------------------------------------------
// Hulls and cards
// ---------------------------------------------------------------------------

export interface PlacedHull {
  uid: number;
  defId: string;
  length: number;
  cells: CellIndex[];
  /** Hits landed on each cell. Trench cells need two. */
  hits: number[];
  destroyed: boolean[];
  sunk: boolean;
  /**
   * The hull card is face up once its ability has fired — the opponent learns
   * the hull exists in the fleet, never where it is.
   */
  revealed: boolean;
  /** A ONCE ability is spent after a single use. */
  abilitySpent: boolean;
  /** Dreadnought's repair is once per turn, not once per match. */
  usedThisTurn: boolean;
}

export interface CardInstance {
  uid: number;
  defId: string;
  /** Face up from the first time it is played, and public thereafter. */
  faceUp: boolean;
  /**
   * Sideways cards are spent. A card played on your turn T straightens at the
   * start of turn T+2 — it sits out exactly one of your turns. Stored as the
   * owner's turn number it straightens on, so nothing has to tick.
   */
  straightensOn: number;
  /** ONCE cards turn face down forever. */
  gone: boolean;
  /** Censor locks a sideways card until Censor is struck. */
  locked: boolean;
  /** Watch Change: taken from a hand and unplayable for two turns. */
  playableFrom: number;
}

// ---------------------------------------------------------------------------
// Recorded information
// ---------------------------------------------------------------------------

/**
 * The digital equivalent of the third-colour detection markers: every READ
 * answer and every shallows reveal is recorded so nobody has to memorise it.
 */
export type Annotation =
  | { kind: 'occupied'; cells: CellIndex[]; turn: number; source: string }
  | { kind: 'empty'; cells: CellIndex[]; turn: number; source: string }
  | { kind: 'count'; cells: CellIndex[]; value: number; turn: number; source: string }
  | { kind: 'atMost'; cells: CellIndex[]; value: number; turn: number; source: string }
  | { kind: 'note'; cells: CellIndex[]; text: string; turn: number; source: string };

// ---------------------------------------------------------------------------
// Timed and standing effects
// ---------------------------------------------------------------------------

export interface Statuses {
  /** Extra cubes at the start of the next turn (Blow Ballast). */
  pendingCubes: number;
  /** Attack cards cost 1 less this turn (Overcharge). */
  attackDiscountTurn: number;
  /** Surcharge on this player's next card / next attack card. */
  nextCardSurcharge: number;
  nextAttackSurcharge: number;
  /** Their shots are answered honestly but destroy nothing, until this turn. */
  vesperUntil: number;
  /** First hit each turn is negated, until this turn (Bulkheads). */
  bulkheadsUntil: number;
  /** Every hit costs the shooter a cube, until this turn (Sheet Anchor). */
  sheetAnchorUntil: number;
  /** Detection works normally on storm this turn (Storm Chaser). */
  stormChaserTurn: number;
  /** Next attack ignores reef (Reef Runner). */
  reefRunnerArmed: boolean;
  /** Next detection card resolves twice (Torchbearer). */
  doubleNextRead: boolean;
  /** Standing triggers set face up: Backdraft, Salt the Wound, Brace. */
  standing: string[];
  /** Hits taken this turn, for Brace and Bastion. */
  hitsTakenThisTurn: number;
  /** Hits landed by this player last turn, for Tithe. */
  hitsLandedLastTurn: number;
  hitsLandedThisTurn: number;
  /** Whether this player sank a hull last turn, for Powder Monkey. */
  sankLastTurn: boolean;
  sankThisTurn: boolean;
  /** Basic Salvo firings used this turn. */
  basicSalvoUsed: number;
  /** Chain of Command's copied card, resolving next turn. */
  pendingCopy: string | null;
  /** Sonar Buoy: cells whose result is reported at the start of next turn. */
  pendingBuoys: { cell: CellIndex; hit: boolean }[];
}

// ---------------------------------------------------------------------------
// Player and match
// ---------------------------------------------------------------------------

export interface PlayerState {
  id: PlayerId;
  name: string;
  isAI: boolean;
  cubes: number;
  /** Hull type ids drafted but not yet deployed. */
  toDeploy: string[];
  hulls: PlacedHull[];
  /** Hidden until played. */
  hand: CardInstance[];
  /** Basic Salvo, always in play, never sideways. */
  basicSalvo: CardInstance;
  /** Discs the OPPONENT has placed on this player's board. Public. */
  discs: (Disc | null)[];
  /** What this player has recorded about the enemy board. Private. */
  annotations: Annotation[];
  /** Enemy hull lengths whose sinking was announced to this player. */
  sunkLengths: number[];
  /** Pairs this player saw pass during the ship draft, for deduction. */
  draftClues: string[][];
  statuses: Statuses;
  /** Turns this player has started. */
  turnCount: number;
  shotsFired: number;
  hitsScored: number;
  deployed: boolean;
}

export interface LogEntry {
  turn: number;
  player: PlayerId;
  text: string;
  kind: 'shot' | 'info' | 'card' | 'ability' | 'system';
}

export type Phase = 'deploy' | 'earn' | 'spend' | 'over';

export interface MatchStats {
  firstHitBy: PlayerId | null;
  cubesSpent: [number, number];
  peakBank: [number, number];
  cardPlays: [Record<string, number>, Record<string, number>];
  abilityUses: [Record<string, number>, Record<string, number>];
  /** Turn each hull sank, by owner, for endgame-drag measurement. */
  sinkTurns: [number[], number[]];
  /** Shots the winner fired after the loser's penultimate sink. */
  shotsAtPenultimate: [number | null, number | null];
}

export interface MatchState {
  version: number;
  seed: string;
  seedName: string;
  board: Board;
  /** The two terrain cards, face up all match. */
  terrainCards: string[];
  phase: Phase;
  /** Total plies elapsed. */
  turn: number;
  current: PlayerId;
  firstPlayer: PlayerId;
  winner: PlayerId | null;
  players: [PlayerState, PlayerState];
  /** One shared face-down pile of everything burned in both drafts. */
  burnPile: string[];
  rng: RngState;
  log: LogEntry[];
  stats: MatchStats;
  nextUid: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const cellRC = (i: CellIndex, w: number): [number, number] => [Math.floor(i / w), i % w];
export const rcCell = (r: number, c: number, w: number): CellIndex => r * w + c;
export const inBounds = (r: number, c: number, w: number, h: number): boolean =>
  r >= 0 && r < h && c >= 0 && c < w;

/** "12-B3" — the printed address of a cell. */
export function cellAddress(board: Board, cell: CellIndex): string {
  return `${board.cardIds[cell]}-${board.locals[cell]}`;
}

/** The four orthogonal neighbours. "Adjacent" always means these four. */
export function orthNeighbours(cell: CellIndex, w: number, h: number): CellIndex[] {
  const [r, c] = cellRC(cell, w);
  const out: CellIndex[] = [];
  for (const [nr, nc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]] as [number, number][]) {
    if (inBounds(nr, nc, w, h)) out.push(rcCell(nr, nc, w));
  }
  return out;
}

/** The four diagonal neighbours. Only Bracket names these. */
export function diagNeighbours(cell: CellIndex, w: number, h: number): CellIndex[] {
  const [r, c] = cellRC(cell, w);
  const out: CellIndex[] = [];
  for (const [nr, nc] of [[r - 1, c - 1], [r - 1, c + 1], [r + 1, c - 1], [r + 1, c + 1]] as [number, number][]) {
    if (inBounds(nr, nc, w, h)) out.push(rcCell(nr, nc, w));
  }
  return out;
}

/** All eight deployment directions. */
export const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1],
];

export type { Keyword, SymbolId };
