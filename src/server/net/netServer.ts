import { WebSocketServer, type WebSocket } from 'ws';
import { createServer, type Server as HttpServer } from 'node:http';
import { MatchServer, type SeatCredentials } from '../matchServer';
import { RateLimiter } from '../rateLimit';
import type { Mode, Stake } from '../../state/profile';
import type { MatchState, Outcome, PlayerId, ResolveEvent } from '../../engine/types';
import { other } from '../../engine/types';
import { clientView, type ClientView } from '../../engine/view';
import { commit } from '../../engine/sha256';
import { autoDeploy } from '../../engine/board';
import { seedRng, type RngState } from '../../engine/rng';
import {
  botCardPick,
  botDeploy,
  botPlan,
  botShipPick,
  type Level,
} from '../../bots/bot';
import {
  issueSessionKey,
  signPlan,
  verifyPayloadSignature,
  type SessionKey,
} from '../../chain/sessionKey';
import {
  PROTOCOL_VERSION,
  parseClientMessage,
  type ClientMessage,
  type ServerMessage,
} from './protocol';
import {
  FINAL,
  newBracket,
  reportResult,
  roundOf,
  standings,
  type Bracket,
} from '../../tournament/bracket';

/**
 * The network authority: one process that owns every live match.
 *
 * This wraps the tested `MatchServer` with a WebSocket layer and adds the
 * things only a real wire needs — connect authentication, a matchmaking
 * queue, server-side clocks, the two-phase commit–reveal, reconnection, and
 * forfeit sweeps. The rule engine is never touched here; anything a message
 * tries that the rules refuse comes back as the same rejection the
 * in-process server produces.
 *
 * Commit–reveal over the wire, precisely: a plan travels as `planCommit`
 * (hash + session-key signature) first. Only once BOTH hashes are held does
 * the server open reveals; `planReveal` before that is refused. A reveal
 * must reproduce its own commit hash — anything else is discarded and the
 * seat lapses to the engine's timeout plan at the reveal deadline, exactly
 * as if it had never answered. No path lets a seat see anything derived
 * from the opponent's plan before its own is fixed.
 *
 * Clocks are server-authoritative. Deadlines are epoch-ms stamped into every
 * `state` message; clients render a countdown estimate and nothing more. A
 * slow, skewed or backgrounded client changes nothing about when the server
 * acts on its silence.
 */

export interface ChainHooks {
  /** Called when a staked match opens. Failures are logged, not fatal. */
  openMatch?: (matchId: string, players: [string, string], stake: Stake) => Promise<void>;
  settle?: (matchId: string, outcome: Outcome | null, state: MatchState) => Promise<void>;
  settleBracket?: (
    bracketId: string,
    places: [number, number, number, number],
    entrants: string[],
    stake: Stake,
  ) => Promise<void>;
}

export interface NetServerOptions {
  port: number;
  now?: () => number;
  /** Casual queue falls back to a bot after this long. Never staked modes. */
  casualBotAfterMs?: number;
  /** Staked queues give up (with a message) after this long. */
  queueTimeoutMs?: number;
  /** Seconds for a draft pick / deployment / plan / reveal window. */
  draftSeconds?: number;
  deploySeconds?: number;
  planSeconds?: number;
  revealSeconds?: number;
  /** Structured log sink — one JSON-able record per event. */
  log?: (record: Record<string, unknown>) => void;
  chain?: ChainHooks;
  /** Sweep interval in ms; tests shrink it. */
  tickMs?: number;
  botLevel?: Level;
}

interface Conn {
  ws: WebSocket;
  id: string;
  name: string;
  sessionPublicKey: string | null;
  challenge: string;
  authed: boolean;
  /** Room the connection is seated in, when playing. */
  matchId: string | null;
  seat: PlayerId | null;
}

interface QueueEntry {
  conn: Conn;
  mode: Mode;
  stake: Stake;
  rating: number;
  provisional: boolean;
  since: number;
}

interface Commit {
  hash: string;
  signature: string | null;
}

interface RoundGate {
  round: number;
  commits: [Commit | null, Commit | null];
  revealsOpen: boolean;
  revealed: [boolean, boolean];
}

interface NetRoom {
  matchId: string;
  mode: Mode;
  stake: Stake;
  names: [string, string];
  creds: [SeatCredentials, SeatCredentials];
  conns: [Conn | null, Conn | null];
  seq: number;
  gate: RoundGate;
  /** What the current deadline is for, and when it lands. */
  deadlineKind: 'draft' | 'deploy' | 'plan' | 'reveal' | null;
  deadlineAt: number | null;
  /** Phase/pack/round marker, to notice transitions and re-arm the clock. */
  mark: string;
  bot: { level: Level; key: SessionKey; rng: RngState; planned: number } | null;
  tournamentId: string | null;
  settled: boolean;
}

interface Tournament {
  id: string;
  stake: Stake;
  bracket: Bracket;
  /** Connection per bracket seat. */
  seats: (Conn | null)[];
  /** Bracket seat -> live match, while one runs. */
  live: Map<number, { matchId: string; matchIndex: number }>;
  seq: number;
  settledSeats: Set<number>;
}

export class NetServer {
  readonly matchServer: MatchServer;
  private readonly wss: WebSocketServer;
  private readonly http: HttpServer;
  private readonly opts: Required<
    Pick<
      NetServerOptions,
      | 'casualBotAfterMs'
      | 'queueTimeoutMs'
      | 'draftSeconds'
      | 'deploySeconds'
      | 'planSeconds'
      | 'revealSeconds'
      | 'tickMs'
      | 'botLevel'
    >
  >;
  private readonly now: () => number;
  private readonly log: (r: Record<string, unknown>) => void;
  private readonly chain: ChainHooks;
  private readonly conns = new Set<Conn>();
  private readonly queue: QueueEntry[] = [];
  private readonly rooms = new Map<string, NetRoom>();
  private readonly tournaments = new Map<string, Tournament>();
  private readonly hellos: RateLimiter;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private counter = 0;

  constructor(options: NetServerOptions) {
    this.now = options.now ?? (() => Date.now());
    this.opts = {
      casualBotAfterMs: options.casualBotAfterMs ?? 5_000,
      queueTimeoutMs: options.queueTimeoutMs ?? 120_000,
      draftSeconds: options.draftSeconds ?? 25,
      deploySeconds: options.deploySeconds ?? 30,
      planSeconds: options.planSeconds ?? 20,
      revealSeconds: options.revealSeconds ?? 8,
      tickMs: options.tickMs ?? 250,
      botLevel: options.botLevel ?? 3,
    };
    this.log = options.log ?? (() => undefined);
    this.chain = options.chain ?? {};
    this.matchServer = new MatchServer({ now: this.now });
    this.hellos = new RateLimiter(30, 60_000, this.now);

    this.http = createServer((req, res) => {
      if (req.url === '/healthz') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: true,
            v: PROTOCOL_VERSION,
            connections: this.conns.size,
            queued: this.queue.length,
            rooms: this.rooms.size,
            tournaments: this.tournaments.size,
          }),
        );
        return;
      }
      res.writeHead(404);
      res.end();
    });
    this.wss = new WebSocketServer({ server: this.http });
    this.wss.on('connection', (ws) => this.onConnection(ws));
    this.http.listen(options.port);
    this.ticker = setInterval(() => this.tick(), this.opts.tickMs);
  }

  address(): number {
    const addr = this.http.address();
    return typeof addr === 'object' && addr ? addr.port : 0;
  }

  close(): void {
    if (this.ticker) clearInterval(this.ticker);
    for (const c of this.conns) c.ws.close();
    this.wss.close();
    this.http.close();
  }

  // --- connection lifecycle ------------------------------------------------

  private onConnection(ws: WebSocket): void {
    this.counter += 1;
    const conn: Conn = {
      ws,
      id: `c${this.counter}`,
      name: '',
      sessionPublicKey: null,
      challenge: `challenge-${this.counter}-${this.now()}-${Math.floor(Math.random() * 1e9)}`,
      authed: false,
      matchId: null,
      seat: null,
    };
    this.conns.add(conn);
    this.send(conn, { t: 'challenge', v: PROTOCOL_VERSION, nonce: conn.challenge });

    ws.on('message', (data) => {
      const msg = parseClientMessage(String(data));
      if (!msg) {
        this.send(conn, { t: 'error', code: 'bad-message', message: 'unparseable message' });
        return;
      }
      try {
        this.onMessage(conn, msg);
      } catch (err) {
        this.log({ at: this.now(), type: 'server-error', conn: conn.id, err: String(err) });
        this.send(conn, { t: 'error', code: 'server-error', message: 'internal error' });
      }
    });
    ws.on('close', () => this.onClose(conn));
    ws.on('error', () => undefined);
  }

  private onClose(conn: Conn): void {
    this.conns.delete(conn);
    this.dequeue(conn);
    const room = conn.matchId ? this.rooms.get(conn.matchId) : null;
    if (room && conn.seat !== null && room.conns[conn.seat] === conn) {
      room.conns[conn.seat] = null;
      this.matchServer.submit(room.creds[conn.seat], { kind: 'disconnect' });
      this.log({ at: this.now(), type: 'disconnect', matchId: room.matchId, seat: conn.seat });
      const opp = room.conns[other(conn.seat)];
      if (opp) {
        this.send(opp, {
          t: 'oppStatus',
          connected: false,
          matchId: room.matchId,
          round: this.roundOfRoom(room),
          seq: ++room.seq,
        });
      }
    }
  }

  private send(conn: Conn, msg: ServerMessage): void {
    try {
      conn.ws.send(JSON.stringify(msg));
    } catch {
      // A send to a closing socket is not an event worth crashing over.
    }
  }

  // --- message dispatch ----------------------------------------------------

  private onMessage(conn: Conn, msg: ClientMessage): void {
    if (msg.t === 'hello') {
      this.onHello(conn, msg);
      return;
    }
    if (!conn.authed) {
      this.send(conn, { t: 'error', code: 'unauthenticated', message: 'say hello first' });
      return;
    }
    switch (msg.t) {
      case 'ping':
        this.send(conn, { t: 'pong', at: msg.at });
        return;
      case 'queueEnter':
        this.onQueueEnter(conn, msg);
        return;
      case 'queueExit':
        this.dequeue(conn);
        return;
      case 'rejoin':
        this.onRejoin(conn, msg);
        return;
      case 'pickShip':
      case 'pickCard':
        this.onPick(conn, msg);
        return;
      case 'deploy':
        this.onDeploy(conn, msg);
        return;
      case 'planCommit':
        this.onPlanCommit(conn, msg);
        return;
      case 'planReveal':
        this.onPlanReveal(conn, msg);
        return;
      case 'leave':
        this.onLeave(conn, msg.matchId);
        return;
      default:
        this.send(conn, { t: 'error', code: 'unknown', message: `unknown message` });
    }
  }

  private onHello(
    conn: Conn,
    msg: Extract<ClientMessage, { t: 'hello' }>,
  ): void {
    if (msg.v !== PROTOCOL_VERSION) {
      this.send(conn, {
        t: 'error',
        code: 'version',
        message: `server speaks v${PROTOCOL_VERSION}, client sent v${msg.v}`,
      });
      conn.ws.close();
      return;
    }
    if (!this.hellos.take('hello')) {
      this.send(conn, { t: 'error', code: 'rate-limited', message: 'too many connects' });
      conn.ws.close();
      return;
    }
    // The session key proves the connection: whoever signs the challenge
    // holds the key that will sign this player's plans.
    if (
      !verifyPayloadSignature(msg.sessionPublicKey, msg.signature, {
        challenge: conn.challenge,
      })
    ) {
      this.send(conn, {
        t: 'error',
        code: 'bad-signature',
        message: 'challenge signature does not verify against the session key',
      });
      conn.ws.close();
      return;
    }
    conn.authed = true;
    conn.name = msg.name.slice(0, 24) || 'player';
    conn.sessionPublicKey = msg.sessionPublicKey;
    this.send(conn, { t: 'welcome', v: PROTOCOL_VERSION, clientId: conn.id });
    this.log({ at: this.now(), type: 'hello', conn: conn.id, name: conn.name });
  }

  // --- matchmaking ---------------------------------------------------------

  private onQueueEnter(
    conn: Conn,
    msg: Extract<ClientMessage, { t: 'queueEnter' }>,
  ): void {
    if (!this.matchServer.joinQueue(conn.sessionPublicKey ?? conn.id)) {
      this.send(conn, { t: 'error', code: 'rate-limited', message: 'queueing too fast' });
      return;
    }
    if (msg.provisional && msg.mode !== 'casual' && msg.stake > 0.05) {
      this.send(conn, {
        t: 'error',
        code: 'provisional',
        message: 'provisional accounts play the lowest table only',
      });
      return;
    }
    this.dequeue(conn);
    this.queue.push({
      conn,
      mode: msg.mode,
      stake: msg.stake,
      rating: msg.rating,
      provisional: msg.provisional,
      since: this.now(),
    });
    const waiting = this.queue.filter((q) => q.mode === msg.mode && q.stake === msg.stake).length;
    this.send(conn, { t: 'queued', mode: msg.mode, stake: msg.stake, waiting });
    this.matchmake();
  }

  private dequeue(conn: Conn): void {
    const i = this.queue.findIndex((q) => q.conn === conn);
    if (i >= 0) this.queue.splice(i, 1);
  }

  /** Band grows the longer a player waits, so nobody queues forever. */
  private band(q: QueueEntry): number {
    const base = q.provisional ? 300 : 120;
    return base + Math.floor((this.now() - q.since) / 1000) * 30;
  }

  private matchmake(): void {
    // Tiers never mix: the bucket key is mode+stake, and a pair must share it.
    for (let i = 0; i < this.queue.length; i++) {
      for (let j = i + 1; j < this.queue.length; j++) {
        const a = this.queue[i];
        const b = this.queue[j];
        if (a.mode !== b.mode || a.stake !== b.stake) continue;
        if (a.mode === 'tournament') continue; // gathered separately below
        if (Math.abs(a.rating - b.rating) > this.band(a) + this.band(b)) continue;
        this.queue.splice(j, 1);
        this.queue.splice(i, 1);
        this.startMatch(a, b);
        this.matchmake();
        return;
      }
    }
    // Tournaments gather eight in one tier.
    const byTier = new Map<Stake, QueueEntry[]>();
    for (const q of this.queue) {
      if (q.mode !== 'tournament') continue;
      const list = byTier.get(q.stake) ?? [];
      list.push(q);
      byTier.set(q.stake, list);
    }
    for (const [stake, list] of byTier) {
      if (list.length < 8) continue;
      const eight = list.slice(0, 8);
      for (const q of eight) this.dequeue(q.conn);
      this.startTournament(stake, eight);
    }
  }

  private newMatchSeed(): string {
    // Match seeds must not be predictable by either player; the server mints
    // them. (Deterministic tests inject `now`, not the seed.)
    return `${this.now().toString(16)}-${Math.floor(Math.random() * 1e12).toString(16)}`;
  }

  private startMatch(
    a: QueueEntry,
    b: QueueEntry | { bot: true },
    tournamentId: string | null = null,
    matchIndex = 0,
  ): NetRoom {
    const vsBot = !('conn' in b);
    const botKey = vsBot ? issueSessionKey(this.now()) : null;
    const names: [string, string] = [
      a.conn.name,
      vsBot ? 'Bot' : (b as QueueEntry).conn.name,
    ];
    const seed = this.newMatchSeed();
    const { credentials } = this.matchServer.createMatchFor(names, seed, [
      a.conn.sessionPublicKey,
      vsBot ? (botKey?.publicKeyHex ?? null) : (b as QueueEntry).conn.sessionPublicKey,
    ]);
    const room: NetRoom = {
      matchId: credentials[0].matchId,
      mode: a.mode,
      stake: a.stake,
      names,
      creds: credentials,
      conns: [a.conn, vsBot ? null : (b as QueueEntry).conn],
      seq: 0,
      gate: { round: 1, commits: [null, null], revealsOpen: false, revealed: [false, false] },
      deadlineKind: null,
      deadlineAt: null,
      mark: '',
      bot: vsBot
        ? {
            level: this.opts.botLevel,
            key: botKey as SessionKey,
            rng: seedRng(`${seed}:net-bot`),
            planned: 0,
          }
        : null,
      tournamentId,
      settled: false,
    };
    this.rooms.set(room.matchId, room);
    a.conn.matchId = room.matchId;
    a.conn.seat = 0;
    if (!vsBot) {
      const bc = (b as QueueEntry).conn;
      bc.matchId = room.matchId;
      bc.seat = 1;
    }
    this.log({
      at: this.now(),
      type: 'match-created',
      matchId: room.matchId,
      mode: room.mode,
      stake: room.stake,
      names,
      vsBot,
      tournamentId,
      matchIndex,
    });
    if (room.stake > 0 && this.chain.openMatch) {
      void this.chain
        .openMatch(room.matchId, names, room.stake)
        .catch((err) =>
          this.log({ at: this.now(), type: 'chain-error', matchId: room.matchId, err: String(err) }),
        );
    }
    for (const seat of [0, 1] as PlayerId[]) {
      const conn = room.conns[seat];
      if (!conn) continue;
      this.send(conn, {
        t: 'matchFound',
        matchId: room.matchId,
        seat,
        token: room.creds[seat].token,
        opponent: names[other(seat)],
        mode: room.mode,
        stake: room.stake,
        vsBot,
      });
    }
    this.afterMutation(room);
    return room;
  }

  // --- match commands ------------------------------------------------------

  private roomFor(conn: Conn, matchId: string): NetRoom | null {
    const room = this.rooms.get(matchId);
    if (!room) {
      this.send(conn, { t: 'error', code: 'no-match', message: 'no such match', matchId });
      return null;
    }
    if (conn.seat === null || room.conns[conn.seat] !== conn || conn.matchId !== matchId) {
      this.send(conn, { t: 'error', code: 'not-seated', message: 'you are not in this match', matchId });
      return null;
    }
    return room;
  }

  private roundOfRoom(room: NetRoom): number {
    const view = this.matchServer.view(room.creds[0]);
    return view?.round ?? 0;
  }

  private onPick(
    conn: Conn,
    msg: Extract<ClientMessage, { t: 'pickShip' | 'pickCard' }>,
  ): void {
    const room = this.roomFor(conn, msg.matchId);
    if (!room || conn.seat === null) return;
    const res = this.matchServer.submit(room.creds[conn.seat], {
      kind: msg.t,
      defId: msg.defId,
    });
    if (!res.ok) {
      this.send(conn, { t: 'error', code: 'rejected', message: res.error ?? 'rejected', matchId: room.matchId });
      return;
    }
    this.afterMutation(room);
  }

  private onDeploy(conn: Conn, msg: Extract<ClientMessage, { t: 'deploy' }>): void {
    const room = this.roomFor(conn, msg.matchId);
    if (!room || conn.seat === null) return;
    const res = this.matchServer.submit(room.creds[conn.seat], {
      kind: 'deploy',
      placements: msg.placements,
      nonce: msg.nonce,
    });
    if (!res.ok) {
      this.send(conn, { t: 'error', code: 'rejected', message: res.error ?? 'rejected', matchId: room.matchId });
      return;
    }
    this.afterMutation(room);
  }

  /**
   * Phase one of two: the hash. Refused when it is not this round, when the
   * seat already committed (two different commits is the attack this blocks),
   * or when the signature does not verify. Once both hashes are held the
   * server opens reveals for both seats at once.
   */
  private onPlanCommit(conn: Conn, msg: Extract<ClientMessage, { t: 'planCommit' }>): void {
    const room = this.roomFor(conn, msg.matchId);
    if (!room || conn.seat === null) return;
    const round = this.roundOfRoom(room);
    this.armGate(room, round);
    if (msg.round !== round) {
      this.send(conn, { t: 'error', code: 'stale-round', message: `round is ${round}`, matchId: room.matchId });
      return;
    }
    if (room.gate.commits[conn.seat]) {
      this.send(conn, {
        t: 'error',
        code: 'double-commit',
        message: 'a commit is already recorded for this seat this round',
        matchId: room.matchId,
      });
      return;
    }
    const key = conn.sessionPublicKey;
    if (key && msg.signature && !this.verifyCommitSig(key, msg.signature, msg.hash)) {
      this.send(conn, {
        t: 'error',
        code: 'bad-signature',
        message: 'commit signature does not match your session key',
        matchId: room.matchId,
      });
      return;
    }
    room.gate.commits[conn.seat] = { hash: msg.hash, signature: msg.signature };
    this.log({ at: this.now(), type: 'commit', matchId: room.matchId, seat: conn.seat, round, hash: msg.hash });
    this.maybeOpenReveals(room, round);
  }

  private verifyCommitSig(key: string, sig: string, hash: string): boolean {
    // The signature is over the commit hash — the same artifact the
    // transcript records.
    return verifyPayloadSignatureOverHash(key, sig, hash);
  }

  private maybeOpenReveals(room: NetRoom, round: number): void {
    const botSeat = room.bot ? 1 : null;
    const humanCommits = ([0, 1] as PlayerId[]).every(
      (s) => s === botSeat || room.gate.commits[s] !== null,
    );
    if (!humanCommits || room.gate.revealsOpen) return;
    room.gate.revealsOpen = true;
    room.deadlineKind = 'reveal';
    room.deadlineAt = this.now() + this.opts.revealSeconds * 1000;
    for (const seat of [0, 1] as PlayerId[]) {
      const conn = room.conns[seat];
      if (!conn) continue;
      this.send(conn, {
        t: 'revealOpen',
        matchId: room.matchId,
        round,
        seq: ++room.seq,
        deadlineAt: room.deadlineAt,
      });
    }
    this.log({ at: this.now(), type: 'reveals-open', matchId: room.matchId, round });
  }

  /**
   * Phase two: the plan itself. Only after both hashes are in, and only if
   * it reproduces this seat's committed hash. A reveal that does not match
   * is discarded — the seat lapses to the engine's timeout plan at the
   * deadline, exactly as if it had stayed silent.
   */
  private onPlanReveal(conn: Conn, msg: Extract<ClientMessage, { t: 'planReveal' }>): void {
    const room = this.roomFor(conn, msg.matchId);
    if (!room || conn.seat === null) return;
    const round = this.roundOfRoom(room);
    if (msg.round !== round) {
      this.send(conn, { t: 'error', code: 'stale-round', message: `round is ${round}`, matchId: room.matchId });
      return;
    }
    if (!room.gate.revealsOpen) {
      this.send(conn, {
        t: 'error',
        code: 'reveal-closed',
        message: 'reveals open only after both commits are in',
        matchId: room.matchId,
      });
      return;
    }
    const committed = room.gate.commits[conn.seat];
    if (!committed) {
      this.send(conn, { t: 'error', code: 'no-commit', message: 'no commit to reveal', matchId: room.matchId });
      return;
    }
    if (room.gate.revealed[conn.seat]) {
      this.send(conn, { t: 'error', code: 'double-reveal', message: 'already revealed', matchId: room.matchId });
      return;
    }
    if (commit(msg.plan, msg.nonce) !== committed.hash) {
      this.log({ at: this.now(), type: 'reveal-mismatch', matchId: room.matchId, seat: conn.seat, round });
      this.send(conn, {
        t: 'error',
        code: 'reveal-mismatch',
        message: 'reveal does not reproduce your committed hash; it is discarded',
        matchId: room.matchId,
      });
      return;
    }
    const res = this.matchServer.submit(room.creds[conn.seat], {
      kind: 'plan',
      committed: {
        commitHash: committed.hash,
        nonce: msg.nonce,
        plan: msg.plan,
        signature: committed.signature,
      },
    });
    if (!res.ok) {
      this.send(conn, { t: 'error', code: 'rejected', message: res.error ?? 'rejected', matchId: room.matchId });
      return;
    }
    room.gate.revealed[conn.seat] = true;
    this.log({ at: this.now(), type: 'reveal', matchId: room.matchId, seat: conn.seat, round });
    this.botPlanIfDue(room);
    this.afterMutation(room);
  }

  private onRejoin(conn: Conn, msg: Extract<ClientMessage, { t: 'rejoin' }>): void {
    const room = this.rooms.get(msg.matchId);
    if (!room || room.creds[msg.seat].token !== msg.token) {
      this.send(conn, { t: 'error', code: 'no-match', message: 'no such match, or the token does not fit', matchId: msg.matchId });
      return;
    }
    const res = this.matchServer.submit(room.creds[msg.seat], { kind: 'reconnect' });
    if (!res.ok) {
      this.send(conn, { t: 'error', code: 'rejoin-refused', message: res.error ?? 'refused', matchId: msg.matchId });
      return;
    }
    room.conns[msg.seat] = conn;
    conn.matchId = room.matchId;
    conn.seat = msg.seat;
    this.log({ at: this.now(), type: 'rejoin', matchId: room.matchId, seat: msg.seat });
    // Full resync from the server, never from anything the client kept.
    this.sendState(room, msg.seat, res.events);
    const opp = room.conns[other(msg.seat)];
    if (opp) {
      this.send(opp, {
        t: 'oppStatus',
        connected: true,
        matchId: room.matchId,
        round: this.roundOfRoom(room),
        seq: ++room.seq,
      });
    }
  }

  private onLeave(conn: Conn, matchId: string): void {
    const room = this.roomFor(conn, matchId);
    if (!room || conn.seat === null) return;
    this.matchServer.submit(room.creds[conn.seat], { kind: 'disconnect' });
    room.conns[conn.seat] = null;
    conn.matchId = null;
    conn.seat = null;
    // Leaving is a deliberate act; the grace period is for bad networks. The
    // sweep will forfeit the seat when the grace runs out.
    this.log({ at: this.now(), type: 'leave', matchId: room.matchId });
  }

  // --- state fan-out --------------------------------------------------------

  private viewFor(room: NetRoom, seat: PlayerId): ClientView | null {
    return this.matchServer.view(room.creds[seat]);
  }

  private sendState(room: NetRoom, seat: PlayerId, events: ResolveEvent[] = []): void {
    const conn = room.conns[seat];
    if (!conn) return;
    const view = this.viewFor(room, seat);
    if (!view) return;
    this.send(conn, {
      t: 'state',
      matchId: room.matchId,
      round: view.round,
      seq: ++room.seq,
      phase: view.phase,
      view,
      deadlineAt: room.deadlineAt,
      opponentConnected: room.bot ? true : room.conns[other(seat)] !== null,
      events,
    });
  }

  /** After any accepted mutation: re-arm clocks, drive the bot, fan out. */
  private afterMutation(room: NetRoom): void {
    this.armClock(room);
    this.driveBot(room);
    const view0 = this.viewFor(room, 0);
    if (!view0) return;
    const resolvedEvents = ([0, 1] as PlayerId[]).map((s) =>
      this.matchServer.lastRoundEvents(room.creds[s]),
    );
    const roundJustResolved =
      room.gate.round < view0.round || (view0.phase === 'over' && !room.settled);
    if (roundJustResolved) {
      this.armGate(room, view0.round);
      for (const seat of [0, 1] as PlayerId[]) {
        const conn = room.conns[seat];
        if (!conn) continue;
        const view = this.viewFor(room, seat);
        if (!view) continue;
        this.send(conn, {
          t: 'roundReport',
          matchId: room.matchId,
          round: view.round,
          seq: ++room.seq,
          view,
          events: resolvedEvents[seat],
        });
      }
    }
    for (const seat of [0, 1] as PlayerId[]) this.sendState(room, seat);
    if (view0.phase === 'over') this.finishRoom(room);
  }

  private armGate(room: NetRoom, round: number): void {
    if (room.gate.round === round) return;
    room.gate = { round, commits: [null, null], revealsOpen: false, revealed: [false, false] };
  }

  /** Deadlines follow the phase; the mark notices pack/round transitions. */
  private armClock(room: NetRoom): void {
    const view = this.viewFor(room, 0);
    if (!view) return;
    const mark =
      view.phase === 'shipDraft'
        ? `ship:${view.shipDraft.index}`
        : view.phase === 'cardDraft'
          ? `card:${view.cardDraft.index}`
          : view.phase === 'deploy'
            ? 'deploy'
            : view.phase === 'battle'
              ? `battle:${view.round}`
              : 'over';
    if (mark === room.mark) return;
    room.mark = mark;
    if (view.phase === 'shipDraft' || view.phase === 'cardDraft') {
      room.deadlineKind = 'draft';
      room.deadlineAt = this.now() + this.opts.draftSeconds * 1000;
    } else if (view.phase === 'deploy') {
      room.deadlineKind = 'deploy';
      room.deadlineAt = this.now() + this.opts.deploySeconds * 1000;
    } else if (view.phase === 'battle') {
      room.deadlineKind = 'plan';
      room.deadlineAt = this.now() + this.opts.planSeconds * 1000;
    } else {
      room.deadlineKind = null;
      room.deadlineAt = null;
    }
  }

  // --- the clock ------------------------------------------------------------

  private tick(): void {
    this.matchmakeTimeouts();
    this.matchmake();
    for (const room of this.rooms.values()) {
      if (room.settled) continue;
      this.armClock(room);
      this.driveBot(room);
      if (room.deadlineAt !== null && this.now() >= room.deadlineAt) this.expire(room);
    }
    for (const { matchId, forfeited } of this.matchServer.sweep()) {
      const room = this.rooms.get(matchId);
      if (!room) continue;
      this.log({ at: this.now(), type: 'forfeit', matchId, seat: forfeited });
      this.afterMutation(room);
    }
  }

  private matchmakeTimeouts(): void {
    for (const q of this.queue.slice()) {
      const waited = this.now() - q.since;
      if (q.mode === 'casual' && waited >= this.opts.casualBotAfterMs) {
        this.dequeue(q.conn);
        this.startMatch(q, { bot: true });
      } else if (q.mode !== 'casual' && waited >= this.opts.queueTimeoutMs) {
        // A staked player never silently faces a bot. They get told, loudly.
        this.dequeue(q.conn);
        this.send(q.conn, {
          t: 'queueTimeout',
          mode: q.mode,
          stake: q.stake,
          reason: 'nobody in your band joined in time — your stake was never taken',
        });
      }
    }
  }

  /** A deadline landed. The server acts on silence; clients only render it. */
  private expire(room: NetRoom): void {
    const kind = room.deadlineKind;
    room.deadlineAt = null;
    room.deadlineKind = null;
    const view0 = this.viewFor(room, 0);
    if (!view0) return;
    if (kind === 'draft') {
      for (const seat of [0, 1] as PlayerId[]) {
        const view = this.viewFor(room, seat);
        if (!view) continue;
        const ds = view.phase === 'shipDraft' ? view.shipDraft : view.cardDraft;
        if (ds.myPicks[ds.index] !== null) continue;
        const choice = ds.packs[ds.index]?.[0];
        if (!choice) continue;
        this.matchServer.submit(room.creds[seat], {
          kind: view.phase === 'shipDraft' ? 'pickShip' : 'pickCard',
          defId: choice,
        });
        this.log({ at: this.now(), type: 'draft-lapse', matchId: room.matchId, seat, choice });
      }
    } else if (kind === 'deploy') {
      for (const seat of [0, 1] as PlayerId[]) {
        const view = this.viewFor(room, seat);
        if (!view || view.me.ships.length > 0) continue;
        const [placements] = autoDeploy(view.me.draftedShips, seedRng(`${room.matchId}:${seat}:lapse`));
        this.matchServer.submit(room.creds[seat], {
          kind: 'deploy',
          placements,
          nonce: `lapse-${room.matchId}-${seat}`,
        });
        this.log({ at: this.now(), type: 'deploy-lapse', matchId: room.matchId, seat });
      }
    } else if (kind === 'plan') {
      // A seat with no commit lapses to the engine's timeout plan. A seat
      // that DID commit is not punished for its opponent's silence: reveals
      // open for it now, against the already-fixed substitute plan.
      let committed = false;
      for (const seat of [0, 1] as PlayerId[]) {
        if (room.bot && seat === 1) continue;
        if (room.gate.commits[seat]) {
          committed = true;
          continue;
        }
        this.matchServer.submit(room.creds[seat], { kind: 'timeout' });
        this.log({ at: this.now(), type: 'plan-lapse', matchId: room.matchId, seat });
      }
      this.botPlanIfDue(room, true);
      if (committed && !room.gate.revealsOpen) {
        room.gate.revealsOpen = true;
        room.deadlineKind = 'reveal';
        room.deadlineAt = this.now() + this.opts.revealSeconds * 1000;
        const round = this.roundOfRoom(room);
        for (const seat of [0, 1] as PlayerId[]) {
          const conn = room.conns[seat];
          if (conn && room.gate.commits[seat] && !room.gate.revealed[seat]) {
            this.send(conn, {
              t: 'revealOpen',
              matchId: room.matchId,
              round,
              seq: ++room.seq,
              deadlineAt: room.deadlineAt,
            });
          }
        }
      }
    } else if (kind === 'reveal') {
      // Committed and silent, or committed and mismatched: the reveal window
      // has closed and the seat lapses exactly as if it had never answered.
      for (const seat of [0, 1] as PlayerId[]) {
        if (room.bot && seat === 1) continue;
        if (room.gate.revealed[seat]) continue;
        this.matchServer.submit(room.creds[seat], { kind: 'timeout' });
        this.log({ at: this.now(), type: 'reveal-lapse', matchId: room.matchId, seat });
      }
      this.botPlanIfDue(room, true);
    }
    this.afterMutation(room);
  }

  // --- the bot seat ---------------------------------------------------------

  private driveBot(room: NetRoom): void {
    if (!room.bot) return;
    const creds = room.creds[1];
    const view = this.matchServer.view(creds);
    if (!view) return;
    if (view.phase === 'shipDraft' && view.shipDraft.myPicks[view.shipDraft.index] === null) {
      const [choice, rng] = botShipPick(view, room.bot.level, room.bot.rng);
      room.bot.rng = rng;
      this.matchServer.submit(creds, { kind: 'pickShip', defId: choice });
      this.afterMutation(room);
    } else if (view.phase === 'cardDraft' && view.cardDraft.myPicks[view.cardDraft.index] === null) {
      const [choice, rng] = botCardPick(view, room.bot.level, room.bot.rng);
      room.bot.rng = rng;
      this.matchServer.submit(creds, { kind: 'pickCard', defId: choice });
      this.afterMutation(room);
    } else if (view.phase === 'deploy' && view.me.ships.length === 0) {
      const [placements, rng] = botDeploy(view, room.bot.level, room.bot.rng);
      room.bot.rng = rng;
      this.matchServer.submit(creds, {
        kind: 'deploy',
        placements,
        nonce: `bot-${room.matchId}`,
      });
      this.afterMutation(room);
    }
  }

  /**
   * The bot plans once the human's reveal is in (or the human lapsed). It
   * cannot peek: its plan is built from its own client view, and the human's
   * plan is inside the match server, which reveals nothing until both are in.
   */
  private botPlanIfDue(room: NetRoom, force = false): void {
    if (!room.bot) return;
    const creds = room.creds[1];
    const view = this.matchServer.view(creds);
    if (!view || view.phase !== 'battle') return;
    if (room.bot.planned >= view.round) return;
    if (!force && !room.gate.revealed[0]) return;
    const [plan, rng] = botPlan(view, room.bot.level, room.bot.rng);
    room.bot.rng = rng;
    room.bot.planned = view.round;
    const nonce = `bot-${room.matchId}-${view.round}`;
    this.matchServer.submit(creds, {
      kind: 'plan',
      committed: {
        commitHash: commit(plan, nonce),
        nonce,
        plan,
        signature: signPlan(room.bot.key, plan, nonce),
      },
    });
  }

  // --- endings --------------------------------------------------------------

  private finishRoom(room: NetRoom): void {
    if (room.settled) return;
    room.settled = true;
    const state = this.matchServer.finishedState(room.matchId);
    const outcome = state?.outcome ?? null;
    this.log({ at: this.now(), type: 'result', matchId: room.matchId, outcome });
    for (const seat of [0, 1] as PlayerId[]) {
      const conn = room.conns[seat];
      if (!conn) continue;
      const view = this.viewFor(room, seat);
      if (!view) continue;
      this.send(conn, {
        t: 'result',
        matchId: room.matchId,
        round: view.round,
        seq: ++room.seq,
        outcome,
        view,
      });
    }
    if (room.stake > 0 && this.chain.settle && state) {
      void this.chain
        .settle(room.matchId, outcome, state)
        .catch((err) =>
          this.log({ at: this.now(), type: 'chain-error', matchId: room.matchId, err: String(err) }),
        );
    }
    if (room.tournamentId) this.reportTournamentResult(room, outcome);
    // Seats are free again; the room stays for rejoin-to-read and disputes.
    for (const seat of [0, 1] as PlayerId[]) {
      const conn = room.conns[seat];
      if (conn) {
        conn.matchId = null;
        conn.seat = null;
      }
    }
  }

  // --- tournaments -----------------------------------------------------------

  private startTournament(stake: Stake, eight: QueueEntry[]): void {
    this.counter += 1;
    const id = `t${this.counter}`;
    const t: Tournament = {
      id,
      stake,
      bracket: newBracket(
        eight.map((q) => q.conn.name),
        stake,
      ),
      seats: eight.map((q) => q.conn),
      live: new Map(),
      seq: 0,
      settledSeats: new Set(),
    };
    this.tournaments.set(id, t);
    this.log({ at: this.now(), type: 'bracket-created', tournamentId: id, stake, names: t.bracket.entrants });
    this.advanceTournament(t, eight);
  }

  /** Start every playable match whose two bracket seats are idle. */
  private advanceTournament(t: Tournament, entries?: QueueEntry[]): void {
    for (let index = 0; index < t.bracket.matches.length; index++) {
      const m = t.bracket.matches[index];
      if (m.winner !== null || m.seats[0] === null || m.seats[1] === null) continue;
      if ([...t.live.values()].some((l) => l.matchIndex === index)) continue;
      const a = t.seats[m.seats[0]];
      const b = t.seats[m.seats[1]];
      if (!a || !b) {
        // A vanished entrant forfeits the bracket match outright.
        const winnerSeat = a ? m.seats[0] : m.seats[1];
        if (winnerSeat === null) continue;
        t.bracket = reportResult(t.bracket, index, winnerSeat);
        continue;
      }
      const qa: QueueEntry = { conn: a, mode: 'tournament', stake: t.stake, rating: 0, provisional: false, since: this.now() };
      const qb: QueueEntry = { conn: b, mode: 'tournament', stake: t.stake, rating: 0, provisional: false, since: this.now() };
      void entries;
      const room = this.startMatch(qa, qb, t.id, index);
      t.live.set(m.seats[0], { matchId: room.matchId, matchIndex: index });
      t.live.set(m.seats[1], { matchId: room.matchId, matchIndex: index });
      this.log({
        at: this.now(),
        type: 'bracket-match',
        tournamentId: t.id,
        matchId: room.matchId,
        round: roundOf(index),
        seats: m.seats,
      });
    }
    this.broadcastBracket(t);
  }

  private reportTournamentResult(room: NetRoom, outcome: Outcome | null): void {
    const t = room.tournamentId ? this.tournaments.get(room.tournamentId) : null;
    if (!t) return;
    const entry = [...t.live.entries()].find(([, l]) => l.matchId === room.matchId);
    if (!entry) return;
    const matchIndex = entry[1].matchIndex;
    const m = t.bracket.matches[matchIndex];
    for (const [seat, l] of [...t.live.entries()]) {
      if (l.matchId === room.matchId) t.live.delete(seat);
    }
    let winnerSeat: number | null = null;
    if (outcome?.kind === 'win') {
      // Room seat 0/1 map onto the bracket seats in declaration order.
      winnerSeat = outcome.winner === 0 ? m.seats[0] : m.seats[1];
    } else {
      // A drawn bracket match is sudden death: replay the pairing.
      this.log({ at: this.now(), type: 'bracket-sudden-death', tournamentId: t.id, matchIndex });
      this.advanceTournament(t);
      return;
    }
    if (winnerSeat === null) return;
    t.bracket = reportResult(t.bracket, matchIndex, winnerSeat);
    const final = standings(t.bracket);
    if (final && this.chain.settleBracket) {
      const places: [number, number, number, number] = [
        final.champion,
        final.runnerUp,
        final.semiLosers[0],
        final.semiLosers[1],
      ];
      void this.chain
        .settleBracket(t.id, places, t.bracket.entrants, t.stake)
        .catch((err) =>
          this.log({ at: this.now(), type: 'chain-error', tournamentId: t.id, err: String(err) }),
        );
    }
    this.advanceTournament(t);
  }

  private broadcastBracket(t: Tournament): void {
    const final = standings(t.bracket);
    for (let seat = 0; seat < t.seats.length; seat++) {
      const conn = t.seats[seat];
      if (!conn) continue;
      const liveMatch = t.live.get(seat);
      const room = liveMatch ? this.rooms.get(liveMatch.matchId) : null;
      const roomSeat = room ? (room.conns[0] === conn ? 0 : 1) : null;
      let place: 'champion' | 'runnerUp' | 'semiLoser' | 'out' | null = null;
      if (final) {
        place =
          final.champion === seat
            ? 'champion'
            : final.runnerUp === seat
              ? 'runnerUp'
              : final.semiLosers.includes(seat)
                ? 'semiLoser'
                : 'out';
      } else {
        // Knocked out before the final finished?
        const lost = t.bracket.matches.some(
          (m) => m.winner !== null && m.seats.includes(seat) && m.winner !== seat,
        );
        if (lost) {
          const lostIn = t.bracket.matches.findIndex(
            (m) => m.winner !== null && m.seats.includes(seat) && m.winner !== seat,
          );
          place = lostIn < 4 ? 'out' : lostIn < FINAL ? 'semiLoser' : 'runnerUp';
        }
      }
      this.send(conn, {
        t: 'bracketState',
        seq: ++t.seq,
        stake: t.stake,
        bracket: t.bracket,
        yourSeat: seat,
        play:
          room && roomSeat !== null && !room.settled
            ? {
                matchId: room.matchId,
                seat: roomSeat,
                token: room.creds[roomSeat].token,
                opponent: room.names[other(roomSeat)],
              }
            : null,
        place,
      });
    }
  }

  // --- introspection for tests and health ------------------------------------

  stats(): { connections: number; queued: number; rooms: number; tournaments: number } {
    return {
      connections: this.conns.size,
      queued: this.queue.length,
      rooms: this.rooms.size,
      tournaments: this.tournaments.size,
    };
  }

  /** Raw room state — test-only, for asserting what the server holds. */
  roomState(matchId: string): MatchState | null {
    const room = this.rooms.get(matchId);
    if (!room) return null;
    const inputs = this.matchServer.transcriptInputs(matchId);
    return inputs?.state ?? null;
  }

  viewOf(matchId: string, seat: PlayerId): ClientView | null {
    const inputs = this.matchServer.transcriptInputs(matchId);
    return inputs ? clientView(inputs.state, seat) : null;
  }
}

// Signature over the bare commit hash string, matching signPlan's artifact.
import nacl from 'tweetnacl';
import { unhex } from '../../chain/sessionKey';

function verifyPayloadSignatureOverHash(
  publicKeyHex: string,
  signatureHex: string,
  hash: string,
): boolean {
  try {
    return nacl.sign.detached.verify(
      new TextEncoder().encode(hash),
      unhex(signatureHex),
      unhex(publicKeyHex),
    );
  } catch {
    return false;
  }
}
