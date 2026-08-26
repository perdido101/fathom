import type { CardShape } from './cards';
import type { PackId, ShipType } from './types';

/**
 * The twelve ships, four per length.
 *
 * A ship is a hull with one trick. ACTIVE and NERF fire once per match as an
 * extra action alongside your card, and using one flips the ship face up — the
 * opponent learns *what* you are sailing but never *where* it sits. REACT
 * ships have no decision at all: they go off when they sink.
 */
export interface ShipDef {
  id: string;
  name: string;
  length: 4 | 3 | 2;
  pack: PackId;
  type: ShipType;
  /** How the ability is aimed. 'none' means it takes no targets. */
  shape: CardShape;
  text: string;
}

export const SHIP_LIST: ShipDef[] = [
  // Pack A — length 4
  {
    id: 'dreadnought',
    name: 'Dreadnought',
    length: 4,
    pack: 'A',
    type: 'REACT',
    shape: 'none',
    text: 'When sunk: add 4 charges split randomly across your cards.',
  },
  {
    id: 'forge',
    name: 'Forge',
    length: 4,
    pack: 'A',
    type: 'ACTIVE',
    shape: 'line',
    text: 'Fire a free 3-cell line.',
  },
  {
    id: 'blackout',
    name: 'Blackout',
    length: 4,
    pack: 'A',
    type: 'NERF',
    shape: 'none',
    text: 'They cannot charge next round, and immediately lose 2 charges at random.',
  },
  {
    id: 'warhead',
    name: 'Warhead',
    length: 4,
    pack: 'A',
    type: 'ACTIVE',
    shape: 'block',
    text: 'Fire a 2x2 block. Any damaged ship hit is sunk outright.',
  },

  // Pack B — length 3
  {
    id: 'kiln',
    name: 'Kiln',
    length: 3,
    pack: 'B',
    type: 'ACTIVE',
    shape: 'kiln',
    text: 'Immediately fire a card in your hand as though it held 3 more charges. It is consumed.',
  },
  {
    id: 'leech',
    name: 'Leech',
    length: 3,
    pack: 'B',
    type: 'NERF',
    shape: 'steal',
    text: 'Steal 3 charges from their cards onto yours. You choose.',
  },
  {
    id: 'cinder',
    name: 'Cinder',
    length: 3,
    pack: 'B',
    type: 'REACT',
    shape: 'none',
    text: 'When sunk: gain 2 charges at random; they cannot fire a card next round.',
  },
  {
    id: 'beacon',
    name: 'Beacon',
    length: 3,
    pack: 'B',
    type: 'ACTIVE',
    shape: 'beacon',
    text: 'Name a row or a column; learn how many ship cells occupy it. Then fire 2 cells anywhere.',
  },

  // Pack C — length 2
  {
    id: 'spite',
    name: 'Spite',
    length: 2,
    pack: 'C',
    type: 'REACT',
    shape: 'none',
    text: 'When sunk: they lose all charges on all cards.',
  },
  {
    id: 'ember',
    name: 'Ember',
    length: 2,
    pack: 'C',
    type: 'ACTIVE',
    shape: 'cells',
    text: 'Fire 3 cells anywhere. Gain 2 charges for each one that hits.',
  },
  {
    id: 'pin',
    name: 'Pin',
    length: 2,
    pack: 'C',
    type: 'ACTIVE',
    shape: 'cell',
    text: 'Fire 1 cell. If it hits, they cannot fire a card next round.',
  },
  {
    id: 'thorn',
    name: 'Thorn',
    length: 2,
    pack: 'C',
    type: 'REACT',
    shape: 'none',
    text: 'When sunk: immediately fire back at every cell they fired at this round.',
  },
];

export const SHIPS: Record<string, ShipDef> = Object.fromEntries(SHIP_LIST.map((s) => [s.id, s]));

export const SHIP_IDS: string[] = SHIP_LIST.map((s) => s.id);

export const PACK_A = SHIP_LIST.filter((s) => s.pack === 'A').map((s) => s.id);
export const PACK_B = SHIP_LIST.filter((s) => s.pack === 'B').map((s) => s.id);
export const PACK_C = SHIP_LIST.filter((s) => s.pack === 'C').map((s) => s.id);

/** Every fleet is one of each length, so this is the whole fleet space. */
export const FLEET_SPACE: string[][] = PACK_A.flatMap((a) =>
  PACK_B.flatMap((b) => PACK_C.map((c) => [a, b, c])),
);
