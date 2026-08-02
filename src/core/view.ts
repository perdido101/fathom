import type { MatchState, PlayerId, CellIndex } from './types';
import { other } from './types';
import { ACTIONS } from '../content/actions';
import { HULLS } from '../content/hulls';
import { isReady, cardCost } from './turn';

/**
 * The opponent-visible projection of a match.
 *
 * This is the ONLY shape a UI or network layer may render from. Hands, burn
 * piles, slates and annotations exist in engine state — several cards reach
 * into the burn pile, and the audit needs the slates — but none of them
 * appear here. What leaks out is exactly what the table would show:
 *
 *  - the boards, which are public and identical
 *  - the discs, because every shot leaves one
 *  - cards the opponent has played, which are face up forever after
 *  - hulls whose ability has fired, which reveals that the hull exists,
 *    never where it is
 *  - lengths of hulls whose sinking was announced
 */
export interface OpponentView {
  name: string;
  isAI: boolean;
  cubes: number;
  turnCount: number;
  /** How many hulls they deployed. Public — the match size says so. */
  fleetCount: number;
  /** How many are still afloat, derived from announced sinks only. */
  announcedSunkLengths: number[];
  /** Cards they have played, and whether each is upright again. */
  revealedCards: { defId: string; upright: boolean; gone: boolean }[];
  /** Hulls whose ability has fired. Identity only, never position. */
  revealedHulls: { defId: string; length: number; sunk: boolean }[];
  /** Number of cards still in hand — countable at the table. */
  handCount: number;
}

export function clientView(ms: MatchState, viewer: PlayerId) {
  const me = ms.players[viewer];
  const foe = ms.players[other(viewer)];

  const opponent: OpponentView = {
    name: foe.name,
    isAI: foe.isAI,
    cubes: foe.cubes,
    turnCount: foe.turnCount,
    fleetCount: foe.hulls.length + foe.toDeploy.length,
    announcedSunkLengths: me.sunkLengths.slice(),
    revealedCards: foe.hand
      .filter((c) => c.faceUp)
      .map((c) => ({
        defId: c.defId,
        upright: c.straightensOn === 0 && !c.locked,
        gone: c.gone,
      })),
    revealedHulls: foe.hulls
      .filter((h) => h.revealed)
      .map((h) => ({ defId: h.defId, length: h.length, sunk: h.sunk })),
    handCount: foe.hand.filter((c) => !c.gone).length,
  };

  return {
    version: ms.version,
    seedName: ms.seedName,
    board: ms.board,
    terrainCards: ms.terrainCards,
    phase: ms.phase,
    turn: ms.turn,
    current: ms.current,
    winner: ms.winner,
    viewer,
    /** Your own everything. */
    me: {
      name: me.name,
      cubes: me.cubes,
      turnCount: me.turnCount,
      hulls: me.hulls,
      toDeploy: me.toDeploy,
      hand: me.hand
        .filter((c) => !c.gone)
        .map((c) => ({
          uid: c.uid,
          defId: c.defId,
          ready: isReady(ms, viewer, c),
          cost: cardCost(ms, viewer, c.defId),
          upright: c.straightensOn === 0,
          locked: c.locked,
          faceUp: c.faceUp,
        })),
      basicSalvo: {
        uid: me.basicSalvo.uid,
        defId: me.basicSalvo.defId,
        ready: isReady(ms, viewer, me.basicSalvo),
        cost: 0,
      },
      annotations: me.annotations,
      draftClues: me.draftClues,
      discsOnMyBoard: me.discs,
    },
    /** Their board, which is where you shoot — the discs are your record. */
    theirDiscs: foe.discs,
    opponent,
    log: ms.log,
    /** Burn pile size is countable; its contents are not. */
    burnPileCount: ms.burnPile.length,
  };
}

export type ClientView = ReturnType<typeof clientView>;

/**
 * The audit. At match end both slates turn face up and every disc is checked.
 * This is a reveal screen, not a trust mechanism — but the data has to be
 * here to render it.
 */
export function auditView(ms: MatchState) {
  if (ms.phase !== 'over') throw new Error('The audit happens at match end');
  return {
    board: ms.board,
    winner: ms.winner,
    players: ms.players.map((p) => ({
      name: p.name,
      /** Names surface only now. */
      fleet: p.hulls.map((h) => ({
        defId: h.defId,
        name: HULLS[h.defId].name,
        length: h.length,
        cells: h.cells,
        destroyed: h.destroyed,
        sunk: h.sunk,
      })),
      discsTakenOnMyBoard: p.discs,
      hand: p.hand.map((c) => ({ defId: c.defId, name: ACTIONS[c.defId].name, gone: c.gone })),
      shotsFired: p.shotsFired,
      hitsScored: p.hitsScored,
    })),
    /** Burned cards return to the box unseen — but the audit may show them. */
    burnPile: ms.burnPile,
  };
}

/**
 * Every cell of the viewer's board that the opponent has fired at, with what
 * the opponent was told. Used by the reveal screen to verify discs.
 */
export function discReport(ms: MatchState, viewer: PlayerId): { cell: CellIndex; disc: string }[] {
  const me = ms.players[viewer];
  const out: { cell: CellIndex; disc: string }[] = [];
  me.discs.forEach((d, cell) => {
    if (d) out.push({ cell, disc: d.kind === 'red' ? (d.cube ? 'red+cube' : 'red') : 'white' });
  });
  return out;
}
