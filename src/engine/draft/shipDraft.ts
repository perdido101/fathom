import type { PlayerId, FleetClue } from '../types';
import { other } from '../types';
import { SHIP_IDS } from '../../content/ships';
import { seedRng, shuffle } from '../rng';

/**
 * Ship draft: passing packs of four.
 *
 * Each pack deals 4 hulls face down to the pack's first player. They keep 1,
 * burn 1 face down, and pass the remaining 2 to the second player, who keeps
 * 1 and burns 1. Which player receives the fresh pack alternates every pack.
 * Five packs consume all 20 hulls and give each player 5 ships.
 *
 * Burned hulls are removed permanently and never revealed to anyone. The burn
 * pile is engine state (determinism and replay) and must never appear in a
 * client-visible serialisation.
 *
 * What a player can legitimately deduce:
 *  - Packs where they went FIRST: they saw all 4, kept 1, burned 1, and know
 *    the opponent kept one of the exact 2 they passed on. A hard pair clue.
 *  - Packs where they went SECOND: they only saw the 2 passed to them. The
 *    opponent kept one of the 2 they never saw — identifiable only by
 *    elimination against the public roster.
 *
 * NOTE: the design references a 20-hull roster; the content set currently
 * defines 10 hulls, so the deck is the roster dealt twice (each hull appears
 * exactly twice). Five packs of four still consume it exactly. Flagged.
 */

export interface PackItem {
  uid: number;
  id: string;
}

export interface PackRecord {
  packIndex: number;
  /** Who received the fresh 4. */
  firstPlayer: PlayerId;
  /** The 2 hulls passed on to the second player — seen by both. */
  passed: [string, string];
}

export interface ShipDraftState {
  /** Undealt hulls, in deal order. */
  deck: PackItem[];
  /** Hulls currently in front of the player to act, if any. */
  current: PackItem[] | null;
  /** Who must act on `current`. */
  toAct: PlayerId | null;
  /** Whether `toAct` is the first (fresh 4) or second (passed 2) picker. */
  stage: 'first' | 'second';
  /** Which player receives the next fresh pack. */
  nextFresh: PlayerId;
  packIndex: number;
  packCount: number;
  keeps: [PackItem[], PackItem[]];
  /** Burn piles — never client-visible. */
  burns: [PackItem[], PackItem[]];
  /** Public trail: what passed through each pack. */
  records: PackRecord[];
  done: boolean;
}

/**
 * Deal a ship draft. `packCount` packs yield one hull per player per pack,
 * so packCount = the round's ship quota. Each pack consumes 4 hulls.
 */
export function dealShipDraft(
  seed: string,
  packCount: number,
  uidBase: number,
  firstFresh: PlayerId = 0,
): ShipDraftState {
  let st = seedRng(`${seed}:ships`);
  let ids: string[];
  [ids, st] = shuffle(st, [...SHIP_IDS, ...SHIP_IDS]);
  const needed = packCount * 4;
  if (needed > ids.length) {
    throw new Error(`Ship draft needs ${needed} hulls but the roster deals ${ids.length}`);
  }
  const deck: PackItem[] = ids.slice(0, needed).map((id, i) => ({ uid: uidBase + i, id }));
  const ds: ShipDraftState = {
    deck,
    current: null,
    toAct: null,
    stage: 'first',
    nextFresh: firstFresh,
    packIndex: 0,
    packCount,
    keeps: [[], []],
    burns: [[], []],
    records: [],
    done: false,
  };
  openPack(ds);
  return ds;
}

function openPack(ds: ShipDraftState): void {
  if (ds.packIndex >= ds.packCount || ds.deck.length < 4) {
    ds.done = true;
    ds.current = null;
    ds.toAct = null;
    return;
  }
  ds.current = ds.deck.splice(0, 4);
  ds.toAct = ds.nextFresh;
  ds.stage = 'first';
}

export function canPick(ds: ShipDraftState, p: PlayerId): boolean {
  return !ds.done && ds.toAct === p && (ds.current?.length ?? 0) >= 2;
}

/** Keep one hull, burn one. Both must come from the cards in front of you. */
export function pickShip(
  ds: ShipDraftState,
  p: PlayerId,
  keepUid: number,
  burnUid: number,
): ShipDraftState {
  if (!canPick(ds, p)) throw new Error('Not your pick');
  if (keepUid === burnUid) throw new Error('Keep and burn must differ');
  const next: ShipDraftState = structuredClone(ds);
  const pack = next.current!;
  const keep = pack.find((i) => i.uid === keepUid);
  const burn = pack.find((i) => i.uid === burnUid);
  if (!keep || !burn) throw new Error('Pick must come from the cards in front of you');
  next.keeps[p].push(keep);
  next.burns[p].push(burn);
  const rest = pack.filter((i) => i.uid !== keepUid && i.uid !== burnUid);

  if (next.stage === 'first') {
    // Pass the remaining 2 to the other player.
    next.records.push({
      packIndex: next.packIndex,
      firstPlayer: p,
      passed: [rest[0].id, rest[1].id],
    });
    next.current = rest;
    next.toAct = other(p);
    next.stage = 'second';
  } else {
    // Pack exhausted; alternate who receives the fresh pack.
    next.packIndex += 1;
    next.nextFresh = other(next.nextFresh);
    openPack(next);
  }
  return next;
}

/**
 * The clue pairs a viewer holds about the opponent's kept hulls.
 *
 * Packs the viewer opened give an exact pair (the two they passed on). Packs
 * the opponent opened are only knowable by elimination: the opponent kept one
 * of the two hulls the viewer never saw, so those clues carry the full set of
 * unseen hulls as candidates.
 */
export function cluesFor(ds: ShipDraftState, viewer: PlayerId): FleetClue[] {
  const clues: FleetClue[] = [];
  const seen: string[] = [];
  // Everything the viewer laid eyes on: their own keeps and burns, plus the
  // hulls passed either direction in packs they took part in.
  for (const item of [...ds.keeps[viewer], ...ds.burns[viewer]]) seen.push(item.id);
  for (const rec of ds.records) seen.push(...rec.passed);

  // Unseen pool = everything dealt minus everything seen (multiset).
  const dealt: string[] = [
    ...ds.keeps[0], ...ds.keeps[1], ...ds.burns[0], ...ds.burns[1],
  ].map((i) => i.id);
  const pool = dealt.slice();
  for (const id of seen) {
    const at = pool.indexOf(id);
    if (at >= 0) pool.splice(at, 1);
  }

  let hidden = 0;
  for (const rec of ds.records) {
    if (rec.firstPlayer === viewer) {
      // The opponent picked from the exact two we passed on.
      clues.push({ options: [...rec.passed] });
    } else {
      hidden += 1;
    }
  }
  // Each pack the opponent opened hides one keep among the unseen hulls.
  const candidates = pool.length > 0 ? pool : dealt;
  for (let i = 0; i < hidden; i++) clues.push({ options: [...new Set(candidates)] });
  return clues;
}

/**
 * Client-visible view. The opponent's keeps, burns, and any hulls not yet
 * shown to this viewer are absent; the pack trail is the deduction aid.
 */
export function clientShipDraftView(ds: ShipDraftState, viewer: PlayerId): object {
  return {
    packIndex: ds.packIndex,
    packCount: ds.packCount,
    stage: ds.stage,
    myTurn: ds.toAct === viewer,
    done: ds.done,
    /** Only shown while it is this viewer's pick. */
    inFront: ds.toAct === viewer ? ds.current : null,
    myKeeps: ds.keeps[viewer],
    myBurns: ds.burns[viewer],
    /** What passed through each pack, and who opened it. */
    packTrail: ds.records,
  };
}
