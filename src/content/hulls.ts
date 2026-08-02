/**
 * The 24 hulls. Ported verbatim from FATHOM_RULEBOOK v2.0 §09 and
 * cross-checked against FATHOM_PRINT_1_cards.pdf.
 *
 * Paying an ACT cost flips the hull card face up and it stays revealed — the
 * ability tells the opponent that you have it, never where it is. REACT
 * abilities are free, automatic, and fire even on the owner's off-turn;
 * they flip themselves. ONCE abilities are spent after a single use.
 */
export type Trigger = 'ACT' | 'REACT';

export interface HullDef {
  id: string;
  name: string;
  /** Cells occupied. */
  length: number;
  trigger: Trigger;
  /** Cubes to activate. 0 for REACT, which is free and automatic. */
  cost: number;
  once: boolean;
  text: string;
}

export const HULLS: Record<string, HullDef> = {
  arsenal: { id: 'arsenal', name: 'Arsenal', length: 5, trigger: 'ACT', cost: 2, once: false, text: 'Your next attack also fires 2 adjacent cells you choose.' },
  dreadnought: { id: 'dreadnought', name: 'Dreadnought', length: 5, trigger: 'ACT', cost: 3, once: false, text: 'Repair one hit anywhere in your fleet. Once per turn.' },
  quartermaster: { id: 'quartermaster', name: 'Quartermaster', length: 5, trigger: 'ACT', cost: 5, once: true, text: 'Straighten all of your sideways cards.' },
  bastion: { id: 'bastion', name: 'Bastion', length: 5, trigger: 'REACT', cost: 0, once: false, text: 'When sunk: repeat every hit they landed this turn onto their board.' },
  salvager: { id: 'salvager', name: 'Salvager', length: 5, trigger: 'REACT', cost: 0, once: false, text: 'Each time this hull is hit, take 3 cubes.' },

  carrier: { id: 'carrier', name: 'Carrier', length: 4, trigger: 'ACT', cost: 4, once: true, text: 'Fire 3 cells anywhere on the board.' },
  firestorm: { id: 'firestorm', name: 'Firestorm', length: 4, trigger: 'ACT', cost: 6, once: true, text: 'Name a 4x4. Fire its four corners and its centre.' },
  censor: { id: 'censor', name: 'Censor', length: 4, trigger: 'ACT', cost: 4, once: true, text: 'Lock one of their sideways cards until Censor is struck.' },
  undertow: { id: 'undertow', name: 'Undertow', length: 4, trigger: 'ACT', cost: 6, once: true, text: 'They must reveal one full hull of their choice.' },
  wrecker: { id: 'wrecker', name: 'Wrecker', length: 4, trigger: 'REACT', cost: 0, once: false, text: 'When sunk: remove one random card from their hand permanently.' },
  harpoon: { id: 'harpoon', name: 'Harpoon', length: 4, trigger: 'ACT', cost: 3, once: false, text: 'Fire one cell. While it keeps hitting, fire again.' },

  sapper: { id: 'sapper', name: 'Sapper', length: 3, trigger: 'ACT', cost: 4, once: false, text: 'Fire one cell. On a miss, fire the next along. Up to three cells.' },
  tithe: { id: 'tithe', name: 'Tithe', length: 3, trigger: 'ACT', cost: 3, once: false, text: 'Take 2 cubes for every hit they landed last turn.' },
  dowser: { id: 'dowser', name: 'Dowser', length: 3, trigger: 'ACT', cost: 5, once: true, text: 'Name a row and a column. They say which holds more occupied cells.' },
  cartographer: { id: 'cartographer', name: 'Cartographer', length: 3, trigger: 'ACT', cost: 5, once: true, text: 'Name any four cells. They say how many are occupied.' },
  magazine: { id: 'magazine', name: 'Magazine', length: 3, trigger: 'REACT', cost: 0, once: false, text: 'When sunk: immediately take 5 cubes.' },
  chameleon: { id: 'chameleon', name: 'Chameleon', length: 3, trigger: 'REACT', cost: 0, once: false, text: 'Cannot be revealed by any detection effect.' },
  nightwatch: { id: 'nightwatch', name: 'Nightwatch', length: 3, trigger: 'REACT', cost: 0, once: false, text: 'When detection touches it, the scanner loses 3 cubes.' },

  chainshot: { id: 'chainshot', name: 'Chainshot', length: 2, trigger: 'ACT', cost: 3, once: false, text: 'Fire two cells in the same row, exactly three apart.' },
  lookout: { id: 'lookout', name: 'Lookout', length: 2, trigger: 'ACT', cost: 2, once: false, text: 'They say the total number of their hull cells not yet hit.' },
  vesper: { id: 'vesper', name: 'Vesper', length: 2, trigger: 'ACT', cost: 4, once: true, text: 'For two turns their shots are answered honestly but destroy nothing.' },
  saboteur: { id: 'saboteur', name: 'Saboteur', length: 2, trigger: 'REACT', cost: 0, once: false, text: 'When this hull is hit, their next card costs 2 more.' },

  torchbearer: { id: 'torchbearer', name: 'Torchbearer', length: 1, trigger: 'ACT', cost: 2, once: true, text: 'Your next detection card resolves twice.' },
  boarder: { id: 'boarder', name: 'Boarder', length: 1, trigger: 'REACT', cost: 0, once: false, text: 'When hit: swap a random card from your hand with one of theirs.' },
};

export const HULL_IDS = Object.keys(HULLS);

/** The full roster is public — it is printed in the rulebook. */
export function hullsOfLength(n: number): HullDef[] {
  return HULL_IDS.map((id) => HULLS[id]).filter((h) => h.length === n);
}
