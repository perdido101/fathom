import { describe, it, expect } from 'vitest';
import { ACTIONS, ACTION_IDS, DRAFTABLE_ACTION_IDS, BASIC_SALVO_ID, actionsOfTier } from './actions';
import { HULLS, HULL_IDS } from './hulls';
import { TERRAIN_CARDS, TERRAIN_CARD_IDS } from './terrainCards';
import { SYMBOLS, SYMBOL_IDS, canDeployOn } from './symbols';
import { GRID_CARDS, MATCH_SIZES, symbolAt } from './grids';

/**
 * The printed cards and the digital game must never disagree. These assert
 * the counts and shapes stated in the rulebook, so a typo in the port fails
 * here rather than surfacing as a balance mystery later.
 */
describe('action cards', () => {
  it('has 51 actions — 50 draftable plus Basic Salvo', () => {
    expect(ACTION_IDS.length).toBe(51);
    expect(DRAFTABLE_ACTION_IDS.length).toBe(50);
    expect(DRAFTABLE_ACTION_IDS).not.toContain(BASIC_SALVO_ID);
  });

  it('the draft deck divides exactly into ten packs of four, twice over', () => {
    // Ten packs of four = 40 dealt; 10 kept each, 20 burned, 10 undealt.
    expect(DRAFTABLE_ACTION_IDS.length).toBe(10 * 4 + 10);
  });

  it('Basic Salvo is free and never spent', () => {
    const b = ACTIONS[BASIC_SALVO_ID];
    expect(b.cost).toBe(0);
    expect(b.once).toBe(false);
    expect(b.tier).toBe(0);
  });

  it('tier cost bands match the printed frames', () => {
    // Tier I bone 2–4, tier II amber 4–6, tier III magenta 5–9.
    for (const a of actionsOfTier(1)) {
      expect(a.cost, a.name).toBeGreaterThanOrEqual(2);
      expect(a.cost, a.name).toBeLessThanOrEqual(4);
    }
    for (const a of actionsOfTier(2)) {
      expect(a.cost, a.name).toBeGreaterThanOrEqual(4);
      expect(a.cost, a.name).toBeLessThanOrEqual(6);
    }
    for (const a of actionsOfTier(3)) {
      expect(a.cost, a.name).toBeGreaterThanOrEqual(5);
      expect(a.cost, a.name).toBeLessThanOrEqual(9);
    }
  });

  it('every keyword is one of the four labels', () => {
    for (const id of ACTION_IDS) {
      expect(['AIM', 'READ', 'RIG', 'HOLD']).toContain(ACTIONS[id].keyword);
    }
  });

  it('ids and names are unique', () => {
    expect(new Set(ACTION_IDS).size).toBe(ACTION_IDS.length);
    const names = ACTION_IDS.map((id) => ACTIONS[id].name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('spot-checks the printed values', () => {
    expect(ACTIONS.dredge.cost).toBe(9);
    expect(ACTIONS.dredge.once).toBe(true);
    expect(ACTIONS.requisition.cost).toBe(5);
    expect(ACTIONS.salt_the_wound.once).toBe(false); // a standing trigger
    expect(ACTIONS.sonar_buoy.cost).toBe(2);
  });
});

describe('hulls', () => {
  it('has all 24', () => {
    expect(HULL_IDS.length).toBe(24);
  });

  it('the ship deck divides into five packs of four with four undealt', () => {
    expect(HULL_IDS.length).toBe(5 * 4 + 4);
  });

  it('REACT abilities are free, ACT abilities are not', () => {
    for (const id of HULL_IDS) {
      const h = HULLS[id];
      if (h.trigger === 'REACT') expect(h.cost, h.name).toBe(0);
      else expect(h.cost, h.name).toBeGreaterThan(0);
    }
  });

  it('lengths run 1 to 5', () => {
    for (const id of HULL_IDS) {
      expect(HULLS[id].length).toBeGreaterThanOrEqual(1);
      expect(HULLS[id].length).toBeLessThanOrEqual(5);
    }
    // The roster the deep-water match needs: enough hulls at every length.
    const byLen = new Map<number, number>();
    for (const id of HULL_IDS) {
      byLen.set(HULLS[id].length, (byLen.get(HULLS[id].length) ?? 0) + 1);
    }
    expect([...byLen.keys()].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('spot-checks the printed values', () => {
    expect(HULLS.dreadnought.length).toBe(5);
    expect(HULLS.dreadnought.cost).toBe(3);
    expect(HULLS.boarder.length).toBe(1);
    expect(HULLS.boarder.trigger).toBe('REACT');
    expect(HULLS.quartermaster.once).toBe(true);
  });
});

describe('terrain cards', () => {
  it('has all 24, six of which amplify a symbol', () => {
    expect(TERRAIN_CARD_IDS.length).toBe(24);
    const symbolCards = TERRAIN_CARD_IDS.filter((id) => TERRAIN_CARDS[id].symbol !== null);
    expect(symbolCards.length).toBe(6);
  });

  it('each amplified symbol is distinct and real', () => {
    const symbols = TERRAIN_CARD_IDS
      .map((id) => TERRAIN_CARDS[id].symbol)
      .filter((s): s is NonNullable<typeof s> => s !== null);
    expect(new Set(symbols).size).toBe(6);
    for (const s of symbols) expect(SYMBOLS[s]).toBeDefined();
    // Open water has no card — there is nothing to amplify.
    expect(symbols).not.toContain('OPEN');
  });
});

describe('symbols', () => {
  it('has all 8', () => {
    expect(SYMBOL_IDS.length).toBe(8);
  });

  it('reef is the only cell a hull may not occupy', () => {
    const blocked = SYMBOL_IDS.filter((s) => !canDeployOn(s));
    expect(blocked).toEqual(['REEF']);
  });

  it('wreckage is deployable — that is what makes a hit there ambiguous', () => {
    expect(canDeployOn('WRECKAGE')).toBe(true);
  });
});

describe('grid cards', () => {
  it('has all 20', () => {
    expect(GRID_CARDS.length).toBe(20);
    expect(new Set(GRID_CARDS.map((c) => c.id)).size).toBe(20);
  });

  it('every marked cell is a real coordinate and a real symbol', () => {
    for (const card of GRID_CARDS) {
      for (const [coord, sym] of Object.entries(card.cells)) {
        expect(coord, `card ${card.id}`).toMatch(/^[A-D][1-4]$/);
        expect(SYMBOLS[sym!], `card ${card.id} ${coord}`).toBeDefined();
        expect(sym).not.toBe('OPEN'); // open water is the absence of a mark
      }
    }
  });

  it('unmarked cells read as open water', () => {
    expect(symbolAt(GRID_CARDS[0], 'A1')).toBe('OPEN');
    expect(symbolAt(GRID_CARDS[0], 'B2')).toBe('REEF');
  });

  it('every symbol appears somewhere in the deck', () => {
    const seen = new Set<string>();
    for (const card of GRID_CARDS) for (const s of Object.values(card.cells)) seen.add(s!);
    for (const s of SYMBOL_IDS) {
      if (s === 'OPEN') continue;
      expect(seen.has(s), `${s} never appears on a grid card`).toBe(true);
    }
  });

  it('terrain is sparse enough to leave the sea mostly open', () => {
    const marked = GRID_CARDS.reduce((n, c) => n + Object.keys(c.cells).length, 0);
    expect(marked).toBe(60); // 3 per card
    expect(marked / (20 * 16)).toBeCloseTo(0.1875, 3);
  });

  it('match sizes tile exactly from 4x4 cards', () => {
    for (const size of Object.values(MATCH_SIZES)) {
      expect(size.cardsAcross * 4).toBe(size.gridW);
      expect(size.cardsDown * 4).toBe(size.gridH);
      expect(size.cardsAcross * size.cardsDown).toBe(size.gridCards);
      expect(size.gridCards).toBeLessThanOrEqual(GRID_CARDS.length);
    }
  });

  it('a match never needs more hulls than the roster holds', () => {
    for (const size of Object.values(MATCH_SIZES)) {
      expect(size.hulls * 2).toBeLessThanOrEqual(HULL_IDS.length);
      expect(size.actionCards * 2).toBeLessThanOrEqual(DRAFTABLE_ACTION_IDS.length);
    }
  });
});
