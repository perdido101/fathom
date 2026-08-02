import { describe, it, expect } from 'vitest';
import { seedRng, nextInt, nextU32, seedName, hashString } from './rng';
import { generateMap } from './map/generate';
import { autoPlaceFleet, isLegalPlacement, isStraightLine } from './fleet/placement';
import { createMatch } from './state';
import { reduce } from './reduce';
import { cardUiState } from './resolve/availability';
import { dealShipDraft, pickShip, cluesFor, clientShipDraftView } from './draft/shipDraft';
import { dealCardDraft, pickCard, currentPicker, snakeOrder } from './draft/cardDraft';
import { fleetBelief } from './deduction';
import { clientMatchView } from './clientView';
import { voyageRound, VOYAGE_LENGTHS } from '../content/voyage';
import { PATCHES } from '../content/patches';
import { MODIFIERS, MODIFIER_IDS } from '../content/modifiers';
import { SHIPS, SHIP_IDS } from '../content/ships';
import { TERRAIN } from '../content/terrain';
import {
  createTournament,
  generateBracket,
  advanceMatch,
  nextPendingMatch,
  resolveUntilHuman,
  humanSeat,
} from './tournament';
import type { MatchConfig, MatchState, PlayerId } from './types';
import { rcCell } from './types';

const baseConfig = (seed: string): MatchConfig => ({
  seed,
  round: 1,
  voyageLength: 6,
  gridW: 8,
  gridH: 8,
  patches: 4,
  baseIncome: 3,
  secondPlayerComp: 2,
  hitBonus: 1,
  firstPlayer: 0,
  players: [
    { name: 'Alpha', isAI: false, fleet: ['tender', 'cutter', 'skiff'], tray: ['twin_shot', 'buoy'] },
    { name: 'Bravo', isAI: false, fleet: ['tender', 'cutter', 'skiff'], tray: ['line_probe', 'ballast'] },
  ],
});

const FULL_FLEET = [
  'dreadnought', 'leviathan', 'carrier', 'sonarship', 'frigate',
  'minelayer', 'tender', 'cutter', 'reefrunner', 'skiff',
];

/** Place both fleets via seeded auto-placement. */
function placeBoth(ms: MatchState): MatchState {
  let st = seedRng(ms.seed + ':test-place');
  let out = ms;
  for (const p of [0, 1] as const) {
    const [placements, st2] = autoPlaceFleet(
      out.players[p].fleetToPlace, out.gridW, out.gridH, out.terrain, st,
    );
    st = st2;
    out = reduce(out, { type: 'PLACE_FLEET', player: p, placements: placements!, mines: [] });
  }
  return out;
}

describe('rng', () => {
  it('is deterministic for a given seed', () => {
    expect(nextU32(seedRng('hello'))[0]).toBe(nextU32(seedRng('hello'))[0]);
  });
  it('produces different streams for different seeds', () => {
    expect(nextU32(seedRng('a'))[0]).not.toBe(nextU32(seedRng('b'))[0]);
  });
  it('nextInt stays in range', () => {
    let st = seedRng('range');
    for (let i = 0; i < 200; i++) {
      let v: number;
      [v, st] = nextInt(st, 7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
  });
  it('seed names are stable and human readable', () => {
    expect(seedName('x')).toBe(seedName('x'));
    expect(seedName('x')).toMatch(/^[A-Z]+-[A-Z]+-\d{4}$/);
  });
  it('hashString is stable across runs (save compatibility)', () => {
    expect(hashString('fathom')).toBe(hashString('fathom'));
  });
});

describe('patch maps', () => {
  it('has 20 authored patch designs', () => {
    expect(PATCHES.length).toBe(20);
    for (const patch of PATCHES) expect(patch.cells.length).toBe(16);
  });
  it('is deterministic and patch-aligned', () => {
    const a = generateMap('map-seed', 8, 12, FULL_FLEET);
    const b = generateMap('map-seed', 8, 12, FULL_FLEET);
    expect(a).toEqual(b);
    expect(a.length).toBe(96);
  });
  it('always admits full-fleet placement', () => {
    for (const [w, h] of [[8, 8], [8, 12], [12, 12]] as const) {
      const t = generateMap(`placeable-${w}x${h}`, w, h, FULL_FLEET);
      let st = seedRng('placement-check');
      for (let i = 0; i < 20; i++) {
        let placed;
        [placed, st] = autoPlaceFleet(FULL_FLEET, w, h, t, st);
        expect(placed).not.toBeNull();
      }
    }
  });
  it('rejects non-patch-aligned dimensions', () => {
    expect(() => generateMap('bad', 10, 10, FULL_FLEET)).toThrow();
  });
});

describe('placement legality (diagonals allowed)', () => {
  const open = new Array(64).fill('OPEN') as import('./types').TerrainId[];
  it('accepts orthogonal and diagonal lines', () => {
    expect(isLegalPlacement([0, 1, 2], 3, 8, 8, open, new Set())).toBe(true);
    expect(isLegalPlacement([0, 8, 16], 3, 8, 8, open, new Set())).toBe(true);
    expect(isLegalPlacement([0, 9, 18], 3, 8, 8, open, new Set())).toBe(true); // ↘ diagonal
    expect(isLegalPlacement([2, 9, 16], 3, 8, 8, open, new Set())).toBe(true); // ↙ diagonal
    expect(isStraightLine([0, 9, 18], 8)).toBe(true);
  });
  it('rejects bent shapes, gaps, overlaps and reef', () => {
    expect(isLegalPlacement([0, 1, 9], 3, 8, 8, open, new Set())).toBe(false);
    expect(isLegalPlacement([0, 1, 3], 3, 8, 8, open, new Set())).toBe(false);
    expect(isLegalPlacement([0, 1], 2, 8, 8, open, new Set([1]))).toBe(false);
    const reefy = open.slice();
    reefy[1] = 'REEF';
    expect(isLegalPlacement([0, 1], 2, 8, 8, reefy, new Set())).toBe(false);
    expect(TERRAIN.REEF.placeable).toBe(false);
  });
});

describe('voyage configuration', () => {
  it('derives grids from patches across every voyage length', () => {
    for (const len of VOYAGE_LENGTHS) {
      const first = voyageRound(len, 1);
      const last = voyageRound(len, len);
      expect(first.gridW).toBe(8);
      expect(first.gridH).toBe(8);
      expect(last.gridW).toBe(12);
      expect(last.gridH).toBe(12);
      // Fleet sizes are cumulative sums of keeps.
      let total = 0;
      for (let r = 1; r <= len; r++) {
        const cfg = voyageRound(len, r);
        total += cfg.keeps;
        expect(cfg.fleetSize).toBe(total);
      }
    }
  });
  it('every voyage ends at a comparable fleet size (10–12)', () => {
    for (const len of VOYAGE_LENGTHS) {
      const final = voyageRound(len, len).fleetSize;
      expect(final).toBeGreaterThanOrEqual(10);
      expect(final).toBeLessThanOrEqual(12);
    }
  });
});

describe('ship draft (packs of four)', () => {
  /** Drive a whole ship draft, always keeping the first two in front. */
  const runDraft = (ds: ReturnType<typeof dealShipDraft>) => {
    let cur = ds;
    let guard = 0;
    while (!cur.done && guard++ < 60) {
      const p = cur.toAct!;
      cur = pickShip(cur, p, cur.current![0].uid, cur.current![1].uid);
    }
    return cur;
  };

  it('deals four at a time and gives each player one hull per pack', () => {
    const ds = dealShipDraft('draft-1', 5, 1000);
    expect(ds.current!.length).toBe(4);
    expect(ds.deck.length).toBe(16);
    const done = runDraft(ds);
    expect(done.done).toBe(true);
    expect(done.keeps[0].length).toBe(5);
    expect(done.keeps[1].length).toBe(5);
    expect(done.burns[0].length).toBe(5);
    expect(done.burns[1].length).toBe(5);
  });

  it('five packs consume the whole 20-hull deck', () => {
    const done = runDraft(dealShipDraft('draft-2', 5, 1000));
    const consumed = [
      ...done.keeps[0], ...done.keeps[1], ...done.burns[0], ...done.burns[1],
    ].map((i) => i.id).sort();
    expect(consumed.length).toBe(20);
    expect(consumed).toEqual([...SHIP_IDS, ...SHIP_IDS].sort());
    expect(done.deck.length).toBe(0);
  });

  it('passes two on, then alternates who opens the next pack', () => {
    let ds = dealShipDraft('draft-3', 2, 1000, 0);
    expect(ds.toAct).toBe(0);
    const opened = ds.current!.map((i) => i.uid);
    ds = pickShip(ds, 0, opened[0], opened[1]);
    // The other two pass to player 1.
    expect(ds.toAct).toBe(1);
    expect(ds.current!.map((i) => i.uid)).toEqual([opened[2], opened[3]]);
    ds = pickShip(ds, 1, opened[2], opened[3]);
    // Fresh pack, and player 1 opens it this time.
    expect(ds.packIndex).toBe(1);
    expect(ds.toAct).toBe(1);
    expect(ds.current!.length).toBe(4);
  });

  it('rejects picks out of turn or outside the cards in front of you', () => {
    const ds = dealShipDraft('draft-4', 2, 1000, 0);
    expect(() => pickShip(ds, 1, ds.current![0].uid, ds.current![1].uid)).toThrow();
    expect(() => pickShip(ds, 0, ds.current![0].uid, ds.current![0].uid)).toThrow();
    expect(() => pickShip(ds, 0, ds.current![0].uid, 999999)).toThrow();
  });

  it('gives an exact pair clue for packs the viewer opened', () => {
    let ds = dealShipDraft('draft-5', 1, 1000, 0);
    const opened = ds.current!.slice();
    ds = pickShip(ds, 0, opened[0].uid, opened[1].uid);
    const passed = [opened[2].id, opened[3].id];
    ds = pickShip(ds, 1, opened[2].uid, opened[3].uid);
    // Player 0 opened the pack, so they know player 1 chose between the two
    // they passed on.
    const clues = cluesFor(ds, 0);
    expect(clues.length).toBe(1);
    expect(clues[0].options.slice().sort()).toEqual(passed.slice().sort());
  });

  it('burn pile is absent from every client view', () => {
    const done = runDraft(dealShipDraft('draft-6', 3, 1000));
    for (const p of [0, 1] as PlayerId[]) {
      const view = clientShipDraftView(done, p) as Record<string, unknown>;
      const json = JSON.stringify(view);
      for (const burned of done.burns[p === 0 ? 1 : 0]) {
        expect(json.includes(`"uid":${burned.uid}`)).toBe(false);
      }
      expect('burns' in view).toBe(false);
      expect('keeps' in view).toBe(false);
      expect('deck' in view).toBe(false);
    }
  });
});

describe('card draft (open shared row)', () => {
  it('snake order is A B B A A B…', () => {
    expect(snakeOrder(0, 3)).toEqual([0, 1, 1, 0, 0, 1]);
    expect(snakeOrder(1, 2)).toEqual([1, 0, 0, 1]);
  });

  it('pool size is (picks × 2) + 2, so the row runs short', () => {
    const ds = dealCardDraft('cards-1', 5, [1, 2], 0);
    expect(ds.pool.length).toBe(12);
  });

  it('is fully public and enforces turn order', () => {
    let ds = dealCardDraft('cards-2', 2, [1], 0);
    expect(currentPicker(ds)).toBe(0);
    expect(() => pickCard(ds, 1, ds.pool[0])).toThrow();
    let guard = 0;
    while (!ds.done && guard++ < 10) {
      ds = pickCard(ds, currentPicker(ds)!, ds.pool[0]);
    }
    expect(ds.done).toBe(true);
    expect(ds.keeps[0].length).toBe(2);
    expect(ds.keeps[1].length).toBe(2);
  });
});

describe('fleet deduction', () => {
  it('narrows the belief when sinks rule branches out', () => {
    // Two pair clues: {skiff(1) | dreadnought(5)}, {cutter(2) | tender(3)}.
    const clues = [
      { options: ['skiff', 'dreadnought'] },
      { options: ['cutter', 'tender'] },
    ];
    const before = fleetBelief(clues, []);
    expect(before.consistentCount).toBe(4);
    // A length-5 sink proves the dreadnought was kept, not the skiff.
    const after = fleetBelief(clues, [5]);
    expect(after.consistentCount).toBe(2);
    const [skiffPossible, dreadPossible] = after.possibleOptions[0];
    expect(dreadPossible).toBe(true);
    expect(skiffPossible).toBe(false);
    // And the remaining expectation carries no length-5 mass.
    expect(after.expectedBySize.get(5) ?? 0).toBe(0);
  });
});

describe('match flow', () => {
  it('placement then battle, income and basic salvo', () => {
    let ms = createMatch(baseConfig('flow-1'));
    expect(ms.phase).toBe('placement');
    expect(MODIFIER_IDS.includes(ms.modifierId)).toBe(true);
    ms = placeBoth(ms);
    expect(ms.phase).toBe('battle');
    expect(ms.current).toBe(0);
    expect(ms.players[0].energy).toBeGreaterThanOrEqual(3);
    const salvo = ms.players[0].tray.find((c) => c.typeId === 'basic_salvo')!;
    // Fire at open water: a miss costs the salvo and earns nothing back.
    const occupied = new Set(ms.players[1].ships.flatMap((s) => s.cells));
    const emptyCell = [...Array(ms.gridW * ms.gridH).keys()].find((c) => !occupied.has(c))!;
    const before = ms.players[0].energy;
    ms = reduce(ms, { type: 'PLAY_CARD', player: 0, cardUid: salvo.uid, target: { cells: [emptyCell] } });
    expect(ms.players[0].energy).toBe(before - 1);
    expect(ms.players[0].shotsFired).toBe(1);
  });

  it('victory when all ships sunk, and sinks announce length only', () => {
    let ms = createMatch(baseConfig('flow-4'));
    ms = placeBoth(ms);
    const salvo = () => ms.players[ms.current].tray.find((c) => c.typeId === 'basic_salvo')!;
    let guard = 0;
    while (ms.phase === 'battle' && guard++ < 800) {
      const enemy = ms.players[1];
      const target = enemy.ships.flatMap((s) =>
        s.sunk ? [] : s.cells.filter((_, i) => !s.destroyed[i]),
      );
      if (ms.current !== 0) {
        ms = reduce(ms, { type: 'END_TURN', player: 1 });
        continue;
      }
      if (ms.players[0].energy < 1 || target.length === 0) {
        if (target.length === 0) break;
        ms = reduce(ms, { type: 'END_TURN', player: 0 });
        continue;
      }
      ms = reduce(ms, { type: 'PLAY_CARD', player: 0, cardUid: salvo().uid, target: { cells: [target[0]] } });
    }
    expect(ms.phase).toBe('over');
    expect(ms.winner).toBe(0);
    // No hull name ever appears in sink announcements.
    for (const entry of ms.log) {
      if (entry.text.includes('goes down')) {
        expect(entry.text).toMatch(/A ship of length \d goes down\./);
      }
    }
  });

  it('evasive skiff dodges the first hit and reports a miss', () => {
    let ms = createMatch(baseConfig('flow-5'));
    ms = placeBoth(ms);
    const skiff = ms.players[1].ships.find((s) => s.typeId === 'skiff')!;
    const salvo = ms.players[0].tray.find((c) => c.typeId === 'basic_salvo')!;
    ms = reduce(ms, { type: 'PLAY_CARD', player: 0, cardUid: salvo.uid, target: { cells: [skiff.cells[0]] } });
    const after = ms.players[1].ships.find((s) => s.typeId === 'skiff')!;
    expect(after.evasiveUsed).toBe(true);
    expect(after.damage[0]).toBe(0);
    expect(ms.players[0].intel[skiff.cells[0]].mark).toBe('miss');
  });

  it('a played card sits out exactly the next turn', () => {
    let ms = createMatch(baseConfig('flow-6'));
    ms = placeBoth(ms);
    const twin = ms.players[0].tray.find((c) => c.typeId === 'twin_shot')!;
    const t0 = ms.players[1].ships.find((s) => s.typeId === 'tender')!.cells;
    ms = reduce(ms, { type: 'PLAY_CARD', player: 0, cardUid: twin.uid, target: { cells: [t0[0], t0[1]] } });
    const played = ms.players[0].tray.find((c) => c.uid === twin.uid)!;
    expect(cardUiState(ms, ms.players[0], played)).toBe('unavailable');

    // Next turn: still unavailable.
    ms = reduce(ms, { type: 'END_TURN', player: 0 });
    ms = reduce(ms, { type: 'END_TURN', player: 1 });
    let card = ms.players[0].tray.find((c) => c.uid === twin.uid)!;
    expect(cardUiState(ms, ms.players[0], card)).toBe('unavailable');
    expect(() =>
      reduce(ms, { type: 'PLAY_CARD', player: 0, cardUid: twin.uid, target: { cells: [t0[0], t0[1]] } }),
    ).toThrow();

    // Turn after that: available again.
    ms = reduce(ms, { type: 'END_TURN', player: 0 });
    ms = reduce(ms, { type: 'END_TURN', player: 1 });
    card = ms.players[0].tray.find((c) => c.uid === twin.uid)!;
    expect(cardUiState(ms, ms.players[0], card)).not.toBe('unavailable');
  });

  it('basic salvo is never unavailable', () => {
    let ms = createMatch(baseConfig('flow-8'));
    ms = placeBoth(ms);
    const salvo = ms.players[0].tray.find((c) => c.typeId === 'basic_salvo')!;
    const target = ms.players[1].ships.find((s) => s.typeId === 'tender')!.cells;
    ms = reduce(ms, { type: 'PLAY_CARD', player: 0, cardUid: salvo.uid, target: { cells: [target[0]] } });
    const after = ms.players[0].tray.find((c) => c.uid === salvo.uid)!;
    expect(cardUiState(ms, ms.players[0], after)).not.toBe('unavailable');
    // And it can be played again immediately, in the same turn.
    ms = reduce(ms, { type: 'PLAY_CARD', player: 0, cardUid: salvo.uid, target: { cells: [target[1]] } });
    expect(ms.players[0].shotsFired).toBe(2);
  });

  it('hit energy lands immediately and is spendable this turn', () => {
    let ms = createMatch(baseConfig('flow-9'));
    ms = placeBoth(ms);
    const salvo = ms.players[0].tray.find((c) => c.typeId === 'basic_salvo')!;
    const tender = ms.players[1].ships.find((s) => s.typeId === 'tender')!;
    const before = ms.players[0].energy;
    ms = reduce(ms, { type: 'PLAY_CARD', player: 0, cardUid: salvo.uid, target: { cells: [tender.cells[0]] } });
    // Paid 1 for the salvo, earned 1 back for the hit, in the same turn.
    expect(ms.players[0].energy).toBe(before - 1 + ms.hitBonus);
  });

  it('rejects illegal actions', () => {
    let ms = createMatch(baseConfig('flow-7'));
    ms = placeBoth(ms);
    expect(() => reduce(ms, { type: 'END_TURN', player: 1 })).toThrow();
    const salvo = ms.players[0].tray.find((c) => c.typeId === 'basic_salvo')!;
    expect(() =>
      reduce(ms, { type: 'PLAY_CARD', player: 0, cardUid: salvo.uid, target: { cells: [] } }),
    ).toThrow();
  });
});

describe('hidden information', () => {
  it('opponent unplayed cards never appear in the client view', () => {
    let ms = createMatch(baseConfig('hide-1'));
    ms = placeBoth(ms);
    // Before any play: only basic salvo is public.
    let view = clientMatchView(ms, 0);
    expect(view.opponent.revealedTray.map((c) => c.typeId)).toEqual(['basic_salvo']);
    expect(JSON.stringify(view).includes('line_probe')).toBe(false);
    // Player 1 plays line_probe → it becomes public with its cooldown.
    ms = reduce(ms, { type: 'END_TURN', player: 0 });
    const probe = ms.players[1].tray.find((c) => c.typeId === 'line_probe')!;
    ms = reduce(ms, { type: 'PLAY_CARD', player: 1, cardUid: probe.uid, target: { cells: [0, 1, 2] } });
    view = clientMatchView(ms, 0);
    const revealed = view.opponent.revealedTray.map((c) => c.typeId);
    expect(revealed).toContain('line_probe');
    expect(revealed).not.toContain('ballast');
    expect(view.opponent.revealedTray.every((c) => 'available' in c)).toBe(true);
  });

  it('opponent ship hulls and positions never appear in the client view', () => {
    let ms = createMatch(baseConfig('hide-2'));
    ms = placeBoth(ms);
    const view = clientMatchView(ms, 0) as unknown as Record<string, unknown>;
    const opp = view.opponent as Record<string, unknown>;
    expect(opp.fleetCount).toBe(3);
    expect('ships' in opp).toBe(false);
    // The serialised view carries no enemy ship cells.
    const json = JSON.stringify(view.opponent);
    expect(json.includes('cells')).toBe(false);
  });
});

describe('terrain modifiers', () => {
  it('has 16 authored modifiers, each tied to one terrain type', () => {
    expect(MODIFIER_IDS.length).toBe(16);
    for (const id of MODIFIER_IDS) {
      expect(MODIFIERS[id].terrain).toBeDefined();
      expect(MODIFIERS[id].effect.kind).toBeDefined();
    }
  });
  it('the drawn modifier is deterministic per seed', () => {
    const a = createMatch(baseConfig('mod-1'));
    const b = createMatch(baseConfig('mod-1'));
    expect(a.modifierId).toBe(b.modifierId);
  });
});

describe('determinism', () => {
  it('same seed and action log produce byte-identical states', () => {
    const run = () => {
      let ms = createMatch(baseConfig('det-1'));
      ms = placeBoth(ms);
      const actions = [
        { type: 'END_TURN', player: 0 },
        { type: 'END_TURN', player: 1 },
      ] as const;
      for (const a of actions) ms = reduce(ms, structuredClone(a) as never);
      return ms;
    };
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });

  it('reduce does not mutate its input', () => {
    const ms = createMatch(baseConfig('det-2'));
    const frozen = JSON.stringify(ms);
    const [placements] = autoPlaceFleet(
      ms.players[0].fleetToPlace, ms.gridW, ms.gridH, ms.terrain, seedRng('x'),
    );
    reduce(ms, { type: 'PLACE_FLEET', player: 0, placements: placements!, mines: [] });
    expect(JSON.stringify(ms)).toBe(frozen);
  });
});

describe('tournament', () => {
  it('builds valid double-elim brackets for 8/16/32', () => {
    for (const n of [8, 16, 32]) {
      const matches = generateBracket(n);
      expect(matches.filter((m) => m.bracket === 'W' && m.round === 1).length).toBe(n / 2);
      expect(matches.filter((m) => m.bracket === 'GF').length).toBe(1);
      for (const m of matches) {
        if (m.bracket !== 'GF') expect(m.winnerTo).not.toBeNull();
      }
    }
  });

  it('a full 16-seat tournament resolves to a champion', () => {
    let ts = createTournament('tourney-1', 'You', 16);
    let guard = 0;
    while (!ts.complete && guard++ < 100) {
      const m = nextPendingMatch(ts);
      expect(m).not.toBeNull();
      ts = advanceMatch(ts, m!.id, Math.min(m!.seats[0]!, m!.seats[1]!));
    }
    expect(ts.complete).toBe(true);
    expect(ts.championSeat).not.toBeNull();
    expect(Math.max(...ts.seats.map((s) => s.losses))).toBeLessThanOrEqual(2);
    expect(ts.seats.filter((s) => s.eliminated).length).toBe(15);
  });

  it('resolves AI matches until the human is up, with real drafts', () => {
    let ts = createTournament('tourney-2', 'You', 16, 6);
    ts = resolveUntilHuman(ts);
    expect(humanSeat(ts).isHuman).toBe(true);
    const played = ts.seats.filter((s) => !s.isHuman && s.matchesPlayed > 0);
    expect(played.length).toBeGreaterThan(0);
    for (const s of played) {
      expect(s.fleet.length).toBe(voyageRound(6, s.matchesPlayed).fleetSize);
      for (const id of s.fleet) expect(SHIPS[id]).toBeDefined();
    }
  });
});

describe('grid helpers', () => {
  it('rectangular indexing round-trips', () => {
    const w = 8;
    expect(rcCell(2, 3, w)).toBe(19);
  });
});
