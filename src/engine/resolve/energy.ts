import type { CardDef, MatchState, PlayerId, PlayerState } from '../types';
import { SHIPS } from '../../content/ships';

/**
 * Optional brake on instant hit income. `null` means uncapped: a big hit can
 * fund a bigger follow-up in the same turn, which is an intended line of
 * play. Set to a number only if the sim shows runaway snowballing.
 */
export const HIT_BONUS_CAP_PER_TURN: number | null = null;

export function tendersAlive(ps: PlayerState): number {
  return ps.ships.filter((s) => !s.sunk && SHIPS[s.typeId].ability === 'supply').length;
}

export function arrayShipAlive(ps: PlayerState): boolean {
  return ps.ships.some((s) => !s.sunk && SHIPS[s.typeId].ability === 'array');
}

/**
 * Effective card cost after the Array Ship discount (detect −1) and any
 * blockade surcharge (detect +N). Clamped at 0.
 */
export function effectiveCost(_ms: MatchState, ps: PlayerState, def: CardDef): number {
  let cost = def.cost;
  if (def.tags.includes('detect')) {
    if (arrayShipAlive(ps)) cost -= 1;
    if (ps.blockadeTurns > 0) cost += 2;
  }
  return Math.max(0, cost);
}

/**
 * Grant hit income immediately, during the resolution of the effect that
 * scored the hit — so it is spendable within the same turn.
 */
export function grantHitEnergy(ms: MatchState, p: PlayerId, amount: number): void {
  if (amount <= 0) return;
  const ps = ms.players[p];
  let grant = amount;
  if (HIT_BONUS_CAP_PER_TURN !== null) {
    grant = Math.max(0, Math.min(grant, HIT_BONUS_CAP_PER_TURN - ps.hitEnergyThisTurn));
  }
  if (grant <= 0) return;
  ps.hitEnergyThisTurn += grant;
  ps.energy += grant;
  ms.stats.peakBank[p] = Math.max(ms.stats.peakBank[p], ps.energy);
}

/**
 * Start-of-turn income: base + supply tenders, plus any banked ballast.
 * EMP halves the income (rounded down); ballast is a gain, not income, so
 * it lands unhalved. Unspent energy banks with no cap.
 */
export function applyIncome(ms: MatchState, p: PlayerId): void {
  const ps = ms.players[p];
  let income = ms.baseIncome + tendersAlive(ps);
  let empNote = '';
  if (ps.empTurns > 0) {
    income = Math.floor(income / 2);
    ps.empTurns -= 1;
    empNote = ' (halved by EMP)';
  }
  const gained = income + ps.pendingEnergy;
  ps.energy += gained;
  ms.stats.peakBank[p] = Math.max(ms.stats.peakBank[p], ps.energy);
  ms.log.push({
    turn: ms.turn,
    player: p,
    text: `${ps.name} gains ${gained} energy${empNote}.`,
    kind: 'info',
  });
  ps.pendingEnergy = 0;
  ps.hitEnergyThisTurn = 0;
}
