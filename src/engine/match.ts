import type {
  CommittedPlan,
  MatchConfig,
  MatchState,
  Plan,
  PlayerId,
  PlayerState,
  ResolveEvent,
} from './types';
import { DEFAULT_CONFIG, noRestrictions, other } from './types';
import { CARD_IDS } from './cards';
import { dealCardDraft, dealShipDraft, draftResult, submitPick } from './draft';
import { autoDeploy, deploymentLegal, toShips, type Placement } from './board';
import { resolveRound, timeoutPlan, validatePlan } from './resolve';
import { commit, sha256 } from './sha256';
import { seedRng, shuffle } from './rng';

export const ENGINE_VERSION = 1;

export interface MatchSetup {
  /** Revealed at match end; only its hash is public beforehand. */
  seed: string;
  players: [string, string];
  config?: Partial<MatchConfig>;
}

function makePlayer(id: PlayerId, name: string): PlayerState {
  return {
    id,
    name,
    ships: [],
    hand: [],
    graveyard: [],
    firedAt: [],
    marks: {},
    knownShipCells: [],
    counts: { rows: {}, cols: {} },
    sankLengths: [],
    restrictions: noRestrictions(),
    timerStrikes: 0,
    deployCommit: null,
    deployNonce: null,
    draftedShips: [],
    draftedCards: [],
    shipCollisions: [],
    cardCollisions: [],
    connected: true,
    stats: {
      shotsFired: 0,
      hits: 0,
      cardsFired: [],
      abilitiesUsed: [],
      chargesEarned: 0,
      firstBlood: false,
    },
  };
}

export function createMatch(setup: MatchSetup): MatchState {
  const config = { ...DEFAULT_CONFIG, ...(setup.config ?? {}) };
  let rng = seedRng(setup.seed);
  const [shipDraft, r1] = dealShipDraft(rng);
  rng = r1;
  const [cardDraft, r2] = dealCardDraft(rng);
  rng = r2;

  return {
    version: ENGINE_VERSION,
    seed: setup.seed,
    seedCommit: sha256(setup.seed),
    config,
    phase: 'shipDraft',
    round: 1,
    players: [makePlayer(0, setup.players[0]), makePlayer(1, setup.players[1])],
    shipDraft,
    cardDraft,
    pile: [],
    rng,
    outcome: null,
    log: [{ round: 0, step: 'setup', player: null, text: 'Match created.' }],
    nextUid: 1,
    history: [],
  };
}

// ---------------------------------------------------------------------------
// Drafting
// ---------------------------------------------------------------------------

export function pickShip(ms: MatchState, p: PlayerId, defId: string): MatchState {
  if (ms.phase !== 'shipDraft') throw new Error('not the ship draft');
  const s: MatchState = structuredClone(ms);
  s.shipDraft = submitPick(s.shipDraft, p, defId);
  if (s.shipDraft.done) {
    for (const q of [0, 1] as PlayerId[]) {
      s.players[q].draftedShips = draftResult(s.shipDraft, q);
      s.players[q].shipCollisions = s.shipDraft.collisions.slice();
    }
    s.phase = 'cardDraft';
    s.log.push({ round: 0, step: 'draft', player: null, text: 'Fleets chosen.' });
  }
  return s;
}

export function pickCard(ms: MatchState, p: PlayerId, defId: string): MatchState {
  if (ms.phase !== 'cardDraft') throw new Error('not the card draft');
  const s: MatchState = structuredClone(ms);
  s.cardDraft = submitPick(s.cardDraft, p, defId);
  if (!s.cardDraft.done) return s;

  for (const q of [0, 1] as PlayerId[]) {
    s.players[q].draftedCards = draftResult(s.cardDraft, q);
    s.players[q].cardCollisions = s.cardDraft.collisions.slice();
    s.players[q].hand = s.players[q].draftedCards.map((defIdCard) => ({
      uid: s.nextUid++,
      defId: defIdCard,
      charges: 0,
    }));
  }

  // The shared draw pile is what neither player took. See RULINGS.md Q1: the
  // rules say "the 9 undrafted cards", which is only exact when all three
  // packs collided; this is the reading that generalises without ever putting
  // a third copy of a card into circulation.
  const taken = new Set([...s.players[0].draftedCards, ...s.players[1].draftedCards]);
  const [pile, rng] = shuffle(
    s.rng,
    CARD_IDS.filter((id) => !taken.has(id)),
  );
  s.pile = pile;
  s.rng = rng;
  s.phase = 'deploy';
  s.log.push({ round: 0, step: 'draft', player: null, text: `Hands dealt. Pile: ${pile.length}.` });
  return s;
}

// ---------------------------------------------------------------------------
// Deployment
// ---------------------------------------------------------------------------

/**
 * Deployment is committed before the battle and revealed after it. The engine
 * holds the real placement so it can resolve shots; the commitment is what a
 * third party checks afterwards to prove nothing moved mid-match.
 */
export function deploy(
  ms: MatchState,
  p: PlayerId,
  placements: Placement[],
  nonce: string,
): MatchState {
  if (ms.phase !== 'deploy') throw new Error('not the deployment phase');
  const s: MatchState = structuredClone(ms);
  const ps = s.players[p];
  if (!deploymentLegal(placements, ps.draftedShips)) throw new Error('illegal deployment');
  ps.ships = toShips(placements);
  ps.deployNonce = nonce;
  ps.deployCommit = commit(placements, nonce);
  if (s.players[0].ships.length && s.players[1].ships.length) {
    s.phase = 'battle';
    s.round = 1;
    s.log.push({ round: 0, step: 'deploy', player: null, text: 'Both fleets are at sea.' });
  }
  return s;
}

/** A seeded legal deployment, for bots and for a player who runs out of time. */
export function deployAuto(ms: MatchState, p: PlayerId, nonce: string): MatchState {
  const [placements, rng] = autoDeploy(ms.players[p].draftedShips, ms.rng);
  const s = deploy({ ...ms, rng }, p, placements, nonce);
  return s;
}

// ---------------------------------------------------------------------------
// Battle
// ---------------------------------------------------------------------------

export interface SubmittedRound {
  plans: [CommittedPlan, CommittedPlan];
}

/**
 * Resolve one round from two committed plans. An invalid plan is replaced by
 * the timeout plan rather than rejected, so a malformed client can never wedge
 * a match — it just forfeits the round and takes a strike.
 */
export function playRound(
  ms: MatchState,
  submitted: SubmittedRound,
): {
  state: MatchState;
  events: ResolveEvent[];
} {
  if (ms.phase !== 'battle') throw new Error('not in battle');
  let staged: MatchState = structuredClone(ms);
  const rngBefore = staged.rng;
  const plans: [Plan, Plan] = [submitted.plans[0].plan, submitted.plans[1].plan];

  for (const p of [0, 1] as PlayerId[]) {
    const cp = submitted.plans[p];
    const badCommit = cp.commitHash !== commit(cp.plan, cp.nonce);
    const reason = badCommit ? 'commitment does not match' : validatePlan(staged, p, cp.plan);
    if (reason) {
      const [fallback, rng] = timeoutPlan(staged, p);
      staged.rng = rng;
      plans[p] = fallback;
      staged.log.push({
        round: staged.round,
        step: 'invalid',
        player: p,
        text: `Plan rejected (${reason}); timer plan substituted.`,
      });
    }
  }

  const { state, events } = resolveRound(staged, plans);
  state.history.push({
    round: ms.round,
    plans: [
      { ...submitted.plans[0], plan: plans[0] },
      { ...submitted.plans[1], plan: plans[1] },
    ],
    rngBefore,
    events,
  });
  return { state, events };
}

/** Build a committed plan. The signature is attached by the transport layer. */
export function commitPlan(
  plan: Plan,
  nonce: string,
  signature: string | null = null,
): CommittedPlan {
  return { commitHash: commit(plan, nonce), nonce, plan, signature };
}

/** A player who walked away. Grace-period accounting lives in the server. */
export function markDisconnected(ms: MatchState, p: PlayerId): MatchState {
  const s: MatchState = structuredClone(ms);
  s.players[p].connected = false;
  s.outcome = { kind: 'win', winner: other(p), reason: 'disconnect' };
  s.phase = 'over';
  return s;
}
