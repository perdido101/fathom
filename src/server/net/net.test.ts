import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { NetServer } from './netServer';
import { NetClient } from './netClient';
import { PROTOCOL_VERSION, type ServerMessage } from './protocol';
import { issueSessionKey, signPayload } from '../../chain/sessionKey';
import { autoDeploy } from '../../engine/board';
import { seedRng } from '../../engine/rng';
import { emptyPlan, type Plan } from '../../engine/types';
import type { Outcome } from '../../engine/types';

/**
 * The wire, exercised adversarially.
 *
 * Everything here runs over a real WebSocket against the real server — no
 * in-process shortcuts. The clients are the same `NetClient` the acceptance
 * tests and the browser use, driven as honest players, cheats, and ghosts.
 */

const servers: NetServer[] = [];
const clients: NetClient[] = [];

function startServer(opts: Partial<ConstructorParameters<typeof NetServer>[0]> = {}): NetServer {
  const server = new NetServer({
    port: 0,
    tickMs: 25,
    casualBotAfterMs: 500,
    queueTimeoutMs: 1_500,
    draftSeconds: 8,
    deploySeconds: 8,
    planSeconds: 8,
    revealSeconds: 1,
    ...opts,
  });
  servers.push(server);
  return server;
}

function makeClient(server: NetServer, name: string): NetClient {
  const client = new NetClient({
    url: `ws://127.0.0.1:${server.address()}`,
    name,
    sessionKey: issueSessionKey(Date.now() + Math.random() * 1000),
    makeSocket: (url) => new WebSocket(url) as never,
  });
  clients.push(client);
  return client;
}

afterEach(() => {
  for (const c of clients.splice(0)) c.close();
  for (const s of servers.splice(0)) s.close();
});

async function pairUp(server: NetServer, names: [string, string] = ['alice', 'bob']) {
  const a = makeClient(server, names[0]);
  const b = makeClient(server, names[1]);
  await a.connect();
  await b.connect();
  a.queue('casual', 0);
  b.queue('casual', 0);
  await a.waitFor((m) => m.t === 'matchFound');
  await b.waitFor((m) => m.t === 'matchFound');
  return { a, b };
}

/** Pick through both drafts, avoiding collisions so nothing goes public. */
async function draftApart(a: NetClient, b: NetClient): Promise<void> {
  for (const kind of ['ship', 'card'] as const) {
    for (let pack = 0; pack < 3; pack++) {
      await a.waitFor(
        (m) =>
          m.t === 'state' &&
          m.phase === `${kind}Draft` &&
          m.view[`${kind}Draft`].index === pack &&
          m.view[`${kind}Draft`].myPicks[pack] === null,
      );
      const options = a.view![`${kind}Draft`].packs[pack];
      if (kind === 'ship') {
        a.pickShip(options[0]);
        b.pickShip(options[1]);
      } else {
        a.pickCard(options[0]);
        b.pickCard(options[1]);
      }
      await a.waitFor(
        (m) =>
          m.t === 'state' &&
          (m.view[`${kind}Draft`].index > pack ||
            m.view[`${kind}Draft`].done ||
            m.phase !== `${kind}Draft`),
      );
    }
  }
}

async function deployBoth(a: NetClient, b: NetClient): Promise<void> {
  for (const [i, c] of [a, b].entries()) {
    await c.waitFor((m) => m.t === 'state' && m.phase === 'deploy');
    const [placements] = autoDeploy(c.view!.me.draftedShips, seedRng(`net-test-${i}`));
    c.deploy(placements, `nonce-${i}`);
  }
  await a.waitFor((m) => m.t === 'state' && m.phase === 'battle');
  await b.waitFor((m) => m.t === 'state' && m.phase === 'battle');
}

function basicPlan(c: NetClient, cell: number): Plan {
  const hand = c.view!.me.hand;
  return {
    ...emptyPlan(),
    chargeTo: hand[0]?.uid ?? null,
    bonusTo: hand[0]?.uid ?? null,
    basic: cell,
  };
}

/** Play whole rounds of basic shots until the match ends or maxRounds. */
async function playOut(a: NetClient, b: NetClient, maxRounds = 24): Promise<Outcome | null> {
  for (let i = 0; i < maxRounds; i++) {
    if (a.view?.phase === 'over') break;
    const round = a.view!.round;
    await Promise.all([
      a.playPlan(basicPlan(a, (i * 2 + 1) % 36), `na${i}`),
      b.playPlan(basicPlan(b, (i * 2) % 36), `nb${i}`),
    ]);
    await Promise.all(
      [a, b].map((c) =>
        c.waitFor((m) => (m.t === 'roundReport' && m.round > round) || m.t === 'result', 20_000),
      ),
    );
    // The view mutates inside the client, which TS's narrowing cannot see.
    if ((a.view?.phase as string) === 'over') break;
  }
  const done = (await a.waitFor((m) => m.t === 'result', 20_000)) as Extract<
    ServerMessage,
    { t: 'result' }
  >;
  return done.outcome;
}

describe('connect authentication', () => {
  it('refuses a hello whose challenge signature does not verify', async () => {
    const server = startServer();
    const ws = new WebSocket(`ws://127.0.0.1:${server.address()}`);
    const key = issueSessionKey(1);
    const messages: ServerMessage[] = [];
    await new Promise<void>((resolve) => {
      ws.on('message', (d) => {
        const m = JSON.parse(String(d)) as ServerMessage;
        messages.push(m);
        if (m.t === 'challenge') {
          ws.send(
            JSON.stringify({
              t: 'hello',
              v: PROTOCOL_VERSION,
              name: 'mallory',
              sessionPublicKey: key.publicKeyHex,
              signature: signPayload(key, { challenge: 'not-the-challenge' }),
            }),
          );
        }
        if (m.t === 'error') resolve();
      });
    });
    expect(messages.some((m) => m.t === 'error' && m.code === 'bad-signature')).toBe(true);
    ws.close();
  });

  it('refuses a protocol version it does not speak', async () => {
    const server = startServer();
    const ws = new WebSocket(`ws://127.0.0.1:${server.address()}`);
    const key = issueSessionKey(2);
    const err = await new Promise<ServerMessage>((resolve) => {
      ws.on('message', (d) => {
        const m = JSON.parse(String(d)) as ServerMessage;
        if (m.t === 'challenge') {
          ws.send(
            JSON.stringify({
              t: 'hello',
              v: 999,
              name: 'timetraveller',
              sessionPublicKey: key.publicKeyHex,
              signature: signPayload(key, { challenge: m.nonce }),
            }),
          );
        }
        if (m.t === 'error') resolve(m);
      });
    });
    expect(err.t === 'error' && err.code === 'version').toBe(true);
    ws.close();
  });
});

describe('matchmaking', () => {
  it('pairs two simultaneous queuers in the same tier', async () => {
    const server = startServer();
    const { a, b } = await pairUp(server);
    expect(a.match).not.toBeNull();
    expect(b.match).not.toBeNull();
    expect(a.match!.matchId).toBe(b.match!.matchId);
    expect(a.match!.seat).not.toBe(b.match!.seat);
  });

  it('never pairs across tiers', async () => {
    const server = startServer({ queueTimeoutMs: 700 });
    const a = makeClient(server, 'low');
    const b = makeClient(server, 'high');
    await a.connect();
    await b.connect();
    a.queue('arena', 0.05);
    b.queue('arena', 0.1);
    const out = await Promise.all([
      a.waitFor((m) => m.t === 'queueTimeout' || m.t === 'matchFound', 5_000),
      b.waitFor((m) => m.t === 'queueTimeout' || m.t === 'matchFound', 5_000),
    ]);
    expect(out.every((m) => m.t === 'queueTimeout')).toBe(true);
  });

  it('keeps rating bands apart until the wait widens them', async () => {
    const server = startServer({ queueTimeoutMs: 60_000 });
    const a = makeClient(server, 'novice');
    const b = makeClient(server, 'master');
    await a.connect();
    await b.connect();
    a.queue('arena', 0.05, 900);
    b.queue('arena', 0.05, 2200);
    // 1300 apart, bands 120+120: no instant pair.
    let paired = false;
    a.waitFor((m) => m.t === 'matchFound', 60_000)
      .then(() => {
        paired = true;
      })
      .catch(() => undefined);
    await new Promise((r) => setTimeout(r, 600));
    expect(paired).toBe(false);
  });

  it('refuses a provisional player above the lowest staked tier', async () => {
    const server = startServer();
    const a = makeClient(server, 'newbie');
    await a.connect();
    a.send({ t: 'queueEnter', mode: 'arena', stake: 0.5, rating: 1200, provisional: true });
    const err = await a.waitFor((m) => m.t === 'error');
    expect(err.t === 'error' && err.code === 'provisional').toBe(true);
  });

  it('falls back to a bot in casual, and tells the client it is a bot', async () => {
    const server = startServer({ casualBotAfterMs: 200 });
    const a = makeClient(server, 'loner');
    await a.connect();
    a.queue('casual', 0);
    const found = (await a.waitFor((m) => m.t === 'matchFound', 5_000)) as Extract<
      ServerMessage,
      { t: 'matchFound' }
    >;
    expect(found.vsBot).toBe(true);
  });

  it('never gives a staked player a bot — the queue times out loudly instead', async () => {
    const server = startServer({ casualBotAfterMs: 100, queueTimeoutMs: 500 });
    const a = makeClient(server, 'whale');
    await a.connect();
    a.queue('arena', 0.05);
    const out = await a.waitFor((m) => m.t === 'queueTimeout' || m.t === 'matchFound', 5_000);
    expect(out.t).toBe('queueTimeout');
  });
});

describe('commit-reveal over the wire', () => {
  async function toBattle(server: NetServer) {
    const { a, b } = await pairUp(server);
    await draftApart(a, b);
    await deployBoth(a, b);
    return { a, b };
  }

  it('holds both hashes before either reveal opens', async () => {
    const server = startServer();
    const { a, b } = await toBattle(server);
    const plan = basicPlan(a, 3);
    const { commit } = await import('../../engine/sha256');
    a.flush();
    a.send({
      t: 'planCommit',
      matchId: a.match!.matchId,
      round: a.view!.round,
      hash: commit(plan, 'n1'),
      signature: null,
    });
    // One commit in: reveals must NOT open for anyone.
    let opened = false;
    a.waitFor((m) => m.t === 'revealOpen', 60_000)
      .then(() => {
        opened = true;
      })
      .catch(() => undefined);
    await new Promise((r) => setTimeout(r, 400));
    expect(opened).toBe(false);
    // An early reveal is refused outright.
    a.send({ t: 'planReveal', matchId: a.match!.matchId, round: a.view!.round, plan, nonce: 'n1' });
    const early = await a.waitFor((m) => m.t === 'error');
    expect(early.t === 'error' && early.code === 'reveal-closed').toBe(true);
    // The opponent commits; now both reveal and the round resolves.
    const planB = basicPlan(b, 5);
    b.send({
      t: 'planCommit',
      matchId: b.match!.matchId,
      round: b.view!.round,
      hash: commit(planB, 'n2'),
      signature: null,
    });
    await a.waitFor((m) => m.t === 'revealOpen');
    a.send({ t: 'planReveal', matchId: a.match!.matchId, round: a.view!.round, plan, nonce: 'n1' });
    b.send({
      t: 'planReveal',
      matchId: b.match!.matchId,
      round: b.view!.round,
      plan: planB,
      nonce: 'n2',
    });
    await a.waitFor((m) => m.t === 'roundReport', 10_000);
  }, 30_000);

  it('rejects a second, different commit from the same seat', async () => {
    const server = startServer();
    const { a } = await toBattle(server);
    const { commit } = await import('../../engine/sha256');
    const plan = basicPlan(a, 3);
    a.send({
      t: 'planCommit',
      matchId: a.match!.matchId,
      round: a.view!.round,
      hash: commit(plan, 'x'),
      signature: null,
    });
    a.send({
      t: 'planCommit',
      matchId: a.match!.matchId,
      round: a.view!.round,
      hash: commit(plan, 'different'),
      signature: null,
    });
    const err = await a.waitFor((m) => m.t === 'error');
    expect(err.t === 'error' && err.code === 'double-commit').toBe(true);
  }, 30_000);

  it('discards a reveal that does not match its commit, and the seat lapses', async () => {
    const server = startServer({ revealSeconds: 1 });
    const { a, b } = await toBattle(server);
    const { commit } = await import('../../engine/sha256');
    const round = a.view!.round;
    const honest = basicPlan(b, 6);
    const cheatCommit = basicPlan(a, 3);
    const cheatReveal = basicPlan(a, 35); // not what was committed
    a.send({
      t: 'planCommit',
      matchId: a.match!.matchId,
      round,
      hash: commit(cheatCommit, 'c'),
      signature: null,
    });
    b.send({
      t: 'planCommit',
      matchId: b.match!.matchId,
      round,
      hash: commit(honest, 'h'),
      signature: null,
    });
    await a.waitFor((m) => m.t === 'revealOpen');
    a.send({ t: 'planReveal', matchId: a.match!.matchId, round, plan: cheatReveal, nonce: 'c' });
    const err = await a.waitFor((m) => m.t === 'error');
    expect(err.t === 'error' && err.code === 'reveal-mismatch').toBe(true);
    b.send({ t: 'planReveal', matchId: b.match!.matchId, round, plan: honest, nonce: 'h' });
    // The cheat lapses at the reveal deadline; the round still resolves, and
    // the cheat's substitute is the engine's timeout plan, not its secret one.
    const report = (await a.waitFor(
      (m) => m.t === 'roundReport' && m.round > round,
      15_000,
    )) as Extract<ServerMessage, { t: 'roundReport' }>;
    expect(report.round).toBe(round + 1);
    expect(a.view!.me.timerStrikes).toBeGreaterThanOrEqual(1);
  }, 30_000);

  it('lets a committed seat resolve against a ghost that never commits', async () => {
    const server = startServer({ planSeconds: 1, revealSeconds: 1 });
    const { a, b } = await toBattle(server);
    const round = a.view!.round;
    // b says nothing at all this round.
    void b;
    await a.playPlan(basicPlan(a, 4), 'alive');
    const report = (await a.waitFor(
      (m) => (m.t === 'roundReport' && m.round > round) || m.t === 'result',
      15_000,
    )) as Extract<ServerMessage, { t: 'roundReport' }>;
    expect(report.t).toBe('roundReport');
  }, 30_000);
});

describe('a full match over the wire', () => {
  it('plays queue to result with server-held state and verifies at the end', async () => {
    const server = startServer();
    const { a, b } = await pairUp(server);
    await draftApart(a, b);
    await deployBoth(a, b);
    const outcome = await playOut(a, b);
    expect(outcome).not.toBeNull();
    expect(a.view!.phase).toBe('over');
    expect(b.view!.phase).toBe('over');
    // The server's finished state agrees with both clients' final views.
    const state = server.matchServer.finishedState(a.match!.matchId);
    expect(state?.outcome).toEqual(outcome);
  }, 60_000);
});

describe('reconnection', () => {
  async function dropAndRejoin(server: NetServer, c: NetClient, name: string): Promise<NetClient> {
    const match = c.match!;
    const viewBefore = c.view;
    c.close();
    await new Promise((r) => setTimeout(r, 150));
    const again = makeClient(server, name);
    await again.connect();
    again.send({ t: 'rejoin', matchId: match.matchId, seat: match.seat, token: match.token });
    const state = (await again.waitFor((m) => m.t === 'state')) as Extract<
      ServerMessage,
      { t: 'state' }
    >;
    again.match = match;
    // The resync is from the server, and it is at least as new as what the
    // dropped client had.
    expect(state.view.round).toBeGreaterThanOrEqual(viewBefore?.round ?? 1);
    expect(state.view.phase).toBeTruthy();
    return again;
  }

  it('rejoins mid-draft with a full server resync', async () => {
    const server = startServer();
    const { a, b } = await pairUp(server);
    await a.waitFor((m) => m.t === 'state' && m.phase === 'shipDraft');
    const a2 = await dropAndRejoin(server, a, 'alice');
    expect(a2.view!.phase).toBe('shipDraft');
    void b;
  }, 30_000);

  it('rejoins mid-deploy and mid-plan, and the match plays on to a result', async () => {
    const server = startServer();
    const { a, b } = await pairUp(server);
    await draftApart(a, b);
    await a.waitFor((m) => m.t === 'state' && m.phase === 'deploy');
    const a2 = await dropAndRejoin(server, a, 'alice');
    expect(a2.view!.phase).toBe('deploy');
    await deployBoth(a2, b);
    // Mid-plan: drop after committing, rejoin, replay the round.
    const a3 = await dropAndRejoin(server, a2, 'alice');
    expect(a3.view!.phase).toBe('battle');
    const outcome = await playOut(a3, b);
    expect(outcome).not.toBeNull();
  }, 90_000);

  it('rejoins mid-resolve: the state message carries the missed beats', async () => {
    const server = startServer();
    const { a, b } = await pairUp(server);
    await draftApart(a, b);
    await deployBoth(a, b);
    const round = a.view!.round;
    await Promise.all([
      a.playPlan(basicPlan(a, 1), 'r1a'),
      b.playPlan(basicPlan(b, 2), 'r1b'),
    ]);
    await a.waitFor((m) => m.t === 'roundReport' && m.round > round, 15_000);
    const match = b.match!;
    b.close();
    await new Promise((r) => setTimeout(r, 150));
    const b2 = makeClient(server, 'bob');
    await b2.connect();
    b2.send({ t: 'rejoin', matchId: match.matchId, seat: match.seat, token: match.token });
    const state = (await b2.waitFor((m) => m.t === 'state')) as Extract<
      ServerMessage,
      { t: 'state' }
    >;
    expect(state.events.length).toBeGreaterThan(0);
  }, 60_000);

  it('forfeits a seat that never comes back, and the opponent wins', async () => {
    // The grace period lives in the match config (60s); rather than waiting,
    // the injected server clock jumps past it once the seat has dropped.
    let offset = 0;
    const server = startServer({ now: () => Date.now() + offset });
    const { a, b } = await pairUp(server);
    await draftApart(a, b);
    await deployBoth(a, b);
    b.close();
    await new Promise((r) => setTimeout(r, 200));
    offset = 120_000;
    const result = (await a.waitFor((m) => m.t === 'result', 15_000)) as Extract<
      ServerMessage,
      { t: 'result' }
    >;
    expect(result.outcome?.kind === 'win' && result.outcome.winner === a.match!.seat).toBe(true);
    expect(result.outcome?.kind === 'win' && result.outcome.reason === 'disconnect').toBe(true);
  }, 60_000);
});

describe('what actually travels', () => {
  it('never ships placements, pile order, plans, or unrevealed identities', async () => {
    const server = startServer();
    const { a, b } = await pairUp(server);
    await draftApart(a, b); // deliberately collision-free: nothing goes public
    await deployBoth(a, b);
    // Play a few rounds of basic shots — no card fires, no abilities, so no
    // foe identity is ever legitimately revealed before the end.
    for (let i = 0; i < 3; i++) {
      const round = a.view!.round;
      await Promise.all([
        a.playPlan(basicPlan(a, i * 3), `la${i}`),
        b.playPlan(basicPlan(b, i * 3 + 1), `lb${i}`),
      ]);
      await Promise.all(
        [a, b].map((c) =>
          c.waitFor((m) => (m.t === 'roundReport' && m.round > round) || m.t === 'result', 15_000),
        ),
      );
      if ((a.view?.phase as string) === 'over') break;
    }

    const state = server.roomState(a.match!.matchId);
    expect(state).not.toBeNull();
    const seatA = a.match!.seat;
    const foeOfA = state!.players[seatA === 0 ? 1 : 0];
    const mineA = state!.players[seatA];

    // Frames delivered to A, up to (not including) any result frame — the
    // final reveal is legitimate.
    const preResult = a.raw.filter((f) => !f.includes('"t":"result"'));
    const joined = preResult.join('\n');

    // 1. The pile order is the whole secret; only a count may travel.
    expect(joined).not.toContain('"pile":[');
    for (const frame of preResult) {
      expect(frame).not.toContain(JSON.stringify(state!.pile));
    }
    // 2. No opponent plan object ever travels — resolve events only.
    expect(joined).not.toContain('"plan":{');
    expect(joined).not.toContain('"chargeTo"');
    // 3. No placements payload is ever echoed to anyone.
    expect(joined).not.toContain('"placements"');
    // 4. The opponent's unrevealed ship and hand identities never appear.
    // draftApart made the picks disjoint, so the opponent's ship identities
    // exist nowhere legitimate in A's traffic outside the public pack lists.
    for (const ship of foeOfA.ships) {
      expect(joined).not.toContain(`"defId":"${ship.defId}"`);
    }
    const foeHandFrames = preResult.filter((f) => f.includes('"foe"'));
    for (const f of foeHandFrames) {
      const parsed = JSON.parse(f) as { view?: { foe?: { hand?: { defId: string | null }[] } } };
      for (const c of parsed.view?.foe?.hand ?? []) {
        expect(c.defId).toBeNull();
      }
    }
    // 5. The opponent's deployment cells are never in A's frames as a ship
    //    cell list (A's own ships legitimately carry cells).
    for (const ship of foeOfA.ships) {
      expect(joined).not.toContain(JSON.stringify(ship.cells));
    }
    void mineA;
  }, 60_000);
});
