import type { MatchState, PlayerId, PlayerState } from '../types';
import { other } from '../types';

export function aliveShips(ps: PlayerState): number {
  return ps.ships.filter((s) => !s.sunk).length;
}

/** Update the endgame-drag stat: ply when a side first hit ≤1 alive ship. */
export function updateEndangered(ms: MatchState): void {
  for (const ps of ms.players) {
    if (ms.stats.endangeredAt[ps.id] === null && ps.ships.length > 0 && aliveShips(ps) <= 1) {
      ms.stats.endangeredAt[ps.id] = ms.turn;
      // Snapshot the hunter's shot count — the "shots to sink the final
      // ship" canary is measured from here.
      ms.stats.oppShotsAtEndangered[ps.id] = ms.players[other(ps.id)].shotsFired;
      if (ms.stats.firstEndangeredTurn === null) ms.stats.firstEndangeredTurn = ms.turn;
    }
  }
}

/**
 * A player wins when every enemy ship is fully sunk. If a Wake chain kills
 * both fleets in one resolution, the acting player wins.
 */
export function checkVictory(ms: MatchState, actor: PlayerId): void {
  if (ms.phase !== 'battle') return;
  const enemyDead = aliveShips(ms.players[other(actor)]) === 0;
  const actorDead = aliveShips(ms.players[actor]) === 0;
  if (enemyDead) {
    ms.phase = 'over';
    ms.winner = actor;
  } else if (actorDead) {
    ms.phase = 'over';
    ms.winner = other(actor);
  }
  if (ms.phase === 'over') {
    const winner = ms.players[ms.winner!];
    ms.log.push({
      turn: ms.turn,
      player: ms.winner!,
      text: `${winner.name} wins — the enemy fleet is destroyed.`,
      kind: 'system',
    });
  }
}
