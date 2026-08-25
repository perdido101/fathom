/**
 * Visual effects, declared as hooks before any of them are built.
 *
 * Each entry names where the effect fires, what it should read as, and how
 * long it has. The battle screen already emits these at the right moments via
 * the resolve event list, so wiring a real effect means replacing one CSS
 * animation — not finding the call site.
 */

export interface VfxHook {
  id: string;
  trigger: string;
  reads: string;
  durationMs: number;
  /** The CSS class the placeholder currently uses, if any. */
  placeholder: string | null;
}

export const VFX_HOOKS: VfxHook[] = [
  {
    id: 'hit-flare',
    trigger: 'a shot lands on a hull',
    reads: 'hard orange-white bloom at the cell, brief screen-shake at the board level',
    durationMs: 520,
    placeholder: '.flare.hitfx',
  },
  {
    id: 'miss-splash',
    trigger: 'a shot lands on water',
    reads: 'cool ring expanding outward, no light, no shake',
    durationMs: 520,
    placeholder: '.flare.missfx',
  },
  {
    id: 'sink-sequence',
    trigger: 'a ship is announced sunk',
    reads: 'the hull darkens along its length bow to stern, then the length number stamps over it',
    durationMs: 1400,
    placeholder: null,
  },
  {
    id: 'charge-accumulation',
    trigger: 'a charge seats on a card',
    reads: 'the number swells and settles; the card edge picks up warmth as the count climbs',
    durationMs: 320,
    placeholder: '.charges',
  },
  {
    id: 'charge-theft',
    trigger: 'Jam, Siphon, Leech or Blackout moves charges',
    reads: 'charges arc across the gap between the two hands, arriving late enough to read',
    durationMs: 640,
    placeholder: null,
  },
  {
    id: 'ability-reveal-flip',
    trigger: 'an ACTIVE or NERF ability is activated',
    reads: 'the ship card flips face up and stays up — identity revealed, position not',
    durationMs: 700,
    placeholder: null,
  },
  {
    id: 'prediction-trigger',
    trigger: 'Mirror or Ambush reads the opponent correctly',
    reads: 'the named cell rings once and the incoming attack visibly stalls on it',
    durationMs: 900,
    placeholder: null,
  },
];
