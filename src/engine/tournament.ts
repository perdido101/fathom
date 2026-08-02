import { hashString, nextFloat, nextInt, seedRng, type RngState } from './rng';
import type { FleetClue, PlayerId } from './types';
import { voyageRound, DEFAULT_VOYAGE_LENGTH, type VoyageLength } from '../content/voyage';
import { SHIP_IDS } from '../content/ships';
import { cardsOfTiers } from '../content/cards';
import { dealShipDraft, pickShip, type ShipDraftState } from './draft/shipDraft';
import {
  dealCardDraft,
  pickCard,
  currentPicker,
  type CardDraftState,
} from './draft/cardDraft';
import { aiShipPick, aiCardPick, aiErrorRate } from '../ai/opponent';

export const SAVE_VERSION = 2;
export const BRACKET_SIZE = 16 as 8 | 16 | 32;

/** One witnessed draft: the pairs a co-drafter saw, or tier rosters otherwise. */
export interface DraftRecord {
  round: number;
  withSeat: number;
  /** This seat's pick pairs (public to the co-drafter). */
  shipPairs: [string, string][];
  tiers: number[];
}

export interface Seat {
  index: number;
  name: string;
  isHuman: boolean;
  losses: number;
  eliminated: boolean;
  matchesPlayed: number;
  /** Drafted ship type ids, persistent across the whole run. Never public. */
  fleet: string[];
  /** Drafted card type ids, persistent across the whole run. Never public. */
  tray: string[];
  /** Draft history — the public trail other players can deduce from. */
  draftRecords: DraftRecord[];
}

export interface BracketMatch {
  id: number;
  bracket: 'W' | 'L' | 'GF';
  /** Round within its own bracket, 1-based. */
  round: number;
  seats: [number | null, number | null];
  winner: number | null;
  loser: number | null;
  winnerTo: { match: number; slot: 0 | 1 } | null;
  loserTo: { match: number; slot: 0 | 1 } | null;
}

export interface TournamentState {
  saveVersion: number;
  seed: string;
  bracketSize: number;
  voyageLength: VoyageLength;
  seats: Seat[];
  matches: BracketMatch[];
  complete: boolean;
  championSeat: number | null;
}

const AI_NAMES = [
  'Cmdr. Ashvane', 'Capt. Okonkwo', 'Adm. Reyes', 'Cmdr. Lindqvist',
  'Capt. Duarte', 'Adm. Tanaka', 'Cmdr. Farrow', 'Capt. Bellamy',
  'Adm. Iyer', 'Cmdr. Volkov', 'Capt. Mbeki', 'Adm. Castellan',
  'Cmdr. Hale', 'Capt. Ostrander', 'Adm. Quill', 'Cmdr. Sable',
  'Capt. Wren', 'Adm. Falk', 'Cmdr. Yun', 'Capt. Ibarra',
  'Adm. Sorrel', 'Cmdr. Pike', 'Capt. Novak', 'Adm. Thorn',
  'Cmdr. Vega', 'Capt. Lark', 'Adm. Crane', 'Cmdr. Frost',
  'Capt. Ember', 'Adm. Gale', 'Cmdr. Marlin', 'Capt. Drift',
];

/**
 * Double-elimination bracket for 8/16/32 seats: winners bracket, losers
 * bracket with alternating drop-in rounds, and a single grand final.
 */
export function generateBracket(n: number): BracketMatch[] {
  if (![8, 16, 32].includes(n)) throw new Error('Bracket size must be 8, 16 or 32');
  const R = Math.log2(n);
  const matches: BracketMatch[] = [];
  let nextId = 0;
  const mk = (bracket: 'W' | 'L' | 'GF', round: number): BracketMatch => {
    const m: BracketMatch = {
      id: nextId++,
      bracket,
      round,
      seats: [null, null],
      winner: null,
      loser: null,
      winnerTo: null,
      loserTo: null,
    };
    matches.push(m);
    return m;
  };

  const wRounds: BracketMatch[][] = [];
  for (let r = 1; r <= R; r++) {
    const count = n / 2 ** r;
    wRounds.push(Array.from({ length: count }, () => mk('W', r)));
  }
  const lRounds: BracketMatch[][] = [];
  for (let r = 1; r <= 2 * R - 2; r++) {
    const count = n / 2 ** (Math.ceil(r / 2) + 1);
    lRounds.push(Array.from({ length: Math.max(1, count) }, () => mk('L', r)));
  }
  const gf = mk('GF', 1);

  for (let r = 0; r < R; r++) {
    wRounds[r].forEach((m, i) => {
      if (r + 1 < R) {
        m.winnerTo = { match: wRounds[r + 1][Math.floor(i / 2)].id, slot: (i % 2) as 0 | 1 };
      } else {
        m.winnerTo = { match: gf.id, slot: 0 };
      }
    });
  }
  wRounds[0].forEach((m, i) => {
    m.loserTo = { match: lRounds[0][Math.floor(i / 2)].id, slot: (i % 2) as 0 | 1 };
  });
  for (let r = 2; r <= R; r++) {
    const lb = lRounds[2 * (r - 1) - 1];
    wRounds[r - 1].forEach((m, i) => {
      const target = lb[lb.length - 1 - (i % lb.length)];
      m.loserTo = { match: target.id, slot: 0 };
    });
  }
  for (let r = 1; r <= 2 * R - 2; r++) {
    const cur = lRounds[r - 1];
    if (r === 2 * R - 2) {
      cur[0].winnerTo = { match: gf.id, slot: 1 };
      continue;
    }
    const nxt = lRounds[r];
    cur.forEach((m, i) => {
      if (r % 2 === 1) {
        m.winnerTo = { match: nxt[i % nxt.length].id, slot: 1 };
      } else {
        m.winnerTo = { match: nxt[Math.floor(i / 2)].id, slot: (i % 2) as 0 | 1 };
      }
    });
  }
  return matches;
}

export function createTournament(
  seed: string,
  humanName: string,
  bracketSize: number = BRACKET_SIZE,
  voyageLength: VoyageLength = DEFAULT_VOYAGE_LENGTH,
): TournamentState {
  let st: RngState = seedRng(`${seed}:bracket`);
  const seats: Seat[] = [];
  let humanIdx: number;
  [humanIdx, st] = nextInt(st, bracketSize);
  const names = AI_NAMES.slice();
  for (let i = 0; i < bracketSize; i++) {
    let ni: number;
    [ni, st] = nextInt(st, names.length);
    const aiName = names.splice(ni, 1)[0];
    seats.push({
      index: i,
      name: i === humanIdx ? humanName : aiName,
      isHuman: i === humanIdx,
      losses: 0,
      eliminated: false,
      matchesPlayed: 0,
      fleet: [],
      tray: [],
      draftRecords: [],
    });
  }
  const matches = generateBracket(bracketSize);
  const w1 = matches.filter((m) => m.bracket === 'W' && m.round === 1);
  w1.forEach((m, i) => {
    m.seats = [i * 2, i * 2 + 1];
  });
  return {
    saveVersion: SAVE_VERSION,
    seed,
    bracketSize,
    voyageLength,
    seats,
    matches,
    complete: false,
    championSeat: null,
  };
}

/** The game round (1..voyageLength) a pairing plays at. */
export function gameRoundFor(ts: TournamentState, m: BracketMatch): number {
  const a = m.seats[0] !== null ? ts.seats[m.seats[0]].matchesPlayed : 0;
  const b = m.seats[1] !== null ? ts.seats[m.seats[1]].matchesPlayed : 0;
  return Math.min(ts.voyageLength, Math.max(a, b) + 1);
}

export function nextPendingMatch(ts: TournamentState): BracketMatch | null {
  for (const m of ts.matches) {
    if (m.winner === null && m.seats[0] !== null && m.seats[1] !== null) return m;
  }
  return null;
}

/** Apply a match result and route both players onward. */
export function advanceMatch(ts: TournamentState, matchId: number, winnerSeat: number): TournamentState {
  const next = structuredClone(ts);
  const m = next.matches.find((x) => x.id === matchId)!;
  if (m.winner !== null) throw new Error('Match already resolved');
  if (!m.seats.includes(winnerSeat)) throw new Error('Winner is not in this match');
  const loserSeat = m.seats[0] === winnerSeat ? m.seats[1]! : m.seats[0]!;
  m.winner = winnerSeat;
  m.loser = loserSeat;
  const winner = next.seats[winnerSeat];
  const loser = next.seats[loserSeat];
  winner.matchesPlayed += 1;
  loser.matchesPlayed += 1;
  loser.losses += 1;

  if (m.winnerTo) {
    const t = next.matches.find((x) => x.id === m.winnerTo!.match)!;
    t.seats[m.winnerTo.slot] = winnerSeat;
  } else {
    next.complete = true;
    next.championSeat = winnerSeat;
  }
  if (m.loserTo && loser.losses < 2) {
    const t = next.matches.find((x) => x.id === m.loserTo!.match)!;
    t.seats[m.loserTo.slot] = loserSeat;
  } else {
    loser.eliminated = true;
  }
  return next;
}

export interface PairingDrafts {
  ships: ShipDraftState;
  cards: CardDraftState;
}

/** Deal the ship packs and the open card row for a pairing. */
export function dealPairingDrafts(ts: TournamentState, m: BracketMatch): PairingDrafts {
  const round = gameRoundFor(ts, m);
  const cfg = voyageRound(ts.voyageLength, round);
  const seedBase = `${ts.seed}:draft:${m.id}:${round}`;
  // Who opens the first ship pack, and who picks first from the card row,
  // alternates by round; round 1 is decided by seed.
  const seedFirst = firstPlayerFor(ts, m);
  const first = ((seedFirst + round + 1) % 2) as PlayerId;
  return {
    ships: dealShipDraft(seedBase, cfg.keeps, 100_000 + m.id * 1000, first),
    cards: dealCardDraft(seedBase, cfg.keeps, cfg.tiers, first),
  };
}

/** Fully resolve a two-AI ship draft. */
function runAiShipDraft(
  ds: ShipDraftState,
  seatA: Seat,
  seatB: Seat,
  seed: string,
  errorRate: number,
): ShipDraftState {
  let cur = ds;
  let guard = 0;
  while (!cur.done && guard++ < 100) {
    const p = cur.toAct;
    if (p === null) break;
    const seat = p === 0 ? seatA : seatB;
    const owned = [...seat.fleet, ...cur.keeps[p].map((k) => k.id)];
    const pick = aiShipPick(cur, p, owned, `${seed}:${p}`, errorRate);
    cur = pickShip(cur, p, pick.keepUid, pick.burnUid);
  }
  return cur;
}

/** Fully resolve a two-AI open card draft. */
function runAiCardDraft(
  ds: CardDraftState,
  seatA: Seat,
  seatB: Seat,
  seed: string,
  errorRate: number,
): CardDraftState {
  let cur = ds;
  let guard = 0;
  while (!cur.done && guard++ < 100) {
    const p = currentPicker(cur);
    if (p === null) break;
    const seat = p === 0 ? seatA : seatB;
    const owned = [...seat.tray, ...cur.keeps[p]];
    cur = pickCard(cur, p, aiCardPick(cur, p, owned, `${seed}:${p}`, errorRate));
  }
  return cur;
}

/** Commit finished drafts into the two seats' persistent runs. */
export function commitDrafts(
  ts: TournamentState,
  m: BracketMatch,
  drafts: PairingDrafts,
): TournamentState {
  const next = structuredClone(ts);
  const round = gameRoundFor(next, m);
  const cfg = voyageRound(next.voyageLength, round);
  for (const p of [0, 1] as PlayerId[]) {
    const seat = next.seats[m.seats[p]!];
    seat.fleet.push(...drafts.ships.keeps[p].map((k) => k.id));
    seat.tray.push(...drafts.cards.keeps[p]);
    seat.draftRecords.push({
      round,
      withSeat: m.seats[p === 0 ? 1 : 0]!,
      /** Packs this seat opened: the pair they passed on is public. */
      shipPairs: drafts.ships.records
        .filter((rec) => rec.firstPlayer === p)
        .map((rec) => [...rec.passed] as [string, string]),
      tiers: cfg.tiers,
    });
  }
  return next;
}

/**
 * What `viewerSeat` legitimately knows about `targetSeat`'s fleet: pairs from
 * drafts they attended together, tier rosters for everything else.
 */
export function cluesAbout(ts: TournamentState, viewerSeat: number, targetSeat: number): FleetClue[] {
  const target = ts.seats[targetSeat];
  const clues: FleetClue[] = [];
  for (const rec of target.draftRecords) {
    if (rec.withSeat === viewerSeat) {
      for (const pair of rec.shipPairs) clues.push({ options: [...pair] });
    } else {
      // Ship packs always deal the complete roster — unwitnessed picks
      // could be any hull.
      for (let i = 0; i < rec.shipPairs.length; i++) clues.push({ options: SHIP_IDS.slice() });
    }
  }
  return clues;
}

/**
 * Resolve an AI-vs-AI match without simulating the battle: both AIs draft
 * for real (fleets stay consistent), then a seeded coin decides the winner.
 */
export function resolveAiMatch(ts: TournamentState, m: BracketMatch): TournamentState {
  const round = gameRoundFor(ts, m);
  const err = aiErrorRate(round);
  const seatA = ts.seats[m.seats[0]!];
  const seatB = ts.seats[m.seats[1]!];
  const drafts = dealPairingDrafts(ts, m);
  const seedBase = `${ts.seed}:aidraft:${m.id}`;
  drafts.ships = runAiShipDraft(drafts.ships, seatA, seatB, `${seedBase}:s`, err);
  drafts.cards = runAiCardDraft(drafts.cards, seatA, seatB, `${seedBase}:c`, err);
  let next = commitDrafts(ts, m, drafts);
  const mm = next.matches.find((x) => x.id === m.id)!;
  let st = seedRng(`${ts.seed}:aires:${m.id}`);
  let f: number;
  [f, st] = nextFloat(st);
  const winnerSeat = f < 0.5 ? mm.seats[0]! : mm.seats[1]!;
  next = advanceMatch(next, m.id, winnerSeat);
  return next;
}

/** Resolve all pending AI-vs-AI matches until the human is up (or done). */
export function resolveUntilHuman(ts: TournamentState): TournamentState {
  let next = ts;
  let guard = 0;
  while (guard++ < 400) {
    const m = nextPendingMatch(next);
    if (!m) break;
    const a = next.seats[m.seats[0]!];
    const b = next.seats[m.seats[1]!];
    if (a.isHuman || b.isHuman) return next;
    next = resolveAiMatch(next, m);
  }
  return next;
}

export function humanNextMatch(ts: TournamentState): BracketMatch | null {
  const m = nextPendingMatch(ts);
  if (!m) return null;
  const a = ts.seats[m.seats[0]!];
  const b = ts.seats[m.seats[1]!];
  return a.isHuman || b.isHuman ? m : null;
}

export function humanSeat(ts: TournamentState): Seat {
  return ts.seats.find((s) => s.isHuman)!;
}

/** First player for a match, decided by seed. */
export function firstPlayerFor(ts: TournamentState, m: BracketMatch): PlayerId {
  return (hashString(`${ts.seed}:first:${m.id}`) % 2) as PlayerId;
}

/** Available cards in a round's packs (used for AI clue rosters). */
export function cardRosterFor(ts: TournamentState, round: number): string[] {
  const cfg = voyageRound(ts.voyageLength, round);
  return cardsOfTiers(cfg.tiers).map((c) => c.id);
}
