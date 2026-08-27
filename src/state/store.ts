import { create } from 'zustand';
import type { MatchState, Plan, PlayerId, ResolveEvent } from '../engine/types';
import { commitPlan, createMatch, deploy, pickCard, pickShip, playRound } from '../engine/match';
import { clientView, type ClientView } from '../engine/view';
import { timeoutPlan } from '../engine/resolve';
import { seedRng, type RngState } from '../engine/rng';
import { botCardPick, botDeploy, botPlan, botShipPick, type Level } from '../bots/bot';
import { autoDeploy, type Placement } from '../engine/board';
import { autoPick } from '../engine/draft';
import {
  BRACKET_SEATS,
  newBracket,
  nextPlayable,
  reportResult,
  roundOf,
  standings,
  type Bracket,
} from '../tournament/bracket';
import { playBotMatch } from '../sim/runner';
import * as net from './net';
import { Sound } from '../ui/sfx/SoundManager';
import { Music } from '../ui/music/MusicManager';
import { announceRound } from '../ui/feedback/announce';
import { playRoundVfx } from '../ui/vfx/derive';
import { useVfx } from '../ui/vfx/store';
import { useFeedback } from '../ui/feedback/store';
import {
  type MatchHistoryEntry,
  type Mode,
  type Profile,
  type Stake,
  ratingDelta,
  seasonState,
} from './profile';
import { chain } from '../chain/client';
import { ratingLine, roundSettlement, settlement, type Settlement } from './settlement';

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
  | 'credits'
  | 'escrow'
  | 'bracket'
  | 'tqueue'
  | 'netResult';

export interface Settings {
  sound: boolean;
  /** Effects volume. Music has its own — see below. */
  volume: number;
  /**
   * Music, as a separate channel and a separate slider.
   *
   * Not a nicety: a player who wants the battle track down almost always
   * still wants to hear a shot land, and one slider forces them to choose
   * between the two. Defaults below the effects channel because music sits
   * under a 20-second decision clock and must never compete with it.
   */
  music: boolean;
  musicVolume: number;
  /** Skip the resolve animation, unlocked after a few matches. */
  fastResolve: boolean;
  /** The beats between phases. On by default; a click skips any single one. */
  transitions: boolean;
  botLevel: Level;
}

/**
 * A beat between two phases. They queue rather than interrupt: a ship draft
 * ending raises the fleet reveal *and* the card-draft card, in that order,
 * and each waits for the one before it.
 */
export type Beat =
  | { kind: 'matchFound'; opponent: string; subtitle: string; stake: number }
  | { kind: 'shipDraft' }
  | { kind: 'cardDraft' }
  | { kind: 'deploy' }
  | { kind: 'battle' }
  | { kind: 'fleet'; ships: string[] }
  | { kind: 'committed'; mine: string | null; theirs: string | null };

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
  /** Queued phase beats. The head is the one on screen. */
  beats: Beat[];
  /**
   * The end-of-match banner, while it is up. Non-null blocks the move to the
   * result screen: the moment has to land before the analysis arrives.
   */
  slam: Settlement | null;
  /**
   * The cells this client declared this round. The event stream carries no
   * plan payload, so this is the only way the feedback layer can put BLOCKED
   * on the cells a Mirror ate — and it is the player's own declaration, which
   * they are plainly entitled to see.
   */
  lastAim: number[];
  matchIdOnChain: string | null;
  chainNotice: string | null;
  /** Non-null while a screen is waiting on something. Never a blank panel. */
  busy: string | null;
  /** Non-null when something recoverable failed. Never a silent failure. */
  error: { what: string; detail: string | null; retry: (() => void) | null } | null;
  /** True until the player has finished a match, which gates the wallet prompt. */
  firstRun: boolean;
  /**
   * The escrow forming, step by step, while an arena match opens. The UI
   * draws two stacks of gold merging; this is the state it draws from.
   */
  escrow: { you: boolean; opponent: boolean; stake: Stake } | null;
  /** Signature of the last settlement, for the result screen's explorer link. */
  lastTx: string | null;
  /** Connection posture when a real server is configured. */
  net: net.NetState;
  /** The server's latest view of the match, when playing over the wire. */
  remoteView: ClientView | null;
  /** Server-authoritative deadline (epoch ms); the clock renders an estimate. */
  netDeadlineAt: number | null;
  /**
   * The live tournament, when one is running. Seat 0 is always the player;
   * the other seven seats are bots whose matches resolve through the same
   * engine via the sim runner.
   */
  tournament: {
    bracketId: string;
    bracket: Bracket;
    stake: Stake;
    /** Seats staked so far while the bracket forms; 8 = full. */
    filled: number;
    /** The player's finishing place once known. */
    yourPlace: 'champion' | 'runnerUp' | 'semiLoser' | 'out' | null;
    settled: boolean;
    /** Set while a drawn match forces a sudden-death replay. */
    suddenDeath: boolean;
  } | null;

  go(screen: Screen): void;
  /** Queue beats, unless the player has turned them off. */
  showBeats(...beats: Beat[]): void;
  advanceBeat(): void;
  dismissSlam(): void;
  fail(what: string, detail?: unknown, retry?: () => void): void;
  clearError(): void;
  noteAway(): void;
  setSettings(patch: Partial<Settings>): void;
  startMatch(mode: Mode, stake: Stake): Promise<void>;
  view(): ClientView | null;

  startTournament(stake: Stake): Promise<void>;
  /** From the bracket screen: start the player's next match. */
  playTournamentRound(): void;

  submitShipPick(defId: string): void;
  submitCardPick(defId: string): void;
  submitDeployment(placements: Placement[]): void;
  submitPlan(plan: Plan, aim?: number[]): void;
  advancePlayback(): void;
  finishPlayback(): void;
  tick(): void;
  rematch(): Promise<void>;
  leaveMatch(): void;
}

const SETTINGS_KEY = 'armada:settings';

/** What runs once the end-of-match banner is done. */
let afterSlam: (() => void) | null = null;

/**
 * Raise the banner, and hold the given continuation until it is dismissed.
 *
 * The result screen is the *analysis*; this is the moment. Deferring rather
 * than racing means a player who clicks through immediately gets the same
 * sequence as one who lets it play, just faster.
 */
function slamThen(s: Settlement, then: () => void): void {
  if (!useStore.getState().settings.transitions) {
    then();
    return;
  }
  afterSlam = then;
  useStore.setState({ slam: s });
}

const BOT_NAMES = ['Deckhand', 'Mate', 'Officer', 'Admiral'];

/**
 * Who you are about to face, said honestly. A local opponent is a bot and is
 * named as one — inventing a rating for it would be the first lie the product
 * tells, on the screen whose whole job is telling you who you are playing.
 */
function foundBeat(mode: Mode, stake: Stake): Beat {
  const level = useStore.getState().settings.botLevel;
  return {
    kind: 'matchFound',
    opponent: 'Opponent',
    subtitle: `${mode} · bot: ${BOT_NAMES[level - 1]}`,
    stake,
  };
}

/** Volume and mute survive a reload; a player should set them once. */
function loadSettings(): Settings {
  const fallback: Settings = {
    sound: true,
    volume: 0.8,
    music: true,
    musicVolume: 0.45,
    fastResolve: false,
    transitions: true,
    botLevel: 3,
  };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const merged = { ...fallback, ...parsed };
    Sound.setEnabled(merged.sound);
    Sound.setVolume(merged.volume);
    Music.setEnabled(merged.music);
    Music.setVolume(merged.musicVolume);
    return merged;
  } catch {
    return fallback;
  }
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
  settings: loadSettings(),
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
  beats: [],
  slam: null,
  lastAim: [],
  matchIdOnChain: null,
  chainNotice: null,
  escrow: null,
  lastTx: null,
  net: net.offNet,
  remoteView: null,
  netDeadlineAt: null,
  tournament: null,
  busy: null,
  error: null,
  firstRun: true,

  go(screen) {
    // Anything the feedback layer still has in flight belongs to the screen
    // being left. A floater anchored to a board cell that no longer exists
    // would draw itself over whatever took its place.
    useFeedback.getState().clear();
    useVfx.getState().clear();
    Sound.play('ui-screen', { gain: 0.6, guard: 200 });
    set({ screen, error: null, busy: null });
  },

  showBeats(...beats) {
    if (!get().settings.transitions) return;
    set({ beats: [...get().beats, ...beats] });
  },

  advanceBeat() {
    set({ beats: get().beats.slice(1) });
  },

  /**
   * The banner steps aside and whatever it was holding back runs. The
   * continuation is stashed rather than duplicated, so the slam has exactly
   * one exit whether it timed out or was clicked away.
   */
  dismissSlam() {
    const after = afterSlam;
    afterSlam = null;
    set({ slam: null });
    after?.();
  },

  /**
   * Surface a failure rather than swallowing it. Anything that touches a stake
   * must land here if it does not succeed — a staking path that quietly does
   * nothing is the worst failure this product has.
   */
  fail(what, detail, retry) {
    const text =
      detail instanceof Error ? detail.message : detail === undefined ? null : String(detail);
    console.error('[armada]', what, text);
    // Once, on the way in. An error that is already on screen does not
    // re-announce itself.
    Sound.play('error-shown', { guard: 800 });
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
      console.info('[armada] player went away during a live match');
    }
  },

  setSettings(patch) {
    const settings = { ...get().settings, ...patch };
    Sound.setEnabled(settings.sound);
    Sound.setVolume(settings.volume);
    Music.setEnabled(settings.music);
    Music.setVolume(settings.musicVolume);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Private windows may refuse storage; the session still works.
    }
    set({ settings });
  },

  view() {
    const { net: n, remoteView, match } = get();
    if (n.remote && remoteView) return remoteView;
    return match ? clientView(match, 0) : null;
  },

  async startMatch(mode, stake) {
    // A configured server takes precedence: the same buttons queue on the
    // wire, and the local bot path stays the offline fallback.
    if (net.netAvailable() && (mode === 'casual' || mode === 'arena')) {
      await net.queueNet(mode, stake);
      return;
    }
    // Money is checked before anything else happens. An arena entry the
    // wallet cannot cover fails here, with the amounts, not at settlement.
    if (mode === 'arena') {
      const balance = chain.balanceSol();
      if (balance !== null && balance < stake) {
        get().fail(
          'Not enough devnet SOL for this table',
          `This table stakes ${stake} SOL and your wallet holds ${balance.toFixed(3)}. ` +
            'Top up at the devnet faucet (faucet.solana.com) or pick a lower table.',
        );
        return;
      }
    }
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
    const base = {
      busy: null,
      match,
      mode,
      stake,
      botRng: seedRng(`${seed}:opponent`),
      playback: null,
      lastRoundEvents: [],
      lastTx: null,
      clock: 25,
      matchIdOnChain: notice.matchId,
      chainNotice: notice.text,
    };
    if (mode === 'arena') {
      // The pot forms in view: your stake lands, theirs follows, then the
      // draft begins. The delays are theatre, but the states are real — a
      // devnet escrow walks exactly these steps.
      set({ ...base, screen: 'escrow', escrow: { you: false, opponent: false, stake } });
      setTimeout(() => {
        if (get().screen !== 'escrow') return;
        set({ escrow: { you: true, opponent: false, stake } });
        Sound.play('stake-confirmed');
      }, 800);
      setTimeout(() => {
        if (get().screen !== 'escrow') return;
        set({ escrow: { you: true, opponent: true, stake } });
        Sound.play('escrow-complete');
      }, 2200);
      setTimeout(() => {
        if (get().screen !== 'escrow') return;
        set({ screen: 'shipDraft', escrow: null });
        get().showBeats(foundBeat(mode, stake), { kind: 'shipDraft' });
        Sound.play('match-found');
      }, 3100);
      return;
    }
    set({ ...base, screen: 'shipDraft' });
    get().showBeats(foundBeat(mode, stake), { kind: 'shipDraft' });
    Sound.play('match-found');
  },

  async startTournament(stake) {
    const balance = chain.balanceSol();
    if (balance !== null && balance < stake) {
      get().fail(
        'Not enough devnet SOL for this bracket',
        `A seat at this bracket stakes ${stake} SOL and your wallet holds ${balance.toFixed(3)}. ` +
          'Top up at the devnet faucet (faucet.solana.com) or pick a lower tier.',
      );
      return;
    }
    set({ busy: 'Opening a bracket' });
    let notice;
    try {
      notice = await chain.openMatch({ mode: 'tournament', stake, seedCommit: freshSeed() });
    } catch (err) {
      get().fail('Could not open the bracket', err, () => void get().startTournament(stake));
      return;
    }
    const entrants = [
      get().profile.name,
      'Squall',
      'Meridian',
      'Undertow',
      'Ballast',
      'Mistral',
      'Keelhaul',
      'Sextant',
    ];
    set({
      busy: null,
      mode: 'tournament',
      stake,
      screen: 'bracket',
      lastTx: null,
      chainNotice: notice.text,
      tournament: {
        bracketId: notice.matchId,
        bracket: newBracket(entrants, stake),
        stake,
        filled: 1,
        yourPlace: null,
        settled: false,
        suddenDeath: false,
      },
    });
    // The other seven stakes land in view. Theatre in the mock, but the same
    // states a devnet bracket walks — and a bracket only starts once full.
    for (let seat = 2; seat <= 8; seat++) {
      setTimeout(
        () => {
          const t = get().tournament;
          if (!t || get().screen !== 'bracket' || t.filled >= seat) return;
          set({ tournament: { ...t, filled: seat } });
          // The last seat is the one that starts a bracket, and sounds it.
          Sound.play(seat === 8 ? 'escrow-complete' : 'escrow-forming');
        },
        350 * (seat - 1),
      );
    }
  },

  playTournamentRound() {
    const t = get().tournament;
    if (!t || t.filled < BRACKET_SEATS) return;
    const idx = nextPlayable(t.bracket);
    if (idx === null) return;
    const m = t.bracket.matches[idx];
    if (!m.seats.includes(0)) return;
    const foeSeat = m.seats[0] === 0 ? m.seats[1] : m.seats[0];
    if (foeSeat === null) return;
    const seed = freshSeed();
    const match = createMatch({
      seed,
      players: [get().profile.name, t.bracket.entrants[foeSeat]],
    });
    set({
      match,
      botRng: seedRng(`${seed}:opponent`),
      playback: null,
      lastRoundEvents: [],
      clock: 25,
      screen: 'shipDraft',
      matchIdOnChain: t.bracketId,
      chainNotice: `bracket ${roundOf(idx)} vs ${t.bracket.entrants[foeSeat]}`,
      tournament: { ...t, suddenDeath: false },
    });
    get().showBeats(
      {
        kind: 'matchFound',
        opponent: t.bracket.entrants[foeSeat],
        subtitle: roundOf(idx),
        stake: t.stake,
      },
      { kind: 'shipDraft' },
    );
    Sound.play('match-found');
  },

  submitShipPick(defId) {
    if (get().net.remote) {
      net.netPickShip(defId);
      return;
    }
    const ms = get().match;
    if (!ms) return;
    const [botChoice, rng] = botShipPick(clientView(ms, 1), get().settings.botLevel, get().botRng);
    let next = pickShip(ms, 0, defId);
    next = pickShip(next, 1, botChoice);
    set({ match: next, botRng: rng, clock: 25 });
    if (next.phase === 'cardDraft') {
      set({ screen: 'cardDraft' });
      get().showBeats(
        { kind: 'fleet', ships: next.players[0].draftedShips.slice() },
        { kind: 'cardDraft' },
      );
    }
  },

  submitCardPick(defId) {
    if (get().net.remote) {
      net.netPickCard(defId);
      return;
    }
    const ms = get().match;
    if (!ms) return;
    const [botChoice, rng] = botCardPick(clientView(ms, 1), get().settings.botLevel, get().botRng);
    let next = pickCard(ms, 0, defId);
    next = pickCard(next, 1, botChoice);
    set({ match: next, botRng: rng, clock: 30 });
    if (next.phase === 'deploy') {
      set({ screen: 'deploy' });
      get().showBeats({ kind: 'deploy' });
    }
  },

  submitDeployment(placements) {
    if (get().net.remote) {
      net.netDeploy(placements);
      return;
    }
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
    get().showBeats(
      {
        kind: 'committed',
        mine: next.players[0].deployCommit,
        theirs: next.players[1].deployCommit,
      },
      { kind: 'battle' },
    );
  },

  submitPlan(plan, aim = []) {
    // The stamp. Both plans are held sealed until both arrive, so this is
    // the last thing a player does in a round and it should land like it.
    Sound.play('plan-committed');
    if (get().net.remote) {
      set({ lastAim: aim });
      net.netPlan(plan);
      return;
    }
    const ms = get().match;
    if (!ms || ms.phase !== 'battle') return;
    const before = clientView(ms, 0);
    const [oppPlan, rng] = botPlan(clientView(ms, 1), get().settings.botLevel, get().botRng);
    const nonceA = freshSeed();
    const nonceB = freshSeed();
    const { state, events } = playRound(ms, {
      plans: [
        commitPlan(plan, nonceA, chain.signWithSessionKey(plan, nonceA)),
        commitPlan(oppPlan, nonceB, chain.signWithSessionKey(oppPlan, nonceB)),
      ],
    });
    const fast = get().settings.fastResolve;
    set({
      match: state,
      botRng: rng,
      lastRoundEvents: events,
      lastAim: aim,
      playback: fast ? null : { events, index: 0 },
      clock: state.config.roundSeconds,
    });
    // The feedback layer runs on its own clock rather than on playback, so it
    // says the same things whether or not the player skips the resolve.
    announceRound(before, clientView(state, 0), events, fast, aim);
    // The effects run off the same two inputs and the same clock, so an
    // impact lands on the beat the overlay narrates rather than after it.
    playRoundVfx(before, clientView(state, 0), events, fast, aim);
    if (fast) get().finishPlayback();
  },

  advancePlayback() {
    const pb = get().playback;
    if (!pb) return;
    const nextIndex = pb.index + 1;
    if (nextIndex >= pb.events.length) {
      get().finishPlayback();
      return;
    }
    // The overlay stepping. Quiet and under everything: it marks the beat
    // rather than announcing it, and the beat's own cue rides on top.
    Sound.play('resolve-step', { gain: 0.35, guard: 60 });
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
      if (get().mode === 'tournament') {
        // A bracket match settles through the bracket, not the 1v1 escrow.
        finishTournamentMatch(result, delta, ms.history.length);
        return;
      }
      void chain
        .settle(get().matchIdOnChain, result, get().stake)
        .then(() => {
          // The ledger closing, and — if anything came back — the money
          // landing. Two events, two cues: a settlement always happens, a
          // payout only happens when you won.
          Sound.play('settlement');
          if (result === 'win' && get().stake > 0) Sound.play('payout');
          set({ lastTx: chain.lastTxSignature() });
        })
        .catch((err) => {
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
        firstRun: false,
      });
      // The moment, then the analysis. The number on the banner is the number
      // on the receipt because both come out of `settlement()`.
      const s = settlement(get().mode, get().stake, result);
      slamThen(
        { ...s, money: s.money ?? ratingLine(delta) },
        () => set({ screen: 'result' }),
      );
    }
  },

  tick() {
    const { clock, match, playback, net: n, netDeadlineAt } = get();
    if (n.remote) {
      const left =
        netDeadlineAt === null ? 0 : Math.max(0, Math.ceil((netDeadlineAt - Date.now()) / 1000));
      if (left !== clock) {
        if (left === 5) Sound.play('timer-warning');
        set({ clock: left });
      }
      return;
    }
    if (!match || playback) return;
    if (clock <= 0) return;
    const next = clock - 1;
    // The last five seconds tick audibly, quickening as they run out.
    if (next > 0 && next <= 5) Sound.play('timer-warning', { rate: 1 + (5 - next) * 0.12 });
    set({ clock: next });
    if (next > 0) return;
    // Out of time. The engine decides what a lapsed plan does, not the UI:
    // a lapsed battle plan is the engine's timeout plan (basic shot + random
    // charge + a strike); a lapsed draft pick takes the pack's first option,
    // no strike; a lapsed deployment auto-places the fleet and commits.
    if (match.phase === 'battle') {
      const [fallback] = timeoutPlan(match, 0);
      get().submitPlan(fallback);
    } else if (match.phase === 'shipDraft') {
      get().submitShipPick(autoPick(match.shipDraft));
    } else if (match.phase === 'cardDraft') {
      get().submitCardPick(autoPick(match.cardDraft));
    } else if (match.phase === 'deploy') {
      const ships = match.players[0].draftedShips;
      const [placements] = autoDeploy(ships, seedRng(freshSeed()));
      get().submitDeployment(placements);
    }
  },

  async rematch() {
    const { mode, stake } = get();
    await get().startMatch(mode, stake);
  },

  leaveMatch() {
    if (get().net.remote || get().remoteView) {
      net.netLeave();
      set({ remoteView: null, netDeadlineAt: null });
    }
    const t = get().tournament;
    if (t && !t.settled) {
      // Walking away from a live bracket is a forfeit: the stake stays in
      // the pot, exactly as a disconnect past the grace period would.
      void chain.settleBracket(t.bracketId, 'out', t.stake).catch(() => undefined);
    }
    afterSlam = null;
    set({
      match: null,
      playback: null,
      beats: [],
      slam: null,
      screen: 'menu',
      matchIdOnChain: null,
      tournament: null,
    });
  },
}));

/**
 * A tournament match ended. Record it on the profile (rated at the same K as
 * arena), fold the result into the bracket, resolve every bot-vs-bot match
 * that is now playable through the same engine, and settle the player's
 * share the moment their finishing place is known.
 */
function finishTournamentMatch(
  result: MatchHistoryEntry['result'],
  delta: number,
  rounds: number,
): void {
  const get = useStore.getState;
  const set = useStore.setState;
  const t = get().tournament;
  const profile = get().profile;
  const record = {
    profile: {
      ...profile,
      rating: profile.rating + delta,
      provisionalMatches: profile.provisionalMatches + 1,
      wins: profile.wins + (result === 'win' ? 1 : 0),
      losses: profile.losses + (result === 'loss' ? 1 : 0),
      draws: profile.draws + (result === 'draw' ? 1 : 0),
      history: [
        { result, delta, rounds, mode: 'tournament' as Mode, stake: get().stake },
        ...profile.history,
      ].slice(0, 30),
    },
    firstRun: false,
  };
  if (!t) {
    set({ ...record, match: null, screen: 'menu' });
    return;
  }
  if (result === 'draw') {
    // A bracket needs a winner, so a drawn match forces a sudden-death
    // replay — full rules, fresh seed. Ruled in RULINGS.md.
    set({ ...record, match: null, screen: 'bracket', tournament: { ...t, suddenDeath: true } });
    return;
  }
  const idx = t.bracket.matches.findIndex(
    (m) => m.winner === null && m.seats[0] !== null && m.seats[1] !== null && m.seats.includes(0),
  );
  // Which round just ended, before the bracket is advanced past it.
  const roundName: 'quarter-final' | 'semi-final' | 'final' =
    idx < 4 ? 'quarter-final' : idx < 6 ? 'semi-final' : 'final';
  let bracket = t.bracket;
  if (idx >= 0) {
    const m = bracket.matches[idx];
    const foeSeat = m.seats[0] === 0 ? m.seats[1] : m.seats[0];
    bracket = reportResult(bracket, idx, result === 'win' ? 0 : (foeSeat ?? 1));
  }
  bracket = simulateBotMatches(bracket, `${t.bracketId}:${idx}`, get().settings.botLevel);
  const final = standings(bracket);
  let yourPlace: NonNullable<ReturnType<typeof get>['tournament']>['yourPlace'] = null;
  if (final) {
    yourPlace =
      final.champion === 0
        ? 'champion'
        : final.runnerUp === 0
          ? 'runnerUp'
          : final.semiLosers.includes(0)
            ? 'semiLoser'
            : 'out';
  } else if (result === 'loss') {
    yourPlace = idx < 4 ? 'out' : idx < 6 ? 'semiLoser' : 'runnerUp';
  }
  const settledNow = yourPlace !== null && !t.settled;
  if (settledNow && yourPlace !== null) {
    void chain
      .settleBracket(t.bracketId, yourPlace, t.stake)
      .then(() => set({ lastTx: chain.lastTxSignature() }))
      .catch((err) => get().fail('Bracket settlement did not go through', err));
  }
  const land = (): void =>
    set({
      ...record,
      match: null,
      screen: 'bracket',
      tournament: {
        ...t,
        bracket,
        yourPlace,
        settled: t.settled || settledNow,
        suddenDeath: false,
      },
    });

  // A bracket round used to simply redraw. Winning a quarter-final carries
  // real consequence — it locks in a floor on what you take home — and that
  // deserves to land before the grid updates underneath it. The final keeps
  // its own CHAMPION screen as the finale, so it is not slammed twice.
  if (roundName === 'final' && result === 'win') {
    // The loudest thing in the game, and the only cue that gets to be.
    Sound.play('champion');
    land();
    return;
  }
  if (result === 'win') Sound.play('round-won');
  slamThen(roundSettlement(t.stake, roundName, result === 'win'), land);
}

/**
 * Resolve every playable bot-vs-bot match with the real engine and bots. A
 * drawn bot match replays with a derived seed — the same sudden-death rule
 * the player is held to.
 */
function simulateBotMatches(bracket: Bracket, baseSeed: string, level: Level): Bracket {
  let b = bracket;
  for (;;) {
    const idx = nextPlayable(b);
    if (idx === null) break;
    const m = b.matches[idx];
    if (m.seats.includes(0)) break;
    let winnerSeat: number | null = null;
    for (let attempt = 0; attempt < 8 && winnerSeat === null; attempt++) {
      const rec = playBotMatch(`${baseSeed}:m${idx}:r${attempt}`, [level, level]);
      if (rec.result === 'p0') winnerSeat = m.seats[0];
      else if (rec.result === 'p1') winnerSeat = m.seats[1];
    }
    b = reportResult(b, idx, winnerSeat ?? m.seats[0] ?? 0);
  }
  return b;
}

// Dev builds expose the store so the screenshot sweep can stage states the
// happy path cannot reach quickly — an established (non-provisional) profile,
// for one. Production builds carry no such handle.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__store = useStore;
}

/** Fire the sound cue that belongs to a resolve beat. */
function cue(e: ResolveEvent): void {
  switch (e.t) {
    case 'shot':
      Sound.play(e.hit ? 'hit' : 'miss');
      break;
    case 'sink':
      // A four-length hull goes down lower than a two. One cue, pitched by
      // the thing that actually differs.
      Sound.play('ship-sunk', { rate: 1.18 - e.length * 0.06 });
      break;
    case 'react':
      Sound.play('react-triggered');
      break;
    case 'nerf':
      Sound.play('charges-stolen');
      break;
    case 'prediction':
      if (e.triggered) Sound.play('prediction-triggered');
      // A Mirror eats the whole round: the shots arrive and stop.
      if (e.triggered && e.card === 'mirror') Sound.play('shot-blocked', { gain: 0.85 });
      break;
    case 'charges':
      Sound.play('charge-placed');
      break;
    case 'reveal':
      // Shots in the air, once for the volley. Nine cells arriving 190ms
      // apart would otherwise be nine overlapping whistles, which is the
      // exact noise the one-cue-per-event rule exists to prevent.
      Sound.play('volley', { gain: 0.7 });
      break;
    case 'strike':
      Sound.play('timer-expired');
      break;
    default:
      break;
  }
}

export { seasonState };
export type { Mode, Stake, PlayerId };
