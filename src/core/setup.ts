import type { MatchState, PlayerId } from './types';
import { createMatch, type MatchSetup } from './state';
import { dealDraft, pick, cluesFor, type DraftState } from './draft';
import { MATCH_SIZES } from '../content/grids';
import { seedRng, type RngState } from '../engine/rng';

/**
 * The setup sequence, in the order the rulebook gives it:
 * ships are drafted before the sea is dealt, then the sea and terrain, then
 * deployment, then action cards — so your toolkit answers the actual match.
 *
 * The digital game runs the same order. Deployment happens between the two
 * drafts, which is why the action draft is a separate step here rather than
 * being folded into match creation.
 */
export interface SetupResult {
  shipDraft: DraftState;
  actionDraft: DraftState;
  match: MatchState;
}

/** Hull packs. Five for a standard match; the size table decides. */
export function beginShipDraft(setup: MatchSetup): [DraftState, RngState] {
  const size = MATCH_SIZES[setup.size];
  const st = seedRng(`${setup.seed}:ships`);
  // One kept hull per pack per player.
  return dealDraft('ship', st, size.hulls, 0, 10_000);
}

/** Action packs, dealt after deployment. Ten for a standard match. */
export function beginActionDraft(setup: MatchSetup, rng: RngState): [DraftState, RngState] {
  const size = MATCH_SIZES[setup.size];
  return dealDraft('action', rng, size.actionCards, 1, 20_000);
}

/**
 * Run a whole draft with two callbacks deciding each pick. Used by the AI
 * and the harness; the UI drives its own picks one at a time.
 */
export function runDraft(
  ds: DraftState,
  choose: (state: DraftState, p: PlayerId) => { keepUid: number; burnUid: number },
): DraftState {
  let cur = ds;
  let guard = 0;
  while (!cur.done && cur.toAct !== null && guard++ < 200) {
    const p = cur.toAct;
    const { keepUid, burnUid } = choose(cur, p);
    cur = pick(cur, p, keepUid, burnUid);
  }
  return cur;
}

/**
 * Assemble a match from two finished drafts. Both burn piles merge into the
 * single face-down pile that Press Gang, Scuttlebutt and Refit reach into.
 */
export function assembleMatch(
  setup: MatchSetup,
  shipDraft: DraftState,
  actionDraft: DraftState,
): MatchState {
  const burnPile = [
    ...shipDraft.burns[0], ...shipDraft.burns[1],
    ...actionDraft.burns[0], ...actionDraft.burns[1],
  ].map((i) => i.defId);

  return createMatch(
    setup,
    [
      {
        hulls: shipDraft.keeps[0].map((i) => i.defId),
        hand: actionDraft.keeps[0].map((i) => i.defId),
      },
      {
        hulls: shipDraft.keeps[1].map((i) => i.defId),
        hand: actionDraft.keeps[1].map((i) => i.defId),
      },
    ],
    [cluesFor(shipDraft, 0), cluesFor(shipDraft, 1)],
    burnPile,
  );
}
