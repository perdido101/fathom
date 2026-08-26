import type { FireSpec } from './types';

/**
 * The twelve cards.
 *
 * There is no cost, no tier and no cooldown. A card has one number on it —
 * its charges — and every effect reads that number. Firing spends all of them
 * and destroys the card for the rest of the match, so the only question a
 * player ever asks is "now, or bigger later?".
 */
export type CardShape = FireSpec['shape'];

export interface CardDef {
  id: string;
  name: string;
  /** Lowest charge count at which the card may be fired at all. */
  minCharges: number;
  shape: CardShape;
  /** Broad role, used by bots and by the UI's colour coding. */
  role: 'attack' | 'intel' | 'control' | 'prediction';
  text: string;
  /**
   * The same rule in one line, for the battle hand.
   *
   * Three cards have to fit across a phone during a twenty-second timer. The
   * full text clipped mid-sentence there, which is worse than saying less —
   * a player who cannot read the card cannot plan with it. The full text is
   * still what the draft screen shows, where there is room for it.
   */
  short: string;
}

export const CARD_LIST: CardDef[] = [
  {
    id: 'salvo',
    name: 'Salvo',
    minCharges: 1,
    shape: 'cells',
    role: 'attack',
    text: 'Fire 1 cell per charge, anywhere on the board.',
    short: 'Fire 1 cell per charge',
  },
  {
    id: 'lance',
    name: 'Lance',
    minCharges: 1,
    shape: 'line',
    role: 'attack',
    text: 'Fire a straight orthogonal line of length C.',
    short: 'Fire a straight line, C long',
  },
  {
    id: 'burst',
    name: 'Burst',
    minCharges: 2,
    shape: 'block',
    role: 'attack',
    text: 'At C2: fire a 2x2 block. At C4: fire a 3x3 block. Cannot be fired below 2.',
    short: 'C2: fire 2x2. C4: fire 3x3',
  },
  {
    id: 'rake',
    name: 'Rake',
    minCharges: 1,
    shape: 'row',
    role: 'attack',
    text: 'Fire 3 cells in a row. Each charge above 1 adds 1 more cell to that row.',
    short: 'Fire 3 in a row, +1 per extra charge',
  },
  {
    id: 'breaker',
    name: 'Breaker',
    minCharges: 3,
    shape: 'block',
    role: 'attack',
    text: 'At C3: fire a 2x2 block. Any damaged ship hit is sunk outright. Cannot be fired below 3.',
    short: 'C3: fire 2x2, sinking anything damaged',
  },
  {
    id: 'ping',
    name: 'Ping',
    minCharges: 1,
    shape: 'cells',
    role: 'intel',
    text: 'Fire 1 cell per charge. For each miss, learn whether a ship sits orthogonally adjacent.',
    short: '1 cell per charge; each miss reveals its neighbours',
  },
  {
    id: 'echo',
    name: 'Echo',
    minCharges: 1,
    shape: 'cells',
    role: 'intel',
    text: 'Fire 1 cell per charge. For each hit, they reveal one further cell of that same ship.',
    short: '1 cell per charge; each hit exposes another cell',
  },
  {
    id: 'sounding',
    name: 'Sounding',
    minCharges: 1,
    shape: 'cell',
    role: 'intel',
    text: 'Fire 1 cell. At C2: also learn that column’s ship-cell count. At C3: row and column.',
    short: 'Fire 1 cell; C2 reads the column, C3 the row too',
  },
  {
    id: 'jam',
    name: 'Jam',
    minCharges: 1,
    shape: 'strip',
    role: 'control',
    text: 'Remove C charges from their cards. You choose which.',
    short: 'Strip C charges from their cards',
  },
  {
    id: 'siphon',
    name: 'Siphon',
    minCharges: 1,
    shape: 'steal',
    role: 'control',
    text: 'Steal C charges from their cards onto one of yours. You choose source and destination.',
    short: 'Steal C charges onto one of yours',
  },
  {
    id: 'mirror',
    name: 'Mirror',
    minCharges: 2,
    shape: 'cell',
    role: 'prediction',
    text: 'Needs 2 charges. Name a cell. If their attack includes it, their entire attack misses and you gain C x 2 charges.',
    short: 'Needs 2. Read a cell, cancel their whole round',
  },
  {
    id: 'ambush',
    name: 'Ambush',
    minCharges: 0,
    shape: 'cell',
    role: 'prediction',
    text: 'Name a cell. If their attack includes it: C0 fire back at it; C2 add its two horizontal neighbours; C3 fire its entire row.',
    short: 'Read a cell, fire back at it',
  },
];

export const CARDS: Record<string, CardDef> = Object.fromEntries(CARD_LIST.map((c) => [c.id, c]));

export const CARD_IDS: string[] = CARD_LIST.map((c) => c.id);

/** Ambush is the only card that does anything from a standing start. */
export function canFireAt(defId: string, charges: number): boolean {
  return charges >= CARDS[defId].minCharges;
}

/** How many cells this card would fire at a given charge count. */
export function shotCount(defId: string, c: number): number {
  switch (defId) {
    case 'salvo':
    case 'ping':
    case 'echo':
      return c;
    case 'lance':
      return c;
    case 'burst':
      return c >= 4 ? 9 : c >= 2 ? 4 : 0;
    case 'rake':
      return 3 + Math.max(0, c - 1);
    case 'breaker':
      return c >= 3 ? 4 : 0;
    case 'sounding':
      return 1;
    case 'mirror':
    case 'jam':
    case 'siphon':
      return 0;
    case 'ambush':
      return c >= 3 ? 6 : c >= 2 ? 3 : 1;
    default:
      return 0;
  }
}
