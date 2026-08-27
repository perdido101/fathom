/**
 * How long each resolve beat is held.
 *
 * Two things read this: the resolve overlay, which advances one beat at a
 * time, and the feedback layer, which schedules its floaters against the same
 * clock so a "HIT" rises off a cell in the same instant the overlay says the
 * word. They were separate numbers until Build 6 and drifted apart twice.
 */

export const STEP_TITLES: Record<string, string> = {
  reveal: '1 · Reveal',
  nerf: '2 · Interference',
  prediction: '3 · Predictions',
  shot: '4 · Attacks',
  sink: '5 · Sinks',
  react: '6 · Reactions',
  charges: '7 · Charges',
  intel: '7 · Intel',
  draw: '8 · Draw',
  strike: '— Timer',
  end: '— Result',
};

export const STEP_MS: Record<string, number> = {
  reveal: 500,
  nerf: 460,
  prediction: 760,
  shot: 190,
  sink: 780,
  react: 620,
  charges: 340,
  intel: 440,
  draw: 260,
  strike: 400,
  end: 900,
};

/** Fast resolve keeps every beat and compresses the sequence to about a second. */
export const FAST_SCALE = 0.25;

export function stepMs(kind: string, fast: boolean): number {
  return Math.max(40, (STEP_MS[kind] ?? 300) * (fast ? FAST_SCALE : 1));
}

/**
 * The moment each event in a round is reached, in milliseconds from the start
 * of the sequence. Index 0 is reached immediately; every later beat waits out
 * the beats before it.
 */
export function beatOffsets(kinds: string[], fast: boolean): number[] {
  const out: number[] = [];
  let t = 0;
  for (const k of kinds) {
    out.push(t);
    t += stepMs(k, fast);
  }
  return out;
}
