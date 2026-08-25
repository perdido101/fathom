import type { Plan } from '../engine/types';
import type { Mode, Stake } from '../state/profile';
import { arenaPayout } from '../state/profile';
import { issueSessionKey, signPlan, type SessionKey } from './sessionKey';
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { DevnetChain } from './devnet';

/**
 * The chain, from the client's side.
 *
 * The architecture the build prompt asks for, restated so the code and the
 * reasoning stay together: the chain holds two commitments and an escrow, and
 * nothing else. It never sees a move. It could not check one if it did — the
 * boards are secret, so any on-chain turn data would have to be hashed, which
 * makes the chain a notary rather than a referee.
 *
 * All of the trust therefore sits in the commitment scheme and the signed
 * transcript, both of which `verify()` checks offline. That is the honest
 * description of the guarantee: the chain proves *who staked what and what was
 * committed*, and the replay proves *that the reported result follows from the
 * rules*. Neither half is sufficient alone.
 *
 * Two adapters implement the same interface. The mock runs the whole game with
 * no wallet and no network, which is what the app uses by default. The devnet
 * adapter talks to a deployed escrow program; it is inert until
 * `VITE_PROGRAM_ID` names one.
 */

export type Result = 'win' | 'loss' | 'draw';

export interface OpenMatchArgs {
  mode: Mode;
  stake: Stake;
  seedCommit: string;
}

export interface OpenMatchResult {
  matchId: string;
  text: string;
}

export interface ChainAdapter {
  readonly kind: 'mock' | 'devnet';
  connected(): boolean;
  address(): string | null;
  sessionKey(): SessionKey;
  connect(): Promise<string>;
  openMatch(args: OpenMatchArgs): Promise<OpenMatchResult>;
  commitDeployment(matchId: string | null, commitHash: string): Promise<void>;
  settle(matchId: string | null, result: Result, stake: Stake): Promise<void>;
  signWithSessionKey(plan: Plan, nonce: string): string;
  /** Human-readable trail of everything the adapter did, for the settings screen. */
  readonly journal: string[];
}

class MockChain implements ChainAdapter {
  readonly kind = 'mock' as const;
  readonly journal: string[] = [];
  private key: SessionKey = issueSessionKey(Date.now());
  private wallet: string | null = null;
  private counter = 0;

  connected(): boolean {
    return this.wallet !== null;
  }

  address(): string | null {
    return this.wallet;
  }

  sessionKey(): SessionKey {
    return this.key;
  }

  async connect(): Promise<string> {
    this.wallet = `mock${this.key.publicKeyHex.slice(0, 8)}`;
    this.key = issueSessionKey(Date.now(), 'mock-wallet-authorisation');
    this.journal.push(
      `connected as ${this.wallet}; session key ${this.key.publicKeyHex.slice(0, 12)}...`,
    );
    return this.wallet;
  }

  async openMatch({ mode, stake, seedCommit }: OpenMatchArgs): Promise<OpenMatchResult> {
    this.counter += 1;
    const matchId = `mock-match-${this.counter}`;
    const text =
      mode === 'arena'
        ? `escrowed ${stake} SOL (mock) — pot ${arenaPayout(stake).pot}, rake ${arenaPayout(stake).rake.toFixed(4)}`
        : mode === 'ranked'
          ? 'ranked ladder — season entry already paid (mock)'
          : 'casual — no chain interaction beyond identity';
    this.journal.push(`open ${matchId}: ${text}; seed commitment ${seedCommit.slice(0, 12)}...`);
    return { matchId, text };
  }

  async commitDeployment(matchId: string | null, commitHash: string): Promise<void> {
    this.journal.push(`${matchId}: deployment commitment ${commitHash.slice(0, 12)}... written`);
  }

  async settle(matchId: string | null, result: Result, stake: Stake): Promise<void> {
    if (result === 'draw') {
      this.journal.push(`${matchId}: draw — ${stake} SOL returned to both, no rake taken`);
      return;
    }
    const { toWinner, rake } = arenaPayout(stake);
    this.journal.push(
      `${matchId}: ${result} — ${result === 'win' ? `${toWinner.toFixed(4)} SOL paid out` : 'stake forfeited'}, rake ${rake.toFixed(4)}`,
    );
  }

  signWithSessionKey(plan: Plan, nonce: string): string {
    return signPlan(this.key, plan, nonce);
  }
}

const env = (import.meta as unknown as { env?: Record<string, string> }).env ?? {};
const USE_DEVNET = env.VITE_CLUSTER === 'devnet';

function key(value: string | undefined): PublicKey | null {
  if (!value) return null;
  try {
    return new PublicKey(value);
  } catch {
    // A malformed key in configuration is not something to paper over on a
    // staking path; leaving it null makes the adapter throw with the reason.
    console.error(`ignoring malformed public key in configuration: ${value}`);
    return null;
  }
}

export const chain: ChainAdapter = USE_DEVNET
  ? new DevnetChain(
      env.VITE_RPC ?? 'https://api.devnet.solana.com',
      key(env.VITE_PROGRAM_ID),
      key(env.VITE_REFEREE),
      key(env.VITE_TREASURY),
    )
  : new MockChain();

export { LAMPORTS_PER_SOL };
