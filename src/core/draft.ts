import type { PlayerId } from './types';
import { other } from './types';
import { HULL_IDS } from '../content/hulls';
import { DRAFTABLE_ACTION_IDS } from '../content/actions';
import { shuffle, type RngState } from '../engine/rng';

/**
 * Both drafts use the same engine. A pack of four is dealt face down to the
 * receiver: they keep one, burn one face down, and pass the remaining two
 * across. The other player keeps one of those and burns the other. The next
 * pack goes to them first.
 *
 * Ships: five packs → 5 hulls each, 10 burned, 4 never dealt.
 * Actions: ten packs → 10 cards each, 20 burned, 10 undealt.
 *
 * What you burn, nobody ever learns. The burn pile is engine state — several
 * action cards reach into it — but it never appears in an opponent-visible
 * view, and neither does anyone's hand.
 */
export type DraftKind = 'ship' | 'action';

export interface DraftItem {
  uid: number;
  defId: string;
}

export interface DraftState {
  kind: DraftKind;
  /** Undealt cards, in deal order. */
  deck: DraftItem[];
  /** The cards in front of the player to act. Four when fresh, two when passed. */
  inFront: DraftItem[];
  toAct: PlayerId | null;
  /** 'fresh' = holding the dealt four; 'passed' = holding the two passed on. */
  stage: 'fresh' | 'passed';
  /** Who receives the next fresh pack. */
  nextReceiver: PlayerId;
  packIndex: number;
  packCount: number;
  keeps: [DraftItem[], DraftItem[]];
  /** Never client-visible. */
  burns: [DraftItem[], DraftItem[]];
  /**
   * Public trail: for each pack, who opened it and which two were passed on.
   * A player who opens a pack knows their opponent chose between exactly
   * those two; a player who receives knows only what they were handed.
   */
  records: { packIndex: number; opener: PlayerId; passed: string[] }[];
  done: boolean;
}

export function dealDraft(
  kind: DraftKind,
  rng: RngState,
  packCount: number,
  firstReceiver: PlayerId,
  uidBase: number,
): [DraftState, RngState] {
  const pool = kind === 'ship' ? HULL_IDS : DRAFTABLE_ACTION_IDS;
  const [shuffled, st] = shuffle(rng, pool);
  const needed = packCount * 4;
  if (needed > shuffled.length) {
    throw new Error(`${kind} draft needs ${needed} cards but the deck holds ${shuffled.length}`);
  }
  const deck: DraftItem[] = shuffled
    .slice(0, needed)
    .map((defId, i) => ({ uid: uidBase + i, defId }));
  const ds: DraftState = {
    kind,
    deck,
    inFront: [],
    toAct: null,
    stage: 'fresh',
    nextReceiver: firstReceiver,
    packIndex: 0,
    packCount,
    keeps: [[], []],
    burns: [[], []],
    records: [],
    done: false,
  };
  openPack(ds);
  return [ds, st];
}

function openPack(ds: DraftState): void {
  if (ds.packIndex >= ds.packCount || ds.deck.length < 4) {
    ds.done = true;
    ds.inFront = [];
    ds.toAct = null;
    return;
  }
  ds.inFront = ds.deck.splice(0, 4);
  ds.toAct = ds.nextReceiver;
  ds.stage = 'fresh';
}

export function canPick(ds: DraftState, p: PlayerId): boolean {
  return !ds.done && ds.toAct === p && ds.inFront.length >= 2;
}

/** Keep one, burn one. Both must be cards currently in front of you. */
export function pick(ds: DraftState, p: PlayerId, keepUid: number, burnUid: number): DraftState {
  if (!canPick(ds, p)) throw new Error('Not your pick');
  if (keepUid === burnUid) throw new Error('Keep and burn must differ');
  const next: DraftState = structuredClone(ds);
  const keep = next.inFront.find((i) => i.uid === keepUid);
  const burn = next.inFront.find((i) => i.uid === burnUid);
  if (!keep || !burn) throw new Error('Pick must come from the cards in front of you');
  next.keeps[p].push(keep);
  next.burns[p].push(burn);
  const rest = next.inFront.filter((i) => i.uid !== keepUid && i.uid !== burnUid);

  if (next.stage === 'fresh') {
    next.records.push({
      packIndex: next.packIndex,
      opener: p,
      passed: rest.map((i) => i.defId),
    });
    next.inFront = rest;
    next.toAct = other(p);
    next.stage = 'passed';
  } else {
    next.packIndex += 1;
    next.nextReceiver = other(next.nextReceiver);
    openPack(next);
  }
  return next;
}

/**
 * What a viewer legitimately knows about the opponent's keeps.
 *
 * A pack the viewer opened yields a hard pair: the opponent kept one of the
 * exact two passed on. A pack the opponent opened yields nothing directly —
 * the viewer never saw the other two — so it resolves only by elimination
 * against the public roster.
 */
export function cluesFor(ds: DraftState, viewer: PlayerId): string[][] {
  const clues: string[][] = [];
  const seen = new Set<string>();
  for (const item of [...ds.keeps[viewer], ...ds.burns[viewer]]) seen.add(item.defId);
  for (const rec of ds.records) for (const id of rec.passed) seen.add(id);

  const dealtAll = [
    ...ds.keeps[0], ...ds.keeps[1], ...ds.burns[0], ...ds.burns[1],
  ].map((i) => i.defId);
  const unseen = dealtAll.filter((id) => !seen.has(id));

  let blind = 0;
  for (const rec of ds.records) {
    if (rec.opener === viewer) clues.push([...rec.passed]);
    else blind += 1;
  }
  const pool = [...new Set(unseen.length > 0 ? unseen : dealtAll)];
  for (let i = 0; i < blind; i++) clues.push([...pool]);
  return clues;
}

/**
 * Client-visible draft state. The opponent's hand, keeps and burns are
 * absent; so are the undealt deck and any cards not currently shown to this
 * viewer. Only the pack trail is public.
 */
export function clientDraftView(ds: DraftState, viewer: PlayerId) {
  return {
    kind: ds.kind,
    packIndex: ds.packIndex,
    packCount: ds.packCount,
    stage: ds.stage,
    myTurn: ds.toAct === viewer,
    done: ds.done,
    /** Only while it is this viewer's pick. */
    inFront: ds.toAct === viewer ? ds.inFront : null,
    myKeeps: ds.keeps[viewer],
    packTrail: ds.records,
    remaining: ds.packCount - ds.packIndex,
  };
}
