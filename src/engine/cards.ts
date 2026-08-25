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
}

export const CARD_LIST: CardDef[] = [
  {
    id: 'salvo',
    name: 'Salvo',
    minCharges: 1,
    shape: 'cells',
    role: 'attack',
    text: 'Fire 1 cell per charge, anywhere on the board.',
  },
  {
    id: 'lance',
    name: 'Lance',
    minCharges: 1,
    shape: 'line',
    role: 'attack',
    text: 'Fire a straight orthogonal line of length C.',
  },
  {
    id: 'burst',
    name: 'Burst',
    minCharges: 2,
    shape: 'block',
    role: 'attack',
    text: 'At C2: fire a 2x2 block. At C4: fire a 3x3 block. Cannot be fired below 2.',
  },
  {
    id: 'rake',
    name: 'Rake',
    minCharges: 1,
    shape: 'row',
    role: 'attack',
    text: 'Fire 3 cells in a row. Each charge above 1 adds 1 more cell to that row.',
  },
  {
    id: 'breaker',
    name: 'Breaker',
    minCharges: 3,
    shape: 'block',
    role: 'attack',
    text: 'At C3: fire a 2x2 block. Any damaged ship hit is sunk outright. Cannot be fired below 3.',
  },
  {
    id: 'ping',
    name: 'Ping',
    minCharges: 1,
    shape: 'cells',
    role: 'intel',
    text: 'Fire 1 cell per charge. For each miss, learn whether a ship sits orthogonally adjacent.',
  },
  {
    id: 'echo',
    name: 'Echo',
    minCharges: 1,
    shape: 'cells',
    role: 'intel',
    text: 'Fire 1 cell per charge. For each hit, they reveal one further cell of that same ship.',
  },
  {
    id: 'sounding',
    name: 'Sounding',
    minCharges: 1,
    shape: 'cell',
    role: 'intel',
    text: 'Fire 1 cell. At C2: also learn that column’s ship-cell count. At C3: row and column.',
  },
  {
    id: 'jam',
    name: 'Jam',
    minCharges: 1,
    shape: 'strip',
    role: 'control',
    text: 'Remove C charges from their cards. You choose which.',
  },
  {
    id: 'siphon',
    name: 'Siphon',
    minCharges: 1,
    shape: 'steal',
    role: 'control',
    text: 'Steal C charges from their cards onto one of yours. You choose source and destination.',
  },
  {
    id: 'mirror',
    name: 'Mirror',
    minCharges: 2,
    shape: 'cell',
    role: 'prediction',
    text: 'Needs 2 charges. Name a cell. If their attack includes it, their entire attack misses and you gain C x 2 charges.',
  },
  {
    id: 'ambush',
    name: 'Ambush',
    minCharges: 0,
    shape: 'cell',
    role: 'prediction',
    text: 'Name a cell. If their attack includes it: C0 fire back at it; C2 add its two horizontal neighbours; C3 fire its entire row.',
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
