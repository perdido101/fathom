import nacl from 'tweetnacl';
import type { Plan } from '../engine/types';
import { commit, stableStringify } from '../engine/sha256';

/**
 * Session keys.
 *
 * A wallet popup between rounds would be unplayable at a 20-second timer, so
 * the wallet signs exactly once — at connect — to authorise a throwaway
 * ed25519 keypair for this session. Every round commitment is then signed by
 * that key, locally and instantly.
 *
 * The security claim is deliberately modest and worth stating plainly: a
 * session key can sign game moves and nothing else. It never touches funds,
 * which are escrowed by the on-chain program against the wallet, not the
 * session. The worst a stolen session key can do is play your match badly.
 */

export interface SessionKey {
  publicKeyHex: string;
  secretKey: Uint8Array;
  /** The wallet signature that authorised this key, for the transcript. */
  authorisation: string | null;
  issuedAt: number;
  expiresAt: number;
}

const SESSION_HOURS = 12;

export function issueSessionKey(now: number, authorisation: string | null = null): SessionKey {
  const pair = nacl.sign.keyPair();
  return {
    publicKeyHex: hex(pair.publicKey),
    secretKey: pair.secretKey,
    authorisation,
    issuedAt: now,
    expiresAt: now + SESSION_HOURS * 3600_000,
  };
}

/** The exact bytes a wallet is asked to sign when authorising a session. */
export function authorisationMessage(publicKeyHex: string, expiresAt: number): string {
  return [
    'Shadow Armada — authorise a session key',
    '',
    'This key may sign game moves for this session only.',
    'It cannot move funds.',
    '',
    `key: ${publicKeyHex}`,
    `expires: ${new Date(expiresAt).toISOString()}`,
  ].join('\n');
}

/** Sign a plan commitment. The plan itself stays secret until the reveal. */
export function signPlan(key: SessionKey, plan: Plan, nonce: string): string {
  return hex(nacl.sign.detached(utf8(commit(plan, nonce)), key.secretKey));
}

/** Sign any payload, used for deployment commitments and match acceptance. */
export function signPayload(key: SessionKey, payload: unknown): string {
  return hex(nacl.sign.detached(utf8(stableStringify(payload)), key.secretKey));
}

/**
 * Check a round signature. This is what makes the transcript a transcript
 * rather than a claim: without it a server could invent moves for a player
 * and the replay would happily reproduce its lie.
 */
export function verifyPlanSignature(
  publicKeyHex: string,
  signatureHex: string,
  commitHash: string,
): boolean {
  try {
    return nacl.sign.detached.verify(
      utf8(commitHash),
      unhex(signatureHex),
      unhex(publicKeyHex),
    );
  } catch {
    return false;
  }
}

export function hex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

export function unhex(s: string): Uint8Array {
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}
