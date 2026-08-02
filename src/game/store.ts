import { create } from 'zustand';
import type { MatchState, PlayerId, CellIndex, TargetPayload } from '../engine/types';
import { other } from '../engine/types';
import type { MatchAction } from '../engine/actions';
import { createMatch } from '../engine/state';
import { reduce } from '../engine/reduce';
import { hashString, seedRng, seedName } from '../engine/rng';
import { voyageRound, type VoyageLength, DEFAULT_VOYAGE_LENGTH } from '../content/voyage';
import {
  dealShipDraft,
  pickShip,
  cluesFor,
  type ShipDraftState,
} from '../engine/draft/shipDraft';
import {
  dealCardDraft,
  pickCard,
  currentPicker,
  type CardDraftState,
} from '../engine/draft/cardDraft';
import {
  createTournament,
  advanceMatch,
  humanNextMatch,
  resolveUntilHuman,
  gameRoundFor,
  firstPlayerFor,
  humanSeat,
  cluesAbout,
  BRACKET_SIZE,
  type TournamentState,
  type BracketMatch,
} from '../engine/tournament';
import { aiShipPick, aiCardPick, aiErrorRate, aiPlaceFleet, aiPlayTurn } from '../ai/opponent';
import { autoPlaceFleet, type Placement } from '../engine/fleet/placement';
import { SHIPS } from '../content/ships';
import { saveRun, loadRun, clearRun, loadSettings, saveSettings, type Settings } from './save';

export type Screen =
  | 'title'
  | 'bracket'
  | 'draftShips'
  | 'draftCards'
  | 'placement'
  | 'match'
  | 'result'
  | 'runSummary'
  | 'settings'
  | 'codex';

/** Placement-in-progress for the human. */
export interface PlacementDraft {
  placed: Placement[];
  mines: CellIndex[];
  /** Index into the remaining fleet queue. */
  selected: number;
  orientation: number; // index into PLACEMENT_DIRS
}

export interface MatchOutcome {
  won: boolean;
  round: number;
  plies: number;
  shots: number;
  hits: number;
  opponentName: string;
  /** Hull names are only revealed at match end. */
  enemyFleet: string[];
}

interface GameStore {
  screen: Screen;
  settings: Settings;
  tournament: TournamentState | null;
  /** The human's current pairing. */
  match: BracketMatch | null;
  shipDraft: ShipDraftState | null;
  cardDraft: CardDraftState | null;
  placement: PlacementDraft | null;
  battle: MatchState | null;
  /** Which side the human plays in the current battle. */
  humanSide: PlayerId;
  outcome: MatchOutcome | null;
  /** Transient banner, e.g. "Not enough energy". */
  notice: string | null;
  /** Card the player is aiming with, and the cells chosen so far. */
  aiming: { cardUid: number; cells: CellIndex[] } | null;
  busy: boolean;

  go: (screen: Screen) => void;
  notify: (msg: string | null) => void;
  setSettings: (patch: Partial<Settings>) => void;

  newRun: (name: string, voyageLength: VoyageLength, bracketSize: number) => void;
  continueRun: () => boolean;
  abandonRun: () => void;

  beginNextMatch: () => void;
  submitShipPick: (keepUid: number, burnUid: number) => void;
  submitCardPick: (id: string) => void;

  selectShipToPlace: (i: number) => void;
  rotate: () => void;
  placeAt: (cell: CellIndex) => void;
  undoPlacement: () => void;
  autoPlace: () => void;
  confirmPlacement: () => void;

  beginAiming: (cardUid: number) => void;
  cancelAiming: () => void;
  tapCell: (cell: CellIndex) => void;
  playCardWith: (cardUid: number, target: TargetPayload) => void;
  useAbility: (shipUid: number, target: TargetPayload) => void;
  endTurn: () => void;
  finishMatch: () => void;
}

/** How many target cells a card needs before it can be fired. */
export function cellsNeeded(kind: string, count?: number): number {
  switch (kind) {
    case 'fire_cells':
      return count ?? 1;
    case 'probe_line':
      return count ?? 3;
    case 'fire_probe_adjacent':
    case 'probe_delayed':
    case 'repair':
      return 1;
    case 'decoy':
      return count ?? 2;
    default:
      return 0; // zone/line cards target differently
  }
}

const dispatch = (ms: MatchState, action: MatchAction): MatchState => reduce(ms, action);

export const useGame = create<GameStore>((set, get) => ({
  screen: 'title',
  settings: loadSettings(),
  tournament: null,
  match: null,
  shipDraft: null,
  cardDraft: null,
  placement: null,
  battle: null,
  humanSide: 0,
  outcome: null,
  notice: null,
  aiming: null,
  busy: false,

  go: (screen) => set({ screen, notice: null }),
  notify: (notice) => set({ notice }),

  setSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    saveSettings(settings);
    set({ settings });
  },

  newRun: (name, voyageLength, bracketSize) => {
    const seed = `${name || 'Captain'}-${voyageLength}-${bracketSize}-${Math.floor(
      // A run seed must be stable once created, but each new run differs.
      // This is the only place a non-deterministic value enters the game,
      // and it never reaches the engine except as a seed string.
      performance.now() * 1000,
    )}`;
    let ts = createTournament(seed, name || 'Captain', bracketSize, voyageLength);
    ts = resolveUntilHuman(ts);
    saveRun(ts);
    set({ tournament: ts, screen: 'bracket', outcome: null, battle: null, match: null });
  },

  continueRun: () => {
    const ts = loadRun();
    if (!ts) return false;
    set({ tournament: ts, screen: 'bracket', outcome: null, battle: null, match: null });
    return true;
  },

  abandonRun: () => {
    clearRun();
    set({ tournament: null, battle: null, match: null, outcome: null, screen: 'title' });
  },

  beginNextMatch: () => {
    const ts0 = get().tournament;
    if (!ts0) return;
    const ts = resolveUntilHuman(ts0);
    const m = humanNextMatch(ts);
    if (!m) {
      saveRun(ts);
      set({ tournament: ts, screen: ts.complete ? 'runSummary' : 'bracket' });
      return;
    }
    const round = gameRoundFor(ts, m);
    const cfg = voyageRound(ts.voyageLength, round);
    const human = humanSeat(ts);
    // The human always occupies the slot they were seeded into.
    const humanSide: PlayerId = m.seats[0] === human.index ? 0 : 1;
    const seedFirst = firstPlayerFor(ts, m);
    const first = ((seedFirst + round + 1) % 2) as PlayerId;
    const seedBase = `${ts.seed}:draft:${m.id}:${round}`;
    const ships = dealShipDraft(seedBase, cfg.keeps, 100_000 + m.id * 1000, first);
    const cards = dealCardDraft(seedBase, cfg.keeps, cfg.tiers, first);
    saveRun(ts);
    set({
      tournament: ts,
      match: m,
      humanSide,
      shipDraft: driveShipAi(ships, ts, m, humanSide),
      cardDraft: driveCardAi(cards, ts, m, humanSide),
      screen: 'draftShips',
      outcome: null,
      battle: null,
      placement: null,
    });
  },

  submitShipPick: (keepUid, burnUid) => {
    const { shipDraft, tournament, match, humanSide } = get();
    if (!shipDraft || !tournament || !match) return;
    let ds: ShipDraftState;
    try {
      ds = pickShip(shipDraft, humanSide, keepUid, burnUid);
    } catch (e) {
      set({ notice: e instanceof Error ? e.message : 'Illegal pick' });
      return;
    }
    ds = driveShipAi(ds, tournament, match, humanSide);
    set({ shipDraft: ds, notice: null });
    if (ds.done) set({ screen: 'draftCards' });
  },

  submitCardPick: (id) => {
    const { cardDraft, tournament, match, humanSide } = get();
    if (!cardDraft || !tournament || !match) return;
    let ds: CardDraftState;
    try {
      ds = pickCard(cardDraft, humanSide, id);
    } catch (e) {
      set({ notice: e instanceof Error ? e.message : 'Illegal pick' });
      return;
    }
    ds = driveCardAi(ds, tournament, match, humanSide);
    set({ cardDraft: ds, notice: null });
    if (ds.done) startBattle(set, get);
  },

  selectShipToPlace: (i) => {
    const p = get().placement;
    if (p) set({ placement: { ...p, selected: i } });
  },

  rotate: () => {
    const p = get().placement;
    if (p) set({ placement: { ...p, orientation: (p.orientation + 1) % 4 } });
  },

  placeAt: (cell) => {
    const { placement, battle, humanSide } = get();
    if (!placement || !battle) return;
    const queue = remainingToPlace(battle, humanSide, placement);
    const typeId = queue[placement.selected] ?? queue[0];
    if (!typeId) return;
    const def = SHIPS[typeId];
    const cells = lineFrom(cell, def.size, placement.orientation, battle.gridW, battle.gridH);
    if (!cells) {
      set({ notice: 'That ship would leave the grid.' });
      return;
    }
    const occupied = new Set(placement.placed.flatMap((pl) => pl.cells));
    for (const c of cells) {
      if (occupied.has(c)) {
        set({ notice: 'Ships cannot overlap.' });
        return;
      }
      if (battle.terrain[c] === 'REEF') {
        set({ notice: 'Ships cannot sit on reef.' });
        return;
      }
    }
    const placed = [...placement.placed, { typeId, cells }];
    set({
      placement: { ...placement, placed, selected: 0 },
      notice: null,
    });
  },

  undoPlacement: () => {
    const p = get().placement;
    if (!p || p.placed.length === 0) return;
    set({ placement: { ...p, placed: p.placed.slice(0, -1), selected: 0 }, notice: null });
  },

  autoPlace: () => {
    const { battle, humanSide } = get();
    if (!battle) return;
    const fleet = battle.players[humanSide].fleetToPlace;
    let st = seedRng(`${battle.seed}:human-auto:${fleet.length}:${Date.now() % 100000}`);
    const [plan] = autoPlaceFleet(fleet, battle.gridW, battle.gridH, battle.terrain, st);
    if (!plan) {
      set({ notice: 'No legal layout found — try again.' });
      return;
    }
    void st;
    set({
      placement: { placed: plan, mines: [], selected: 0, orientation: 0 },
      notice: null,
    });
  },

  confirmPlacement: () => {
    const { battle, placement, humanSide, tournament } = get();
    if (!battle || !placement || !tournament) return;
    const remaining = remainingToPlace(battle, humanSide, placement);
    if (remaining.length > 0) {
      set({ notice: `${remaining.length} ship${remaining.length === 1 ? '' : 's'} still to deploy.` });
      return;
    }
    // Mines: the human's minelayers scatter automatically on legal cells.
    const minelayers = placement.placed.filter((pl) => SHIPS[pl.typeId].ability === 'deploy').length;
    const occupied = new Set(placement.placed.flatMap((pl) => pl.cells));
    const mines: CellIndex[] = [];
    let st = seedRng(`${battle.seed}:mines:${humanSide}`);
    const candidates: CellIndex[] = [];
    for (let c = 0; c < battle.gridW * battle.gridH; c++) {
      if (!occupied.has(c) && battle.terrain[c] !== 'REEF') candidates.push(c);
    }
    for (let i = 0; i < minelayers * 2 && candidates.length > 0; i++) {
      const h = hashString(`${battle.seed}:mine:${i}`) % candidates.length;
      mines.push(candidates.splice(h, 1)[0]);
    }
    void st;

    let ms: MatchState;
    try {
      ms = dispatch(battle, {
        type: 'PLACE_FLEET',
        player: humanSide,
        placements: placement.placed,
        mines,
      });
    } catch (e) {
      set({ notice: e instanceof Error ? e.message : 'Deployment refused' });
      return;
    }
    // The opponent deploys too.
    const foe = other(humanSide);
    if (!ms.players[foe].placed) {
      const [plan] = aiPlaceFleet(ms, foe, seedRng(`${ms.seed}:ai-place`));
      ms = dispatch(ms, {
        type: 'PLACE_FLEET',
        player: foe,
        placements: plan.placements,
        mines: plan.mines,
      });
    }
    ms = runAiIfNeeded(ms, humanSide);
    set({ battle: ms, placement: null, screen: 'match', notice: null, aiming: null });
    if (ms.phase === 'over') get().finishMatch();
  },

  beginAiming: (cardUid) => set({ aiming: { cardUid, cells: [] }, notice: null }),
  cancelAiming: () => set({ aiming: null }),

  tapCell: (cell) => {
    const { aiming, battle } = get();
    if (!aiming || !battle) return;
    const card = battle.players[get().humanSide].tray.find((c) => c.uid === aiming.cardUid);
    if (!card) return;
    const cells = aiming.cells.includes(cell)
      ? aiming.cells.filter((c) => c !== cell)
      : [...aiming.cells, cell];
    set({ aiming: { ...aiming, cells } });
  },

  playCardWith: (cardUid, target) => {
    const { battle, humanSide } = get();
    if (!battle) return;
    let ms: MatchState;
    try {
      ms = dispatch(battle, { type: 'PLAY_CARD', player: humanSide, cardUid, target });
    } catch (e) {
      set({ notice: e instanceof Error ? e.message : 'That play is not legal' });
      return;
    }
    set({ battle: ms, aiming: null, notice: null });
    if (ms.phase === 'over') get().finishMatch();
  },

  useAbility: (shipUid, target) => {
    const { battle, humanSide } = get();
    if (!battle) return;
    let ms: MatchState;
    try {
      ms = dispatch(battle, { type: 'SHIP_ABILITY', player: humanSide, shipUid, target });
    } catch (e) {
      set({ notice: e instanceof Error ? e.message : 'That ability is not available' });
      return;
    }
    set({ battle: ms, aiming: null, notice: null });
    if (ms.phase === 'over') get().finishMatch();
  },

  endTurn: () => {
    const { battle, humanSide } = get();
    if (!battle || battle.phase !== 'battle') return;
    let ms = dispatch(battle, { type: 'END_TURN', player: humanSide });
    ms = runAiIfNeeded(ms, humanSide);
    set({ battle: ms, aiming: null, notice: null });
    if (ms.phase === 'over') get().finishMatch();
  },

  finishMatch: () => {
    const { battle, tournament, match, humanSide } = get();
    if (!battle || !tournament || !match || battle.winner === null) return;
    const human = humanSeat(tournament);
    const won = battle.winner === humanSide;
    const foe = other(humanSide);
    const winnerSeat = won ? human.index : match.seats[m0(match, human.index)]!;
    const ts = advanceMatch(tournament, match.id, winnerSeat);
    saveRun(ts);
    set({
      tournament: ts,
      outcome: {
        won,
        round: battle.round,
        plies: battle.turn,
        shots: battle.players[humanSide].shotsFired,
        hits: battle.players[humanSide].hitsScored,
        opponentName: battle.players[foe].name,
        // Hull names are revealed only now the match is over.
        enemyFleet: battle.players[foe].ships.map((s) => s.typeId),
      },
      screen: 'result',
    });
  },
}));

/** The opposing seat index within a pairing. */
function m0(m: BracketMatch, humanIndex: number): 0 | 1 {
  return m.seats[0] === humanIndex ? 1 : 0;
}

/** Ships the human still has to deploy, in fleet order. */
export function remainingToPlace(
  ms: MatchState,
  side: PlayerId,
  placement: PlacementDraft,
): string[] {
  const queue = ms.players[side].fleetToPlace.slice();
  for (const pl of placement.placed) {
    const i = queue.indexOf(pl.typeId);
    if (i >= 0) queue.splice(i, 1);
  }
  return queue;
}

/** Cells of a ship of `size` laid from `cell` along orientation index. */
export function lineFrom(
  cell: CellIndex,
  size: number,
  orientation: number,
  w: number,
  h: number,
): CellIndex[] | null {
  const dirs: [number, number][] = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  const [dr, dc] = dirs[orientation % 4];
  const r0 = Math.floor(cell / w);
  const c0 = cell % w;
  const cells: CellIndex[] = [];
  for (let i = 0; i < size; i++) {
    const r = r0 + dr * i;
    const c = c0 + dc * i;
    if (r < 0 || r >= h || c < 0 || c >= w) return null;
    cells.push(r * w + c);
  }
  return cells;
}

/** Advance a ship draft through any consecutive AI picks. */
function driveShipAi(
  ds: ShipDraftState,
  ts: TournamentState,
  m: BracketMatch,
  humanSide: PlayerId,
): ShipDraftState {
  let cur = ds;
  const round = gameRoundFor(ts, m);
  const err = aiErrorRate(round);
  let guard = 0;
  while (!cur.done && cur.toAct !== null && cur.toAct !== humanSide && guard++ < 60) {
    const p = cur.toAct;
    const seat = ts.seats[m.seats[p]!];
    const owned = [...seat.fleet, ...cur.keeps[p].map((k) => k.id)];
    const pick = aiShipPick(cur, p, owned, `${ts.seed}:m${m.id}:s`, err);
    cur = pickShip(cur, p, pick.keepUid, pick.burnUid);
  }
  return cur;
}

/** Advance an open card draft through any consecutive AI picks. */
function driveCardAi(
  ds: CardDraftState,
  ts: TournamentState,
  m: BracketMatch,
  humanSide: PlayerId,
): CardDraftState {
  let cur = ds;
  const round = gameRoundFor(ts, m);
  const err = aiErrorRate(round);
  let guard = 0;
  while (!cur.done && currentPicker(cur) !== null && currentPicker(cur) !== humanSide && guard++ < 60) {
    const p = currentPicker(cur)!;
    const seat = ts.seats[m.seats[p]!];
    const owned = [...seat.tray, ...cur.keeps[p]];
    cur = pickCard(cur, p, aiCardPick(cur, p, owned, `${ts.seed}:m${m.id}:c`, err));
  }
  return cur;
}

/** Let the AI take its whole turn if it is the AI's move. */
function runAiIfNeeded(ms: MatchState, humanSide: PlayerId): MatchState {
  let state = ms;
  let guard = 0;
  while (state.phase === 'battle' && state.current !== humanSide && guard++ < 40) {
    state = aiPlayTurn(state);
  }
  return state;
}

/** Commit the finished drafts and open the placement screen. */
function startBattle(
  set: (partial: Partial<GameStore>) => void,
  get: () => GameStore,
): void {
  const { tournament, match, shipDraft, cardDraft, humanSide } = get();
  if (!tournament || !match || !shipDraft || !cardDraft) return;
  const round = gameRoundFor(tournament, match);
  const cfg = voyageRound(tournament.voyageLength, round);

  // Commit picks into both seats' persistent runs.
  const ts: TournamentState = structuredClone(tournament);
  for (const p of [0, 1] as PlayerId[]) {
    const seat = ts.seats[match.seats[p]!];
    seat.fleet.push(...shipDraft.keeps[p].map((k) => k.id));
    seat.tray.push(...cardDraft.keeps[p]);
    seat.draftRecords.push({
      round,
      withSeat: match.seats[p === 0 ? 1 : 0]!,
      shipPairs: shipDraft.records
        .filter((rec) => rec.firstPlayer === p)
        .map((rec) => [...rec.passed] as [string, string]),
      tiers: cfg.tiers,
    });
  }

  const seatA = ts.seats[match.seats[0]!];
  const seatB = ts.seats[match.seats[1]!];
  const firstPlayer = firstPlayerFor(ts, match);
  const battle = createMatch({
    seed: `${ts.seed}:match:${match.id}`,
    round,
    voyageLength: ts.voyageLength,
    gridW: cfg.gridW,
    gridH: cfg.gridH,
    patches: cfg.patches,
    baseIncome: cfg.baseIncome,
    secondPlayerComp: cfg.secondPlayerComp,
    hitBonus: cfg.hitBonus,
    firstPlayer,
    players: [
      {
        name: seatA.name,
        isAI: !seatA.isHuman,
        fleet: seatA.fleet,
        tray: seatA.tray,
        enemyClues: humanSide === 0 ? cluesFor(shipDraft, 0) : cluesAbout(ts, seatA.index, seatB.index),
      },
      {
        name: seatB.name,
        isAI: !seatB.isHuman,
        fleet: seatB.fleet,
        tray: seatB.tray,
        enemyClues: humanSide === 1 ? cluesFor(shipDraft, 1) : cluesAbout(ts, seatB.index, seatA.index),
      },
    ],
  });

  saveRun(ts);
  set({
    tournament: ts,
    battle,
    placement: { placed: [], mines: [], selected: 0, orientation: 0 },
    screen: 'placement',
    notice: null,
  });
}

export { seedName, BRACKET_SIZE, DEFAULT_VOYAGE_LENGTH };
