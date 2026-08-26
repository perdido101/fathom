import { NetClient } from '../server/net/netClient';
import type { ServerMessage } from '../server/net/protocol';
import { issueSessionKey } from '../chain/sessionKey';
import { useStore } from './store';
import type { Mode, Stake } from './profile';
import type { Plan } from '../engine/types';
import { Sound } from '../ui/sfx/SoundManager';

/**
 * The browser's side of the wire.
 *
 * When a server URL is configured (`VITE_WS`, or `?ws=` in the address bar),
 * the queue buttons connect here instead of spinning up the local bot match.
 * The screens do not know the difference: they render `view()` and call the
 * same actions; this module reroutes those actions onto the socket and feeds
 * the server's views back into the store. The client asserts nothing — it
 * cannot: every message it sends is an intent, and everything it renders
 * came back from the authority.
 *
 * The five connection states the UI owes the player — connecting, online,
 * reconnecting, lost, and server error — live in `store.net`, and the
 * server's deadline drives the displayed clock as an estimate only.
 */

export interface NetState {
  status: 'off' | 'connecting' | 'online' | 'reconnecting' | 'lost';
  queueState: 'idle' | 'waiting' | 'timeout';
  oppConnected: boolean;
  lastServerError: string | null;
  /** True while match state comes from the server, not the local engine. */
  remote: boolean;
}

export const offNet: NetState = {
  status: 'off',
  queueState: 'idle',
  oppConnected: true,
  lastServerError: null,
  remote: false,
};

let client: NetClient | null = null;
let rejoinTimer: ReturnType<typeof setTimeout> | null = null;

export function netUrl(): string | null {
  const env = (import.meta as unknown as { env?: Record<string, string> }).env ?? {};
  if (env.VITE_WS) return env.VITE_WS;
  if (typeof location !== 'undefined') {
    const q = new URLSearchParams(location.search).get('ws');
    if (q) return q;
  }
  return null;
}

export function netAvailable(): boolean {
  return netUrl() !== null;
}

function patchNet(patch: Partial<NetState>): void {
  const s = useStore.getState();
  useStore.setState({ net: { ...s.net, ...patch } });
}

/** Connect (or reuse) the socket, and start the message pump. */
export async function connectNet(): Promise<NetClient> {
  if (client && !client.closed) return client;
  const url = netUrl();
  if (!url) throw new Error('no server configured');
  patchNet({ status: 'connecting', lastServerError: null });
  const c = new NetClient({
    url,
    name: useStore.getState().profile.name,
    sessionKey: issueSessionKey(Date.now()),
  });
  client = c;
  pump(c);
  await c.connect();
  patchNet({ status: 'online' });
  return c;
}

function pump(c: NetClient): void {
  const forward = (m: ServerMessage): void => onServerMessage(c, m);
  // The client buffers everything; poll the inbox through waitFor chains.
  const loop = async (): Promise<void> => {
    let seen = 0;
    for (;;) {
      if (c.closed) return;
      await c.waitFor(() => c.inbox.length > seen, 3_600_000).catch(() => undefined);
      if (c.closed) return;
      while (seen < c.inbox.length) forward(c.inbox[seen++]);
    }
  };
  void loop();
  // Reconnect posture: if the socket drops mid-match, try to rejoin.
  const watchClose = async (): Promise<void> => {
    for (;;) {
      await new Promise((r) => setTimeout(r, 500));
      if (!c.closed) continue;
      if (client !== c) return;
      const match = c.match;
      if (match && useStore.getState().net.remote) {
        patchNet({ status: 'reconnecting' });
        rejoinTimer = setTimeout(() => void tryRejoin(match), 700);
      } else {
        patchNet({ status: 'lost' });
      }
      return;
    }
  };
  void watchClose();
}

async function tryRejoin(match: { matchId: string; seat: 0 | 1; token: string }): Promise<void> {
  try {
    const c = await connectNet();
    c.match = match;
    c.send({ t: 'rejoin', matchId: match.matchId, seat: match.seat, token: match.token });
    await c.waitFor((m) => m.t === 'state' || (m.t === 'error' && m.matchId === match.matchId));
    if (c.lastError?.code === 'rejoin-refused' || c.lastError?.code === 'no-match') {
      patchNet({ status: 'online', remote: false });
      useStore.setState({ screen: 'menu' });
      useStore
        .getState()
        .fail('The match could not be rejoined', c.lastError.message);
      return;
    }
    patchNet({ status: 'online' });
  } catch {
    patchNet({ status: 'lost' });
    rejoinTimer = setTimeout(() => void tryRejoin(match), 2_000);
  }
}

function onServerMessage(c: NetClient, m: ServerMessage): void {
  const store = useStore.getState();
  switch (m.t) {
    case 'queued':
      patchNet({ queueState: 'waiting' });
      return;
    case 'queueTimeout':
      patchNet({ queueState: 'timeout' });
      useStore.setState({ busy: null });
      store.fail('Nobody joined in time', m.reason, () => {
        void queueNet(m.mode, m.stake);
      });
      return;
    case 'matchFound':
      patchNet({ queueState: 'idle', remote: true, oppConnected: true });
      useStore.setState({
        busy: null,
        mode: m.mode,
        stake: m.stake,
        match: null,
        playback: null,
        lastRoundEvents: [],
        lastTx: null,
        chainNotice: m.vsBot ? 'casual vs server bot' : `vs ${m.opponent} over the wire`,
        screen: 'shipDraft',
      });
      Sound.play('round-start');
      return;
    case 'state': {
      useStore.setState({ remoteView: m.view, netDeadlineAt: m.deadlineAt });
      patchNet({ oppConnected: m.opponentConnected });
      const screen = useStore.getState().screen;
      const want =
        m.phase === 'shipDraft'
          ? 'shipDraft'
          : m.phase === 'cardDraft'
            ? 'cardDraft'
            : m.phase === 'deploy'
              ? 'deploy'
              : m.phase === 'battle'
                ? 'battle'
                : null;
      if (want && screen !== want && useStore.getState().net.remote) {
        useStore.setState({ screen: want });
      }
      return;
    }
    case 'roundReport':
      useStore.setState({
        remoteView: m.view,
        lastRoundEvents: m.events,
        playback: useStore.getState().settings.fastResolve
          ? null
          : { events: m.events, index: 0 },
      });
      return;
    case 'result':
      useStore.setState({ remoteView: m.view, screen: 'netResult', playback: null });
      Sound.play(
        m.outcome?.kind === 'win'
          ? m.outcome.winner === m.view.you
            ? 'victory'
            : 'defeat'
          : 'draw',
      );
      patchNet({ remote: false });
      return;
    case 'oppStatus':
      patchNet({ oppConnected: m.connected });
      return;
    case 'error':
      patchNet({ lastServerError: `${m.code}: ${m.message}` });
      if (m.code === 'server-error') {
        store.fail('The server hit an internal error', m.message);
      }
      return;
    default:
      return;
  }
  void c;
}

/** Queue on the server. The screens call this through startMatch. */
export async function queueNet(mode: Mode, stake: Stake): Promise<void> {
  const store = useStore.getState();
  try {
    const c = await connectNet();
    useStore.setState({ busy: 'Finding an opponent on the server' });
    c.queue(mode, stake, store.profile.rating, store.profile.provisionalMatches < 10);
  } catch (err) {
    store.fail('Could not reach the server', err, () => void queueNet(mode, stake));
  }
}

export function netPickShip(defId: string): void {
  client?.pickShip(defId);
}

export function netPickCard(defId: string): void {
  client?.pickCard(defId);
}

export function netDeploy(placements: { defId: string; cells: number[] }[]): void {
  client?.deploy(placements, `web-${Date.now().toString(16)}`);
}

export function netPlan(plan: Plan): void {
  const nonce = `web-${Date.now().toString(16)}-${Math.floor(Math.random() * 1e9).toString(16)}`;
  void client?.playPlan(plan, nonce).catch(() => undefined);
}

export function netLeave(): void {
  if (client?.match) client.send({ t: 'leave', matchId: client.match.matchId });
  if (rejoinTimer) clearTimeout(rejoinTimer);
  patchNet({ remote: false, queueState: 'idle' });
}
