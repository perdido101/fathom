/**
 * Seeded randomness.
 *
 * The engine never touches Math.random. Every random decision in a match —
 * pack order, draw pile order, Dreadnought's scatter, Blackout's theft, a
 * timed-out player's shot — comes from this generator, whose state is carried
 * explicitly in the match and advanced by returning a new state rather than
 * mutating one. That is what makes a match replayable from its seed alone.
 */

export interface RngState {
  readonly s: number;
}

/** FNV-1a over the seed string, so a human-readable seed maps to 32 bits. */
export function seedRng(seed: string): RngState {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return { s: h >>> 0 };
}

/** mulberry32: one step, returning the value and the next state. */
export function next(state: RngState): [number, RngState] {
  let a = (state.s + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, { s: a >>> 0 }];
}

/** Uniform integer in [0, bound). */
export function nextInt(state: RngState, bound: number): [number, RngState] {
  if (bound <= 1) return [0, state];
  const [v, st] = next(state);
  return [Math.floor(v * bound), st];
}

/** Fisher-Yates, non-mutating. */
export function shuffle<T>(state: RngState, items: readonly T[]): [T[], RngState] {
  const out = items.slice();
  let st = state;
  for (let i = out.length - 1; i > 0; i--) {
    let j: number;
    [j, st] = nextInt(st, i + 1);
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return [out, st];
}

/** One element, uniformly. Returns null for an empty list. */
export function pick<T>(state: RngState, items: readonly T[]): [T | null, RngState] {
  if (items.length === 0) return [null, state];
  const [i, st] = nextInt(state, items.length);
  return [items[i], st];
}
