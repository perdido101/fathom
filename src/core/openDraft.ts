import type { PlayerId } from './types';
import { other } from './types';
import { DRAFTABLE_ACTION_IDS } from '../content/actions';
import { shuffle, type RngState } from '../engine/rng';

/**
 * The open row: an alternative action draft where cards are dealt face up and
 * taken one at a time.
 *
 * Why this exists as an option rather than a replacement: hidden packs and an
 * open row are not interchangeable, and the difference lands on six specific
 * cards. Watch Change, Shot Across the Bow, Mutiny, Press Gang, Scuttlebutt
 * and Refit all trade on nobody knowing what is in a hand or a burn pile. Run
 * the row and those cards lose most of their point; run the packs and the
 * draft is slower and less interactive. Both are implemented so the printed
 * prototype can try each without a rules rewrite.
 *
 * The row is deliberately short — (picks x 2) + 2 — so the last picker goes
 * hungry and denial is a real choice rather than a courtesy.
 */
export interface OpenDraftState {
  kind: 'action';
  /** The face-up row, visible to both. */
  row: string[];
  /** Whose pick it is. */
  toAct: PlayerId;
  picks: { by: PlayerId; defId: string }[];
  keeps: [string[], string[]];
  /** Picks each player still owes. */
  remaining: [number, number];
  done: boolean;
}

export function dealOpenDraft(
  rng: RngState,
  picksEach: number,
  firstPicker: PlayerId,
): [OpenDraftState, RngState] {
  const [deck, st] = shuffle(rng, DRAFTABLE_ACTION_IDS);
  const rowSize = picksEach * 2 + 2;
  return [
    {
      kind: 'action',
      row: deck.slice(0, rowSize),
      toAct: firstPicker,
      picks: [],
      keeps: [[], []],
      remaining: [picksEach, picksEach],
      done: false,
    },
    st,
  ];
}

export function canTake(ds: OpenDraftState, p: PlayerId, defId: string): boolean {
  return !ds.done && ds.toAct === p && ds.remaining[p] > 0 && ds.row.includes(defId);
}

export function take(ds: OpenDraftState, p: PlayerId, defId: string): OpenDraftState {
  if (!canTake(ds, p, defId)) throw new Error('Illegal pick');
  const next: OpenDraftState = structuredClone(ds);
  next.row.splice(next.row.indexOf(defId), 1);
  next.keeps[p].push(defId);
  next.picks.push({ by: p, defId });
  next.remaining[p] -= 1;

  // Alternate, skipping anyone who has finished.
  const opponent = other(p);
  if (next.remaining[opponent] > 0) next.toAct = opponent;
  else if (next.remaining[p] > 0) next.toAct = p;

  if (next.remaining[0] === 0 && next.remaining[1] === 0) next.done = true;
  return next;
}

/** The whole row is public, so there is nothing to strip. */
export function clientOpenDraftView(ds: OpenDraftState, viewer: PlayerId) {
  return {
    kind: ds.kind,
    row: ds.row,
    myTurn: ds.toAct === viewer,
    myKeeps: ds.keeps[viewer],
    theirKeeps: ds.keeps[other(viewer)],
    remaining: ds.remaining[viewer],
    done: ds.done,
  };
}
