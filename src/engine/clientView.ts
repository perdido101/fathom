import type { MatchState, PlayerId } from './types';
import { other } from './types';
import { CARDS, BASIC_SALVO_ID } from '../content/cards';

/**
 * The client-visible projection of a match for one player. This is the ONLY
 * shape a UI or network layer may render from: the opponent's unplayed
 * cards, ship hulls, positions, mines, decoys, buoys and intel never leave
 * the engine. Fleet composition is never declared — the viewer's clue pairs
 * and announced sink lengths are all they get.
 */
export interface OpponentView {
  name: string;
  isAI: boolean;
  energy: number;
  turnCount: number;
  /** Number of ships the opponent fields (public via the round structure). */
  fleetCount: number;
  /** Ships whose sinking was announced: lengths only. */
  announcedSunkLengths: number[];
  /** Cards the opponent has revealed by playing them (plus basic salvo). */
  revealedTray: { typeId: string; available: boolean; spent: boolean }[];
  /** Statuses that are publicly observable. */
  empTurns: number;
  blockadeTurns: number;
}

export function clientMatchView(ms: MatchState, viewer: PlayerId) {
  const me = ms.players[viewer];
  const oppFull = ms.players[other(viewer)];
  const opponent: OpponentView = {
    name: oppFull.name,
    isAI: oppFull.isAI,
    energy: oppFull.energy,
    turnCount: oppFull.turnCount,
    fleetCount: oppFull.ships.length + oppFull.fleetToPlace.length,
    announcedSunkLengths: me.enemySunkLengths.slice(),
    revealedTray: oppFull.tray
      .filter((c) => c.revealed)
      .map((c) => ({
        typeId: c.typeId,
        available: c.typeId === BASIC_SALVO_ID || oppFull.turnCount >= c.availableFromTurn,
        spent: c.spent,
      })),
    empTurns: oppFull.empTurns,
    blockadeTurns: oppFull.blockadeTurns,
  };
  return {
    version: ms.version,
    seedName: ms.seedName,
    round: ms.round,
    voyageLength: ms.voyageLength,
    gridW: ms.gridW,
    gridH: ms.gridH,
    terrain: ms.terrain,
    modifierId: ms.modifierId,
    baseIncome: ms.baseIncome,
    phase: ms.phase,
    turn: ms.turn,
    current: ms.current,
    firstPlayer: ms.firstPlayer,
    winner: ms.winner,
    viewer,
    me,
    opponent,
    log: ms.log,
  };
}

export type ClientMatchView = ReturnType<typeof clientMatchView>;

/** Assert-friendly helper: every card id visible to `viewer` about the enemy. */
export function visibleOpponentCardIds(ms: MatchState, viewer: PlayerId): string[] {
  return clientMatchView(ms, viewer).opponent.revealedTray.map((c) => c.typeId);
}

/** Sanity helper for tests: ids of all draftable cards. */
export function isDraftable(id: string): boolean {
  return CARDS[id] !== undefined && CARDS[id].tier !== 0;
}
