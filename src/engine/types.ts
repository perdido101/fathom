import type { RngState } from './rng';

export type PlayerId = 0 | 1;
export const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

/** The board is a fixed 6x6. There is no terrain and no map randomness. */
export const BOARD = 6;
export const CELLS = BOARD * BOARD;

/** 0..35, row-major. */
export type CellIndex = number;

export const xy = (cell: CellIndex): [number, number] => [cell % BOARD, Math.floor(cell / BOARD)];
export const cellAt = (x: number, y: number): CellIndex => y * BOARD + x;
export const onBoard = (x: number, y: number): boolean => x >= 0 && x < BOARD && y >= 0 && y < BOARD;

/** Ships deploy orthogonally only. */
export const ORTH: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** "A1".."F6", column letter then row number, for logs and the UI. */
export function label(cell: CellIndex): string {
  const [x, y] = xy(cell);
  return `${String.fromCharCode(65 + x)}${y + 1}`;
}

export function parseLabel(text: string): CellIndex | null {
  const m = /^([A-Fa-f])([1-6])$/.exec(text.trim());
  if (!m) return null;
  return cellAt(m[1].toUpperCase().charCodeAt(0) - 65, Number(m[2]) - 1);
}

export function orthNeighbours(cell: CellIndex): CellIndex[] {
  const [x, y] = xy(cell);
  const out: CellIndex[] = [];
  for (const [dx, dy] of ORTH) if (onBoard(x + dx, y + dy)) out.push(cellAt(x + dx, y + dy));
  return out;
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

export type ShipType = 'ACTIVE' | 'NERF' | 'REACT';
export type PackId = 'A' | 'B' | 'C';

export interface PlacedShip {
  defId: string;
  length: number;
  /** Board cells occupied, bow to stern. */
  cells: CellIndex[];
  /** Parallel to `cells`. */
  hits: boolean[];
  sunk: boolean;
  /** ACTIVE/NERF abilities fire once per match. */
  abilityUsed: boolean;
  /**
   * Set when the ability is activated or the ship sinks. A revealed ship's
   * identity is public; its position is not.
   */
  revealed: boolean;
}

export interface CardInstance {
  uid: number;
  defId: string;
  /** Public to both players. This is deliberate — see the charge economy. */
  charges: number;
}

/** Blocks that one player can impose on the other for a single round. */
export interface Restrictions {
  /** Blackout: no charge may be placed. */
  noCharge: boolean;
  /** Pin: no card may be fired. */
  noFire: boolean;
  /** Cinder: a card holding exactly this many charges cannot be fired. */
  chargeLock: number | null;
}

export function noRestrictions(): Restrictions {
  return { noCharge: false, noFire: false, chargeLock: null };
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  ships: PlacedShip[];
  hand: CardInstance[];
  /** Cards fired and destroyed, in order. Public once fired. */
  graveyard: { defId: string; charges: number; round: number }[];
  /** Cells this player has fired at on the enemy board, ever. */
  firedAt: CellIndex[];
  /** What this player knows about enemy cells: hit, miss or unknown. */
  marks: Record<CellIndex, 'hit' | 'miss'>;
  /** Enemy cells known to hold a ship without having been hit — Echo's work. */
  knownShipCells: CellIndex[];
  /** Row/column ship-cell counts learned from Sounding and Beacon. */
  counts: { rows: Record<number, number>; cols: Record<number, number> };
  /** Lengths of enemy ships this player has sunk, in order. */
  sankLengths: number[];
  restrictions: Restrictions;
  timerStrikes: number;
  /** Deployment commitment, checked at reveal. */
  deployCommit: string | null;
  deployNonce: string | null;
  /** Draft results, kept for the end-of-match reveal. */
  draftedShips: string[];
  draftedCards: string[];
  /** Packs where the two players chose the same item. Public knowledge. */
  shipCollisions: boolean[];
  cardCollisions: boolean[];
  connected: boolean;
  stats: PlayerStats;
}

export interface PlayerStats {
  shotsFired: number;
  hits: number;
  cardsFired: { defId: string; charges: number }[];
  abilitiesUsed: string[];
  chargesEarned: number;
  firstBlood: boolean;
}

export type Phase = 'shipDraft' | 'cardDraft' | 'deploy' | 'battle' | 'over';

export type Outcome =
  | { kind: 'win'; winner: PlayerId; reason: 'fleet' | 'timeout-strikes' | 'disconnect' | 'cells' }
  | { kind: 'draw'; reason: 'mutual' | 'cells' };

export interface LogEntry {
  round: number;
  step: string;
  /** Who the entry is about; null for neutral events. */
  player: PlayerId | null;
  text: string;
  /** Only players in this list may see the entry. Empty means public. */
  privateTo?: PlayerId[];
}

export interface DraftState {
  kind: 'ship' | 'card';
  /** Three packs of four, dealt up front and shown face up to both players. */
  packs: string[][];
  index: number;
  /** Locked-in picks, one per pack per player. */
  picks: [(string | null)[], (string | null)[]];
  /** Whether each resolved pack was a collision. */
  collisions: boolean[];
  done: boolean;
}

export interface MatchConfig {
  roundSeconds: number;
  roundCap: number;
  timerStrikeLimit: number;
  handSize: number;
  /** Hand size at or below which a player draws. */
  drawThreshold: number;
  disconnectGraceSeconds: number;
  /**
   * How the hit bonus is counted. The rules say "landing a hit grants 1 bonus
   * charge" without saying whether that is once per hit or once per round in
   * which you connected — see RULINGS.md Q3. Both readings are implemented so
   * the difference can be measured instead of argued about; 'per-hit' is the
   * literal reading and the default.
   */
  hitBonusMode: 'per-hit' | 'per-round';
}

export const DEFAULT_CONFIG: MatchConfig = {
  roundSeconds: 20,
  roundCap: 20,
  timerStrikeLimit: 3,
  handSize: 3,
  drawThreshold: 1,
  disconnectGraceSeconds: 60,
  hitBonusMode: 'per-hit',
};

export interface MatchState {
  version: number;
  /** Revealed at match end; its hash is published before the match starts. */
  seed: string;
  seedCommit: string;
  config: MatchConfig;
  phase: Phase;
  round: number;
  players: [PlayerState, PlayerState];
  shipDraft: DraftState;
  cardDraft: DraftState;
  /** Shared, face down, depletes. Order is fixed by the seed. */
  pile: string[];
  rng: RngState;
  outcome: Outcome | null;
  log: LogEntry[];
  nextUid: number;
  /** Every resolved round, in order — the replayable record. */
  history: RoundRecord[];
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export type FireSpec =
  /** Salvo, Ping, Echo, Ember: a free list of cells. */
  | { shape: 'cells'; cells: CellIndex[] }
  /** Lance, Forge: a straight orthogonal run. */
  | { shape: 'line'; origin: CellIndex; dir: [number, number] }
  /** Burst, Breaker, Warhead: a square whose top-left corner is `anchor`. */
  | { shape: 'block'; anchor: CellIndex }
  /** Rake: a horizontal run inside one row. */
  | { shape: 'row'; origin: CellIndex }
  /** Sounding, Mirror, Ambush, Pin: one named cell. */
  | { shape: 'cell'; cell: CellIndex }
  /** Jam: charges to strip, by enemy card uid. */
  | { shape: 'strip'; from: { uid: number; amount: number }[] }
  /** Siphon, Leech: charges to move from enemy cards onto one of yours. */
  | { shape: 'steal'; from: { uid: number; amount: number }[]; toUid: number }
  /** Beacon: a row and a column to read, plus four cells to fire. */
  | { shape: 'beacon'; row: number; col: number; cells: CellIndex[] }
  /** Kiln: which card in hand to fire at +3 charges, and how to aim it. */
  | { shape: 'kiln'; uid: number; inner: FireSpec }
  /** Blackout, Dreadnought, Cinder, Spite, Thorn: nothing to aim. */
  | { shape: 'none' };

export interface Plan {
  /** Which card receives this round's charge. Null only when blocked. */
  chargeTo: number | null;
  /**
   * Where charges earned this round land (hit bonuses, Mirror, Ember, Forge).
   * See RULINGS.md — the rules say charges are "gained" without saying where.
   */
  bonusTo: number | null;
  fire: { uid: number; spec: FireSpec } | null;
  ability: { defId: string; spec: FireSpec } | null;
  /** The free basic attack. Null means it was not aimed. */
  basic: CellIndex | null;
  /** True when the plan was synthesised by the timer rather than the player. */
  timedOut: boolean;
}

export function emptyPlan(): Plan {
  return { chargeTo: null, bonusTo: null, fire: null, ability: null, basic: null, timedOut: false };
}

/** A plan, its nonce, and the commitment published before the reveal. */
export interface CommittedPlan {
  commitHash: string;
  nonce: string;
  plan: Plan;
  /** Ed25519 signature over the commitment, produced with the session key. */
  signature: string | null;
}

export interface RoundRecord {
  round: number;
  plans: [CommittedPlan, CommittedPlan];
  /** The rng state before the round resolved, so a round can be replayed alone. */
  rngBefore: RngState;
  events: ResolveEvent[];
}

/**
 * One entry per visible beat of the resolve sequence. The UI reads this list
 * to drive the popup and SFX order, and the sim reads it to score balance, so
 * both agree on what happened by construction.
 */
export type ResolveEvent =
  | { t: 'reveal'; plans: [Plan, Plan] }
  | { t: 'nerf'; by: PlayerId; text: string }
  | { t: 'prediction'; by: PlayerId; card: string; triggered: boolean; cell: CellIndex }
  | { t: 'shot'; by: PlayerId; cell: CellIndex; hit: boolean; source: string }
  | { t: 'sink'; owner: PlayerId; length: number }
  | { t: 'react'; owner: PlayerId; defId: string; text: string }
  | { t: 'charges'; to: PlayerId; amount: number; reason: string }
  | { t: 'intel'; to: PlayerId; text: string }
  | { t: 'draw'; to: PlayerId; count: number }
  | { t: 'strike'; who: PlayerId; total: number }
  | { t: 'end'; outcome: Outcome };
