import type {
  CellIndex,
  MatchState,
  Outcome,
  Phase,
  PlayerId,
  ResolveEvent,
  Restrictions,
} from './types';
import { other } from './types';
import { SHIPS } from './ships';

/**
 * The only shape a client is ever handed.
 *
 * Hiding information in the UI is not hiding it — anyone can open the network
 * tab. So the projection happens here, in the engine, and the server sends
 * nothing else. What survives the trip is exactly what the rules say is
 * public: every charge count on both sides, the packs that were shown face up,
 * which packs collided, revealed ship identities, and your own board.
 */

export interface EnemyShipView {
  /** Lengths are public: a sink announces its length. */
  length: number;
  sunk: boolean;
  /** Set once the ship has acted or died. Position is never included. */
  defId: string | null;
  abilityUsed: boolean;
}

export interface EnemyCardView {
  uid: number;
  /** Always public. This is the core of the design. */
  charges: number;
  /** Non-null only for a card whose identity you are entitled to know. */
  defId: string | null;
}

export interface ClientView {
  version: number;
  phase: Phase;
  round: number;
  roundCap: number;
  seedCommit: string;
  /** Revealed only once the match is over. */
  seed: string | null;
  you: PlayerId;
  outcome: Outcome | null;

  me: {
    name: string;
    hand: { uid: number; defId: string; charges: number }[];
    ships: {
      defId: string;
      length: number;
      cells: CellIndex[];
      hits: boolean[];
      sunk: boolean;
      abilityUsed: boolean;
    }[];
    graveyard: { defId: string; charges: number; round: number }[];
    restrictions: Restrictions;
    timerStrikes: number;
    draftedShips: string[];
    draftedCards: string[];
    /** Your shot history on their board. */
    marks: Record<CellIndex, 'hit' | 'miss'>;
    knownShipCells: CellIndex[];
    counts: { rows: Record<number, number>; cols: Record<number, number> };
    sankLengths: number[];
  };

  foe: {
    name: string;
    hand: EnemyCardView[];
    ships: EnemyShipView[];
    graveyard: { defId: string; charges: number; round: number }[];
    restrictions: Restrictions;
    timerStrikes: number;
    /** Their shots on your board. You can see these; they hit your water. */
    marks: Record<CellIndex, 'hit' | 'miss'>;
    connected: boolean;
  };

  /** Packs were shown face up to both players, so they stay public. */
  shipDraft: { packs: string[][]; index: number; myPicks: (string | null)[]; collisions: boolean[]; done: boolean };
  cardDraft: { packs: string[][]; index: number; myPicks: (string | null)[]; collisions: boolean[]; done: boolean };

  /** Count only. The order is the whole secret. */
  pileCount: number;

  log: { round: number; text: string }[];
}

export function clientView(ms: MatchState, viewer: PlayerId): ClientView {
  const me = ms.players[viewer];
  const foe = ms.players[other(viewer)];
  const over = ms.phase === 'over';

  // A foe card's identity is knowable only where the rules made it public:
  // a collided draft pack means you took the same card they did.
  const collidedCards = new Set(
    ms.cardDraft.collisions
      .map((c, i) => (c ? ms.cardDraft.picks[viewer][i] : null))
      .filter((x): x is string => x !== null),
  );

  return {
    version: ms.version,
    phase: ms.phase,
    round: ms.round,
    roundCap: ms.config.roundCap,
    seedCommit: ms.seedCommit,
    seed: over ? ms.seed : null,
    you: viewer,
    outcome: ms.outcome,

    me: {
      name: me.name,
      hand: me.hand.map((c) => ({ uid: c.uid, defId: c.defId, charges: c.charges })),
      ships: me.ships.map((s) => ({
        defId: s.defId,
        length: s.length,
        cells: s.cells.slice(),
        hits: s.hits.slice(),
        sunk: s.sunk,
        abilityUsed: s.abilityUsed,
      })),
      graveyard: me.graveyard.slice(),
      restrictions: { ...me.restrictions },
      timerStrikes: me.timerStrikes,
      draftedShips: me.draftedShips.slice(),
      draftedCards: me.draftedCards.slice(),
      marks: { ...me.marks },
      knownShipCells: me.knownShipCells.slice(),
      counts: { rows: { ...me.counts.rows }, cols: { ...me.counts.cols } },
      sankLengths: me.sankLengths.slice(),
    },

    foe: {
      name: foe.name,
      hand: foe.hand.map((c) => ({
        uid: c.uid,
        charges: c.charges,
        defId: over || collidedCards.has(c.defId) ? c.defId : null,
      })),
      ships: foe.ships.map((s) => ({
        length: s.length,
        sunk: s.sunk,
        defId: s.revealed || over ? s.defId : null,
        abilityUsed: s.abilityUsed,
      })),
      graveyard: foe.graveyard.slice(),
      restrictions: { ...foe.restrictions },
      timerStrikes: foe.timerStrikes,
      marks: { ...foe.marks },
      connected: foe.connected,
    },

    shipDraft: projectDraft(ms, viewer, 'shipDraft'),
    cardDraft: projectDraft(ms, viewer, 'cardDraft'),
    pileCount: ms.pile.length,
    log: ms.log
      .filter((l) => !l.privateTo || l.privateTo.includes(viewer))
      .slice(-60)
      .map((l) => ({ round: l.round, text: l.text })),
  };
}

function projectDraft(ms: MatchState, viewer: PlayerId, which: 'shipDraft' | 'cardDraft') {
  const ds = ms[which];
  return {
    packs: ds.packs.map((p) => p.slice()),
    index: ds.index,
    myPicks: ds.picks[viewer].slice(),
    collisions: ds.collisions.slice(),
    done: ds.done,
  };
}

/**
 * What each player is allowed to see of a resolve step. Intel is private to
 * the player who bought it; everything else in the sequence is shared.
 */
export function visibleEvents(events: ResolveEvent[], viewer: PlayerId): ResolveEvent[] {
  return events.filter((e) => (e.t === 'intel' ? e.to === viewer : true));
}

/** Both fleets, for the result screen. Only ever called on a finished match. */
export function finalReveal(ms: MatchState): {
  ships: [string[], string[]];
  cards: [string[], string[]];
  placements: [CellIndex[][], CellIndex[][]];
  names: [string, string];
  seed: string;
} | null {
  if (ms.phase !== 'over') return null;
  return {
    ships: [ms.players[0].draftedShips.slice(), ms.players[1].draftedShips.slice()],
    cards: [ms.players[0].draftedCards.slice(), ms.players[1].draftedCards.slice()],
    placements: [
      ms.players[0].ships.map((s) => s.cells.slice()),
      ms.players[1].ships.map((s) => s.cells.slice()),
    ],
    names: [ms.players[0].name, ms.players[1].name],
    seed: ms.seed,
  };
}

/** Human-readable fleet summary for the result screen. */
export function fleetNames(ids: string[]): string {
  return ids.map((id) => SHIPS[id]?.name ?? id).join(', ');
}
