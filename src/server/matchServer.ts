import type { CommittedPlan, MatchState, Plan, PlayerId, ResolveEvent } from '../engine/types';
import { other } from '../engine/types';
import { createMatch, deploy, pickCard, pickShip, playRound } from '../engine/match';
import { clientView, visibleEvents, type ClientView } from '../engine/view';
import { timeoutPlan, validatePlan } from '../engine/resolve';
import { commit } from '../engine/sha256';
import { verifyPlanSignature } from '../chain/sessionKey';
import type { Placement } from '../engine/board';
import { MatchLog, type LogRecord } from './matchLog';
import { RateLimiter } from './rateLimit';

/**
 * The authority.
 *
 * Every rule in this game is enforced here and nowhere else. The client is a
 * renderer and an input device: it receives `ClientView`s, it sends commands,
 * and it is never asked what the state is. That distinction is not
 * architectural taste — a client that could assert state could assert that it
 * won a staked match.
 *
 * Three things follow from it, and all three are tested:
 *
 *  - A command naming a piece the player does not hold is rejected, not
 *    corrected. There is no "the client probably meant" path.
 *  - Both players' plans are held until both have arrived. A plan cannot be
 *    submitted after seeing the opponent's, because the opponent's has not
 *    been sent to anyone yet.
 *  - Reconnecting hands back a view, never the state. A player who refreshes
 *    mid-match resumes with exactly what they could see before.
 */

export type Command =
  | { kind: 'pickShip'; defId: string }
  | { kind: 'pickCard'; defId: string }
  | { kind: 'deploy'; placements: Placement[]; nonce: string }
  | { kind: 'plan'; committed: CommittedPlan }
  | { kind: 'timeout' }
  | { kind: 'disconnect' }
  | { kind: 'reconnect' };

export interface CommandResult {
  ok: boolean;
  /** Why it was rejected. Null when accepted. */
  error: string | null;
  /** The view for the player who sent the command, after it was applied. */
  view: ClientView | null;
  /** Resolve beats this player is entitled to see, if a round resolved. */
  events: ResolveEvent[];
}

export interface SeatCredentials {
  matchId: string;
  seat: PlayerId;
  /** Bearer token for this seat. Reconnection needs it; nothing else does. */
  token: string;
  /** Published ed25519 key that must sign this seat's plans. */
  sessionPublicKey: string | null;
}

interface Seat {
  token: string;
  sessionPublicKey: string | null;
  connected: boolean;
  /** Wall-clock ms when the seat dropped, for the grace period. */
  droppedAt: number | null;
}

interface Room {
  id: string;
  state: MatchState;
  seats: [Seat, Seat];
  /** Plans held until both have arrived. Neither is revealed before then. */
  pending: [CommittedPlan | null, CommittedPlan | null];
  log: MatchLog;
  /** Beats from the last resolved round, kept for a reconnecting player. */
  lastEvents: ResolveEvent[];
  createdAt: number;
}

export interface ServerOptions {
  /** Injected so the server is testable without a real clock. */
  now: () => number;
  /** Match creations allowed per identity per minute. */
  createsPerMinute?: number;
  /** Queue joins allowed per identity per minute. */
  joinsPerMinute?: number;
}

export class MatchServer {
  private readonly rooms = new Map<string, Room>();
  private readonly creates: RateLimiter;
  private readonly joins: RateLimiter;
  private readonly now: () => number;
  private counter = 0;

  constructor(opts: ServerOptions) {
    this.now = opts.now;
    this.creates = new RateLimiter(opts.createsPerMinute ?? 6, 60_000, opts.now);
    this.joins = new RateLimiter(opts.joinsPerMinute ?? 20, 60_000, opts.now);
  }

  /**
   * Open a match. Rate limited per identity: without it, one script can fill
   * the queue with matches nobody is playing and starve real players, and on a
   * staked ladder that is cheap griefing rather than a hypothetical.
   */
  createMatchFor(
    identities: [string, string],
    seed: string,
    sessionKeys: [string | null, string | null] = [null, null],
  ): { credentials: [SeatCredentials, SeatCredentials] } {
    for (const who of identities) {
      if (!this.creates.take(who)) {
        throw new Error(`rate limit: ${who} has opened too many matches recently`);
      }
    }
    this.counter += 1;
    const id = `m${this.counter}-${seed.slice(0, 8)}`;
    const state = createMatch({ seed, players: identities });
    const seats: [Seat, Seat] = [
      {
        token: `${id}.0.${seed.slice(8, 20)}`,
        sessionPublicKey: sessionKeys[0],
        connected: true,
        droppedAt: null,
      },
      {
        token: `${id}.1.${seed.slice(20, 32)}`,
        sessionPublicKey: sessionKeys[1],
        connected: true,
        droppedAt: null,
      },
    ];
    this.rooms.set(id, {
      id,
      state,
      seats,
      pending: [null, null],
      log: new MatchLog(id, seed, this.now),
      lastEvents: [],
      createdAt: this.now(),
    });
    return {
      credentials: [
        { matchId: id, seat: 0, token: seats[0].token, sessionPublicKey: sessionKeys[0] },
        { matchId: id, seat: 1, token: seats[1].token, sessionPublicKey: sessionKeys[1] },
      ],
    };
  }

  joinQueue(identity: string): boolean {
    return this.joins.take(identity);
  }

  /** The only way to read anything. There is no method that returns state. */
  view(creds: SeatCredentials): ClientView | null {
    const room = this.authorise(creds);
    return room ? clientView(room.state, creds.seat) : null;
  }

  logOf(matchId: string): LogRecord[] {
    return this.rooms.get(matchId)?.log.records() ?? [];
  }

  /** Present only so tests and the referee can audit a finished match. */
  finishedState(matchId: string): MatchState | null {
    const room = this.rooms.get(matchId);
    if (!room || room.state.phase !== 'over') return null;
    return room.state;
  }

  private authorise(creds: SeatCredentials): Room | null {
    const room = this.rooms.get(creds.matchId);
    if (!room) return null;
    // The token is the whole authorisation. A seat number alone would let
    // anyone who guessed a match id play someone else's match.
    if (room.seats[creds.seat].token !== creds.token) return null;
    return room;
  }

  submit(creds: SeatCredentials, cmd: Command): CommandResult {
    const room = this.authorise(creds);
    if (!room)
      return {
        ok: false,
        error: 'no such match, or the token does not fit that seat',
        view: null,
        events: [],
      };
    const seat = creds.seat;

    try {
      switch (cmd.kind) {
        case 'pickShip':
          return this.doDraft(room, seat, cmd.defId, 'ship');
        case 'pickCard':
          return this.doDraft(room, seat, cmd.defId, 'card');
        case 'deploy':
          return this.doDeploy(room, seat, cmd.placements, cmd.nonce);
        case 'plan':
          return this.doPlan(room, seat, cmd.committed);
        case 'timeout':
          return this.doTimeout(room, seat);
        case 'disconnect':
          return this.doDisconnect(room, seat);
        case 'reconnect':
          return this.doReconnect(room, seat);
        default:
          return this.reject(room, seat, 'unknown command');
      }
    } catch (err) {
      return this.reject(room, seat, err instanceof Error ? err.message : String(err));
    }
  }

  private reject(room: Room, seat: PlayerId, error: string): CommandResult {
    room.log.rejected(seat, error);
    return { ok: false, error, view: clientView(room.state, seat), events: [] };
  }

  private ok(room: Room, seat: PlayerId, events: ResolveEvent[] = []): CommandResult {
    return { ok: true, error: null, view: clientView(room.state, seat), events };
  }

  private doDraft(room: Room, seat: PlayerId, defId: string, kind: 'ship' | 'card'): CommandResult {
    const phase = kind === 'ship' ? 'shipDraft' : 'cardDraft';
    if (room.state.phase !== phase) return this.reject(room, seat, `not the ${kind} draft`);
    const ds = kind === 'ship' ? room.state.shipDraft : room.state.cardDraft;
    if (ds.picks[seat][ds.index] !== null) {
      return this.reject(room, seat, 'you have already picked from this pack');
    }
    room.state =
      kind === 'ship' ? pickShip(room.state, seat, defId) : pickCard(room.state, seat, defId);
    room.log.draft(seat, kind, defId);
    return this.ok(room, seat);
  }

  private doDeploy(
    room: Room,
    seat: PlayerId,
    placements: Placement[],
    nonce: string,
  ): CommandResult {
    if (room.state.phase !== 'deploy') return this.reject(room, seat, 'not the deployment phase');
    if (room.state.players[seat].ships.length > 0) {
      return this.reject(room, seat, 'your fleet is already committed and cannot be moved');
    }
    room.state = deploy(room.state, seat, placements, nonce);
    room.log.deployed(seat, room.state.players[seat].deployCommit ?? '');
    return this.ok(room, seat);
  }

  /**
   * Hold a plan until both have arrived.
   *
   * Nothing about the opponent's plan is readable before this point, so there
   * is no window in which a late submission could be informed by an early one.
   * The commitment hash is checked anyway, because it is the artifact a third
   * party audits later.
   */
  private doPlan(room: Room, seat: PlayerId, committed: CommittedPlan): CommandResult {
    if (room.state.phase !== 'battle') return this.reject(room, seat, 'not in battle');
    if (room.pending[seat]) return this.reject(room, seat, 'you have already submitted this round');
    if (committed.commitHash !== commit(committed.plan, committed.nonce)) {
      return this.reject(room, seat, 'plan does not match its commitment');
    }
    const key = room.seats[seat].sessionPublicKey;
    if (key) {
      if (!committed.signature) return this.reject(room, seat, 'plan is unsigned');
      if (!verifyPlanSignature(key, committed.signature, committed.commitHash)) {
        return this.reject(room, seat, 'plan signature does not match your session key');
      }
    }
    const why = validatePlan(room.state, seat, committed.plan);
    if (why) return this.reject(room, seat, why);

    room.pending[seat] = committed;
    room.log.planned(seat, committed.commitHash);
    if (!room.pending[other(seat)]) {
      // Still waiting. The waiting player learns nothing but that.
      return this.ok(room, seat);
    }
    return this.resolveRoundNow(room, seat);
  }

  private doTimeout(room: Room, seat: PlayerId): CommandResult {
    if (room.state.phase !== 'battle') return this.reject(room, seat, 'not in battle');
    if (room.pending[seat]) return this.ok(room, seat);
    const [plan, rng] = timeoutPlan(room.state, seat);
    room.state = { ...room.state, rng };
    room.pending[seat] = {
      commitHash: commit(plan, 'timeout'),
      nonce: 'timeout',
      plan,
      signature: 'server-timeout',
    };
    room.log.timedOut(seat);
    if (!room.pending[other(seat)]) return this.ok(room, seat);
    return this.resolveRoundNow(room, seat);
  }

  private resolveRoundNow(room: Room, seat: PlayerId): CommandResult {
    const plans: [CommittedPlan, CommittedPlan] = [room.pending[0]!, room.pending[1]!];
    const { state, events } = playRound(room.state, { plans });
    room.state = state;
    room.pending = [null, null];
    room.lastEvents = events;
    room.log.resolved(state.round - 1, events);
    if (state.phase === 'over') room.log.finished(state.outcome);
    return this.ok(room, seat, visibleEvents(events, seat));
  }

  /**
   * A dropped player is not immediately a lost player. The grace period is the
   * difference between a tunnel and a rage-quit, and on a staked ladder
   * getting that wrong takes money off someone for a bad signal.
   */
  private doDisconnect(room: Room, seat: PlayerId): CommandResult {
    room.seats[seat].connected = false;
    room.seats[seat].droppedAt = this.now();
    room.log.disconnected(seat);
    return this.ok(room, seat);
  }

  private doReconnect(room: Room, seat: PlayerId): CommandResult {
    const grace = room.state.config.disconnectGraceSeconds * 1000;
    const dropped = room.seats[seat].droppedAt;
    if (dropped !== null && this.now() - dropped > grace) {
      return this.reject(room, seat, 'the grace period has expired; the match was forfeited');
    }
    room.seats[seat].connected = true;
    room.seats[seat].droppedAt = null;
    room.log.reconnected(seat);
    // Hand back the view and the last round's beats, so a player who refreshed
    // mid-animation sees what they missed rather than a board that jumped.
    return this.ok(room, seat, visibleEvents(room.lastEvents, seat));
  }

  /**
   * Called on a timer. Forfeits any seat past its grace period — the only
   * place a match ends because of the wall clock rather than a command.
   */
  sweep(): { matchId: string; forfeited: PlayerId }[] {
    const out: { matchId: string; forfeited: PlayerId }[] = [];
    for (const room of this.rooms.values()) {
      if (room.state.phase === 'over') continue;
      const grace = room.state.config.disconnectGraceSeconds * 1000;
      for (const seat of [0, 1] as PlayerId[]) {
        const dropped = room.seats[seat].droppedAt;
        if (dropped === null || this.now() - dropped <= grace) continue;
        room.state = {
          ...room.state,
          phase: 'over',
          outcome: { kind: 'win', winner: other(seat), reason: 'disconnect' },
        };
        room.log.forfeited(seat);
        out.push({ matchId: room.id, forfeited: seat });
        break;
      }
    }
    return out;
  }

  /** For a referee settling on-chain, and for anyone auditing a dispute. */
  transcriptInputs(matchId: string): { state: MatchState; log: LogRecord[] } | null {
    const room = this.rooms.get(matchId);
    return room ? { state: room.state, log: room.log.records() } : null;
  }
}

export type { Plan };
