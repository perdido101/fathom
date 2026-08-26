import type { ClientMessage, ServerMessage } from './protocol';
import { PROTOCOL_VERSION } from './protocol';
import { commit } from '../../engine/sha256';
import type { Plan, PlayerId } from '../../engine/types';
import type { ClientView } from '../../engine/view';
import { signPayload, signPlan, type SessionKey } from '../../chain/sessionKey';
import type { Mode, Stake } from '../../state/profile';

/**
 * The client side of the wire, shared by the browser and the headless
 * acceptance tests. It renders nothing and decides nothing: it holds the
 * latest view the server sent, answers the connect challenge with its
 * session key, and turns a `Plan` into the commit-then-reveal pair the
 * protocol demands.
 *
 * Every inbound frame is kept verbatim in `raw` — that is what the leak
 * test reads when it asserts the server never shipped a hidden field.
 */

type WsLike = {
  send(data: string): void;
  close(): void;
  addEventListener(ev: string, fn: (e: { data?: unknown }) => void): void;
};

export interface NetClientOptions {
  url: string;
  name: string;
  sessionKey: SessionKey;
  /** Node passes `ws`; the browser default is the global WebSocket. */
  makeSocket?: (url: string) => WsLike;
}

export class NetClient {
  /** Every inbound frame, verbatim. The leak test inspects these. */
  readonly raw: string[] = [];
  readonly inbox: ServerMessage[] = [];
  view: ClientView | null = null;
  match: { matchId: string; seat: PlayerId; token: string } | null = null;
  lastError: Extract<ServerMessage, { t: 'error' }> | null = null;
  deadlineAt: number | null = null;
  closed = false;

  private ws: WsLike | null = null;
  private waiters: {
    pred: (m: ServerMessage) => boolean;
    resolve: (m: ServerMessage) => void;
  }[] = [];

  constructor(private readonly opts: NetClientOptions) {}

  async connect(): Promise<void> {
    const make =
      this.opts.makeSocket ??
      ((url: string) => new (globalThis as { WebSocket: new (u: string) => WsLike }).WebSocket(url));
    this.ws = make(this.opts.url);
    // Listeners go on before the open await: the server's challenge can land
    // in the same event-loop turn as 'open', and a listener attached in a
    // microtask after that turn would miss it.
    this.ws.addEventListener('message', (e) => this.onFrame(String(e.data)));
    this.ws.addEventListener('close', () => {
      this.closed = true;
    });
    await new Promise<void>((resolve, reject) => {
      this.ws!.addEventListener('open', () => resolve());
      this.ws!.addEventListener('error', () => reject(new Error('websocket failed to open')));
    });
    const challenge = (await this.waitFor((m) => m.t === 'challenge')) as Extract<
      ServerMessage,
      { t: 'challenge' }
    >;
    this.send({
      t: 'hello',
      v: PROTOCOL_VERSION,
      name: this.opts.name,
      sessionPublicKey: this.opts.sessionKey.publicKeyHex,
      signature: signPayload(this.opts.sessionKey, { challenge: challenge.nonce }),
    });
    await this.waitFor((m) => m.t === 'welcome');
  }

  close(): void {
    this.ws?.close();
  }

  send(msg: ClientMessage): void {
    this.ws?.send(JSON.stringify(msg));
  }

  private onFrame(raw: string): void {
    this.raw.push(raw);
    let msg: ServerMessage;
    try {
      msg = JSON.parse(raw) as ServerMessage;
    } catch {
      return;
    }
    if (msg.t === 'state' || msg.t === 'update' || msg.t === 'roundReport' || msg.t === 'result') {
      this.view = msg.view;
    }
    if (msg.t === 'state') this.deadlineAt = msg.deadlineAt;
    if (msg.t === 'matchFound') {
      this.match = { matchId: msg.matchId, seat: msg.seat, token: msg.token };
    }
    if (msg.t === 'error') this.lastError = msg;
    this.inbox.push(msg);
    for (const w of this.waiters.slice()) {
      if (w.pred(msg)) {
        this.waiters.splice(this.waiters.indexOf(w), 1);
        w.resolve(msg);
      }
    }
  }

  /** Resolve on the first buffered or future message the predicate accepts. */
  waitFor(pred: (m: ServerMessage) => boolean, timeoutMs = 15_000): Promise<ServerMessage> {
    const hit = this.inbox.find(pred);
    if (hit) return Promise.resolve(hit);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w.resolve !== wrapped);
        reject(new Error(`timed out waiting (${timeoutMs}ms)`));
      }, timeoutMs);
      const wrapped = (m: ServerMessage): void => {
        clearTimeout(timer);
        resolve(m);
      };
      this.waiters.push({ pred, resolve: wrapped });
    });
  }

  /** Drop buffered messages, so the next waitFor sees only what follows. */
  flush(): void {
    this.inbox.length = 0;
  }

  // --- conveniences the acceptance tests read like a script -----------------

  queue(mode: Mode, stake: Stake, rating = 1200, provisional = false): void {
    this.send({ t: 'queueEnter', mode, stake, rating, provisional });
  }

  pickShip(defId: string): void {
    if (!this.match) throw new Error('not in a match');
    this.send({ t: 'pickShip', matchId: this.match.matchId, defId });
  }

  pickCard(defId: string): void {
    if (!this.match) throw new Error('not in a match');
    this.send({ t: 'pickCard', matchId: this.match.matchId, defId });
  }

  deploy(placements: { defId: string; cells: number[] }[], nonce: string): void {
    if (!this.match) throw new Error('not in a match');
    this.send({ t: 'deploy', matchId: this.match.matchId, placements, nonce });
  }

  /** The two-phase plan: hash now, plan only after the server opens reveals. */
  async playPlan(plan: Plan, nonce: string): Promise<void> {
    if (!this.match) throw new Error('not in a match');
    const round = this.view?.round ?? 1;
    const hash = commit(plan, nonce);
    this.send({
      t: 'planCommit',
      matchId: this.match.matchId,
      round,
      hash,
      signature: signPlan(this.opts.sessionKey, plan, nonce),
    });
    await this.waitFor(
      (m) => m.t === 'revealOpen' && m.matchId === this.match?.matchId && m.round === round,
    );
    this.send({ t: 'planReveal', matchId: this.match.matchId, round, plan, nonce });
  }
}
