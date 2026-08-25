import { create } from 'zustand';
import type { MatchState, Plan, PlayerId, ResolveEvent } from '../engine/types';
import { commitPlan, createMatch, deploy, pickCard, pickShip, playRound } from '../engine/match';
import { clientView, type ClientView } from '../engine/view';
import { timeoutPlan } from '../engine/resolve';
import { seedRng, type RngState } from '../engine/rng';
import { botCardPick, botDeploy, botPlan, botShipPick, type Level } from '../bots/bot';
import type { Placement } from '../engine/board';
import { Sound } from '../ui/sfx/SoundManager';
import {
  type MatchHistoryEntry,
  type Mode,
  type Profile,
  type Stake,
  ratingDelta,
  seasonState,
} from './profile';
import { chain } from '../chain/client';

/**
 * The client's whole state.
 *
 * The human is always player 0. The opponent is a bot driven by the same
 * `clientView` a remote player would receive, so the local game and a
 * networked one differ only in where the second plan comes from — which is
 * what makes the transport swappable later without touching a screen.
 */

export type Screen =
  | 'menu'
  | 'howto'
  | 'queue'
  | 'shipDraft'
  | 'cardDraft'
  | 'deploy'
  | 'battle'
  | 'result'
  | 'leaderboard'
  | 'season'
  | 'settings'
  | 'credits';

export interface Settings {
  sound: boolean;
  volume: number;
  /** Skip the resolve animation, unlocked after a few matches. */
  fastResolve: boolean;
  botLevel: Level;
}

interface Store {
  screen: Screen;
  settings: Settings;
  profile: Profile;
  mode: Mode;
  stake: Stake;

  match: MatchState | null;
  /** The opponent's private rng, kept out of the match so it cannot leak. */
  botRng: RngState;
  /** Set while the resolve overlay is walking the event list. */
  playback: { events: ResolveEvent[]; index: number } | null;
  lastRoundEvents: ResolveEvent[];
  /** Seconds left in the plan window. */
  clock: number;
  matchIdOnChain: string | null;
  chainNotice: string | null;
  /** Non-null while a screen is waiting on something. Never a blank panel. */
  busy: string | null;
  /** Non-null when something recoverable failed. Never a silent failure. */
  error: { what: string; detail: string | null; retry: (() => void) | null } | null;
  /** True until the player has finished a match, which gates the wallet prompt. */
  firstRun: boolean;

  go(screen: Screen): void;
  fail(what: string, detail?: unknown, retry?: () => void): void;
  clearError(): void;
  noteAway(): void;
  setSettings(patch: Partial<Settings>): void;
  startMatch(mode: Mode, stake: Stake): Promise<void>;
  view(): ClientView | null;

  submitShipPick(defId: string): void;
  submitCardPick(defId: string): void;
  submitDeployment(placements: Placement[]): void;
  submitPlan(plan: Plan): void;
  advancePlayback(): void;
  finishPlayback(): void;
  tick(): void;
  rematch(): Promise<void>;
  leaveMatch(): void;
}

function freshSeed(): string {
  // The seed is committed before the match and revealed at the end, so it must
  // not be predictable from anything the opponent can see.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export const useStore = create<Store>((set, get) => ({
  screen: 'menu',
  settings: { sound: true, volume: 0.8, fastResolve: false, botLevel: 3 },
  profile: {
    name: 'You',
    rating: 1200,
    provisionalMatches: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    history: [],
    seasonEntry: false,
  },
  mode: 'casual',
  stake: 0,
  match: null,
  botRng: seedRng('bot'),
  playback: null,
  lastRoundEvents: [],
  clock: 20,
  matchIdOnChain: null,
  chainNotice: null,
  busy: null,
  error: null,
  firstRun: true,

  go(screen) {
    set({ screen, error: null, busy: null });
  },

  /**
   * Surface a failure rather than swallowing it. Anything that touches a stake
   * must land here if it does not succeed — a staking path that quietly does
   * nothing is the worst failure this product has.
   */
  fail(what, detail, retry) {
    const text =
      detail instanceof Error ? detail.message : detail === undefined ? null : String(detail);
    console.error('[shadow-armada]', what, text);
    set({ error: { what, detail: text, retry: retry ?? null }, busy: null });
  },

  clearError() {
    set({ error: null });
  },

  /**
   * The tab went away mid-match. The server holds the seat for the grace
   * period regardless; telling it early just starts that clock sooner.
   */
  noteAway() {
    const ms = get().match;
    if (ms && ms.phase !== 'over') {
      console.info('[shadow-armada] player went away during a live match');
    }
  },

  setSettings(patch) {
    const settings = { ...get().settings, ...patch };
    Sound.setEnabled(settings.sound);
    Sound.setVolume(settings.volume);
    set({ settings });
  },

  view() {
    const ms = get().match;
    return ms ? clientView(ms, 0) : null;
  },

  async startMatch(mode, stake) {
    set({ busy: 'Finding an opponent' });
    const seed = freshSeed();
    const match = createMatch({ seed, players: [get().profile.name, 'Opponent'] });
    let notice;
    try {
      notice = await chain.openMatch({ mode, stake, seedCommit: match.seedCommit });
    } catch (err) {
      get().fail('Could not open the match', err, () => void get().startMatch(mode, stake));
      return;
    }
    set({
      busy: null,
      match,
      mode,
      stake,
      botRng: seedRng(`${seed}:opponent`),
      screen: 'shipDraft',
      playback: null,
      lastRoundEvents: [],
      clock: 25,
      matchIdOnChain: notice.matchId,
      chainNotice: notice.text,
    });
    Sound.play('round-start');
  },

  submitShipPick(defId) {
    const ms = get().match;
    if (!ms) return;
    const [botChoice, rng] = botShipPick(clientView(ms, 1), get().settings.botLevel, get().botRng);
    let next = pickShip(ms, 0, defId);
    next = pickShip(next, 1, botChoice);
    set({ match: next, botRng: rng, clock: 25 });
    if (next.phase === 'cardDraft') set({ screen: 'cardDraft' });
  },

  submitCardPick(defId) {
    const ms = get().match;
    if (!ms) return;
    const [botChoice, rng] = botCardPick(clientView(ms, 1), get().settings.botLevel, get().botRng);
    let next = pickCard(ms, 0, defId);
    next = pickCard(next, 1, botChoice);
    set({ match: next, botRng: rng, clock: 30 });
    if (next.phase === 'deploy') set({ screen: 'deploy' });
  },

  submitDeployment(placements) {
    const ms = get().match;
    if (!ms) return;
    const [botPlacements, rng] = botDeploy(
      clientView(ms, 1),
      get().settings.botLevel,
      get().botRng,
    );
    let next = deploy(ms, 0, placements, freshSeed());
    next = deploy(next, 1, botPlacements, freshSeed());
    void chain.commitDeployment(get().matchIdOnChain, next.players[0].deployCommit ?? '');
    set({ match: next, botRng: rng, screen: 'battle', clock: next.config.roundSeconds });
  },

  submitPlan(plan) {
    const ms = get().match;
    if (!ms || ms.phase !== 'battle') return;
    const [oppPlan, rng] = botPlan(clientView(ms, 1), get().settings.botLevel, get().botRng);
    const nonceA = freshSeed();
    const nonceB = freshSeed();
    const { state, events } = playRound(ms, {
      plans: [
        commitPlan(plan, nonceA, chain.signWithSessionKey(plan, nonceA)),
        commitPlan(oppPlan, nonceB, chain.signWithSessionKey(oppPlan, nonceB)),
      ],
    });
    set({
      match: state,
      botRng: rng,
      lastRoundEvents: events,
      playback: get().settings.fastResolve ? null : { events, index: 0 },
      clock: state.config.roundSeconds,
    });
    if (get().settings.fastResolve) get().finishPlayback();
  },

  advancePlayback() {
    const pb = get().playback;
    if (!pb) return;
    const nextIndex = pb.index + 1;
    if (nextIndex >= pb.events.length) {
      get().finishPlayback();
      return;
    }
    cue(pb.events[nextIndex]);
    set({ playback: { ...pb, index: nextIndex } });
  },

  finishPlayback() {
    const ms = get().match;
    set({ playback: null });
    if (ms && ms.phase === 'over') {
      const outcome = ms.outcome;
      const won = outcome?.kind === 'win' && outcome.winner === 0;
      const drew = outcome?.kind === 'draw';
      const result: MatchHistoryEntry['result'] = won ? 'win' : drew ? 'draw' : 'loss';
      Sound.play(drew ? 'draw' : won ? 'victory' : 'defeat');
      const profile = get().profile;
      const delta = ratingDelta(profile, result);
      void chain.settle(get().matchIdOnChain, result, get().stake).catch((err) => {
        // A settlement that failed is a settlement the player must be told
        // about; it is their money waiting on the reclaim path.
        get().fail('Settlement did not go through', err);
      });
      set({
        profile: {
          ...profile,
          rating: profile.rating + delta,
          provisionalMatches: profile.provisionalMatches + 1,
          wins: profile.wins + (won ? 1 : 0),
          losses: profile.losses + (!won && !drew ? 1 : 0),
          draws: profile.draws + (drew ? 1 : 0),
          history: [
            {
              result,
              delta,
              rounds: ms.history.length,
              mode: get().mode,
              stake: get().stake,
            },
            ...profile.history,
          ].slice(0, 30),
        },
        screen: 'result',
        firstRun: false,
      });
    }
  },

  tick() {
    const { clock, match, playback } = get();
    if (!match || playback) return;
    if (clock <= 0) return;
    const next = clock - 1;
    if (next === 5) Sound.play('timer-warning');
    set({ clock: next });
    if (next > 0) return;
    // Out of time. The engine decides what a lapsed plan does, not the UI.
    if (match.phase === 'battle') {
      const [fallback] = timeoutPlan(match, 0);
      get().submitPlan(fallback);
    }
  },

  async rematch() {
    const { mode, stake } = get();
    await get().startMatch(mode, stake);
  },

  leaveMatch() {
    set({ match: null, playback: null, screen: 'menu', matchIdOnChain: null });
  },
}));

/** Fire the sound cue that belongs to a resolve beat. */
function cue(e: ResolveEvent): void {
  switch (e.t) {
    case 'shot':
      Sound.play(e.hit ? 'hit' : 'miss');
      break;
    case 'sink':
      Sound.play('ship-sunk');
      break;
    case 'react':
      Sound.play('react-triggered');
      break;
    case 'nerf':
      Sound.play('charges-stolen');
      break;
    case 'prediction':
      if (e.triggered) Sound.play('prediction-triggered');
      break;
    case 'charges':
      Sound.play('charge-placed');
      break;
    default:
      break;
  }
}

export { seasonState };
export type { Mode, Stake, PlayerId };
