import type { MatchConfig, MatchState, PlayerId, Plan } from '../engine/types';
import { commitPlan, createMatch, deploy, pickCard, pickShip, playRound } from '../engine/match';
import { clientView } from '../engine/view';
import { seedRng, type RngState } from '../engine/rng';
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
}

export function playBotMatch(
  seed: string,
  levels: [Level, Level],
  config: Partial<MatchConfig> = {},
): MatchOutcomeRecord {
  let ms = createMatch({ seed, players: [`bot${levels[0]}`, `bot${levels[1]}`], config });
  const rngs: [RngState, RngState] = [seedRng(`${seed}:b0`), seedRng(`${seed}:b1`)];

  for (let pack = 0; pack < 3; pack++) {
    const picks: [string, string] = ['', ''];
    for (const p of [0, 1] as PlayerId[]) {
      const [choice, st] = botShipPick(clientView(ms, p), levels[p], rngs[p]);
      rngs[p] = st;
      picks[p] = choice;
    }
    ms = pickShip(ms, 0, picks[0]);
    ms = pickShip(ms, 1, picks[1]);
  }

  for (let pack = 0; pack < 3; pack++) {
    const picks: [string, string] = ['', ''];
    for (const p of [0, 1] as PlayerId[]) {
      const [choice, st] = botCardPick(clientView(ms, p), levels[p], rngs[p]);
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
  while (ms.phase === 'battle' && guard < 64) {
    guard += 1;
    hullBeforeLast = [hullLeft(ms, 0), hullLeft(ms, 1)];
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

  return summarise(seed, levels, ms, hullBeforeLast);
}

function summarise(
  seed: string,
  levels: [Level, Level],
  ms: MatchState,
  hullBeforeLast: [number, number],
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
    reason: outcome ? (outcome.kind === 'draw' ? `draw:${outcome.reason}` : outcome.reason) : 'unfinished',
    drafted: [ms.players[0].draftedCards.slice(), ms.players[1].draftedCards.slice()],
    fired: [ms.players[0].stats.cardsFired.slice(), ms.players[1].stats.cardsFired.slice()],
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
  };
}

function hullLeft(ms: MatchState, p: PlayerId): number {
  let n = 0;
  for (const s of ms.players[p].ships) for (const h of s.hits) if (!h) n++;
  return n;
}
