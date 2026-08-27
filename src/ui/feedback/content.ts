import { CARD_LIST, CARDS } from '../../engine/cards';
import { SHIP_LIST, SHIPS } from '../../engine/ships';

/**
 * Everything the game says to a player, in one list.
 *
 * The rule text is never retyped here: it is read out of `CARD_LIST` and
 * `SHIP_LIST`, so a balance change to a card changes what the explainer says
 * about it in the same commit. What *is* authored here is the consequence —
 * the one line that says why the player should care, which no data file can
 * derive. `docs/FEEDBACK.md` is generated from this module for the same
 * reason: a document that restates the copy is a document that goes stale.
 *
 * Three tiers, and the split between them is about permanence:
 *   Tier 1 floaters are wordless and never stop appearing.
 *   Tier 2 named events are one line and never stop appearing.
 *   Tier 3 explainers appear once in a player's life and then never again.
 */

export type Tier = 1 | 2 | 3;

export interface Explainer {
  /** Stable storage key. Persisted per player; resettable from Settings. */
  key: string;
  group: 'card' | 'ability' | 'react' | 'rule';
  title: string;
  /** The rule, verbatim from the content lists. */
  rule: string;
  /** Why it matters. The only authored sentence. */
  soWhat: string;
  /** What has to happen for a player to see this. */
  trigger: string;
}

/** The authored half. Keys must cover every card, ability, REACT and rule. */
const SO_WHAT: Record<string, string> = {
  // --- the twelve cards ---
  'card:salvo':
    'Charges become cells one for one, so a long-charged Salvo is the simplest big round in the game.',
  'card:lance':
    'A line beats scattered cells the moment you know which way a hull is lying.',
  'card:burst':
    'Two charges buys four cells, four buys nine. Charging past four adds nothing at all.',
  'card:rake':
    'It only ever searches one row, so it pays off after a Sounding or a Beacon has named the row.',
  'card:breaker':
    'Anything you have already wounded dies outright if this touches it. It is a finisher, not a search.',
  'card:ping': 'Missing is the point: every miss reports whether a hull sits next door.',
  'card:echo': 'Hitting is the point: every hit forces another cell of that same ship into the open.',
  'card:sounding':
    'A count is not a location, but it cuts a thirty-six cell board down fast.',
  'card:jam':
    'Those charges are destroyed, not moved. It is the answer to a card that has been growing all match.',
  'card:siphon': 'Their loss and your gain in one beat, so the swing is twice the number stolen.',
  'card:mirror':
    'A correct read cancels their entire round — every shot they fired, not just the cell you named.',
  'card:ambush':
    'A correct read fires back for free, and at zero charges it costs nothing to leave standing.',

  // --- the eight ACTIVE and NERF abilities ---
  'ability:forge': 'Damage that costs neither a card nor a charge. Using it flips the ship face up for good.',
  'ability:warhead': 'Four cells, and anything already damaged inside them is gone. This is the sink button.',
  'ability:blackout':
    'Two charges now and no charge at all next round — two rounds of their economy, in one activation.',
  'ability:kiln': 'The chosen card fires at three charges more than it holds, and is consumed doing it.',
  'ability:leech': 'Three charges cross the table. Their bank falls and yours rises in the same instant.',
  'ability:beacon': 'An exact count for one row or one column, and two free cells to act on what it says.',
  'ability:ember': 'Every cell that lands pays two charges back, so a good Ember funds the card after it.',
  'ability:pin': 'One cell. If it lands, not one of their cards may fire next round.',

  // --- the four REACTs ---
  'react:dreadnought': 'It pays out on the way down: four charges scattered over the cards still in hand.',
  'react:cinder': 'Sinking it costs them next round’s card fire and hands them two charges.',
  'react:spite': 'Every charge on every one of their cards, gone. A card charged all match dies with it.',
  'react:thorn': 'It answers with the whole round: every cell they fired at gets fired back at.',

  // --- the four rules that have no card to hang on ---
  'rule:tiebreak':
    'Round twenty arrived with both fleets still afloat, so the match is decided on hull cells remaining.',
  'rule:draw':
    'Dead level at the cap. In arena that returns both stakes in full and takes no rake at all.',
  'rule:strike':
    'A lapsed timer plays a fallback plan and adds a strike against you. Three strikes lose the match outright.',
  'rule:pile-draw':
    'Every card neither of you drafted went into a shared face-down pile. Drop to one card in hand and you draw from it.',
};

const RULE_TITLES: Record<string, { title: string; rule: string; trigger: string }> = {
  'rule:tiebreak': {
    title: 'Decided on hull',
    rule: 'At the round cap with both fleets afloat, the player holding more hull cells wins.',
    trigger: 'the match ends at the round cap with a hull difference',
  },
  'rule:draw': {
    title: 'A draw',
    rule: 'Level on hull at the cap, or both fleets destroyed in the same round from level hull, is a draw.',
    trigger: 'the match ends in a draw',
  },
  'rule:strike': {
    title: 'Timer strike',
    rule: 'A lapsed plan window plays a fallback plan and records a strike. Three strikes forfeit the match.',
    trigger: 'a plan window lapses for either player',
  },
  'rule:pile-draw': {
    title: 'The shared pile',
    rule: 'Undrafted cards form one shared, face-down pile. A player at or below one card in hand draws from it.',
    trigger: 'either player draws from the pile for the first time',
  },
};

function build(): Explainer[] {
  const out: Explainer[] = [];
  for (const c of CARD_LIST) {
    out.push({
      key: `card:${c.id}`,
      group: 'card',
      title: c.name,
      rule: c.text,
      soWhat: SO_WHAT[`card:${c.id}`],
      trigger: `${c.name} is fired by either player`,
    });
  }
  for (const s of SHIP_LIST) {
    if (s.type === 'REACT') continue;
    out.push({
      key: `ability:${s.id}`,
      group: 'ability',
      title: s.name,
      rule: s.text,
      soWhat: SO_WHAT[`ability:${s.id}`],
      trigger: `${s.name}'s ability is activated by either player`,
    });
  }
  for (const s of SHIP_LIST) {
    if (s.type !== 'REACT') continue;
    out.push({
      key: `react:${s.id}`,
      group: 'react',
      title: s.name,
      rule: s.text,
      soWhat: SO_WHAT[`react:${s.id}`],
      trigger: `${s.name} is sunk and its reaction fires`,
    });
  }
  for (const [key, meta] of Object.entries(RULE_TITLES)) {
    out.push({
      key,
      group: 'rule',
      title: meta.title,
      rule: meta.rule,
      soWhat: SO_WHAT[key],
      trigger: meta.trigger,
    });
  }
  return out;
}

export const EXPLAINERS: Explainer[] = build();

export const EXPLAINER_BY_KEY: Record<string, Explainer> = Object.fromEntries(
  EXPLAINERS.map((e) => [e.key, e]),
);

// ---------------------------------------------------------------------------
// Tier 1 — the floater vocabulary
// ---------------------------------------------------------------------------

export type FloaterKind = 'hit' | 'miss' | 'sunk' | 'gain' | 'loss' | 'blocked';

export interface FloaterSpec {
  kind: FloaterKind;
  /** Where it rises from. */
  from: string;
  /** What it says, with N standing in for a number. */
  says: string;
}

export const FLOATER_SPECS: FloaterSpec[] = [
  { kind: 'hit', from: 'the cell that was fired at', says: 'HIT' },
  { kind: 'miss', from: 'the cell that was fired at', says: 'MISS' },
  { kind: 'sunk', from: 'the cells of the ship going down', says: 'SUNK · N' },
  { kind: 'gain', from: 'the card that gained charges', says: '+N' },
  { kind: 'loss', from: 'the card that lost charges', says: '−N' },
  { kind: 'blocked', from: 'the cell a Mirror cancellation ate', says: 'BLOCKED' },
];

// ---------------------------------------------------------------------------
// Tier 2 — named events
// ---------------------------------------------------------------------------

export interface NamedSpec {
  id: string;
  trigger: string;
  copy: string;
}

/**
 * The wording rule, held to across all of these: say what happened to the
 * board in the register the resolve overlay uses. "Firing back at every cell
 * they hit", never "THORN triggers REACT".
 */
export const NAMED_SPECS: NamedSpec[] = [
  { id: 'react:thorn', trigger: 'Thorn is sunk', copy: 'THORN — firing back at every cell they hit.' },
  {
    id: 'react:spite',
    trigger: 'Spite is sunk',
    copy: 'SPITE — every charge on their cards is gone.',
  },
  {
    id: 'react:cinder',
    trigger: 'Cinder is sunk',
    copy: 'CINDER — they can’t fire a card next round.',
  },
  {
    id: 'react:dreadnought',
    trigger: 'Dreadnought is sunk',
    copy: 'DREADNOUGHT — charges scattered across the hand.',
  },
  {
    id: 'prediction:mirror:you',
    trigger: 'your Mirror reads them correctly',
    copy: 'MIRROR — their whole round missed.',
  },
  {
    id: 'prediction:mirror:them',
    trigger: 'their Mirror reads you correctly',
    copy: 'MIRROR — your whole round missed.',
  },
  {
    id: 'prediction:ambush:you',
    trigger: 'your Ambush reads them correctly',
    copy: 'AMBUSH — you fire back where they came from.',
  },
  {
    id: 'prediction:ambush:them',
    trigger: 'their Ambush reads you correctly',
    copy: 'AMBUSH — they fire back where you came from.',
  },
  { id: 'restrict:pin', trigger: 'Pin lands on you', copy: 'PIN — you can’t fire a card next round.' },
  {
    id: 'restrict:blackout',
    trigger: 'Blackout is used on you',
    copy: 'BLACKOUT — no charge for you next round.',
  },
  {
    id: 'ability:used',
    trigger: 'either side activates a ship ability',
    copy: 'They used NAME. / You used NAME.',
  },
];

/** The one-line copy for a ship ability activation, either side. */
export function abilityLine(defId: string, mine: boolean): string {
  const name = SHIPS[defId]?.name.toUpperCase() ?? defId.toUpperCase();
  return mine ? `You used ${name}.` : `They used ${name}.`;
}

/** The one-line copy for a card being fired, either side. */
export function cardLine(defId: string, mine: boolean): string {
  const name = CARDS[defId]?.name.toUpperCase() ?? defId.toUpperCase();
  return mine ? `You fired ${name}.` : `They fired ${name}.`;
}
