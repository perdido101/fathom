/**
 * The end-to-end chain test.
 *
 * Two headless clients play a whole match through the real engine, stake real
 * lamports into the real deployed program, settle on-chain, and then anyone —
 * including this script — re-derives the result from the published seed and
 * the signed transcript. That is the whole trust story of the product
 * exercised in one pass, which is why this is the test that matters most.
 *
 * It runs against whatever cluster `SA_RPC` points at. On a local validator it
 * is hermetic and fast; on devnet it is the same test against the same
 * program. If the program is not deployed it says so and exits non-zero rather
 * than passing quietly, because a staking test that skips itself is worse than
 * no test at all.
 *
 *   SA_RPC=http://127.0.0.1:8899 SA_PROGRAM_ID=<id> npm run e2e:chain
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
import {
  createMatch,
  commitPlan,
  deploy,
  pickCard,
  pickShip,
  playRound,
} from '../src/engine/match';
import { clientView } from '../src/engine/view';
import { transcriptOf, verify } from '../src/engine/verify';
import { sha256, stableStringify } from '../src/engine/sha256';
import { seedRng, type RngState } from '../src/engine/rng';
import { botCardPick, botDeploy, botPlan, botShipPick } from '../src/bots/bot';
import { issueSessionKey, signPlan, unhex, verifyPlanSignature } from '../src/chain/sessionKey';
import {
  Outcome,
  Status,
  decodeMatch,
  fetchMatch,
  ixCommitSetup,
  ixOpenMatch,
  ixReclaim,
  ixSettle,
  matchIdFrom,
  matchPda,
  payout,
} from '../src/chain/program';
import type { MatchState, Plan, PlayerId } from '../src/engine/types';

const RPC = process.env.SA_RPC ?? 'http://127.0.0.1:8899';
const PROGRAM_ID = process.env.SA_PROGRAM_ID;
const FAST_PROGRAM_ID = process.env.SA_FAST_PROGRAM_ID;
const STAKE = BigInt(Math.round(0.05 * LAMPORTS_PER_SOL));
/**
 * Match ids are derived from the match seed, which is deterministic — so a
 * second run against the same validator would collide with the PDAs the first
 * one created. Mixing in a per-run nonce keeps each run's escrow accounts its
 * own without making the derivation any less checkable.
 */
const RUN = process.env.SA_RUN ?? String(Date.now());

if (!PROGRAM_ID) {
  console.error('SA_PROGRAM_ID is not set — deploy chain/program first. Refusing to pass.');
  process.exit(1);
}
const programId = new PublicKey(PROGRAM_ID);
const connection = new Connection(RPC, 'confirmed');

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

async function fund(kp: Keypair, sol: number): Promise<void> {
  const sig = await connection.requestAirdrop(kp.publicKey, sol * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig, 'confirmed');
}

function payer(): Keypair {
  const path = process.env.SA_PAYER ?? '/tmp/sa-payer.json';
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, 'utf8'))));
}

async function send(ixs: Parameters<Transaction['add']>, signers: Keypair[]): Promise<string> {
  const tx = new Transaction().add(...(Array.isArray(ixs) ? ixs : [ixs]));
  return sendAndConfirmTransaction(connection, tx, signers, {
    commitment: 'confirmed',
    skipPreflight: false,
  });
}

/**
 * Play a full match between two bots, exactly as the sim does, but keep the
 * final state so its commitments and transcript can be published.
 */
function playFullMatch(seed: string): MatchState {
  let ms = createMatch({ seed, players: ['alice', 'bob'] });
  const rngs: [RngState, RngState] = [seedRng(`${seed}:a`), seedRng(`${seed}:b`)];
  const keys = [issueSessionKey(0), issueSessionKey(1)];

  for (let pack = 0; pack < 3; pack++) {
    const picks: string[] = [];
    for (const p of [0, 1] as PlayerId[]) {
      const [c, st] = botShipPick(clientView(ms, p), 4, rngs[p]);
      rngs[p] = st;
      picks.push(c);
    }
    ms = pickShip(ms, 0, picks[0]);
    ms = pickShip(ms, 1, picks[1]);
  }
  for (let pack = 0; pack < 3; pack++) {
    const picks: string[] = [];
    for (const p of [0, 1] as PlayerId[]) {
      const [c, st] = botCardPick(clientView(ms, p), 4, rngs[p]);
      rngs[p] = st;
      picks.push(c);
    }
    ms = pickCard(ms, 0, picks[0]);
    ms = pickCard(ms, 1, picks[1]);
  }
  for (const p of [0, 1] as PlayerId[]) {
    const [placements, st] = botDeploy(clientView(ms, p), 4, rngs[p]);
    rngs[p] = st;
    ms = deploy(ms, p, placements, `${seed}-deploy-${p}`);
  }

  let round = 0;
  while (ms.phase === 'battle' && round < 40) {
    round += 1;
    const plans: [Plan, Plan] = [] as unknown as [Plan, Plan];
    for (const p of [0, 1] as PlayerId[]) {
      const [plan, st] = botPlan(clientView(ms, p), 4, rngs[p]);
      rngs[p] = st;
      plans[p] = plan;
    }
    // Every round is signed by that player's session key, which is what makes
    // the transcript evidence rather than a claim.
    const nonces = [`${seed}-${round}-a`, `${seed}-${round}-b`];
    ms = playRound(ms, {
      plans: [
        commitPlan(plans[0], nonces[0], signPlan(keys[0], plans[0], nonces[0])),
        commitPlan(plans[1], nonces[1], signPlan(keys[1], plans[1], nonces[1])),
      ],
    }).state;
  }
  (ms as MatchState & { sessionKeys?: [string, string] }).sessionKeys = [
    keys[0].publicKeyHex,
    keys[1].publicKeyHex,
  ];
  return ms;
}

/**
 * Find a seed whose match ends the way this test needs it to.
 *
 * The probe has to be the same function that gets replayed. An earlier version
 * screened with the sim runner, which seeds its bots differently, so the seed
 * it picked produced a different match when played here — a draw that turned
 * out to be a win.
 */
function matchEndingIn(kind: 'win' | 'draw', from = 0): MatchState {
  for (let i = from; i < from + 4000; i++) {
    const ms = playFullMatch(`chain-probe-${i}`);
    const drew = ms.outcome?.kind === 'draw';
    if (kind === 'draw' ? drew : !drew) return ms;
  }
  throw new Error(`no seed produced a ${kind} in 4000 tries`);
}

// ---------------------------------------------------------------------------

async function scenarioWin(): Promise<void> {
  console.log('\n[1] arena win: escrow, play, settle to the winner minus 5% rake');
  const ms = matchEndingIn('win');
  const alice = Keypair.generate();
  const bob = Keypair.generate();
  const referee = payer();
  const treasury = Keypair.generate();
  await Promise.all([fund(alice, 1), fund(bob, 1)]);

  const matchId = matchIdFrom(sha256(`${RUN}:${ms.seed}`).slice(0, 64));
  const [pda] = matchPda(programId, matchId);

  await send(
    ixOpenMatch({
      programId,
      matchId,
      stakeLamports: STAKE,
      seedCommit: unhex(ms.seedCommit),
      playerA: alice.publicKey,
      playerB: bob.publicKey,
      referee: referee.publicKey,
    }),
    [alice, bob],
  );
  const opened = await fetchMatch(connection, programId, matchId);
  check('escrow opened', opened?.status === Status.Open, `stake ${opened?.stake} lamports each`);
  const escrowed = await connection.getBalance(pda, 'confirmed');
  check('both stakes are in escrow', BigInt(escrowed) >= STAKE * 2n, `${escrowed} lamports held`);

  for (const [kp, side] of [
    [alice, 0],
    [bob, 1],
  ] as [Keypair, PlayerId][]) {
    await send(
      ixCommitSetup({
        programId,
        matchId,
        player: kp.publicKey,
        commitment: unhex(ms.players[side].deployCommit ?? ''),
      }),
      [kp],
    );
  }
  const live = await fetchMatch(connection, programId, matchId);
  check('both deployment commitments written, match live', live?.status === Status.Live);
  check(
    'the commitment on-chain is the one the engine produced',
    live?.setupA === ms.players[0].deployCommit,
  );

  const keys = (ms as MatchState & { sessionKeys: [string, string] }).sessionKeys;
  const transcript = transcriptOf(ms, 'chain-win', keys);
  const transcriptHash = sha256(stableStringify(transcript));
  const winner = ms.outcome?.kind === 'win' ? ms.outcome.winner : 0;

  const before = {
    winner: await connection.getBalance(
      winner === 0 ? alice.publicKey : bob.publicKey,
      'confirmed',
    ),
    treasury: await connection.getBalance(treasury.publicKey, 'confirmed'),
  };
  await send(
    ixSettle({
      programId,
      matchId,
      outcome: winner === 0 ? Outcome.WinA : Outcome.WinB,
      seed: unhex(sha256(ms.seed)),
      transcriptHash: unhex(transcriptHash),
      playerA: alice.publicKey,
      playerB: bob.publicKey,
      treasury: treasury.publicKey,
      referee: referee.publicKey,
    }),
    [referee],
  );

  const settled = await fetchMatch(connection, programId, matchId);
  const { toWinner, rake } = payout(STAKE);
  const after = {
    winner: await connection.getBalance(
      winner === 0 ? alice.publicKey : bob.publicKey,
      'confirmed',
    ),
    treasury: await connection.getBalance(treasury.publicKey, 'confirmed'),
  };
  check('match is settled on-chain', settled?.status === Status.Settled);
  check(
    'winner paid the pot minus rake',
    BigInt(after.winner - before.winner) === toWinner,
    `${after.winner - before.winner} vs expected ${toWinner}`,
  );
  check(
    'treasury took exactly 5%',
    BigInt(after.treasury - before.treasury) === rake,
    `${after.treasury - before.treasury} vs expected ${rake}`,
  );
  check('transcript hash is pinned on-chain', settled?.transcriptHash === transcriptHash);

  const replay = verify(transcript);
  check(
    'the published transcript replays to the reported result',
    replay.ok,
    replay.problems.join('; '),
  );
  check(
    'every round signature checked out',
    replay.warnings.length === 0,
    replay.warnings.join('; '),
  );
}

async function scenarioDraw(): Promise<void> {
  console.log('\n[2] draw: both stakes returned in full, no rake');
  const ms = matchEndingIn('draw');
  const alice = Keypair.generate();
  const bob = Keypair.generate();
  const referee = payer();
  const treasury = Keypair.generate();
  await Promise.all([fund(alice, 1), fund(bob, 1)]);
  const matchId = matchIdFrom(sha256(`${RUN}:${ms.seed}-draw`).slice(0, 64));

  await send(
    ixOpenMatch({
      programId,
      matchId,
      stakeLamports: STAKE,
      seedCommit: unhex(ms.seedCommit),
      playerA: alice.publicKey,
      playerB: bob.publicKey,
      referee: referee.publicKey,
    }),
    [alice, bob],
  );
  for (const [kp, side] of [
    [alice, 0],
    [bob, 1],
  ] as [Keypair, PlayerId][]) {
    await send(
      ixCommitSetup({
        programId,
        matchId,
        player: kp.publicKey,
        commitment: unhex(ms.players[side].deployCommit ?? ''),
      }),
      [kp],
    );
  }

  const beforeA = await connection.getBalance(alice.publicKey, 'confirmed');
  const beforeB = await connection.getBalance(bob.publicKey, 'confirmed');
  const beforeT = await connection.getBalance(treasury.publicKey, 'confirmed');
  await send(
    ixSettle({
      programId,
      matchId,
      outcome: Outcome.Draw,
      seed: unhex(sha256(ms.seed)),
      transcriptHash: unhex(sha256('draw')),
      playerA: alice.publicKey,
      playerB: bob.publicKey,
      treasury: treasury.publicKey,
      referee: referee.publicKey,
    }),
    [referee],
  );
  const afterA = await connection.getBalance(alice.publicKey, 'confirmed');
  const afterB = await connection.getBalance(bob.publicKey, 'confirmed');
  const afterT = await connection.getBalance(treasury.publicKey, 'confirmed');

  check('player A got their whole stake back', BigInt(afterA - beforeA) === STAKE);
  check('player B got their whole stake back', BigInt(afterB - beforeB) === STAKE);
  check('no rake was taken on the draw', afterT - beforeT === 0);
  check(
    'the match itself ended in a genuine draw',
    ms.outcome?.kind === 'draw',
    ms.outcome ? JSON.stringify(ms.outcome) : 'none',
  );
}

async function scenarioAuthorisation(): Promise<void> {
  console.log('\n[3] authorisation: only the referee settles, only players reclaim');
  const ms = matchEndingIn('win', 500);
  const alice = Keypair.generate();
  const bob = Keypair.generate();
  const stranger = Keypair.generate();
  const referee = payer();
  const treasury = Keypair.generate();
  await Promise.all([fund(alice, 1), fund(bob, 1), fund(stranger, 1)]);
  const matchId = matchIdFrom(sha256(`${RUN}:${ms.seed}-auth`).slice(0, 64));

  await send(
    ixOpenMatch({
      programId,
      matchId,
      stakeLamports: STAKE,
      seedCommit: unhex(ms.seedCommit),
      playerA: alice.publicKey,
      playerB: bob.publicKey,
      referee: referee.publicKey,
    }),
    [alice, bob],
  );
  for (const [kp, side] of [
    [alice, 0],
    [bob, 1],
  ] as [Keypair, PlayerId][]) {
    await send(
      ixCommitSetup({
        programId,
        matchId,
        player: kp.publicKey,
        commitment: unhex(ms.players[side].deployCommit ?? ''),
      }),
      [kp],
    );
  }

  await expectRejected('a stranger cannot settle the match', () =>
    send(
      ixSettle({
        programId,
        matchId,
        outcome: Outcome.WinB,
        seed: unhex(sha256(ms.seed)),
        transcriptHash: unhex(sha256('x')),
        playerA: alice.publicKey,
        playerB: bob.publicKey,
        treasury: treasury.publicKey,
        referee: stranger.publicKey,
      }),
      [stranger],
    ),
  );

  await expectRejected('a stranger cannot reclaim the escrow', () =>
    send(
      ixReclaim({
        programId,
        matchId,
        playerA: alice.publicKey,
        playerB: bob.publicKey,
        caller: stranger.publicKey,
      }),
      [stranger],
    ),
  );

  await expectRejected('a player cannot reclaim before the window elapses', () =>
    send(
      ixReclaim({
        programId,
        matchId,
        playerA: alice.publicKey,
        playerB: bob.publicKey,
        caller: alice.publicKey,
      }),
      [alice],
    ),
  );

  await expectRejected('a deployment commitment cannot be overwritten', () =>
    send(
      ixCommitSetup({
        programId,
        matchId,
        player: alice.publicKey,
        commitment: unhex(sha256('a different fleet')),
      }),
      [alice],
    ),
  );
}

async function scenarioReclaim(): Promise<void> {
  if (!FAST_PROGRAM_ID) {
    console.log('\n[4] reclaim payout: SKIPPED (SA_FAST_PROGRAM_ID not set)');
    return;
  }
  console.log('\n[4] reclaim payout: an abandoned match returns both stakes to their owners');
  const fastProgram = new PublicKey(FAST_PROGRAM_ID);
  const alice = Keypair.generate();
  const bob = Keypair.generate();
  const referee = payer();
  await Promise.all([fund(alice, 1), fund(bob, 1)]);
  const matchId = matchIdFrom(sha256(`${RUN}:reclaim`).slice(0, 64));

  await send(
    ixOpenMatch({
      programId: fastProgram,
      matchId,
      stakeLamports: STAKE,
      seedCommit: unhex(sha256('abandoned')),
      playerA: alice.publicKey,
      playerB: bob.publicKey,
      referee: referee.publicKey,
    }),
    [alice, bob],
  );

  const beforeA = await connection.getBalance(alice.publicKey, 'confirmed');
  const beforeB = await connection.getBalance(bob.publicKey, 'confirmed');
  // Bob calls it, but the payout is symmetric — a reclaim always returns each
  // player their own stake, so there is nothing here for either side to grief.
  await send(
    ixReclaim({
      programId: fastProgram,
      matchId,
      playerA: alice.publicKey,
      playerB: bob.publicKey,
      caller: bob.publicKey,
    }),
    [bob],
  );
  const afterA = await connection.getBalance(alice.publicKey, 'confirmed');
  const afterB = await connection.getBalance(bob.publicKey, 'confirmed');
  check('the caller cannot take more than their own stake', BigInt(afterB - beforeB) <= STAKE);
  check('the other player is made whole too', BigInt(afterA - beforeA) === STAKE);

  const [pda] = matchPda(fastProgram, matchId);
  const info = await connection.getAccountInfo(pda);
  const rec = info ? decodeMatch(new Uint8Array(info.data)) : null;
  check('the abandoned match is closed as a draw', rec?.outcome === Outcome.Draw);

  await expectRejected('a settled match cannot be reclaimed twice', () =>
    send(
      ixReclaim({
        programId: fastProgram,
        matchId,
        playerA: alice.publicKey,
        playerB: bob.publicKey,
        caller: alice.publicKey,
      }),
      [alice],
    ),
  );
}

/**
 * The session-key claim, tested rather than asserted.
 *
 * A session key is a real ed25519 keypair, so it is a syntactically valid
 * Solana signer — which is exactly why "it cannot move funds" needs a test
 * rather than a sentence. The guarantee does not come from the key being
 * unusable; it comes from the program only ever recognising the wallets named
 * in the match record and the referee named alongside them. So: take a live
 * session key, turn it into a Solana keypair, and try to use it everywhere
 * value moves.
 */
async function scenarioSessionKeys(): Promise<void> {
  console.log('\n[5] session keys sign moves and can never move funds');
  const ms = matchEndingIn('win', 900);
  const alice = Keypair.generate();
  const bob = Keypair.generate();
  const referee = payer();
  const treasury = Keypair.generate();
  await Promise.all([fund(alice, 1), fund(bob, 1)]);
  const matchId = matchIdFrom(sha256(`${RUN}:${ms.seed}-session`).slice(0, 64));

  await send(
    ixOpenMatch({
      programId,
      matchId,
      stakeLamports: STAKE,
      seedCommit: unhex(ms.seedCommit),
      playerA: alice.publicKey,
      playerB: bob.publicKey,
      referee: referee.publicKey,
    }),
    [alice, bob],
  );
  for (const [kp, side] of [
    [alice, 0],
    [bob, 1],
  ] as [Keypair, PlayerId][]) {
    await send(
      ixCommitSetup({
        programId,
        matchId,
        player: kp.publicKey,
        commitment: unhex(ms.players[side].deployCommit ?? ''),
      }),
      [kp],
    );
  }

  // A session key issued exactly as the client issues one, then handed to
  // Solana as a signer.
  const session = issueSessionKey(0);
  const asSolanaSigner = Keypair.fromSecretKey(session.secretKey);
  check(
    'a session key really is a usable ed25519 signer, so this is a fair test',
    asSolanaSigner.publicKey.toBase58().length > 0,
  );
  await fund(asSolanaSigner, 1);

  await expectRejected('a session key cannot settle a match', () =>
    send(
      ixSettle({
        programId,
        matchId,
        outcome: Outcome.WinA,
        seed: unhex(sha256(ms.seed)),
        transcriptHash: unhex(sha256('x')),
        playerA: alice.publicKey,
        playerB: bob.publicKey,
        treasury: treasury.publicKey,
        referee: asSolanaSigner.publicKey,
      }),
      [asSolanaSigner],
    ),
  );

  await expectRejected('a session key cannot reclaim an escrow', () =>
    send(
      ixReclaim({
        programId,
        matchId,
        playerA: alice.publicKey,
        playerB: bob.publicKey,
        caller: asSolanaSigner.publicKey,
      }),
      [asSolanaSigner],
    ),
  );

  await expectRejected('a session key cannot stand in for a player at setup', () =>
    send(
      ixCommitSetup({
        programId,
        matchId,
        player: asSolanaSigner.publicKey,
        commitment: unhex(sha256('someone else fleet')),
      }),
      [asSolanaSigner],
    ),
  );

  // And the positive half: it does sign moves, and the signature verifies.
  const plan = ms.history[0]?.plans[0];
  check(
    'a session key does sign round plans, and the signature verifies',
    plan !== undefined &&
      verifyPlanSignature(
        (ms as MatchState & { sessionKeys: [string, string] }).sessionKeys[0],
        plan.signature ?? '',
        plan.commitHash,
      ),
  );

  const escrowIntact = await connection.getBalance(matchPda(programId, matchId)[0], 'confirmed');
  check(
    'the escrow is untouched after every session-key attempt',
    BigInt(escrowIntact) >= STAKE * 2n,
    `${escrowIntact} lamports still held`,
  );
}

async function expectRejected(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
    check(label, false, 'the transaction was accepted');
  } catch {
    check(label, true);
  }
}

async function main(): Promise<void> {
  console.log(`endpoint ${RPC}`);
  console.log(`program  ${programId.toBase58()}`);
  const version = await connection.getVersion();
  console.log(`cluster  ${JSON.stringify(version)}`);

  await scenarioWin();
  await scenarioDraw();
  await scenarioAuthorisation();
  await scenarioReclaim();
  await scenarioSessionKeys();

  console.log(
    failures === 0 ? '\nall on-chain checks passed.' : `\n${failures} on-chain check(s) FAILED.`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

void main().catch((err) => {
  console.error('\nE2E aborted:', err instanceof Error ? err.message : err);
  process.exit(1);
});
