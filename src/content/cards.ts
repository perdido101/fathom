import type { CardDef } from '../engine/types';

export const BASIC_SALVO_ID = 'basic_salvo';

/**
 * Costs were tuned against numeric cooldowns that no longer exist. With the
 * binary availability rule (play a card, it sits out your next turn), energy
 * is the only brake on a turn's throughput. Every cost below is provisional
 * pending the first calibrated sim run.
 */

export const CARDS: Record<string, CardDef> = {
  // ---- Permanent, undraftable ----
  basic_salvo: {
    id: 'basic_salvo',
    name: 'Basic Salvo',
    cost: 1,
    tier: 0,
    tags: ['attack'],
    text: 'Fire one cell.',
    effect: { kind: 'fire_cells', count: 1 },
  },

  // ---- Tier 1 ----
  twin_shot: {
    id: 'twin_shot',
    name: 'Twin Shot',
    cost: 2,
    tier: 1,
    tags: ['attack'],
    text: 'Fire two separate cells.',
    effect: { kind: 'fire_cells', count: 2 },
  },
  line_probe: {
    id: 'line_probe',
    name: 'Line Probe',
    cost: 2,
    tier: 1,
    tags: ['detect'],
    text: 'Choose 3 cells in a row. Reports only how many are occupied.',
    effect: { kind: 'probe_line', length: 3 },
  },
  depth_charge: {
    id: 'depth_charge',
    name: 'Depth Charge',
    cost: 3,
    tier: 1,
    tags: ['attack', 'detect'],
    text: 'Fire one cell; also reports whether any orthogonal neighbour is occupied.',
    effect: { kind: 'fire_probe_adjacent' },
  },
  scatter: {
    id: 'scatter',
    name: 'Scatter',
    cost: 2,
    tier: 1,
    tags: ['attack'],
    text: 'Fire 3 random cells inside a chosen 4×4 zone.',
    effect: { kind: 'fire_scatter', zone: 4, shots: 3 },
  },
  buoy: {
    id: 'buoy',
    name: 'Buoy',
    cost: 1,
    tier: 1,
    tags: ['detect'],
    text: 'Mark a cell. At the start of your next turn, learn if it is occupied.',
    effect: { kind: 'probe_delayed' },
  },
  ballast: {
    id: 'ballast',
    name: 'Ballast',
    cost: 1,
    tier: 1,
    tags: ['utility'],
    text: 'Gain 3 energy at the start of your next turn.',
    effect: { kind: 'energy_delayed', amount: 3 },
  },

  // ---- Tier 2 ----
  cross_salvo: {
    id: 'cross_salvo',
    name: 'Cross Salvo',
    cost: 4,
    tier: 2,
    tags: ['attack'],
    text: 'Fire a plus-shape of 5 cells.',
    effect: { kind: 'fire_plus' },
  },
  sonar_sweep: {
    id: 'sonar_sweep',
    name: 'Sonar Sweep',
    cost: 3,
    tier: 2,
    tags: ['detect'],
    text: 'Reports how many cells are occupied in a 3×3 zone.',
    effect: { kind: 'probe_zone_count', zone: 3 },
  },
  torpedo: {
    id: 'torpedo',
    name: 'Torpedo',
    cost: 4,
    tier: 2,
    tags: ['attack'],
    text: 'Fires along a row or column from an edge until it hits something or hits reef.',
    effect: { kind: 'fire_torpedo' },
  },
  barrage: {
    id: 'barrage',
    name: 'Barrage',
    cost: 5,
    tier: 2,
    tags: ['attack'],
    text: 'Fire an entire row. Reports total hits only, not which cells.',
    effect: { kind: 'fire_row_sweep' },
  },
  decoy: {
    id: 'decoy',
    name: 'Decoy',
    cost: 3,
    tier: 2,
    tags: ['utility'],
    text: 'For 3 turns, 2 of your empty cells report as hits when fired on.',
    effect: { kind: 'decoy', count: 2, turns: 3 },
  },
  repair: {
    id: 'repair',
    name: 'Repair',
    cost: 3,
    tier: 2,
    tags: ['utility'],
    text: 'Restore one damaged, unsunk cell of your fleet.',
    effect: { kind: 'repair' },
  },

  // ---- Tier 3 ----
  satellite: {
    id: 'satellite',
    name: 'Satellite',
    cost: 6,
    tier: 3,
    tags: ['detect'],
    text: 'Reveal the exact occupied cells in a 4×4 zone.',
    effect: { kind: 'reveal_zone', zone: 4 },
  },
  saturation: {
    id: 'saturation',
    name: 'Saturation Fire',
    cost: 8,
    tier: 3,
    tags: ['attack'],
    text: 'Fire every cell in a 3×3 zone.',
    effect: { kind: 'fire_zone', zone: 3 },
  },
  wolfpack: {
    id: 'wolfpack',
    name: 'Wolfpack',
    cost: 6,
    tier: 3,
    tags: ['attack'],
    text: 'Fire 3 cells anywhere on the grid.',
    effect: { kind: 'fire_cells', count: 3 },
  },
  emp: {
    id: 'emp',
    name: 'EMP Burst',
    cost: 5,
    tier: 3,
    tags: ['utility'],
    text: 'Enemy energy income is halved for their next 2 turns.',
    effect: { kind: 'emp', turns: 2 },
  },
  dredge: {
    id: 'dredge',
    name: 'Dredge',
    cost: 7,
    tier: 3,
    tags: ['attack'],
    text: 'Fire every cell in a column that you have previously fired on at least once.',
    effect: { kind: 'fire_marked_column' },
  },
  blockade: {
    id: 'blockade',
    name: 'Blockade',
    cost: 4,
    tier: 3,
    tags: ['utility'],
    text: 'For 2 turns, enemy detection cards cost 2 more.',
    effect: { kind: 'blockade', turns: 2, surcharge: 2 },
  },
};

export const CARD_IDS = Object.keys(CARDS);
export const DRAFTABLE_CARD_IDS = CARD_IDS.filter((id) => CARDS[id].tier !== 0);

export function cardsOfTiers(tiers: number[]): CardDef[] {
  return DRAFTABLE_CARD_IDS.map((id) => CARDS[id]).filter((c) => tiers.includes(c.tier));
}
