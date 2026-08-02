import type { FleetClue, MatchState, PlayerId } from '../engine/types';
import { hashString, seedRng } from '../engine/rng';
import { createMatch } from '../engine/state';
import { reduce } from '../engine/reduce';
import { voyageRound, type VoyageLength } from '../content/voyage';
import {
  dealShipDraft,
  pickShip,
  cluesFor,
  clientShipDraftView,
} from '../engine/draft/shipDraft';
import { dealCardDraft, pickCard, currentPicker } from '../engine/draft/cardDraft';
import { CARDS } from '../content/cards';
import { aiShipPick, aiCardPick, aiErrorRate, aiPlaceFleet, aiPlayTurn } from '../ai/opponent';

/** Hard ply cap for the harness; anything reaching it is a stalemate record. */
export const STALEMATE_CAP = 150;

export interface MatchRecord {
  seed: string;
  round: number;
  voyageLength: number;
  winner: PlayerId;
  firstPlayer: PlayerId;
  plies: number;
  /** Plies between the loser's last ship remaining and match over. */
  endgameDrag: number | null;
  /** Winner's shots fired from the loser's last-ship moment to match over. */
  shotsToFinalShip: number | null;
  stalemate: boolean;
  modifierId: string;
  drafted: [{ ships: string[]; cards: string[] }, { ships: string[]; cards: string[] }],
  /** Detect-tagged cards per player (for modifier neutrality). */
  detectCounts: [number, number];
  /** Plays per card id, per player. */
  cardPlays: [Record<string, number>, Record<string, number>];
  /** Burn-integrity violations observed in client views of the drafts. */
  burnLeaks: number;
  /** Who landed the first hit of the match (snowball check). */
  firstHitBy: PlayerId | null;
  /** Total energy spent on cards, per player. */
  energySpent: [number, number];
  /** Turns taken, per player (for energy-per-turn). */
  turnsTaken: [number, number];
  /** Highest bank held, per player. */
  peakBank: [number, number];
}

interface DraftedRun {
  ships: string[];
  cards: string[];
}

/**
 * Play out every pack draft from round 1 to `round` for one pairing.
 * Returns both runs plus the clue pairs each player holds about the other,
 * and counts burn-integrity leaks in the client views.
 */
export function draftVoyage(
  seed: string,
  voyageLength: VoyageLength,
  round: number,
): { runs: [DraftedRun, DraftedRun]; clues: [FleetClue[], FleetClue[]]; burnLeaks: number } {
  const runs: [DraftedRun, DraftedRun] = [
    { ships: [], cards: [] },
    { ships: [], cards: [] },
  ];
  const clues: [FleetClue[], FleetClue[]] = [[], []];
  let burnLeaks = 0;

  for (let r = 1; r <= round; r++) {
    const cfg = voyageRound(voyageLength, r);
    const base = `${seed}:v${voyageLength}:r${r}`;
    const err = aiErrorRate(r);
    // Who opens the first ship pack / picks first from the card row
    // alternates by round.
    const seedFirst = (hashString(`${seed}:first`) % 2) as PlayerId;
    const first = ((seedFirst + r + 1) % 2) as PlayerId;

    // --- Ship packs of four (hidden) ---
    let ships = dealShipDraft(base, cfg.keeps, 10_000 * r, first);
    let guard = 0;
    while (!ships.done && guard++ < 100) {
      const p = ships.toAct;
      if (p === null) break;
      const owned = [...runs[p].ships, ...ships.keeps[p].map((k) => k.id)];
      const pick = aiShipPick(ships, p, owned, `${seed}:ships:${r}:${p}`, err);
      ships = pickShip(ships, p, pick.keepUid, pick.burnUid);
    }
    // Burn integrity: a burned hull must never surface in a client view.
    for (const p of [0, 1] as PlayerId[]) {
      const view = clientShipDraftView(ships, p) as Record<string, unknown>;
      const json = JSON.stringify(view);
      for (const burned of ships.burns[p === 0 ? 1 : 0]) {
        if (json.includes(`"uid":${burned.uid}`)) burnLeaks += 1;
      }
      if ('burns' in view || 'opponentBurns' in view || 'keeps' in view) burnLeaks += 1;
    }

    // --- Action cards from the open row (public) ---
    let cards = dealCardDraft(base, cfg.keeps, cfg.tiers, first);
    guard = 0;
    while (!cards.done && guard++ < 100) {
      const p = currentPicker(cards);
      if (p === null) break;
      const owned = [...runs[p].cards, ...cards.keeps[p]];
      cards = pickCard(cards, p, aiCardPick(cards, p, owned, `${seed}:cards:${r}:${p}`, err));
    }

    for (const p of [0, 1] as PlayerId[]) {
      runs[p].ships.push(...ships.keeps[p].map((k) => k.id));
      runs[p].cards.push(...cards.keeps[p]);
      clues[p].push(...cluesFor(ships, p));
    }
  }
  return { runs, clues, burnLeaks };
}

/** Play one full headless AI-vs-AI match at a voyage round. */
export function runMatch(seed: string, voyageLength: VoyageLength, round: number): MatchRecord {
  const cfg = voyageRound(voyageLength, round);
  const { runs, clues, burnLeaks } = draftVoyage(seed, voyageLength, round);
  const firstPlayer = (hashString(`${seed}:fp`) % 2) as PlayerId;
  let ms: MatchState = createMatch({
    seed,
    round,
    voyageLength,
    gridW: cfg.gridW,
    gridH: cfg.gridH,
    patches: cfg.patches,
    baseIncome: cfg.baseIncome,
    secondPlayerComp: cfg.secondPlayerComp,
    hitBonus: cfg.hitBonus,
    firstPlayer,
    players: [
      { name: 'Sim A', isAI: true, fleet: runs[0].ships, tray: runs[0].cards, enemyClues: clues[0] },
      { name: 'Sim B', isAI: true, fleet: runs[1].ships, tray: runs[1].cards, enemyClues: clues[1] },
    ],
  });

  let st = seedRng(`${seed}:placement`);
  for (const p of [0, 1] as PlayerId[]) {
    let plan;
    [plan, st] = aiPlaceFleet(ms, p, st);
    ms = reduce(ms, { type: 'PLACE_FLEET', player: p, placements: plan.placements, mines: plan.mines });
  }

  let guard = 0;
  while (ms.phase === 'battle' && ms.turn < STALEMATE_CAP && guard++ < 2000) {
    ms = aiPlayTurn(ms);
  }
  const stalemate = ms.phase !== 'over';
  const winner: PlayerId = ms.winner ?? 0;
  const loser: PlayerId = winner === 0 ? 1 : 0;
  const endangered = ms.stats.endangeredAt[loser];
  const shotsSnapshot = ms.stats.oppShotsAtEndangered[loser];
  const detectCount = (cards: string[]) =>
    cards.filter((id) => CARDS[id]?.tags.includes('detect')).length;
  return {
    seed,
    round,
    voyageLength,
    winner,
    firstPlayer,
    plies: ms.turn,
    endgameDrag: stalemate || endangered === null ? null : ms.turn - endangered,
    shotsToFinalShip:
      stalemate || shotsSnapshot === null || winner === loser
        ? null
        : ms.players[winner].shotsFired - shotsSnapshot,
    stalemate,
    modifierId: ms.modifierId,
    drafted: [runs[0], runs[1]],
    detectCounts: [detectCount(runs[0].cards), detectCount(runs[1].cards)],
    cardPlays: structuredClone(ms.stats.cardPlays),
    burnLeaks,
    firstHitBy: ms.stats.firstHitBy,
    energySpent: [ms.stats.energySpent[0], ms.stats.energySpent[1]],
    turnsTaken: [ms.players[0].turnCount, ms.players[1].turnCount],
    peakBank: [ms.stats.peakBank[0], ms.stats.peakBank[1]],
  };
}
