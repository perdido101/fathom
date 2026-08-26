import { Connection, PublicKey, Transaction, type TransactionInstruction } from '@solana/web3.js';
import type { Plan } from '../engine/types';
import type { Stake } from '../state/profile';
import { issueSessionKey, signPlan, unhex, type SessionKey } from './sessionKey';
import {
  Outcome,
  fetchMatch,
  ixCommitSetup,
  ixOpenMatch,
  ixSettle,
  matchIdFrom,
  payout,
  type MatchRecord,
} from './program';
import type { ChainAdapter, OpenMatchArgs, OpenMatchResult, Result } from './client';

/**
 * The devnet adapter, talking to the deployed escrow program.
 *
 * Two rules govern everything here.
 *
 * First, **no staking path may ever silently do nothing.** A no-op on a path
 * the player believes moved money is the worst failure this product has, worse
 * than an outage, because it is invisible until settlement. Every method that
 * touches value either lands a transaction or throws with the reason.
 *
 * Second, **the wallet signs, the session key never does.** The session key
 * exists to sign round plans at speed; it appears in no instruction on this
 * page. That is enforced by the program (the escrow only recognises the
 * wallets named in the match record) and tested on-chain, not just asserted.
 */

interface WalletProvider {
  publicKey: { toString(): string; toBytes(): Uint8Array };
  connect(): Promise<{ publicKey: { toString(): string } }>;
  signTransaction(tx: Transaction): Promise<Transaction>;
  signMessage?(msg: Uint8Array): Promise<{ signature: Uint8Array }>;
}

export class DevnetChain implements ChainAdapter {
  readonly kind = 'devnet' as const;
  readonly journal: string[] = [];
  private key: SessionKey = issueSessionKey(Date.now());
  private wallet: PublicKey | null = null;
  private readonly connection: Connection;

  constructor(
    endpoint: string,
    private readonly programId: PublicKey | null,
    private readonly referee: PublicKey | null,
    private readonly treasury: PublicKey | null,
  ) {
    this.connection = new Connection(endpoint, 'confirmed');
  }

  connected(): boolean {
    return this.wallet !== null;
  }

  address(): string | null {
    return this.wallet?.toBase58() ?? null;
  }

  sessionKey(): SessionKey {
    return this.key;
  }

  private provider(): WalletProvider {
    const p = (globalThis as { solana?: WalletProvider }).solana;
    if (!p) throw new Error('No Solana wallet found in this browser.');
    return p;
  }

  private requireProgram(): PublicKey {
    if (!this.programId) {
      throw new Error(
        'No escrow program configured. Deploy chain/program and set VITE_PROGRAM_ID before staking.',
      );
    }
    return this.programId;
  }

  private requireWallet(): PublicKey {
    if (!this.wallet) throw new Error('Connect a wallet before staking.');
    return this.wallet;
  }

  async connect(): Promise<string> {
    const provider = this.provider();
    const res = await provider.connect();
    this.wallet = new PublicKey(res.publicKey.toString());
    this.key = issueSessionKey(Date.now());
    this.journal.push(`connected ${this.wallet.toBase58()}`);
    return this.wallet.toBase58();
  }

  private async submit(ixs: TransactionInstruction[]): Promise<string> {
    const provider = this.provider();
    const wallet = this.requireWallet();
    const tx = new Transaction().add(...ixs);
    tx.feePayer = wallet;
    tx.recentBlockhash = (await this.connection.getLatestBlockhash('confirmed')).blockhash;
    const signed = await provider.signTransaction(tx);
    const sig = await this.connection.sendRawTransaction(signed.serialize());
    await this.connection.confirmTransaction(sig, 'confirmed');
    return sig;
  }

  async openMatch({ mode, seedCommit }: OpenMatchArgs): Promise<OpenMatchResult> {
    if (mode === 'casual') {
      // Casual touches no value, so it needs no escrow and no program.
      return { matchId: `casual-${seedCommit.slice(0, 8)}`, text: 'Casual — identity only.' };
    }
    this.requireProgram();
    if (!this.referee || !this.treasury) {
      throw new Error('No referee or treasury configured. Set VITE_REFEREE and VITE_TREASURY.');
    }
    // Opening the escrow needs both players' signatures in one transaction,
    // which a single browser cannot produce. That is a matchmaking-server job,
    // and until the server exists this path throws rather than pretending.
    throw new Error(
      'Staked matches need the matchmaking server to co-sign the escrow with your opponent. ' +
        'Not available in this build — play casual, or run the local chain proof with ' +
        '`npm run chain:local`.',
    );
  }

  async commitDeployment(matchId: string | null, commitHash: string): Promise<void> {
    const programId = this.requireProgram();
    const wallet = this.requireWallet();
    if (!matchId) throw new Error('No match to commit a deployment to.');
    const id = matchIdFrom(matchId);
    const sig = await this.submit([
      ixCommitSetup({ programId, matchId: id, player: wallet, commitment: unhex(commitHash) }),
    ]);
    this.journal.push(`deployment commitment written: ${sig.slice(0, 16)}...`);
  }

  async settle(matchId: string | null, result: Result, stake: Stake): Promise<void> {
    this.requireProgram();
    if (!matchId) throw new Error('No match to settle.');
    // Only the referee may settle, and the referee is the server. A client
    // that could settle its own match could award itself the pot.
    throw new Error(
      `Settlement is the referee's to submit, not this client's. Result "${result}" ` +
        `(${stake} SOL) has been reported to the server for settlement.`,
    );
  }

  async settleBracket(
    bracketId: string | null,
    place: 'champion' | 'runnerUp' | 'semiLoser' | 'out',
    stake: Stake,
  ): Promise<void> {
    this.requireProgram();
    if (!bracketId) throw new Error('No bracket to settle.');
    // Same authority rule as 1v1 settlement: the referee posts standings and
    // the program pays the curve. A client that could settle its own bracket
    // could award itself the pot.
    throw new Error(
      `Bracket settlement is the referee's to submit, not this client's. Place "${place}" ` +
        `(${stake} SOL tier) has been reported to the server for settlement.`,
    );
  }

  /** Read the on-chain record, for the UI to show a player what was published. */
  async readMatch(matchId: string): Promise<MatchRecord | null> {
    const programId = this.requireProgram();
    return fetchMatch(this.connection, programId, matchIdFrom(matchId));
  }

  private cachedBalance: number | null = null;
  private cachedTx: string | null = null;

  balanceSol(): number | null {
    // Refresh in the background; the chip renders the last known value.
    if (this.wallet) {
      void this.connection
        .getBalance(this.wallet, 'confirmed')
        .then((lamports) => {
          this.cachedBalance = lamports / 1e9;
        })
        .catch(() => undefined);
    }
    return this.cachedBalance;
  }

  lastTxSignature(): string | null {
    return this.cachedTx;
  }

  signWithSessionKey(plan: Plan, nonce: string): string {
    return signPlan(this.key, plan, nonce);
  }
}

export { Outcome, payout, ixOpenMatch, ixSettle };
