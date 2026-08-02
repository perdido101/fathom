/**
 * Terrain effect modifiers: one is drawn face up at match start and applies
 * to both players all match. Each changes the behaviour of exactly one
 * existing terrain type (wreckage — the cells of sunk ships — counts as a
 * terrain state for this purpose). Never a new rule, only a twist on one.
 *
 * NOTE: the design doc's examples reference `storm` and `current` terrain
 * and diagonal line effects, none of which exist in the current content set
 * (5 terrain types, orthogonal-only line cards). The 16 modifiers below are
 * authored strictly over existing terrain behaviour; flagged in the report.
 */

export type ModifierEffect =
  | { kind: 'fog_blocks_detection' }
  | { kind: 'fog_reveals_identity' }
  | { kind: 'fog_no_hit_bonus' }
  | { kind: 'trench_single_hit' }
  | { kind: 'trench_hides_from_detection' }
  | { kind: 'trench_no_repair' }
  | { kind: 'reef_no_line_block' }
  | { kind: 'reef_conceals_adjacent' }
  | { kind: 'reef_shot_penalty' }
  | { kind: 'shallows_no_reveal' }
  | { kind: 'shallows_reveal_eight' }
  | { kind: 'shallows_bonus_energy' }
  | { kind: 'wreck_salvage_energy' }
  | { kind: 'wreck_blocks_lines' }
  | { kind: 'open_swift_two' }
  | { kind: 'open_decoy_extended' };

export interface ModifierDef {
  id: string;
  name: string;
  terrain: 'FOG' | 'TRENCH' | 'REEF' | 'SHALLOWS' | 'OPEN' | 'WRECK';
  text: string;
  effect: ModifierEffect;
}

export const MODIFIERS: Record<string, ModifierDef> = {
  spring_tide: {
    id: 'spring_tide',
    name: 'Spring Tide',
    terrain: 'FOG',
    text: 'Fog also blocks detection — probes and reveals report nothing for fogged cells.',
    effect: { kind: 'fog_blocks_detection' },
  },
  burn_off: {
    id: 'burn_off',
    name: 'Burn-Off',
    terrain: 'FOG',
    text: 'Thin fog: hits and sinks in fog are reported normally.',
    effect: { kind: 'fog_reveals_identity' },
  },
  rolling_fog: {
    id: 'rolling_fog',
    name: 'Rolling Fog',
    terrain: 'FOG',
    text: 'Hits in fog grant no bonus energy.',
    effect: { kind: 'fog_no_hit_bonus' },
  },
  silted_up: {
    id: 'silted_up',
    name: 'Silted Up',
    terrain: 'TRENCH',
    text: 'Trench no longer doubles hits, and ships there cannot be relocated.',
    effect: { kind: 'trench_single_hit' },
  },
  deep_water: {
    id: 'deep_water',
    name: 'Deep Water',
    terrain: 'TRENCH',
    text: 'Ship cells in a trench are invisible to detection.',
    effect: { kind: 'trench_hides_from_detection' },
  },
  undertow: {
    id: 'undertow',
    name: 'Undertow',
    terrain: 'TRENCH',
    text: 'Cells in a trench cannot be repaired.',
    effect: { kind: 'trench_no_repair' },
  },
  breakers: {
    id: 'breakers',
    name: 'Breakers',
    terrain: 'REEF',
    text: 'Storm-worn reef no longer stops line effects.',
    effect: { kind: 'reef_no_line_block' },
  },
  coral_growth: {
    id: 'coral_growth',
    name: 'Coral Growth',
    terrain: 'REEF',
    text: 'Sinks of ships adjacent to reef are not announced.',
    effect: { kind: 'reef_conceals_adjacent' },
  },
  sharp_shoals: {
    id: 'sharp_shoals',
    name: 'Sharp Shoals',
    terrain: 'REEF',
    text: 'Firing at a reef cell costs 1 extra energy.',
    effect: { kind: 'reef_shot_penalty' },
  },
  murky_water: {
    id: 'murky_water',
    name: 'Murky Water',
    terrain: 'SHALLOWS',
    text: 'Shallows no longer reveal their neighbours when hit.',
    effect: { kind: 'shallows_no_reveal' },
  },
  clear_water: {
    id: 'clear_water',
    name: 'Clear Water',
    terrain: 'SHALLOWS',
    text: 'A hit in shallows reveals all eight neighbours.',
    effect: { kind: 'shallows_reveal_eight' },
  },
  ebb_tide: {
    id: 'ebb_tide',
    name: 'Ebb Tide',
    terrain: 'SHALLOWS',
    text: 'Hits in shallows grant 1 extra bonus energy.',
    effect: { kind: 'shallows_bonus_energy' },
  },
  salvage_rights: {
    id: 'salvage_rights',
    name: 'Salvage Rights',
    terrain: 'WRECK',
    text: 'Firing at empty wreckage grants the shooter 2 energy.',
    effect: { kind: 'wreck_salvage_energy' },
  },
  flotsam: {
    id: 'flotsam',
    name: 'Flotsam',
    terrain: 'WRECK',
    text: 'Sunken wrecks block line effects like reef.',
    effect: { kind: 'wreck_blocks_lines' },
  },
  strong_current: {
    id: 'strong_current',
    name: 'Strong Current',
    terrain: 'OPEN',
    text: 'Relocation abilities may move two cells across open water.',
    effect: { kind: 'open_swift_two' },
  },
  false_lights: {
    id: 'false_lights',
    name: 'False Lights',
    terrain: 'OPEN',
    text: 'Decoys on open water last 2 extra turns.',
    effect: { kind: 'open_decoy_extended' },
  },
};

export const MODIFIER_IDS = Object.keys(MODIFIERS);
