/**
 * The 51 action cards — 50 draftable plus Basic Salvo, which is never drafted.
 * Ported verbatim from FATHOM_RULEBOOK v2.0 §08 (tier reference tables) and
 * cross-checked against FATHOM_PRINT_1_cards.pdf.
 *
 * Costs and text are the printed values. Keywords are labels only — AIM
 * fires, READ learns, RIG works your resources and their hand, HOLD defends
 * and repairs — no rules attach to them.
 *
 * `once: true` means spent when played: the card turns face down forever.
 */
export type Keyword = 'AIM' | 'READ' | 'RIG' | 'HOLD';

/** 0 = Basic Salvo (always in play), 1–3 = bone / amber / magenta frames. */
export type ActionTier = 0 | 1 | 2 | 3;

export interface ActionDef {
  id: string;
  name: string;
  cost: number;
  tier: ActionTier;
  keyword: Keyword;
  once: boolean;
  text: string;
}

export const BASIC_SALVO_ID = 'basic_salvo';

export const ACTIONS: Record<string, ActionDef> = {
  // ---- Always in play ----
  basic_salvo: {
    id: 'basic_salvo',
    name: 'Basic Salvo',
    cost: 0,
    tier: 0,
    keyword: 'AIM',
    once: false,
    text: 'Fire one cell. Once per turn. Never drafted, never sideways.',
  },

  // ---- Tier I · bone frames, costs 2–4 ----
  twin_shot: { id: 'twin_shot', name: 'Twin Shot', cost: 3, tier: 1, keyword: 'AIM', once: false, text: 'Fire two separate cells.' },
  sonar_buoy: { id: 'sonar_buoy', name: 'Sonar Buoy', cost: 2, tier: 1, keyword: 'AIM', once: false, text: 'Fire a cell. Learn next turn whether it hit.' },
  crows_foot: { id: 'crows_foot', name: "Crow's Foot", cost: 4, tier: 1, keyword: 'AIM', once: false, text: 'Fire three cells forming an L.' },
  bracket: { id: 'bracket', name: 'Bracket', cost: 4, tier: 1, keyword: 'AIM', once: false, text: 'Name a cell. Fire the four cells diagonally adjacent to it.' },
  line_probe: { id: 'line_probe', name: 'Line Probe', cost: 3, tier: 1, keyword: 'READ', once: false, text: 'Name 4 cells in a line. Learn how many are occupied.' },
  lantern: { id: 'lantern', name: 'Lantern', cost: 3, tier: 1, keyword: 'READ', once: false, text: 'Name a cell. Learn whether any hull is within two cells of it.' },
  hollow_ping: { id: 'hollow_ping', name: 'Hollow Ping', cost: 3, tier: 1, keyword: 'READ', once: false, text: 'Name a 2x2. They say zero, exactly one, or more.' },
  blow_ballast: { id: 'blow_ballast', name: 'Blow Ballast', cost: 2, tier: 1, keyword: 'RIG', once: false, text: 'Take 3 extra cubes at the start of your next turn.' },
  overcharge: { id: 'overcharge', name: 'Overcharge', cost: 3, tier: 1, keyword: 'RIG', once: false, text: 'Your attack cards cost 1 less this turn.' },
  rally: { id: 'rally', name: 'Rally', cost: 3, tier: 1, keyword: 'RIG', once: false, text: 'Straighten one of your sideways cards.' },
  bail_out: { id: 'bail_out', name: 'Bail Out', cost: 2, tier: 1, keyword: 'RIG', once: false, text: 'Turn one of your upright face-up cards sideways. Take 4 cubes.' },
  dead_weight: { id: 'dead_weight', name: 'Dead Weight', cost: 3, tier: 1, keyword: 'RIG', once: false, text: 'Their next card costs 2 more.' },
  powder_monkey: { id: 'powder_monkey', name: 'Powder Monkey', cost: 2, tier: 1, keyword: 'RIG', once: false, text: 'Take 2 cubes. Take 6 instead if you sank a hull last turn.' },
  watch_change: { id: 'watch_change', name: 'Watch Change', cost: 4, tier: 1, keyword: 'RIG', once: false, text: 'Take a card from their hand at random. It cannot be played for two turns.' },
  reef_runner: { id: 'reef_runner', name: 'Reef Runner', cost: 3, tier: 1, keyword: 'RIG', once: false, text: 'Your next attack ignores reef entirely.' },
  storm_chaser: { id: 'storm_chaser', name: 'Storm Chaser', cost: 3, tier: 1, keyword: 'RIG', once: false, text: 'Detection works normally on storm cells this turn.' },
  fothering: { id: 'fothering', name: 'Fothering', cost: 4, tier: 1, keyword: 'HOLD', once: false, text: 'Repair two hits on a single hull.' },
  kedge: { id: 'kedge', name: 'Kedge', cost: 3, tier: 1, keyword: 'HOLD', once: false, text: 'Repair one hit. Take 2 cubes if that hull was hit this turn.' },

  // ---- Tier II · amber frames, costs 4–6 ----
  torpedo: { id: 'torpedo', name: 'Torpedo', cost: 5, tier: 2, keyword: 'AIM', once: false, text: 'Fire from a board edge along a row or column. Travels until it hits a hull or reef.' },
  cross_salvo: { id: 'cross_salvo', name: 'Cross Salvo', cost: 5, tier: 2, keyword: 'AIM', once: false, text: 'Fire a plus-shape of five cells.' },
  mortar: { id: 'mortar', name: 'Mortar', cost: 4, tier: 2, keyword: 'AIM', once: false, text: 'Fire a 2x2 block.' },
  raking_fire: { id: 'raking_fire', name: 'Raking Fire', cost: 5, tier: 2, keyword: 'AIM', once: false, text: 'Fire four cells in a row, skipping every other cell.' },
  sonar_sweep: { id: 'sonar_sweep', name: 'Sonar Sweep', cost: 4, tier: 2, keyword: 'READ', once: false, text: 'Name a 3x3. Learn how many cells are occupied.' },
  widows_watch: { id: 'widows_watch', name: "Widow's Watch", cost: 5, tier: 2, keyword: 'READ', once: false, text: 'They name the row holding most of their remaining hull cells.' },
  sounding_line: { id: 'sounding_line', name: 'Sounding Line', cost: 4, tier: 2, keyword: 'READ', once: false, text: 'Name a symbol. They say how many of their hull cells sit on it.' },
  dead_reckoning: { id: 'dead_reckoning', name: 'Dead Reckoning', cost: 5, tier: 2, keyword: 'READ', once: false, text: 'Name a cell. If occupied you take 6 cubes. If not, they do.' },
  shot_across_the_bow: { id: 'shot_across_the_bow', name: 'Shot Across the Bow', cost: 4, tier: 2, keyword: 'RIG', once: false, text: 'Look at their hand. Choose one card. They play it next turn or discard it.' },
  powder_store: { id: 'powder_store', name: 'Powder Store', cost: 5, tier: 2, keyword: 'RIG', once: false, text: 'Their next attack card costs 3 more.' },
  quarterdeck: { id: 'quarterdeck', name: 'Quarterdeck', cost: 4, tier: 2, keyword: 'RIG', once: false, text: 'Play one of your sideways cards this turn. Pay its cost as well.' },
  chain_of_command: { id: 'chain_of_command', name: 'Chain of Command', cost: 4, tier: 2, keyword: 'RIG', once: false, text: 'Copy any face-up card on the table. It resolves on your next turn.' },
  press_gang: { id: 'press_gang', name: 'Press Gang', cost: 5, tier: 2, keyword: 'RIG', once: true, text: 'Take a random card from the burn pile into your hand.' },
  mutiny: { id: 'mutiny', name: 'Mutiny', cost: 5, tier: 2, keyword: 'RIG', once: true, text: 'Choose a card from your hand. They choose one from theirs. Swap.' },
  scuttlebutt: { id: 'scuttlebutt', name: 'Scuttlebutt', cost: 4, tier: 2, keyword: 'RIG', once: true, text: 'Look at the top three of the burn pile. Take one into hand.' },
  bulkheads: { id: 'bulkheads', name: 'Bulkheads', cost: 5, tier: 2, keyword: 'HOLD', once: false, text: 'For two turns, the first hit each turn on your fleet is negated.' },
  brace: { id: 'brace', name: 'Brace', cost: 4, tier: 2, keyword: 'HOLD', once: false, text: 'If they land three or more hits this turn, take 6 cubes.' },
  backdraft: { id: 'backdraft', name: 'Backdraft', cost: 5, tier: 2, keyword: 'HOLD', once: false, text: 'Set face up. When they play a card costing 6 or more, take 4 cubes.' },
  sheet_anchor: { id: 'sheet_anchor', name: 'Sheet Anchor', cost: 5, tier: 2, keyword: 'HOLD', once: false, text: 'For two turns, every hit on your fleet costs the shooter 1 cube.' },
  careening: { id: 'careening', name: 'Careening', cost: 5, tier: 2, keyword: 'HOLD', once: false, text: 'Repair one hit on each of two different hulls.' },

  // ---- Tier III · magenta frames, costs 5–9 ----
  maelstrom: { id: 'maelstrom', name: 'Maelstrom', cost: 7, tier: 3, keyword: 'AIM', once: false, text: 'Fire every cell along one full diagonal.' },
  dredge: { id: 'dredge', name: 'Dredge', cost: 9, tier: 3, keyword: 'AIM', once: true, text: 'Name a column you have fired into. Fire every cell in it, stopping at reef.' },
  coup_de_grace: { id: 'coup_de_grace', name: 'Coup de Grace', cost: 6, tier: 3, keyword: 'AIM', once: true, text: 'Fire every cell adjacent to a hull you have already sunk.' },
  fireship: { id: 'fireship', name: 'Fireship', cost: 8, tier: 3, keyword: 'AIM', once: true, text: 'Discard a face-up card of yours permanently. Fire every cell in a 3x3.' },
  deadlight: { id: 'deadlight', name: 'Deadlight', cost: 8, tier: 3, keyword: 'AIM', once: true, text: 'Name a symbol. Every cell of that type on their board is fired at.' },
  satellite_pass: { id: 'satellite_pass', name: 'Satellite Pass', cost: 7, tier: 3, keyword: 'READ', once: true, text: 'Name a 4x4. They reveal every occupied cell in it, exactly.' },
  oracle: { id: 'oracle', name: 'Oracle', cost: 6, tier: 3, keyword: 'READ', once: true, text: 'Name a hull length. They reveal one cell of a surviving hull of that length.' },
  cairn: { id: 'cairn', name: 'Cairn', cost: 6, tier: 3, keyword: 'READ', once: true, text: 'Name four cells. If all four are empty, take 9 cubes.' },
  requisition: { id: 'requisition', name: 'Requisition', cost: 5, tier: 3, keyword: 'RIG', once: true, text: 'Immediately take 10 cubes.' },
  refit: { id: 'refit', name: 'Refit', cost: 6, tier: 3, keyword: 'RIG', once: true, text: 'Discard a card from your hand permanently. Take two from the burn pile.' },
  dry_dock: { id: 'dry_dock', name: 'Dry Dock', cost: 7, tier: 3, keyword: 'HOLD', once: true, text: 'Repair every hit on one hull of your choice.' },
  salt_the_wound: { id: 'salt_the_wound', name: 'Salt the Wound', cost: 6, tier: 3, keyword: 'HOLD', once: false, text: 'When they miss with an AIM card costing 5 or more, fire the same cells on their board.' },
};

export const ACTION_IDS = Object.keys(ACTIONS);
/** The 50-card draft deck: everything except Basic Salvo. */
export const DRAFTABLE_ACTION_IDS = ACTION_IDS.filter((id) => id !== BASIC_SALVO_ID);

export function actionsOfTier(tier: ActionTier): ActionDef[] {
  return ACTION_IDS.map((id) => ACTIONS[id]).filter((a) => a.tier === tier);
}
