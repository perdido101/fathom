import { PublicKey, SystemProgram, TransactionInstruction, type Connection } from '@solana/web3.js';
import { unhex } from './sessionKey';

/**
 * The escrow program, from TypeScript.
 *
 * Instruction encoding is hand-rolled rather than pulled from an IDL, because
 * the program is hand-rolled too — a native Solana program with a fixed byte
 * layout, no Anchor, no discriminators. Keeping both sides of the wire format
 * in files that name the same offsets is the cheapest way to notice when one
 * of them changes.
 */

export const STATE_LEN = 314;
export const RAKE_BPS = 500n;

export enum Outcome {
  WinA = 0,
  WinB = 1,
  Draw = 2,
  None = 255,
}

export enum Status {
  Open = 0,
  Live = 1,
  Settled = 2,
}

// Offsets, mirroring chain/program/src/lib.rs.
const O = {
  status: 0,
  matchId: 1,
  playerA: 33,
  playerB: 65,
  referee: 97,
  stake: 129,
  seedCommit: 137,
  seed: 169,
  setupA: 201,
  setupB: 233,
  transcript: 265,
  outcome: 297,
  openedAt: 298,
  settledAt: 306,
} as const;

export interface MatchRecord {
  status: Status;
  matchId: string;
  playerA: PublicKey;
  playerB: PublicKey;
  referee: PublicKey;
  stake: bigint;
  seedCommit: string;
  seed: string;
  setupA: string;
  setupB: string;
  transcriptHash: string;
  outcome: Outcome;
  openedAt: bigint;
  settledAt: bigint;
}

const hex = (b: Uint8Array): string =>
  Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

export function matchPda(programId: PublicKey, matchId: Uint8Array): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from('match'), Buffer.from(matchId)], programId);
}

/** A 32-byte match id from any string, so ids are stable and collision-free. */
export function matchIdFrom(hexOrText: string): Uint8Array {
  if (/^[0-9a-f]{64}$/.test(hexOrText)) return unhex(hexOrText);
  const out = new Uint8Array(32);
  const bytes = new TextEncoder().encode(hexOrText);
  out.set(bytes.slice(0, 32));
  return out;
}

export function decodeMatch(data: Uint8Array): MatchRecord {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const at = (o: number) => new PublicKey(data.slice(o, o + 32));
  return {
    status: data[O.status] as Status,
    matchId: hex(data.slice(O.matchId, O.matchId + 32)),
    playerA: at(O.playerA),
    playerB: at(O.playerB),
    referee: at(O.referee),
    stake: dv.getBigUint64(O.stake, true),
    seedCommit: hex(data.slice(O.seedCommit, O.seedCommit + 32)),
    seed: hex(data.slice(O.seed, O.seed + 32)),
    setupA: hex(data.slice(O.setupA, O.setupA + 32)),
    setupB: hex(data.slice(O.setupB, O.setupB + 32)),
    transcriptHash: hex(data.slice(O.transcript, O.transcript + 32)),
    outcome: data[O.outcome] as Outcome,
    openedAt: dv.getBigInt64(O.openedAt, true),
    settledAt: dv.getBigInt64(O.settledAt, true),
  };
}

export async function fetchMatch(
  connection: Connection,
  programId: PublicKey,
  matchId: Uint8Array,
): Promise<MatchRecord | null> {
  const [pda] = matchPda(programId, matchId);
  const info = await connection.getAccountInfo(pda);
  if (!info) return null;
  return decodeMatch(new Uint8Array(info.data));
}

// ---------------------------------------------------------------------------
// Instructions
// ---------------------------------------------------------------------------

export function ixOpenMatch(args: {
  programId: PublicKey;
  matchId: Uint8Array;
  stakeLamports: bigint;
  seedCommit: Uint8Array;
  playerA: PublicKey;
  playerB: PublicKey;
  referee: PublicKey;
}): TransactionInstruction {
  const [pda] = matchPda(args.programId, args.matchId);
  const data = new Uint8Array(1 + 32 + 8 + 32);
  data[0] = 0;
  data.set(args.matchId, 1);
  new DataView(data.buffer).setBigUint64(33, args.stakeLamports, true);
  data.set(args.seedCommit, 41);
  return new TransactionInstruction({
    programId: args.programId,
    keys: [
      { pubkey: pda, isSigner: false, isWritable: true },
      { pubkey: args.playerA, isSigner: true, isWritable: true },
      { pubkey: args.playerB, isSigner: true, isWritable: true },
      { pubkey: args.referee, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

export function ixCommitSetup(args: {
  programId: PublicKey;
  matchId: Uint8Array;
  player: PublicKey;
  commitment: Uint8Array;
}): TransactionInstruction {
  const [pda] = matchPda(args.programId, args.matchId);
  const data = new Uint8Array(33);
  data[0] = 1;
  data.set(args.commitment, 1);
  return new TransactionInstruction({
    programId: args.programId,
    keys: [
      { pubkey: pda, isSigner: false, isWritable: true },
      { pubkey: args.player, isSigner: true, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

export function ixSettle(args: {
  programId: PublicKey;
  matchId: Uint8Array;
  outcome: Outcome;
  seed: Uint8Array;
  transcriptHash: Uint8Array;
  playerA: PublicKey;
  playerB: PublicKey;
  treasury: PublicKey;
  referee: PublicKey;
}): TransactionInstruction {
  const [pda] = matchPda(args.programId, args.matchId);
  const data = new Uint8Array(1 + 1 + 32 + 32);
  data[0] = 2;
  data[1] = args.outcome;
  data.set(args.seed, 2);
  data.set(args.transcriptHash, 34);
  return new TransactionInstruction({
    programId: args.programId,
    keys: [
      { pubkey: pda, isSigner: false, isWritable: true },
      { pubkey: args.playerA, isSigner: false, isWritable: true },
      { pubkey: args.playerB, isSigner: false, isWritable: true },
      { pubkey: args.treasury, isSigner: false, isWritable: true },
      { pubkey: args.referee, isSigner: true, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

export function ixReclaim(args: {
  programId: PublicKey;
  matchId: Uint8Array;
  playerA: PublicKey;
  playerB: PublicKey;
  caller: PublicKey;
}): TransactionInstruction {
  const [pda] = matchPda(args.programId, args.matchId);
  return new TransactionInstruction({
    programId: args.programId,
    keys: [
      { pubkey: pda, isSigner: false, isWritable: true },
      { pubkey: args.playerA, isSigner: false, isWritable: true },
      { pubkey: args.playerB, isSigner: false, isWritable: true },
      { pubkey: args.caller, isSigner: true, isWritable: false },
    ],
    data: Buffer.from([3]),
  });
}

/** What the winner receives, computed the same way the program computes it. */
export function payout(stakeLamports: bigint): {
  pot: bigint;
  rake: bigint;
  toWinner: bigint;
} {
  const pot = stakeLamports * 2n;
  const rake = (pot * RAKE_BPS) / 10_000n;
  return { pot, rake, toWinner: pot - rake };
}

// ---------------------------------------------------------------------------
// Tournament brackets — 8 seats, single elimination
// ---------------------------------------------------------------------------

export const BRACKET_SEATS = 8;
export const BRACKET_LEN = 391;
export const CHAMPION_BPS = 5_500n;
export const RUNNER_BPS = 2_500n;
export const SEMI_BPS = 1_000n;

export enum BracketStatus {
  Forming = 0,
  Full = 1,
  Settled = 2,
}

// Offsets, mirroring chain/program/src/lib.rs.
const B = {
  status: 0,
  bracketId: 1,
  referee: 33,
  stake: 65,
  openedAt: 73,
  fullAt: 81,
  joined: 89,
  refunded: 90,
  result: 91,
  transcript: 95,
  settledAt: 127,
  players: 135,
} as const;

export interface BracketRecord {
  status: BracketStatus;
  bracketId: string;
  referee: PublicKey;
  stake: bigint;
  openedAt: bigint;
  fullAt: bigint;
  joined: number;
  refunded: number;
  /** Seat indices: champion, runner-up, and the two losing semifinalists. */
  places: [number, number, number, number];
  transcriptRoot: string;
  settledAt: bigint;
  players: PublicKey[];
}

export function bracketPda(programId: PublicKey, bracketId: Uint8Array): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('bracket'), Buffer.from(bracketId)],
    programId,
  );
}

export function decodeBracket(data: Uint8Array): BracketRecord {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const joined = data[B.joined];
  return {
    status: data[B.status] as BracketStatus,
    bracketId: hex(data.slice(B.bracketId, B.bracketId + 32)),
    referee: new PublicKey(data.slice(B.referee, B.referee + 32)),
    stake: dv.getBigUint64(B.stake, true),
    openedAt: dv.getBigInt64(B.openedAt, true),
    fullAt: dv.getBigInt64(B.fullAt, true),
    joined,
    refunded: data[B.refunded],
    places: [data[B.result], data[B.result + 1], data[B.result + 2], data[B.result + 3]],
    transcriptRoot: hex(data.slice(B.transcript, B.transcript + 32)),
    settledAt: dv.getBigInt64(B.settledAt, true),
    players: Array.from({ length: joined }, (_, s) =>
      new PublicKey(data.slice(B.players + s * 32, B.players + s * 32 + 32)),
    ),
  };
}

export async function fetchBracket(
  connection: Connection,
  programId: PublicKey,
  bracketId: Uint8Array,
): Promise<BracketRecord | null> {
  const [pda] = bracketPda(programId, bracketId);
  const info = await connection.getAccountInfo(pda);
  if (!info) return null;
  return decodeBracket(new Uint8Array(info.data));
}

export function ixOpenBracket(args: {
  programId: PublicKey;
  bracketId: Uint8Array;
  stakeLamports: bigint;
  opener: PublicKey;
  referee: PublicKey;
}): TransactionInstruction {
  const [pda] = bracketPda(args.programId, args.bracketId);
  const data = new Uint8Array(1 + 32 + 8);
  data[0] = 4;
  data.set(args.bracketId, 1);
  new DataView(data.buffer).setBigUint64(33, args.stakeLamports, true);
  return new TransactionInstruction({
    programId: args.programId,
    keys: [
      { pubkey: pda, isSigner: false, isWritable: true },
      { pubkey: args.opener, isSigner: true, isWritable: true },
      { pubkey: args.referee, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

export function ixJoinBracket(args: {
  programId: PublicKey;
  bracketId: Uint8Array;
  player: PublicKey;
}): TransactionInstruction {
  const [pda] = bracketPda(args.programId, args.bracketId);
  return new TransactionInstruction({
    programId: args.programId,
    keys: [
      { pubkey: pda, isSigner: false, isWritable: true },
      { pubkey: args.player, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([5]),
  });
}

export function ixSettleBracket(args: {
  programId: PublicKey;
  bracketId: Uint8Array;
  /** Seat indices: champion, runner-up, then the two losing semifinalists. */
  places: [number, number, number, number];
  transcriptRoot: Uint8Array;
  champion: PublicKey;
  runner: PublicKey;
  semi3: PublicKey;
  semi4: PublicKey;
  treasury: PublicKey;
  referee: PublicKey;
}): TransactionInstruction {
  const [pda] = bracketPda(args.programId, args.bracketId);
  const data = new Uint8Array(1 + 4 + 32);
  data[0] = 6;
  data.set(args.places, 1);
  data.set(args.transcriptRoot, 5);
  return new TransactionInstruction({
    programId: args.programId,
    keys: [
      { pubkey: pda, isSigner: false, isWritable: true },
      { pubkey: args.champion, isSigner: false, isWritable: true },
      { pubkey: args.runner, isSigner: false, isWritable: true },
      { pubkey: args.semi3, isSigner: false, isWritable: true },
      { pubkey: args.semi4, isSigner: false, isWritable: true },
      { pubkey: args.treasury, isSigner: false, isWritable: true },
      { pubkey: args.referee, isSigner: true, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

export function ixReclaimBracket(args: {
  programId: PublicKey;
  bracketId: Uint8Array;
  caller: PublicKey;
}): TransactionInstruction {
  const [pda] = bracketPda(args.programId, args.bracketId);
  return new TransactionInstruction({
    programId: args.programId,
    keys: [
      { pubkey: pda, isSigner: false, isWritable: true },
      { pubkey: args.caller, isSigner: true, isWritable: true },
    ],
    data: Buffer.from([7]),
  });
}

/**
 * The bracket payout, computed exactly as the program computes it: rake off
 * the pot, fixed shares of the remainder, division dust to the champion so
 * the escrow always empties to the rent floor.
 */
export function bracketPayout(stakeLamports: bigint): {
  pot: bigint;
  rake: bigint;
  net: bigint;
  toChampion: bigint;
  toRunner: bigint;
  toSemi: bigint;
} {
  const pot = stakeLamports * BigInt(BRACKET_SEATS);
  const rake = (pot * RAKE_BPS) / 10_000n;
  const net = pot - rake;
  const toRunner = (net * RUNNER_BPS) / 10_000n;
  const toSemi = (net * SEMI_BPS) / 10_000n;
  const toChampion = net - toRunner - toSemi * 2n;
  return { pot, rake, net, toChampion, toRunner, toSemi };
}
