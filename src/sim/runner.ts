import type { MatchConfig, MatchState, PlayerId, Plan } from '../engine/types';
import { commitPlan, createMatch, deploy, pickCard, pickShip, playRound } from '../engine/match';
import { clientView } from '../engine/view';
import { pick, seedRng, type RngState } from '../engine/rng';
import { SHIPS } from '../engine/ships';
import { botCardPick, botDeploy, botPlan, botShipPick, type Level } from '../bots/bot';

/**
 * A whole match between two bots, played through the same public interface a
 * client uses. The bots are handed `clientView`, never the match state, so a
 * balance number produced here is a number produced by players who cannot see
 * through the table.
 */

export interface MatchOutcomeRecord {
  seed: string;
  levels: [Level, Level];
  rounds: number;
  result: 'p0' | 'p1' | 'draw';
  reason: string;
  /** Cards each player drafted and whether they were fired. */
  drafted: [string[], string[]];
  fired: [{ defId: string; charges: number }[], { defId: string; charges: number }[]];
  /** Every ship drafted, for per-ship win rates. */
  shipsDrafted: [string[], string[]];
  /** ACTIVE/NERF ships drafted and whether the ability was used. */
  abilityShips: [string[], string[]];
  abilitiesUsed: [string[], string[]];
  firstBlood: PlayerId | null;
  hits: [number, number];
  shots: [number, number];
  hullLeft: [number, number];
  /**
   * Hull cells each side held entering the final round. Every draw this sim
   * produces is a mutual elimination, so this is what a tiebreak would have
   * had to work with.
   */
  hullBeforeLast: [number, number];
  /**
   * Hull cells at the top of round 8 — the midpoint. A match where the player
   * behind here almost never recovers is a match decided before it ends.
   */
  hullAtRound8: [number, number];
}

export interface RunOptions {
  config?: Partial<MatchConfig>;
  /**
   * Draft uniformly at random instead of by the bot's value table.
   *
   * Without this, four of the twelve ships are never drafted at all — the
   * value table always prefers something else in their pack — so they get no
   * per-ship win rate and the balance band passes over them in silence. That
   * makes the harness, not the game, the thing deciding what gets measured.
   * A random-draft pairing plays the match at full strength but chooses the
   * pieces blind, which is the only way to price a ship the bot dislikes.
   */
  randomDraft?: boolean;
}

export function playBotMatch(
  seed: string,
  levels: [Level, Level],
  options: RunOptions = {},
): MatchOutcomeRecord {
  const config = options.config ?? {};
  let ms = createMatch({ seed, players: [`bot${levels[0]}`, `bot${levels[1]}`], config });
  const rngs: [RngState, RngState] = [seedRng(`${seed}:b0`), seedRng(`${seed}:b1`)];

  for (let pack = 0; pack < 3; pack++) {
    const picks: [string, string] = ['', ''];
    for (const p of [0, 1] as PlayerId[]) {
      const pack = ms.shipDraft.packs[ms.shipDraft.index] ?? [];
      const [choice, st] = options.randomDraft
        ? pickUniform(rngs[p], pack)
        : botShipPick(clientView(ms, p), levels[p], rngs[p]);
      rngs[p] = st;
      picks[p] = choice;
    }
    ms = pickShip(ms, 0, picks[0]);
    ms = pickShip(ms, 1, picks[1]);
  }

  for (let pack = 0; pack < 3; pack++) {
    const picks: [string, string] = ['', ''];
    for (const p of [0, 1] as PlayerId[]) {
      const pack = ms.cardDraft.packs[ms.cardDraft.index] ?? [];
      const [choice, st] = options.randomDraft
        ? pickUniform(rngs[p], pack)
        : botCardPick(clientView(ms, p), levels[p], rngs[p]);
      rngs[p] = st;
      picks[p] = choice;
    }
    ms = pickCard(ms, 0, picks[0]);
    ms = pickCard(ms, 1, picks[1]);
  }

  for (const p of [0, 1] as PlayerId[]) {
    const [placements, st] = botDeploy(clientView(ms, p), levels[p], rngs[p]);
    rngs[p] = st;
    ms = deploy(ms, p, placements, `nonce-${seed}-${p}`);
  }

  let guard = 0;
  let hullBeforeLast: [number, number] = [9, 9];
  let hullAtRound8: [number, number] = [9, 9];
  while (ms.phase === 'battle' && guard < 64) {
    guard += 1;
    hullBeforeLast = [hullLeft(ms, 0), hullLeft(ms, 1)];
    if (ms.round === 8) hullAtRound8 = [hullLeft(ms, 0), hullLeft(ms, 1)];
    const plans: [Plan, Plan] = [] as unknown as [Plan, Plan];
    for (const p of [0, 1] as PlayerId[]) {
      const [plan, st] = botPlan(clientView(ms, p), levels[p], rngs[p]);
      rngs[p] = st;
      plans[p] = plan;
    }
    ms = playRound(ms, {
      plans: [commitPlan(plans[0], `n${guard}a`, 'sim'), commitPlan(plans[1], `n${guard}b`, 'sim')],
    }).state;
  }

  return summarise(seed, levels, ms, hullBeforeLast, hullAtRound8);
}

function summarise(
  seed: string,
  levels: [Level, Level],
  ms: MatchState,
  hullBeforeLast: [number, number],
  hullAtRound8: [number, number],
): MatchOutcomeRecord {
  const outcome = ms.outcome;
  const result: 'p0' | 'p1' | 'draw' =
    !outcome || outcome.kind === 'draw' ? 'draw' : outcome.winner === 0 ? 'p0' : 'p1';
  const abilityShips = ([0, 1] as PlayerId[]).map((p) =>
    ms.players[p].draftedShips.filter((id) => SHIPS[id]?.type !== 'REACT'),
  ) as [string[], string[]];

  return {
    seed,
    levels,
    rounds: ms.history.length,
    result,
    reason: outcome
      ? outcome.kind === 'draw'
        ? `draw:${outcome.reason}`
        : outcome.reason
      : 'unfinished',
    drafted: [ms.players[0].draftedCards.slice(), ms.players[1].draftedCards.slice()],
    fired: [ms.players[0].stats.cardsFired.slice(), ms.players[1].stats.cardsFired.slice()],
    shipsDrafted: [ms.players[0].draftedShips.slice(), ms.players[1].draftedShips.slice()],
    abilityShips,
    abilitiesUsed: [
      ms.players[0].stats.abilitiesUsed.slice(),
      ms.players[1].stats.abilitiesUsed.slice(),
    ],
    firstBlood: ms.players[0].stats.firstBlood ? 0 : ms.players[1].stats.firstBlood ? 1 : null,
    hits: [ms.players[0].stats.hits, ms.players[1].stats.hits],
    shots: [ms.players[0].stats.shotsFired, ms.players[1].stats.shotsFired],
    hullLeft: [hullLeft(ms, 0), hullLeft(ms, 1)],
    hullBeforeLast,
    hullAtRound8,
  };
}

function pickUniform(rng: RngState, pack: string[]): [string, RngState] {
  const [choice, st] = pick(rng, pack);
  return [choice ?? pack[0], st];
}

function hullLeft(ms: MatchState, p: PlayerId): number {
  let n = 0;
  for (const s of ms.players[p].ships) for (const h of s.hits) if (!h) n++;
  return n;
}
