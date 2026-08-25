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
