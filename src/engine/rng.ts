// Seeded mulberry32 PRNG. The state is a uint32 carried inside MatchState so
// every draw is explicit and the engine stays deterministic.

export type RngState = number;

/** xmur3 string hash — turns a seed string into a uint32 PRNG state. */
export function hashString(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

export function seedRng(seed: string): RngState {
  return hashString(seed);
}

/** mulberry32 step: returns [uint32, nextState]. */
export function nextU32(s: RngState): [number, RngState] {
  const s2 = (s + 0x6d2b79f5) >>> 0;
  let t = s2;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [(t ^ (t >>> 14)) >>> 0, s2];
}

export function nextFloat(s: RngState): [number, RngState] {
  const [u, s2] = nextU32(s);
  return [u / 4294967296, s2];
}

/** Integer in [0, n). */
export function nextInt(s: RngState, n: number): [number, RngState] {
  const [f, s2] = nextFloat(s);
  return [Math.floor(f * n), s2];
}

export function pickOne<T>(s: RngState, arr: readonly T[]): [T, RngState] {
  const [i, s2] = nextInt(s, arr.length);
  return [arr[i], s2];
}

/** Fisher–Yates shuffle returning a new array. */
export function shuffle<T>(s: RngState, arr: readonly T[]): [T[], RngState] {
  const a = arr.slice();
  let st = s;
  for (let i = a.length - 1; i > 0; i--) {
    let j: number;
    [j, st] = nextInt(st, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return [a, st];
}

const SEED_WORDS_A = [
  'AMBER', 'CORAL', 'FATHOM', 'BRINE', 'SONAR', 'ABYSS', 'KELP', 'TIDAL',
  'PEARL', 'SQUALL', 'DRIFT', 'SHOAL', 'HARBOR', 'GALLEY', 'ANCHOR', 'BEACON',
];
const SEED_WORDS_B = [
  'REEF', 'TRENCH', 'WAKE', 'SWELL', 'DEPTH', 'CURRENT', 'MIST', 'STRAIT',
  'BUOY', 'KEEL', 'MAST', 'HULL', 'PROW', 'GYRE', 'FLARE', 'ECHO',
];

/** Human-shareable seed name like "CORAL-TRENCH-7314", derived from a base seed. */
export function seedName(base: string): string {
  const h = hashString(base);
  const a = SEED_WORDS_A[h % SEED_WORDS_A.length];
  const b = SEED_WORDS_B[(h >>> 4) % SEED_WORDS_B.length];
  const n = ((h >>> 8) % 10000).toString().padStart(4, '0');
  return `${a}-${b}-${n}`;
}
