import type { CardUiState, CardInstance, MatchState, PlayerState } from '../types';
import { CARDS, BASIC_SALVO_ID } from '../../content/cards';
import { effectiveCost } from './energy';

/**
 * Binary availability. Playing a card on your turn T makes it unavailable for
 * turn T+1; it is available again from T+2. There is no counter and no tick
 * step — a card simply carries the turn number it becomes playable again.
 *
 * Basic salvo is exempt: without it a player could face a turn with no legal
 * action, which must never happen.
 */
export function isAvailable(ps: PlayerState, card: CardInstance): boolean {
  if (card.spent) return false;
  if (card.typeId === BASIC_SALVO_ID) return true;
  return ps.turnCount >= card.availableFromTurn;
}

/** Mark a card as played on the owner's current turn. */
export function markPlayed(ps: PlayerState, card: CardInstance): void {
  card.availableFromTurn = ps.turnCount + 2;
}

/** The four tray states: ready / too expensive / unavailable / spent. */
export function cardUiState(ms: MatchState, ps: PlayerState, card: CardInstance): CardUiState {
  if (card.spent) return 'spent';
  if (!isAvailable(ps, card)) return 'unavailable';
  const cost = effectiveCost(ms, ps, CARDS[card.typeId]);
  return ps.energy >= cost ? 'ready' : 'expensive';
}

export function isCardPlayable(ms: MatchState, ps: PlayerState, card: CardInstance): boolean {
  return cardUiState(ms, ps, card) === 'ready';
}
