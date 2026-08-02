import type { SymbolId } from './symbols';

/**
 * The 24 terrain cards. Ported verbatim from FATHOM_RULEBOOK v2.0 §10.
 *
 * Two are flipped at setup and rule the whole match. Six amplify a symbol;
 * the other eighteen rewrite the match itself. If a flipped pair conflicts or
 * makes deployment impossible, one is discarded and redrawn — the engine
 * decides that by checking legality, not by consulting a list of known-bad
 * pairs.
 */
export interface TerrainCardDef {
  id: string;
  name: string;
  /** The symbol this card amplifies, or null for a match condition. */
  symbol: SymbolId | null;
  text: string;
}

export const TERRAIN_CARDS: Record<string, TerrainCardDef> = {
  // ---- Six amplify a symbol ----
  spring_tide: { id: 'spring_tide', name: 'Spring Tide', symbol: 'FOG', text: 'Fog also blocks detection, exactly as a storm front does.' },
  pressure_hull: { id: 'pressure_hull', name: 'Pressure Hull', symbol: 'TRENCH', text: 'Hulls with a cell in a trench cannot be revealed by detection.' },
  slack_tide: { id: 'slack_tide', name: 'Slack Tide', symbol: 'SHALLOWS', text: 'Hulls with a cell on shallows cannot activate abilities. Hits there reveal nothing.' },
  static: { id: 'static', name: 'Static', symbol: 'STORM', text: 'Detection costs 2 more if you have a hull in or adjacent to a storm.' },
  salvage_yards: { id: 'salvage_yards', name: 'Salvage Yards', symbol: 'WRECKAGE', text: 'When a hull cell on wreckage is destroyed, the shooter takes 3 cubes.' },
  thermal_vent: { id: 'thermal_vent', name: 'Thermal Vent', symbol: 'UPWELLING', text: 'Ship abilities cost 1 less if that hull has a cell on upwelling.' },

  // ---- Eighteen match conditions ----
  lean_season: { id: 'lean_season', name: 'Lean Season', symbol: null, text: 'Income is 1 instead of 2. Every hit pays 2 cubes instead of 1.' },
  war_chest: { id: 'war_chest', name: 'War Chest', symbol: null, text: 'Both players begin the match with 6 banked cubes.' },
  blockade: { id: 'blockade', name: 'Blockade', symbol: null, text: 'Detection cards cost 1 more for both players.' },
  forced_march: { id: 'forced_march', name: 'Forced March', symbol: null, text: 'Sideways cards straighten at the start of your next turn.' },
  convoy: { id: 'convoy', name: 'Convoy', symbol: null, text: 'Every hull must touch at least one other hull.' },
  full_roster: { id: 'full_roster', name: 'Full Roster', symbol: null, text: 'Deal all 24 hulls. Ten packs. Keep and burn accordingly.' },
  prize_money: { id: 'prize_money', name: 'Prize Money', symbol: null, text: 'Sinking a hull grants you cubes equal to its length.' },
  hard_tack: { id: 'hard_tack', name: 'Hard Tack', symbol: null, text: 'Cards costing 5 or more cost 2 less.' },
  slow_water: { id: 'slow_water', name: 'Slow Water', symbol: null, text: 'Basic Salvo may be fired twice per turn.' },
  skeleton_crews: { id: 'skeleton_crews', name: 'Skeleton Crews', symbol: null, text: 'Deal four fewer hulls each. Deploy two fewer hulls.' },
  shoal_water: { id: 'shoal_water', name: 'Shoal Water', symbol: null, text: 'Every hull must have at least one cell on a terrain symbol.' },
  wolf_season: { id: 'wolf_season', name: 'Wolf Season', symbol: null, text: "Every third turn, both players' income is doubled." },
  letters_of_marque: { id: 'letters_of_marque', name: 'Letters of Marque', symbol: null, text: 'Whenever you sink a hull, take one card from the burn pile.' },
  contraband: { id: 'contraband', name: 'Contraband', symbol: null, text: 'At the start of your turn you may burn a card from hand to take 4 cubes.' },
  attrition: { id: 'attrition', name: 'Attrition', symbol: null, text: 'When you sink a hull, discard one card from your hand permanently.' },
  dead_mans_hand: { id: 'dead_mans_hand', name: "Dead Man's Hand", symbol: null, text: 'When a hull is sunk its owner may activate its ability one last time. Not reactions.' },
  second_fleet: { id: 'second_fleet', name: 'Second Fleet', symbol: null, text: 'Each player may redeploy their first sunk hull into cells not yet fired at.' },
  open_market: { id: 'open_market', name: 'Open Market', symbol: null, text: 'During the ship draft, players exchange their entire drafted fleets.' },
};

export const TERRAIN_CARD_IDS = Object.keys(TERRAIN_CARDS);

/** Cards that change setup itself, so they must be resolved before deployment. */
export const SETUP_TERRAIN_CARDS = [
  'full_roster',
  'skeleton_crews',
  'convoy',
  'shoal_water',
  'open_market',
  'war_chest',
] as const;
