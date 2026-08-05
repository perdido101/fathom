import type { SymbolId } from './symbols';

/**
 * The 20 grid cards, ported cell-for-cell from FATHOM_PRINT_2_grid.pdf.
 *
 * Each card is a 4×4 patch with its own printed id and internal coordinates,
 * so a cell is addressed as `cardId-localCoord` — "12-B3" is card twelve,
 * cell B3. Cards are never rotated, and both boards are built from the same
 * layout, so terrain is identical for both players.
 *
 * Extracted programmatically from the print file's vector fills; both printed
 * copies of every card were compared and matched exactly.
 */
export interface GridCard {
  id: number;
  /** Local coordinate ("A1".."D4") → symbol. Omitted cells are open water. */
  cells: Partial<Record<string, SymbolId>>;
}

export const GRID_CARD_SIZE = 4;

export const GRID_CARDS: GridCard[] = [
  { id: 1, cells: { B2: 'REEF', C2: 'REEF', D4: 'SHALLOWS' } },
  { id: 2, cells: { A3: 'SHALLOWS', B3: 'SHALLOWS', D1: 'TRENCH' } },
  { id: 3, cells: { A4: 'UPWELLING', C1: 'TRENCH', C2: 'TRENCH' } },
  { id: 4, cells: { A1: 'STORM', B4: 'UPWELLING', C4: 'UPWELLING' } },
  { id: 5, cells: { B1: 'WRECKAGE', D2: 'FOG', D3: 'FOG' } },
  { id: 6, cells: { A1: 'STORM', B1: 'STORM', C3: 'REEF' } },
  { id: 7, cells: { A2: 'SHALLOWS', C3: 'WRECKAGE', D4: 'REEF' } },
  { id: 8, cells: { A2: 'REEF', A3: 'REEF', C4: 'FOG' } },
  { id: 9, cells: { B2: 'TRENCH', B3: 'TRENCH', D1: 'STORM' } },
  { id: 10, cells: { A4: 'WRECKAGE', C2: 'UPWELLING', D2: 'STORM' } },
  { id: 11, cells: { A4: 'FOG', B4: 'FOG', C1: 'SHALLOWS' } },
  { id: 12, cells: { B1: 'REEF', C1: 'REEF', C2: 'REEF' } },
  { id: 13, cells: { A1: 'SHALLOWS', A2: 'SHALLOWS', D4: 'STORM' } },
  { id: 14, cells: { B3: 'TRENCH', D1: 'WRECKAGE', D2: 'WRECKAGE' } },
  { id: 15, cells: { A1: 'FOG', B3: 'UPWELLING', C3: 'UPWELLING' } },
  { id: 16, cells: { A4: 'STORM', B4: 'STORM', D2: 'REEF' } },
  { id: 17, cells: { A2: 'UPWELLING', C3: 'TRENCH', C4: 'TRENCH' } },
  { id: 18, cells: { A3: 'FOG', B2: 'WRECKAGE', D3: 'SHALLOWS' } },
  { id: 19, cells: { B1: 'UPWELLING', D3: 'REEF', D4: 'REEF' } },
  { id: 20, cells: { A1: 'TRENCH', C2: 'FOG', C3: 'STORM' } },
];

/** Symbol at a local coordinate of a grid card. */
export function symbolAt(card: GridCard, local: string): SymbolId {
  return card.cells[local] ?? 'OPEN';
}

/** "A1".."D4" for a 0-indexed column and row within a card. */
export function localCoord(col: number, row: number): string {
  return `${String.fromCharCode(65 + col)}${row + 1}`;
}

/**
 * Match sizes.
 *
 * Density is the number that matters: hull cells as a fraction of the board.
 * Classic Battleship runs at 17%, but Fathom legalises diagonals, which
 * roughly doubles the orientations a hit could belong to and makes each
 * answer far less informative. So Fathom needs to sit *above* 17%, not at it
 * — the printed prototype played at 17% and felt empty, which is exactly
 * what that predicts.
 *
 * Every size below targets ~21%.
 *
 * The 24-hull roster caps a two-player match at six hulls each (six packs of
 * four consumes the whole deck), so a 12x12 sea cannot reach a sensible
 * density for a duel at all — at six hulls it is 14%. That size is reserved
 * for team play, where four fleets share the water.
 */
export interface MatchSize {
  id: 'duel' | 'deep' | 'squadron';
  name: string;
  gridCards: number;
  /** Board dimensions in cells. */
  gridW: number;
  gridH: number;
  /** Grid cards across and down. */
  cardsAcross: number;
  cardsDown: number;
  /** Hulls per player, which is also the number of ship packs. */
  hulls: number;
  /** Action cards per player. */
  actionCards: number;
  /** Players this size is built for. */
  players: 2 | 4;
}

export const MATCH_SIZES: Record<MatchSize['id'], MatchSize> = {
  duel: {
    id: 'duel',
    name: 'Duel',
    gridCards: 4,
    gridW: 8,
    gridH: 8,
    cardsAcross: 2,
    cardsDown: 2,
    hulls: 4,
    actionCards: 5,
    players: 2,
  },
  deep: {
    id: 'deep',
    name: 'Deep duel',
    gridCards: 6,
    gridW: 8,
    gridH: 12,
    cardsAcross: 2,
    cardsDown: 3,
    hulls: 6,
    actionCards: 7,
    players: 2,
  },
  /**
   * Reserved for team play. The 2v2 rules are not written yet, so the hull
   * count here is a placeholder and the density figure is meaningless until
   * they say whether the four fleets share one sea or hold two. A duel on
   * this board sits at 14% and plays exactly as flat as the prototype did,
   * which is why it is not offered as a two-player size.
   */
  squadron: {
    id: 'squadron',
    name: 'Squadron',
    gridCards: 9,
    gridW: 12,
    gridH: 12,
    cardsAcross: 3,
    cardsDown: 3,
    hulls: 4,
    actionCards: 5,
    players: 4,
  },
};

export const DUEL_SIZES: MatchSize['id'][] = ['duel', 'deep'];

/** Hull cells as a fraction of the board — the number that sets the feel. */
export const AVERAGE_HULL_LENGTH = 10 / 3;

export function density(size: MatchSize): number {
  return (size.hulls * AVERAGE_HULL_LENGTH) / (size.gridW * size.gridH);
}
