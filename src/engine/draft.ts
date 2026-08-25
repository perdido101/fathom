import type { DraftState, PlayerId } from './types';
import { CARD_IDS } from './cards';
import { PACK_A, PACK_B, PACK_C } from './ships';
import { shuffle, type RngState } from './rng';

/**
 * One drafting mechanism, used twice.
 *
 * A pack of four is shown face up to both players at once. Both pick in
 * secret. Both picks resolve together, and if they chose the same thing they
 * both get it — no redraw, no tiebreak, no penalty.
 *
 * What the reveal actually shows is the *collision*, not the pick. You learn
 * their choice only when it matched yours; otherwise their ship is still one
 * of four, which is what keeps up to 64 enemy fleets on the table after the
 * ship draft. Leaking the unpicked cards would collapse that to nothing, so
 * the client view never carries them.
 */

export function dealShipDraft(rng: RngState): [DraftState, RngState] {
  let st = rng;
  const packs: string[][] = [];
  // Pack order within each pack is shuffled so the four options are not always
  // presented in the same slots; the *contents* of each pack are fixed by
  // length, because every fleet must end up 4/3/2.
  for (const source of [PACK_A, PACK_B, PACK_C]) {
    let p: string[];
    [p, st] = shuffle(st, source);
    packs.push(p);
  }
  return [blank('ship', packs), st];
}

export function dealCardDraft(rng: RngState): [DraftState, RngState] {
  const [deck, st] = shuffle(rng, CARD_IDS);
  const packs = [deck.slice(0, 4), deck.slice(4, 8), deck.slice(8, 12)];
  return [blank('card', packs), st];
}

function blank(kind: 'ship' | 'card', packs: string[][]): DraftState {
  return {
    kind,
    packs,
    index: 0,
    picks: [
      [null, null, null],
      [null, null, null],
    ],
    collisions: [false, false, false],
    done: false,
  };
}

export function currentPack(ds: DraftState): string[] {
  return ds.packs[ds.index] ?? [];
}

export function canPick(ds: DraftState, p: PlayerId, defId: string): boolean {
  if (ds.done) return false;
  if (ds.picks[p][ds.index] !== null) return false;
  return currentPack(ds).includes(defId);
}

/** Lock in one player's pick. The pack resolves once both have chosen. */
export function submitPick(ds: DraftState, p: PlayerId, defId: string): DraftState {
  if (!canPick(ds, p, defId)) throw new Error(`illegal draft pick: ${defId}`);
  const next: DraftState = structuredClone(ds);
  next.picks[p][next.index] = defId;
  const a = next.picks[0][next.index];
  const b = next.picks[1][next.index];
  if (a !== null && b !== null) {
    next.collisions[next.index] = a === b;
    next.index += 1;
    if (next.index >= next.packs.length) {
      next.index = next.packs.length - 1;
      next.done = true;
    }
  }
  return next;
}

/** A player who ran out of time takes the first option in the pack. */
export function autoPick(ds: DraftState): string {
  return currentPack(ds)[0];
}

export function draftResult(ds: DraftState, p: PlayerId): string[] {
  return ds.picks[p].filter((x): x is string => x !== null);
}

/**
 * What the opponent could still be holding, given what the packs offered and
 * which packs collided. This is the deduction surface the bots reason over.
 */
export function possiblePicks(ds: DraftState, viewer: PlayerId): string[][] {
  return ds.packs.map((pack, i) => {
    if (ds.collisions[i]) {
      const mine = ds.picks[viewer][i];
      return mine ? [mine] : pack.slice();
    }
    // A non-collision rules out our own pick, and nothing else.
    const mine = ds.picks[viewer][i];
    return mine ? pack.filter((x) => x !== mine) : pack.slice();
  });
}
