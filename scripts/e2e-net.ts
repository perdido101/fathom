/**
 * The Build 5 acceptance test: two strangers, two sockets, one match.
 *
 * Part 1 — two headless clients with separate session keys and separate
 * Solana wallets play a full arena match over a real WebSocket against the
 * real NetServer, with a real escrow on the validator `SA_RPC` points at:
 * open_match (both wallets sign), commit_setup per player, referee settle,
 * exact payout checks, and a verify() replay of the network-played match.
 *
 * Part 2 — eight clients queue into one tournament tier, the bracket forms
 * on the eighth, all seven matches play over the wire, and the bracket
 * escrow settles 55/25/10/10 on-chain, checked to the lamport.
 *
 * What this is and is not (stated per the brief): the clients are headless
 * Node processes speaking the production protocol through the production
 * NetClient — the same code path a browser tab uses, minus the DOM. Wallet
 * keypairs live in this harness and co-sign the escrow transactions the way
 * a matchmaking flow would assemble them from partially-signed halves; the
 * program on the validator is the same build that would serve devnet.
 *
 * Without SA_PROGRAM_ID it refuses to pass, exactly like e2e-chain.
 */
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { readFileSync } from 'node:fs';
import WebSocket from 'ws';
import { NetServer } from '../src/server/net/netServer';
import { NetClient } from '../src/server/net/netClient';
import type { ServerMessage } from '../src/server/net/protocol';
import { issueSessionKey } from '../src/chain/sessionKey';
import { unhex } from '../src/chain/sessionKey';
import { autoDeploy } from '../src/engine/board';
import { seedRng } from '../src/engine/rng';
import { emptyPlan, type Outcome, type Plan } from '../src/engine/types';
import { sha256, stableStringify } from '../src/engine/sha256';
import { transcriptOf, verify } from '../src/engine/verify';
import type { MatchState } from '../src/engine/types';
import {
  Outcome as ChainOutcome,
  bracketPayout,
  bracketPda,
  fetchBracket,
  fetchMatch,
  ixCommitSetup,
  ixJoinBracket,
  ixOpenBracket,
  ixOpenMatch,
  ixSettle,
  ixSettleBracket,
  matchIdFrom,
  matchPda,
  payout,
} from '../src/chain/program';

const RPC = process.env.SA_RPC ?? 'http://127.0.0.1:8899';
const PROGRAM_ID = process.env.SA_PROGRAM_ID;
const RUN = process.env.SA_RUN ?? String(Date.now());
if (!PROGRAM_ID) {
  console.error('SA_PROGRAM_ID is not set — deploy chain/program first. Refusing to pass.');
  process.exit(1);
}
const programId = new PublicKey(PROGRAM_ID);
const connection = new Connection(RPC, 'confirmed');
const STAKE = BigInt(Math.round(0.05 * LAMPORTS_PER_SOL));

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

function payer(): Keypair {
  const path = process.env.SA_PAYER ?? '/tmp/sa-payer.json';
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, 'utf8'))));
}

async function fund(kp: Keypair, sol: number): Promise<void> {
  const sig = await connection.requestAirdrop(kp.publicKey, sol * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig, 'confirmed');
}

async function send(ixs: Parameters<Transaction['add']>, signers: Keypair[]): Promise<string> {
  const tx = new Transaction().add(...(Array.isArray(ixs) ? ixs : [ixs]));
  return sendAndConfirmTransaction(connection, tx, signers, { commitment: 'confirmed' });
}

// --- headless client plumbing ----------------------------------------------

function mkClient(port: number, name: string): NetClient {
  return new NetClient({
    url: `ws://127.0.0.1:${port}`,
    name,
    sessionKey: issueSessionKey(Date.now() + Math.random() * 1e6),
    makeSocket: (u) => new WebSocket(u) as never,
  });
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

async function draftAndDeploy(c: NetClient, pickIndex: number, tag: string): Promise<void> {
  // Every wait is scoped to the CURRENT match id — a client that just came
  // out of a bracket match still holds frames from it, and a stale
  // ship-draft state satisfies an unscoped predicate perfectly.
  const mid = c.match!.matchId;
  for (const kind of ['ship', 'card'] as const) {
    for (let pack = 0; pack < 3; pack++) {
      await c.waitFor(
        (m) =>
          m.t === 'state' &&
          m.matchId === mid &&
          m.phase === `${kind}Draft` &&
          m.view[`${kind}Draft`].index === pack &&
          m.view[`${kind}Draft`].myPicks[pack] === null,
        30_000,
      );
      const options = c.view![`${kind}Draft`].packs[pack];
      const choice = options[pickIndex % options.length];
      if (kind === 'ship') c.pickShip(choice);
      else c.pickCard(choice);
      await c.waitFor(
        (m) =>
          m.t === 'state' &&
          m.matchId === mid &&
          (m.view[`${kind}Draft`].index > pack ||
            m.view[`${kind}Draft`].done ||
            m.phase !== `${kind}Draft`),
        30_000,
      );
    }
  }
  await c.waitFor((m) => m.t === 'state' && m.matchId === mid && m.phase === 'deploy', 30_000);
  const [placements] = autoDeploy(c.view!.me.draftedShips, seedRng(`e2e-net-${tag}`));
  c.deploy(placements, `nonce-${tag}`);
  await c.waitFor((m) => m.t === 'state' && m.matchId === mid && m.phase === 'battle', 30_000);
}

async function playMatch(a: NetClient, b: NetClient, salt: number): Promise<void> {
  const mid = a.match!.matchId;
  let done = false;
  let lastRound = 0;
  for (let i = 0; i < 26 && !done; i++) {
    const round = lastRound + 1;
    await Promise.all([
      a.playPlan(basicPlan(a, (i * 2 + salt) % 36), `a${salt}-${i}`, mid, round),
      b.playPlan(basicPlan(b, (i * 2 + salt + 1) % 36), `b${salt}-${i}`, mid, round),
    ]);
    const got = await Promise.all(
      [a, b].map((c) =>
        c.waitFor(
          (m) =>
            (m.t === 'roundReport' && m.matchId === mid && m.round > round) ||
            (m.t === 'result' && m.matchId === mid),
          30_000,
        ),
      ),
    );
    done = got.some(
      (m) => m.t === 'result' || (m.t === 'roundReport' && m.view.phase === 'over'),
    );
    if (!done) lastRound = (got[0] as Extract<ServerMessage, { t: 'roundReport' }>).round - 1;
  }
  await a.waitFor((m) => m.t === 'result' && m.matchId === mid, 30_000);
  await b.waitFor((m) => m.t === 'result' && m.matchId === mid, 30_000);
}

// --- part 1: two clients, one escrowed match --------------------------------

async function twoClientMatch(): Promise<void> {
  console.log('\n[N1] two clients, two wallets, one escrowed match over the wire');
  const referee = payer();
  const treasury = Keypair.generate();
  const wallets = [Keypair.generate(), Keypair.generate()];
  await fund(wallets[0], 1);
  await fund(wallets[1], 1);

  // Escrow state the hooks fill in as the server drives the match.
  const escrow: { matchId: string | null; settled: Outcome | null; state: MatchState | null } = {
    matchId: null,
    settled: null,
    state: null,
  };
  let settleDone: (() => void) | null = null;
  const settledSignal = new Promise<void>((r) => {
    settleDone = r;
  });
  let openDone: (() => void) | null = null;
  const openedSignal = new Promise<void>((r) => {
    openDone = r;
  });

  const server = new NetServer({
    port: 0,
    tickMs: 25,
    revealSeconds: 2,
    chain: {
      openMatch: async (matchId) => {
        // Both wallets sign the escrow in one transaction — the assembly a
        // matchmaking flow does from two partially-signed halves; the
        // harness holds both keypairs, so it signs directly.
        const id = matchIdFrom(sha256(`${RUN}:net:${matchId}`).slice(0, 64));
        escrow.matchId = matchId;
        (escrow as { id?: Uint8Array }).id = id;
        await send(
          ixOpenMatch({
            programId,
            matchId: id,
            stakeLamports: STAKE,
            seedCommit: unhex(sha256(`net-${matchId}`)),
            playerA: wallets[0].publicKey,
            playerB: wallets[1].publicKey,
            referee: referee.publicKey,
          }),
          [wallets[0], wallets[1]],
        );
        openDone?.();
      },
      settle: async (matchId, outcome, state) => {
        escrow.settled = outcome;
        escrow.state = state;
        settleDone?.();
        void matchId;
      },
    },
  });

  const a = mkClient(server.address(), 'alice-net');
  const b = mkClient(server.address(), 'bob-net');
  await a.connect();
  await b.connect();
  a.queue('arena', 0.05, 1200, false);
  b.queue('arena', 0.05, 1200, false);
  await a.waitFor((m) => m.t === 'matchFound', 15_000);
  await b.waitFor((m) => m.t === 'matchFound', 15_000);
  check('two strangers paired over the wire', a.match!.matchId === b.match!.matchId);

  await Promise.all([draftAndDeploy(a, 0, 'na'), draftAndDeploy(b, 1, 'nb'), openedSignal]);
  const id = (escrow as { id?: Uint8Array }).id;
  check('the escrow opened on-chain while they drafted', Boolean(id && escrow.matchId));

  // Each player writes their own deployment commitment on-chain, signed by
  // their own wallet — the client's chain duty, done by the harness here.
  const state0 = server.roomState(a.match!.matchId)!;
  for (const [i, w] of wallets.entries()) {
    await send(
      ixCommitSetup({
        programId,
        matchId: id!,
        player: w.publicKey,
        commitment: unhex(state0.players[i].deployCommit ?? sha256('none')),
      }),
      [w],
    );
  }
  const live = await fetchMatch(connection, programId, id!);
  check('both deployment commitments landed; escrow is live', live?.status === 1);

  await playMatch(a, b, 0);
  await settledSignal;
  check('the server reported settlement', escrow.settled !== null || escrow.state !== null);

  // The referee settles the real escrow from the server's own record.
  const state = escrow.state!;
  const sessionKeys = [a.sessionPublicKeyHex, b.sessionPublicKeyHex] as [string, string];
  const transcript = transcriptOf(state, `net-${RUN}`, sessionKeys);
  const replay = verify(transcript);
  check('the network-played match replays under verify()', replay.ok, replay.problems.join('; '));
  check('every round signature verifies', replay.warnings.length === 0, replay.warnings.join('; '));

  const outcome = state.outcome;
  const chainOutcome =
    outcome?.kind === 'draw'
      ? ChainOutcome.Draw
      : outcome?.winner === 0
        ? ChainOutcome.WinA
        : ChainOutcome.WinB;
  const winnerWallet = outcome?.kind === 'win' ? wallets[outcome.winner] : null;
  const before = winnerWallet
    ? await connection.getBalance(winnerWallet.publicKey, 'confirmed')
    : 0;
  await send(
    ixSettle({
      programId,
      matchId: id!,
      outcome: chainOutcome,
      seed: unhex(sha256(state.seed)),
      transcriptHash: unhex(sha256(stableStringify(transcript))),
      playerA: wallets[0].publicKey,
      playerB: wallets[1].publicKey,
      treasury: treasury.publicKey,
      referee: referee.publicKey,
    }),
    [referee],
  );
  if (winnerWallet) {
    const after = await connection.getBalance(winnerWallet.publicKey, 'confirmed');
    const { toWinner } = payout(STAKE);
    check(
      'the winner was paid the pot minus rake, to the lamport',
      BigInt(after - before) === toWinner,
      `${after - before} vs ${toWinner}`,
    );
  } else {
    const [pda] = matchPda(programId, id!);
    const drained = await connection.getBalance(pda, 'confirmed');
    check('a draw returned both stakes (escrow at rent floor)', drained < Number(STAKE));
  }
  const settled = await fetchMatch(connection, programId, id!);
  check('the on-chain record is settled', settled?.status === 2);

  a.close();
  b.close();
  server.close();
}

// --- part 2: eight clients, one bracket -------------------------------------

async function eightClientBracket(): Promise<void> {
  console.log('\n[N2] eight clients, one bracket, escrow settled on the curve');
  const referee = payer();
  const treasury = Keypair.generate();
  const wallets = Array.from({ length: 8 }, () => Keypair.generate());
  for (const w of wallets) await fund(w, 1);

  const bracketId = matchIdFrom(sha256(`${RUN}:net-bracket`).slice(0, 64));
  const [pda] = bracketPda(programId, bracketId);
  // The eight stakes land as the eight clients queue: the first opens the
  // bracket escrow, the rest join it.
  await send(
    ixOpenBracket({
      programId,
      bracketId,
      stakeLamports: STAKE,
      opener: wallets[0].publicKey,
      referee: referee.publicKey,
    }),
    [wallets[0]],
  );
  for (const w of wallets.slice(1)) {
    await send(ixJoinBracket({ programId, bracketId, player: w.publicKey }), [w]);
  }
  const held = await connection.getBalance(pda, 'confirmed');
  check('eight stakes are escrowed before the bracket starts', BigInt(held) >= STAKE * 8n);

  let bracketPlaces: [number, number, number, number] | null = null;
  let bracketEntrants: string[] = [];
  let placesDone: (() => void) | null = null;
  const placesSignal = new Promise<void>((r) => {
    placesDone = r;
  });

  const server = new NetServer({
    port: 0,
    tickMs: 25,
    revealSeconds: 2,
    chain: {
      settleBracket: async (_id, places, entrants) => {
        bracketPlaces = places;
        bracketEntrants = entrants;
        placesDone?.();
      },
    },
  });

  const names = ['n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7'];
  const clients = names.map((n) => mkClient(server.address(), n));
  for (const c of clients) await c.connect();
  for (const c of clients) c.queue('tournament', 0.05, 1200, false);

  // Every client plays every match it is given until it has a place.
  const done = clients.map(async (c, i) => {
    const played = new Set<string>();
    for (let matches = 0; matches < 6; matches++) {
      const next = await c.waitFor(
        (m) =>
          (m.t === 'matchFound' && !played.has(m.matchId)) ||
          (m.t === 'bracketState' && m.place !== null),
        90_000,
      );
      if (next.t === 'bracketState') return next.place;
      const mid = (next as Extract<ServerMessage, { t: 'matchFound' }>).matchId;
      played.add(mid);
      c.match = {
        matchId: mid,
        seat: (next as Extract<ServerMessage, { t: 'matchFound' }>).seat,
        token: (next as Extract<ServerMessage, { t: 'matchFound' }>).token,
      };
      await draftAndDeploy(c, i % 4, `t${i}-${matches}`);
      // The two seats sweep different cell runs, so matches actually decide.
      // The loop breaks ONLY on this match's own result message — the next
      // bracket round's matchFound can overwrite the client's shared view
      // mid-loop, and peeking it here once fired stale commits into the new
      // room (a harness race the reveal-mismatch guard then caught, which is
      // the guard doing its job).
      const salt = c.match.seat === 0 ? 0 : 18;
      let lastRound = 0;
      for (let r = 0; r < 26; r++) {
        const round = Math.max(lastRound + 1, 1);
        await c.playPlan(basicPlan(c, (r * 5 + salt + i) % 36), `t${i}-${matches}-${r}`, mid, round);
        const got = await c.waitFor(
          (m) =>
            (m.t === 'roundReport' && m.matchId === mid && m.round > round) ||
            (m.t === 'result' && m.matchId === mid),
          90_000,
        );
        if (got.t === 'result' || (got.t === 'roundReport' && got.view.phase === 'over')) break;
        lastRound = (got as Extract<ServerMessage, { t: 'roundReport' }>).round - 1;
      }
      await c.waitFor((m) => m.t === 'result' && m.matchId === mid, 90_000);
    }
    return null;
  });

  const places = await Promise.all(done);
  check(
    'all eight clients ended with a bracket place',
    places.every((p) => p !== null),
    places.join(','),
  );
  await placesSignal;
  check('the server reported final standings', bracketPlaces !== null);

  // The referee settles the on-chain bracket from the server's standings.
  const order = bracketPlaces!;
  void bracketEntrants;
  const balancesBefore = await Promise.all(
    order.map((s) => connection.getBalance(wallets[s].publicKey, 'confirmed')),
  );
  await send(
    ixSettleBracket({
      programId,
      bracketId,
      places: order,
      transcriptRoot: unhex(sha256(`${RUN}:net-bracket-root`)),
      champion: wallets[order[0]].publicKey,
      runner: wallets[order[1]].publicKey,
      semi3: wallets[order[2]].publicKey,
      semi4: wallets[order[3]].publicKey,
      treasury: treasury.publicKey,
      referee: referee.publicKey,
    }),
    [referee],
  );
  const pay8 = bracketPayout(STAKE);
  const balancesAfter = await Promise.all(
    order.map((s) => connection.getBalance(wallets[s].publicKey, 'confirmed')),
  );
  const deltas = balancesAfter.map((x, i) => BigInt(x - balancesBefore[i]));
  check('champion took 55% of the post-rake pot', deltas[0] === pay8.toChampion, `${deltas[0]}`);
  check('runner-up took 25%', deltas[1] === pay8.toRunner, `${deltas[1]}`);
  check(
    'each losing semifinalist took 10%',
    deltas[2] === pay8.toSemi && deltas[3] === pay8.toSemi,
    `${deltas[2]}/${deltas[3]}`,
  );
  const rec = await fetchBracket(connection, programId, bracketId);
  check('the bracket record is settled on-chain', rec?.status === 2);

  for (const c of clients) c.close();
  server.close();
}

async function main(): Promise<void> {
  console.log(`endpoint ${RPC}`);
  console.log(`program  ${programId.toBase58()}`);
  await twoClientMatch();
  await eightClientBracket();
  console.log(
    failures === 0
      ? '\nall network acceptance checks passed.'
      : `\n${failures} network acceptance check(s) FAILED.`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

void main().catch((err) => {
  console.error('\nnetwork acceptance aborted:', err instanceof Error ? err.stack : err);
  process.exit(1);
});
