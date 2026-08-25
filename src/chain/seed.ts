import { sha256 } from '../engine/sha256';

/**
 * Where the match seed comes from.
 *
 * The build prompt asks for a seed committed before the match and revealed at
 * the end, so randomness is verifiable rather than server-chosen. A single
 * server-held seed does not achieve that: a server can grind seeds offline and
 * publish whichever commitment suits it. The fix costs nothing — three
 * contributions, each committed before any is revealed, hashed together.
 *
 *     seed = H(serverSeed | clientSeedA | clientSeedB)
 *
 * No single party can steer the result, because each of the other two can
 * change it, and nobody sees a contribution until all three are locked.
 *
 * This is not a VRF and does not claim to be. A VRF recommendation is a
 * separate decision that the prompt reserves — see docs/SOLANA.md.
 */

export interface SeedContribution {
  from: 'server' | 'p0' | 'p1';
  /** Published first. */
  commitHash: string;
  /** Published after every commitment is in. */
  revealed: string | null;
}

export function contribute(secret: string, from: SeedContribution['from']): SeedContribution {
  return { from, commitHash: sha256(secret), revealed: null };
}

export function randomSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Combine the three reveals. Throws if any reveal does not match the
 * commitment that was published for it — a mismatch is not an error to
 * recover from, it is proof that someone tried to move the seed.
 */
export function combineSeed(contributions: SeedContribution[]): string {
  const ordered = ['server', 'p0', 'p1'].map((from) => {
    const c = contributions.find((x) => x.from === from);
    if (!c) throw new Error(`missing seed contribution from ${from}`);
    if (c.revealed === null) throw new Error(`seed contribution from ${from} was never revealed`);
    if (sha256(c.revealed) !== c.commitHash) {
      throw new Error(`seed contribution from ${from} does not match its commitment`);
    }
    return c.revealed;
  });
  return sha256(ordered.join('|'));
}

/** Anyone can re-run this from the published transcript. */
export function checkSeed(contributions: SeedContribution[], claimedSeed: string): boolean {
  try {
    return combineSeed(contributions) === claimedSeed;
  } catch {
    return false;
  }
}
