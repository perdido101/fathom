import { CARDS } from '../../engine/cards';
import type { Restrictions } from '../../engine/types';

/**
 * Why a control is inert.
 *
 * Every one of these returns null when the control is live, so a caller wraps
 * unconditionally and pays nothing for the ones that are working. The rule
 * being named is always the *first* rule that stops the action — a card that
 * is both pinned and under-charged says "pinned", because lifting the pin is
 * what the player would have to do first.
 */

export function whyCannotFire(
  defId: string,
  charges: number,
  restrictions: Restrictions,
  alreadyFiring: boolean,
): string | null {
  if (restrictions.noFire) return 'Your cards are locked this round — a Pin or a Cinder landed.';
  if (alreadyFiring) return 'You have already declared a card this round.';
  const need = CARDS[defId]?.minCharges ?? 1;
  if (charges < need) {
    return need === 1
      ? `${CARDS[defId]?.name ?? 'This card'} needs a charge before it can fire.`
      : `${CARDS[defId]?.name ?? 'This card'} needs ${need} charges. It holds ${charges}.`;
  }
  return null;
}

export function whyCannotCharge(restrictions: Restrictions, handEmpty: boolean): string | null {
  if (restrictions.noCharge) return 'Blacked out — no charge may be placed this round.';
  if (handEmpty) return 'No cards in hand to charge.';
  return null;
}

export function whyCannotCommit(
  charged: boolean,
  restrictions: Restrictions,
  aiming: boolean,
  handEmpty: boolean,
): string | null {
  if (aiming) return 'Finish aiming first — lock the declaration in or cancel it.';
  if (!charged && !restrictions.noCharge && !handEmpty)
    return 'One charge is mandatory every round. Click a card to place it.';
  return null;
}

export function whyTierLocked(locked: boolean, after: number, played: number): string | null {
  if (!locked) return null;
  const left = Math.max(0, after - played);
  return `Provisional accounts play the lowest table. ${left} more rated ${
    left === 1 ? 'match' : 'matches'
  } unlocks this one.`;
}

export function whyCannotDeploy(placed: number, total: number): string | null {
  if (placed >= total) return null;
  const left = total - placed;
  return `${left} ${left === 1 ? 'ship' : 'ships'} still to place.`;
}
