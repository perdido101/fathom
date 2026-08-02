/**
 * Amber scope: a retro-futurist sonar console. Near-black hull, multi-phosphor
 * readouts, thin linework. No gradients, no glow filters, no photographic
 * texture — the CRT feel comes from colour and line, not effects.
 *
 * No component may hardcode a hex. Everything resolves through these tokens,
 * which are also emitted as CSS custom properties on :root.
 */
export const PALETTE = {
  void: '#060A09', // page background
  hull: '#0B1210', // surface 0
  deck: '#16241C', // surface 1, grid cells
  panel: '#1E3228', // surface 2, cards, trays
  line: '#2E4038', // hairlines, grid rules

  green: '#39FF8B', // primary phosphor: hits, confirm, defense
  amber: '#FFB020', // energy, warnings, tier 2
  red: '#FF3B30', // sunk, danger, attack
  cyan: '#3BE8FF', // detection, information, tier 1
  magenta: '#FF5FD2', // tier 3, rare, once-per-match
  violet: '#9D6BFF', // utility, statuses

  bone: '#E6E2D0', // primary text
  boneDim: '#9AA79B', // secondary text
  boneFaint: '#61705F', // muted text, terrain linework
} as const;

export type PaletteKey = keyof typeof PALETTE;

/**
 * Colour must mean something. If an element needs a colour and this map has
 * none for it, that is a design gap to report — not a licence to invent one.
 */
export const ENCODING = {
  tag: {
    attack: 'red',
    detect: 'cyan',
    utility: 'violet',
    defense: 'green',
  },
  tier: { 1: 'bone', 2: 'amber', 3: 'magenta' },
  marker: {
    miss: 'boneFaint',
    hit: 'green',
    sunk: 'red',
    probe: 'cyan',
    mine: 'amber',
    decoy: 'violet',
  },
  energy: 'amber',
  unavailable: 'boneDim',
  status: 'violet',
  statusBad: 'red',
  bot: 'cyan',
} as const;

/** Ship accents are derived from a hash of the id: never red or magenta. */
export const SHIP_ACCENTS: PaletteKey[] = ['green', 'cyan', 'violet', 'amber'];

export function accentForShip(id: string): PaletteKey {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return SHIP_ACCENTS[h % SHIP_ACCENTS.length];
}

/** Stable per-id hash for varying generated glyph geometry. */
export function idHash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const cssVars = (): string =>
  Object.entries(PALETTE)
    .map(([k, v]) => `--${k}: ${v};`)
    .join('\n  ');
