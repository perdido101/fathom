import type { PlayerId } from '../types';
import { cardsOfTiers } from '../../content/cards';
import { seedRng, nextInt, type RngState } from '../rng';

/**
 * Action cards draft from a shared, fully visible row with snake-order picks.
 * Cards public, ships hidden: the hidden information belongs on the board,
 * not in the toolkit, and counter-drafting an opponent's tools is the part of
 * the draft players enjoy most.
 *
 * Pool size is (picks × 2) + 2, so the row runs short and the last picker is
 * punished — which is what makes denial meaningful.
 */

export interface CardDraftState {
  /** The shared row, fully visible to both players. */
  pool: string[];
  /** Whose pick it is at each step. */
  order: PlayerId[];
  idx: number;
  picks: { by: PlayerId; id: string }[];
  keeps: [string[], string[]];
  done: boolean;
}

/** Snake order: A B B A A B … for `picksPerPlayer` picks each. */
export function snakeOrder(first: PlayerId, picksPerPlayer: number): PlayerId[] {
  const order: PlayerId[] = [];
  const second = (first === 0 ? 1 : 0) as PlayerId;
  for (let i = 0; i < picksPerPlayer; i++) {
    if (i % 2 === 0) order.push(first, second);
    else order.push(second, first);
  }
  return order;
}

export function dealCardDraft(
  seed: string,
  picksPerPlayer: number,
  tiers: number[],
  first: PlayerId,
): CardDraftState {
  let st: RngState = seedRng(`${seed}:cards`);
  const roster = cardsOfTiers(tiers).map((c) => c.id);
  const size = picksPerPlayer * 2 + 2;
  const pool: string[] = [];
  const copies = new Map<string, number>();
  let guard = 0;
  while (pool.length < size && guard++ < 1000) {
    let i: number;
    [i, st] = nextInt(st, roster.length);
    const id = roster[i];
    const c = copies.get(id) ?? 0;
    if (c >= 2) continue;
    copies.set(id, c + 1);
    pool.push(id);
  }
  return {
    pool,
    order: snakeOrder(first, picksPerPlayer),
    idx: 0,
    picks: [],
    keeps: [[], []],
    done: false,
  };
}

export function currentPicker(ds: CardDraftState): PlayerId | null {
  return ds.done ? null : ds.order[ds.idx];
}

export function canPickCard(ds: CardDraftState, p: PlayerId, id: string): boolean {
  return !ds.done && ds.order[ds.idx] === p && ds.pool.includes(id);
}

export function pickCard(ds: CardDraftState, p: PlayerId, id: string): CardDraftState {
  if (!canPickCard(ds, p, id)) throw new Error('Illegal card pick');
  const next: CardDraftState = structuredClone(ds);
  next.pool.splice(next.pool.indexOf(id), 1);
  next.picks.push({ by: p, id });
  next.keeps[p].push(id);
  next.idx += 1;
  if (next.idx >= next.order.length) next.done = true;
  return next;
}

/** The whole card draft is public — no hidden state to strip. */
export function clientCardDraftView(ds: CardDraftState, viewer: PlayerId): object {
  return {
    pool: ds.pool,
    picks: ds.picks,
    myKeeps: ds.keeps[viewer],
    opponentKeeps: ds.keeps[viewer === 0 ? 1 : 0],
    myTurn: currentPicker(ds) === viewer,
    done: ds.done,
  };
}
