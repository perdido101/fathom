import type { CommittedPlan, MatchConfig, MatchState, Outcome, PlayerId } from './types';
import type { Placement } from './board';
import { createMatch, deploy, pickCard, pickShip, playRound } from './match';
import { commit, sha256 } from './sha256';
import { verifyPlanSignature } from '../chain/sessionKey';

/**
 * Independent replay.
 *
 * The chain holds two commitments and a result. It cannot check a single rule,
 * because it cannot see the boards — which is exactly why the trust has to
 * live in the commitment scheme instead. This function is the other half of
 * that bargain: hand it what the chain published plus the signed transcript,
 * and it reruns the match from scratch and tells you whether the reported
 * result is the one the rules produce. If the server ever lies, this is what
 * proves it.
 *
 * It takes no I/O, no clock and no randomness of its own, so anyone can run it
 * anywhere and get the same answer.
 */

export interface MatchTranscript {
  version: number;
  matchId: string;
  /** Published before the match; checked against the revealed seed. */
  seedCommit: string;
  /** Revealed at the end. */
  seed: string;
  config: Partial<MatchConfig>;
  players: [string, string];
  /** Ed25519 public keys of the session keys that signed the rounds. */
  sessionKeys: [string, string];
  /** Draft picks in pack order. */
  shipPicks: [string[], string[]];
  cardPicks: [string[], string[]];
  /** Published on-chain at match start. */
  deployCommits: [string, string];
  /** Revealed at match end. */
  deployments: [{ placements: Placement[]; nonce: string }, { placements: Placement[]; nonce: string }];
  /** One entry per round, each holding both players' committed plans. */
  rounds: [CommittedPlan, CommittedPlan][];
  /** What the server said happened. */
  reportedOutcome: Outcome | null;
}

export interface VerifyResult {
  ok: boolean;
  /** Every check that failed, in the order they were made. */
  problems: string[];
  /**
   * Checks that could not be performed, as opposed to checks that failed. A
   * transcript with no published session keys is not evidence of cheating —
   * it is simply less evidence than one that has them, and saying so is more
   * useful than either passing it silently or failing it outright.
   */
  warnings: string[];
  /** The outcome the rules actually produce from this transcript. */
  outcome: Outcome | null;
  /** The replayed final state, for anyone who wants to inspect it. */
  state: MatchState | null;
  /** Rounds successfully replayed. */
  roundsReplayed: number;
}

const SESSION_KEY_HEX = /^[0-9a-f]{64}$/;

export function verify(t: MatchTranscript): VerifyResult {
  const problems: string[] = [];
  const warnings: string[] = [];
  const checkable: [boolean, boolean] = [
    SESSION_KEY_HEX.test(t.sessionKeys[0]),
    SESSION_KEY_HEX.test(t.sessionKeys[1]),
  ];
  for (const p of [0, 1] as PlayerId[]) {
    if (!checkable[p]) warnings.push(`player ${p} published no session key — signatures unchecked`);
  }

  if (sha256(t.seed) !== t.seedCommit) {
    problems.push('seed does not match the commitment published before the match');
  }

  for (const p of [0, 1] as PlayerId[]) {
    const d = t.deployments[p];
    if (commit(d.placements, d.nonce) !== t.deployCommits[p]) {
      problems.push(`player ${p} deployment does not match their on-chain commitment`);
    }
  }

  let ms: MatchState;
  try {
    ms = createMatch({ seed: t.seed, players: t.players, config: t.config });
  } catch (err) {
    return {
      ok: false,
      problems: [...problems, `setup failed: ${String(err)}`],
      warnings,
      outcome: null,
      state: null,
      roundsReplayed: 0,
    };
  }

  try {
    for (let pack = 0; pack < 3; pack++) {
      ms = pickShip(ms, 0, t.shipPicks[0][pack]);
      ms = pickShip(ms, 1, t.shipPicks[1][pack]);
    }
    for (let pack = 0; pack < 3; pack++) {
      ms = pickCard(ms, 0, t.cardPicks[0][pack]);
      ms = pickCard(ms, 1, t.cardPicks[1][pack]);
    }
    for (const p of [0, 1] as PlayerId[]) {
      ms = deploy(ms, p, t.deployments[p].placements, t.deployments[p].nonce);
    }
  } catch (err) {
    problems.push(`draft or deployment is not legal: ${String(err)}`);
    return { ok: false, problems, warnings, outcome: null, state: ms!, roundsReplayed: 0 };
  }

  let replayed = 0;
  for (const round of t.rounds) {
    if (ms.phase !== 'battle') {
      problems.push(`transcript continues past the end of the match at round ${replayed + 1}`);
      break;
    }
    for (const p of [0, 1] as PlayerId[]) {
      const cp = round[p];
      if (cp.commitHash !== commit(cp.plan, cp.nonce)) {
        problems.push(`round ${ms.round}: player ${p} plan does not match its commitment`);
      }
      if (cp.signature === null) {
        problems.push(`round ${ms.round}: player ${p} plan is unsigned`);
      } else if (checkable[p]) {
        if (!verifyPlanSignature(t.sessionKeys[p], cp.signature, cp.commitHash)) {
          problems.push(`round ${ms.round}: player ${p} signature does not match their session key`);
        }
      }
    }
    ms = playRound(ms, { plans: round }).state;
    replayed += 1;
  }

  const outcome = ms.outcome;
  if (t.reportedOutcome !== null) {
    if (JSON.stringify(outcome) !== JSON.stringify(t.reportedOutcome)) {
      problems.push(
        `reported outcome ${JSON.stringify(t.reportedOutcome)} does not match the replay ${JSON.stringify(outcome)}`,
      );
    }
  }

  return { ok: problems.length === 0, problems, warnings, outcome, state: ms, roundsReplayed: replayed };
}

/** Build a transcript from a finished match, for publishing alongside a result. */
export function transcriptOf(
  ms: MatchState,
  matchId: string,
  sessionKeys: [string, string],
): MatchTranscript {
  return {
    version: ms.version,
    matchId,
    seedCommit: ms.seedCommit,
    seed: ms.seed,
    config: ms.config,
    players: [ms.players[0].name, ms.players[1].name],
    sessionKeys,
    shipPicks: [ms.shipDraft.picks[0].filter(nn), ms.shipDraft.picks[1].filter(nn)],
    cardPicks: [ms.cardDraft.picks[0].filter(nn), ms.cardDraft.picks[1].filter(nn)],
    deployCommits: [ms.players[0].deployCommit ?? '', ms.players[1].deployCommit ?? ''],
    deployments: [
      {
        placements: ms.players[0].ships.map((s) => ({ defId: s.defId, cells: s.cells.slice() })),
        nonce: ms.players[0].deployNonce ?? '',
      },
      {
        placements: ms.players[1].ships.map((s) => ({ defId: s.defId, cells: s.cells.slice() })),
        nonce: ms.players[1].deployNonce ?? '',
      },
    ],
    rounds: ms.history.map((h) => h.plans),
    reportedOutcome: ms.outcome,
  };
}

const nn = (x: string | null): x is string => x !== null;
