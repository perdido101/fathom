import { describe, expect, it } from 'vitest';
import type { CardInstance, MatchState, Plan, PlayerId } from './types';
import { cellAt, emptyPlan } from './types';
import { createMatch, commitPlan, deploy, pickCard, pickShip, playRound } from './match';
import { currentPack } from './draft';
import { clientView } from './view';
import { transcriptOf, verify } from './verify';
import { CARD_IDS } from './cards';
import { stableStringify } from './sha256';
import type { Placement } from './board';

// ---------------------------------------------------------------------------
// Scaffolding
// ---------------------------------------------------------------------------

interface Setup {
  seed?: string;
  ships?: [string[], string[]];
  place?: [Placement[], Placement[]];
  hands?: [string[], string[]];
}

const DEFAULT_SHIPS: [string[], string[]] = [
  ['warhead', 'beacon', 'ember'],
  ['forge', 'kiln', 'pin'],
];

/** Three ships laid out in tidy rows, so tests can name cells by hand. */
function rows(ids: string[], startRow: number): Placement[] {
  const lengths = [4, 3, 2];
  return ids.map((defId, i) => ({
    defId,
    cells: Array.from({ length: lengths[i] }, (_, k) => cellAt(k, startRow + i)),
  }));
}

/** A match sitting at the top of round 1 with exactly the pieces asked for. */
function battle(opts: Setup = {}): MatchState {
  const ships = opts.ships ?? DEFAULT_SHIPS;
  let ms = createMatch({ seed: opts.seed ?? 'test-seed', players: ['A', 'B'] });

  for (let pack = 0; pack < 3; pack++) {
    ms = pickShip(ms, 0, ships[0][pack]);
    ms = pickShip(ms, 1, ships[1][pack]);
  }
  for (let pack = 0; pack < 3; pack++) {
    const options = currentPack(ms.cardDraft);
    ms = pickCard(ms, 0, options[0]);
    ms = pickCard(ms, 1, options[1] ?? options[0]);
  }

  const place = opts.place ?? [rows(ships[0], 0), rows(ships[1], 0)];
  ms = deploy(ms, 0, place[0], 'n0');
  ms = deploy(ms, 1, place[1], 'n1');

  if (opts.hands) {
    for (const p of [0, 1] as PlayerId[]) {
      ms.players[p].hand = opts.hands[p].map((defId, i) => ({
        uid: 900 + p * 100 + i,
        defId,
        charges: 0,
      }));
    }
  }
  return ms;
}

function card(ms: MatchState, p: PlayerId, defId: string): CardInstance {
  const c = ms.players[p].hand.find((x) => x.defId === defId);
  if (!c) throw new Error(`no ${defId} in hand`);
  return c;
}

function charge(ms: MatchState, p: PlayerId, defId: string, n: number): void {
  card(ms, p, defId).charges = n;
}

/** A plan that does the minimum the rules demand: place one charge. */
function idle(ms: MatchState, p: PlayerId): Plan {
  const first = ms.players[p].hand[0];
  return { ...emptyPlan(), chargeTo: first?.uid ?? null, bonusTo: first?.uid ?? null };
}

function run(ms: MatchState, a: Plan, b: Plan) {
  return playRound(ms, {
    plans: [commitPlan(a, 'x', 'sig'), commitPlan(b, 'y', 'sig')],
  });
}

// ---------------------------------------------------------------------------

describe('content', () => {
  it('fields twelve cards and twelve ships', async () => {
    const { CARD_LIST } = await import('./cards');
    const { SHIP_LIST, PACK_A, PACK_B, PACK_C } = await import('./ships');
    expect(CARD_LIST).toHaveLength(12);
    expect(SHIP_LIST).toHaveLength(12);
    expect(PACK_A).toHaveLength(4);
    expect(PACK_B).toHaveLength(4);
    expect(PACK_C).toHaveLength(4);
    expect(new Set(SHIP_LIST.map((s) => s.id)).size).toBe(12);
  });

  it('offers 64 possible enemy fleets', async () => {
    const { FLEET_SPACE } = await import('./ships');
    expect(FLEET_SPACE).toHaveLength(64);
  });

  it('lets only Ambush fire from a standing start', async () => {
    const { CARD_LIST } = await import('./cards');
    const free = CARD_LIST.filter((c) => c.minCharges === 0).map((c) => c.id);
    expect(free).toEqual(['ambush']);
  });
});

describe('drafting', () => {
  it('gives both players the item when they collide', () => {
    let ms = createMatch({ seed: 'collide', players: ['A', 'B'] });
    const pack = currentPack(ms.shipDraft);
    ms = pickShip(ms, 0, pack[0]);
    ms = pickShip(ms, 1, pack[0]);
    expect(ms.shipDraft.collisions[0]).toBe(true);
    expect(ms.shipDraft.picks[0][0]).toBe(pack[0]);
    expect(ms.shipDraft.picks[1][0]).toBe(pack[0]);
  });

  it('builds a fleet of one 4, one 3 and one 2', () => {
    const ms = battle();
    for (const p of [0, 1] as PlayerId[]) {
      expect(ms.players[p].ships.map((s) => s.length).sort()).toEqual([2, 3, 4]);
    }
  });

  it('leaves the undrafted cards in a shared pile', () => {
    const ms = battle();
    const taken = new Set([...ms.players[0].draftedCards, ...ms.players[1].draftedCards]);
    expect(ms.pile.length).toBe(CARD_IDS.length - taken.size);
    for (const id of ms.pile) expect(taken.has(id)).toBe(false);
  });
});

describe('hidden information', () => {
  it('keeps enemy placements, hand identities and pile order out of the view', () => {
    // The fleets are laid out differently so a coordinate list belonging to
    // one player can never be mistaken for the other's in the serialised view.
    const ms = battle({ place: [rows(DEFAULT_SHIPS[0], 0), rows(DEFAULT_SHIPS[1], 3)] });
    for (const viewer of [0, 1] as PlayerId[]) {
      const view = clientView(ms, viewer);
      const json = stableStringify(view);
      const foe = ms.players[viewer === 0 ? 1 : 0];

      // No enemy ship ever appears at a coordinate.
      for (const ship of foe.ships) {
        expect(json).not.toContain(stableStringify(ship.cells));
      }
      // The pile is a count, never a list.
      expect(json).not.toContain(stableStringify(ms.pile));
      expect(view.pileCount).toBe(ms.pile.length);
      // The seed decides the pile order and every random effect to come.
      expect(view.seed).toBeNull();
      // Enemy cards show a charge count and nothing else, unless the draft
      // made the identity public by colliding.
      const collided = new Set(
        ms.cardDraft.collisions
          .map((c, i) => (c ? ms.cardDraft.picks[viewer][i] : null))
          .filter(Boolean),
      );
      for (const c of view.foe.hand) {
        if (c.defId !== null) expect(collided.has(c.defId)).toBe(true);
      }
      // Enemy ship identities stay hidden until they act or die.
      for (const s of view.foe.ships) expect(s.defId).toBeNull();
    }
  });

  it('reveals a ship identity when its ability is used, but not its position', () => {
    let ms = battle({
      place: [rows(DEFAULT_SHIPS[0], 0), rows(DEFAULT_SHIPS[1], 3)],
      hands: [
        ['salvo', 'lance', 'rake'],
        ['salvo', 'lance', 'rake'],
      ],
    });
    const a: Plan = {
      ...idle(ms, 0),
      ability: { defId: 'ember', spec: { shape: 'cells', cells: [3, 4, 5, 9] } },
    };
    ms = run(ms, a, idle(ms, 1)).state;
    const view = clientView(ms, 1);
    const ember = view.foe.ships.find((s) => s.defId === 'ember');
    expect(ember).toBeDefined();
    expect(stableStringify(view)).not.toContain(stableStringify(ms.players[0].ships[2].cells));
  });

  it('announces a sink by length only', () => {
    let ms = battle({
      place: [
        rows(DEFAULT_SHIPS[0], 0),
        [
          { defId: 'forge', cells: [0, 1, 2, 3] },
          { defId: 'kiln', cells: [6, 7, 8] },
          { defId: 'pin', cells: [12, 13] },
        ],
      ],
      hands: [
        ['salvo', 'lance', 'rake'],
        ['salvo', 'lance', 'rake'],
      ],
    });
    charge(ms, 0, 'salvo', 1);
    const a: Plan = {
      ...idle(ms, 0),
      chargeTo: card(ms, 0, 'salvo').uid,
      basic: 12,
      fire: { uid: card(ms, 0, 'salvo').uid, spec: { shape: 'cells', cells: [13] } },
    };
    const res = run(ms, a, idle(ms, 1));
    const sinks = res.events.filter((e) => e.t === 'sink');
    expect(sinks).toHaveLength(1);
    expect(stableStringify(sinks[0])).not.toContain('pin');
  });
});

describe('the charge economy', () => {
  it('spends every charge and destroys the card', () => {
    let ms = battle({
      hands: [
        ['salvo', 'lance', 'rake'],
        ['salvo', 'lance', 'rake'],
      ],
    });
    charge(ms, 0, 'salvo', 3);
    const uid = card(ms, 0, 'salvo').uid;
    const a: Plan = {
      ...idle(ms, 0),
      chargeTo: uid,
      fire: { uid, spec: { shape: 'cells', cells: [20, 21, 22, 23] } },
    };
    const res = run(ms, a, idle(ms, 1));
    expect(res.state.players[0].hand.find((c) => c.uid === uid)).toBeUndefined();
    expect(res.state.players[0].graveyard.map((g) => g.defId)).toContain('salvo');
    // Three banked plus this round's one.
    expect(res.state.players[0].graveyard[0].charges).toBe(4);
  });

  it('fires one cell per charge and no more', () => {
    let ms = battle({
      hands: [
        ['salvo', 'lance', 'rake'],
        ['salvo', 'lance', 'rake'],
      ],
    });
    charge(ms, 0, 'salvo', 1);
    const uid = card(ms, 0, 'salvo').uid;
    const a: Plan = {
      ...idle(ms, 0),
      chargeTo: uid,
      basic: null,
      fire: { uid, spec: { shape: 'cells', cells: [20, 21, 22, 23, 24] } },
    };
    const res = run(ms, a, idle(ms, 1));
    const shots = res.events.filter((e) => e.t === 'shot' && e.by === 0);
    expect(shots).toHaveLength(2); // salvo at 2 charges
  });

  it('grants exactly one bonus charge however many cells connect', () => {
    // Ruling Q1: connecting is worth one charge, not one per hit.
    let ms = battle({
      hands: [
        ['salvo', 'lance', 'rake'],
        ['lance', 'salvo', 'rake'],
      ],
    });
    charge(ms, 0, 'salvo', 3);
    const salvoUid = card(ms, 0, 'salvo').uid;
    const rakeUid = card(ms, 0, 'rake').uid;
    const a: Plan = {
      ...idle(ms, 0),
      chargeTo: salvoUid,
      bonusTo: rakeUid,
      basic: null,
      // Their 4-ship sits on 0..3, so all four cells connect.
      fire: { uid: salvoUid, spec: { shape: 'cells', cells: [0, 1, 2, 3] } },
    };
    const res = run(ms, a, idle(ms, 1));
    expect(res.events.filter((e) => e.t === 'shot' && e.by === 0 && e.hit)).toHaveLength(4);
    expect(res.state.players[0].hand.find((c) => c.uid === rakeUid)!.charges).toBe(1);
  });

  it('does not let charges earned this round be spent this round', () => {
    let ms = battle({
      hands: [
        ['salvo', 'lance', 'rake'],
        ['salvo', 'lance', 'rake'],
      ],
    });
    charge(ms, 0, 'lance', 2);
    const lanceUid = card(ms, 0, 'lance').uid;
    const rakeUid = card(ms, 0, 'rake').uid;
    const a: Plan = {
      ...idle(ms, 0),
      chargeTo: lanceUid,
      bonusTo: rakeUid,
      basic: 0, // a certain hit on their 4-ship
      fire: { uid: lanceUid, spec: { shape: 'line', origin: 0, dir: [1, 0] } },
    };
    const res = run(ms, a, idle(ms, 1));
    const rake = res.state.players[0].hand.find((c) => c.uid === rakeUid)!;
    expect(rake.charges).toBe(1); // the round's single bonus, landing after the shot
    expect(res.state.players[0].graveyard[0].charges).toBe(3); // lance fired at 2+1
  });

  it('refuses to fire Burst below two charges', async () => {
    const { validatePlan } = await import('./resolve');
    const ms = battle({
      hands: [
        ['burst', 'lance', 'rake'],
        ['salvo', 'lance', 'rake'],
      ],
    });
    const uid = card(ms, 0, 'burst').uid;
    const plan: Plan = {
      ...idle(ms, 0),
      chargeTo: uid,
      fire: { uid, spec: { shape: 'block', anchor: 0 } },
    };
    expect(validatePlan(ms, 0, plan)).toMatch(/cannot fire/);
  });

  it('scales Burst from 2x2 to 3x3 at four charges', () => {
    let ms = battle({
      hands: [
        ['burst', 'lance', 'rake'],
        ['salvo', 'lance', 'rake'],
      ],
    });
    charge(ms, 0, 'burst', 3);
    const uid = card(ms, 0, 'burst').uid;
    const a: Plan = {
      ...idle(ms, 0),
      chargeTo: uid,
      basic: null,
      fire: { uid, spec: { shape: 'block', anchor: 14 } },
    };
    const res = run(ms, a, idle(ms, 1));
    expect(res.events.filter((e) => e.t === 'shot' && e.by === 0)).toHaveLength(9);
  });

  it('grows Rake by one cell per charge above the first', () => {
    let ms = battle({
      hands: [
        ['rake', 'lance', 'salvo'],
        ['salvo', 'lance', 'rake'],
      ],
    });
    charge(ms, 0, 'rake', 2);
    const uid = card(ms, 0, 'rake').uid;
    const a: Plan = {
      ...idle(ms, 0),
      chargeTo: uid,
      basic: null,
      fire: { uid, spec: { shape: 'row', origin: 18 } },
    };
    const res = run(ms, a, idle(ms, 1));
    expect(res.events.filter((e) => e.t === 'shot' && e.by === 0)).toHaveLength(5);
  });
});

describe('simultaneity', () => {
  it('lets a ship that dies this round still land its shots', () => {
    // Both fleets are one hit from gone; both fire; both die.
    let ms = battle({
      place: [
        [
          { defId: 'warhead', cells: [0, 1, 2, 3] },
          { defId: 'beacon', cells: [6, 7, 8] },
          { defId: 'ember', cells: [12, 13] },
        ],
        [
          { defId: 'forge', cells: [0, 1, 2, 3] },
          { defId: 'kiln', cells: [6, 7, 8] },
          { defId: 'pin', cells: [12, 13] },
        ],
      ],
      hands: [
        ['salvo', 'lance', 'rake'],
        ['salvo', 'lance', 'rake'],
      ],
    });
    for (const p of [0, 1] as PlayerId[]) {
      for (const s of ms.players[p].ships) {
        s.hits = s.cells.map((_, i) => i > 0);
      }
    }
    charge(ms, 0, 'salvo', 2);
    charge(ms, 1, 'salvo', 2);
    const mk = (p: PlayerId): Plan => {
      const uid = card(ms, p, 'salvo').uid;
      return {
        ...idle(ms, p),
        chargeTo: uid,
        basic: 12,
        fire: { uid, spec: { shape: 'cells', cells: [0, 6, 12] } },
      };
    };
    const res = run(ms, mk(0), mk(1));
    expect(res.state.outcome).toEqual({ kind: 'draw', reason: 'mutual' });
  });

  it('scores both attacks against the same pre-damage board', () => {
    let ms = battle({
      hands: [
        ['salvo', 'lance', 'rake'],
        ['salvo', 'lance', 'rake'],
      ],
    });
    charge(ms, 0, 'salvo', 1);
    charge(ms, 1, 'salvo', 1);
    const mk = (p: PlayerId): Plan => {
      const uid = card(ms, p, 'salvo').uid;
      return {
        ...idle(ms, p),
        chargeTo: uid,
        basic: null,
        fire: { uid, spec: { shape: 'cells', cells: [0, 1] } },
      };
    };
    const res = run(ms, mk(0), mk(1));
    const hits = res.events.filter((e) => e.t === 'shot' && e.hit);
    expect(hits.length).toBe(4); // two each, nobody pre-empts anybody
  });
});

describe('execute effects', () => {
  it('sinks a damaged ship outright with Breaker', () => {
    let ms = battle({
      hands: [
        ['breaker', 'lance', 'rake'],
        ['salvo', 'lance', 'rake'],
      ],
    });
    ms.players[1].ships[0].hits[3] = true; // the 4-ship is damaged
    charge(ms, 0, 'breaker', 2);
    const uid = card(ms, 0, 'breaker').uid;
    const a: Plan = {
      ...idle(ms, 0),
      chargeTo: uid,
      basic: null,
      fire: { uid, spec: { shape: 'block', anchor: 0 } },
    };
    const res = run(ms, a, idle(ms, 1));
    expect(res.state.players[1].ships[0].sunk).toBe(true);
  });

  it('leaves an undamaged ship merely damaged', () => {
    let ms = battle({
      hands: [
        ['breaker', 'lance', 'rake'],
        ['salvo', 'lance', 'rake'],
      ],
    });
    charge(ms, 0, 'breaker', 2);
    const uid = card(ms, 0, 'breaker').uid;
    const a: Plan = {
      ...idle(ms, 0),
      chargeTo: uid,
      basic: null,
      fire: { uid, spec: { shape: 'block', anchor: 0 } },
    };
    const res = run(ms, a, idle(ms, 1));
    expect(res.state.players[1].ships[0].sunk).toBe(false);
    expect(res.state.players[1].ships[0].hits.filter(Boolean).length).toBe(2);
  });
});

describe('predictions', () => {
  it('makes their whole attack miss when Mirror reads it', () => {
    let ms = battle({
      hands: [
        ['mirror', 'lance', 'rake'],
        ['salvo', 'lance', 'rake'],
      ],
    });
    charge(ms, 0, 'mirror', 1);
    charge(ms, 1, 'salvo', 2);
    const mirrorUid = card(ms, 0, 'mirror').uid;
    const salvoUid = card(ms, 1, 'salvo').uid;
    const a: Plan = {
      ...idle(ms, 0),
      chargeTo: mirrorUid,
      basic: null,
      fire: { uid: mirrorUid, spec: { shape: 'cell', cell: 7 } },
    };
    const b: Plan = {
      ...idle(ms, 1),
      chargeTo: salvoUid,
      basic: null,
      fire: { uid: salvoUid, spec: { shape: 'cells', cells: [0, 1, 7] } },
    };
    const res = run(ms, a, b);
    expect(res.events.filter((e) => e.t === 'shot' && e.by === 1)).toHaveLength(0);
    const read = res.events.find((e) => e.t === 'prediction');
    expect(read && read.t === 'prediction' && read.triggered).toBe(true);
  });

  it('fires Ambush back from zero charges', () => {
    let ms = battle({
      hands: [
        ['ambush', 'lance', 'rake'],
        ['salvo', 'lance', 'rake'],
      ],
    });
    const ambushUid = card(ms, 0, 'ambush').uid;
    const lanceUid = card(ms, 0, 'lance').uid;
    const a: Plan = {
      ...idle(ms, 0),
      chargeTo: lanceUid,
      basic: null,
      fire: { uid: ambushUid, spec: { shape: 'cell', cell: 20 } },
    };
    const b: Plan = { ...idle(ms, 1), basic: 20 };
    const res = run(ms, a, b);
    const back = res.events.filter((e) => e.t === 'shot' && e.by === 0 && e.source === 'ambush');
    expect(back).toHaveLength(1);
    expect(res.state.players[0].hand.find((c) => c.uid === ambushUid)).toBeUndefined();
  });

  it('does nothing when the read is wrong', () => {
    let ms = battle({
      hands: [
        ['ambush', 'lance', 'rake'],
        ['salvo', 'lance', 'rake'],
      ],
    });
    const ambushUid = card(ms, 0, 'ambush').uid;
    const a: Plan = {
      ...idle(ms, 0),
      chargeTo: card(ms, 0, 'lance').uid,
      basic: null,
      fire: { uid: ambushUid, spec: { shape: 'cell', cell: 35 } },
    };
    const res = run(ms, a, { ...idle(ms, 1), basic: 20 });
    expect(res.events.filter((e) => e.t === 'shot' && e.by === 0)).toHaveLength(0);
  });
});

describe('rulings from build 2', () => {
  it('refuses to fire Mirror below two charges', async () => {
    const { validatePlan } = await import('./resolve');
    const ms = battle({
      hands: [
        ['mirror', 'lance', 'rake'],
        ['salvo', 'lance', 'rake'],
      ],
    });
    const uid = card(ms, 0, 'mirror').uid;
    // One banked plus this round's charge is still only two, so one banked
    // is the lowest that works; zero banked must be refused.
    const plan: Plan = {
      ...idle(ms, 0),
      chargeTo: uid,
      fire: { uid, spec: { shape: 'cell', cell: 7 } },
    };
    expect(validatePlan(ms, 0, plan)).toMatch(/cannot fire/);
    charge(ms, 0, 'mirror', 1);
    expect(validatePlan(ms, 0, plan)).toBeNull();
  });

  it('awards a mutual elimination to whoever entered the round ahead', () => {
    let ms = battle({
      place: [rows(DEFAULT_SHIPS[0], 0), rows(DEFAULT_SHIPS[1], 0)],
      hands: [
        ['salvo', 'lance', 'rake'],
        ['salvo', 'lance', 'rake'],
      ],
    });
    // Both fleets one cell from gone, but player 1 has taken an extra hit
    // somewhere that does not matter to this round's shots.
    for (const p of [0, 1] as PlayerId[]) {
      for (const s2 of ms.players[p].ships) s2.hits = s2.cells.map((_, i) => i > 0);
    }
    // Player 1's 4-ship has one more cell already gone than player 0's does.
    ms.players[1].ships[0].hits = [false, true, true, true];
    ms.players[0].ships[0].hits = [false, false, true, true];

    charge(ms, 0, 'salvo', 2);
    charge(ms, 1, 'salvo', 2);
    const mk = (p: PlayerId): Plan => {
      const uid = card(ms, p, 'salvo').uid;
      return {
        ...idle(ms, p),
        chargeTo: uid,
        basic: 12,
        fire: { uid, spec: { shape: 'cells', cells: [0, 1, 6] } },
      };
    };
    const res = run(ms, mk(0), mk(1));
    // Both fleets are gone, and player 0 walked in with more hull.
    expect(res.state.players[0].ships.every((x) => x.sunk)).toBe(true);
    expect(res.state.players[1].ships.every((x) => x.sunk)).toBe(true);
    expect(res.state.outcome).toEqual({ kind: 'win', winner: 0, reason: 'mutual' });
  });

  it('still draws a mutual elimination that was level going in', () => {
    let ms = battle({
      hands: [
        ['salvo', 'lance', 'rake'],
        ['salvo', 'lance', 'rake'],
      ],
    });
    for (const p of [0, 1] as PlayerId[]) {
      for (const s2 of ms.players[p].ships) s2.hits = s2.cells.map((_, i) => i > 0);
    }
    charge(ms, 0, 'salvo', 2);
    charge(ms, 1, 'salvo', 2);
    const mk = (p: PlayerId): Plan => {
      const uid = card(ms, p, 'salvo').uid;
      return {
        ...idle(ms, p),
        chargeTo: uid,
        basic: 12,
        fire: { uid, spec: { shape: 'cells', cells: [0, 6, 12] } },
      };
    };
    const res = run(ms, mk(0), mk(1));
    expect(res.state.outcome).toEqual({ kind: 'draw', reason: 'mutual' });
  });

  it('lets Kiln turn a zero-charge Ambush into a whole-row answer', () => {
    let ms = battle({
      ships: [
        ['warhead', 'kiln', 'ember'],
        ['forge', 'beacon', 'pin'],
      ],
      hands: [
        ['ambush', 'lance', 'rake'],
        ['salvo', 'lance', 'rake'],
      ],
    });
    const ambushUid = card(ms, 0, 'ambush').uid;
    const lanceUid = card(ms, 0, 'lance').uid;
    const a: Plan = {
      ...idle(ms, 0),
      chargeTo: lanceUid,
      basic: null,
      ability: {
        defId: 'kiln',
        spec: { shape: 'kiln', uid: ambushUid, inner: { shape: 'cell', cell: 20 } },
      },
    };
    // They shoot the cell Ambush named, so the read lands.
    const res = run(ms, a, { ...idle(ms, 1), basic: 20 });
    const back = res.events.filter((e) => e.t === 'shot' && e.by === 0 && e.source === 'ambush');
    // Ambush at 0 + Kiln's 3 clears the three-charge threshold: the whole row.
    expect(back).toHaveLength(6);
  });

  it('does not let two Thorns answer each other', () => {
    // Both players field Thorn, both are one hit from losing it, and both fire
    // at the other's Thorn. Each mirrors the round's declared salvo once and
    // the round settles.
    const shipsA = ['warhead', 'beacon', 'thorn'];
    const shipsB = ['forge', 'kiln', 'thorn'];
    let ms = battle({
      ships: [shipsA, shipsB],
      place: [rows(shipsA, 0), rows(shipsB, 0)],
      hands: [
        ['salvo', 'lance', 'rake'],
        ['salvo', 'lance', 'rake'],
      ],
    });
    for (const p of [0, 1] as PlayerId[]) {
      ms.players[p].ships[2].hits = [true, false];
    }
    const mk = (p: PlayerId): Plan => ({ ...idle(ms, p), basic: 13 });
    const res = run(ms, mk(0), mk(1));

    const thornShots = res.events.filter((e) => e.t === 'shot' && e.source === 'thorn');
    // One mirrored cell each, and no third wave.
    expect(thornShots).toHaveLength(2);
    expect(res.state.phase === 'battle' || res.state.phase === 'over').toBe(true);
  });
});

describe('control effects', () => {
  it('strips the charges Jam names', () => {
    let ms = battle({
      hands: [
        ['jam', 'lance', 'rake'],
        ['lance', 'salvo', 'rake'],
      ],
    });
    charge(ms, 0, 'jam', 2);
    charge(ms, 1, 'salvo', 5);
    const jamUid = card(ms, 0, 'jam').uid;
    const target = card(ms, 1, 'salvo').uid;
    const a: Plan = {
      ...idle(ms, 0),
      chargeTo: jamUid,
      basic: null,
      fire: { uid: jamUid, spec: { shape: 'strip', from: [{ uid: target, amount: 3 }] } },
    };
    const res = run(ms, a, idle(ms, 1));
    expect(res.state.players[1].hand.find((c) => c.uid === target)!.charges).toBe(2);
  });

  it('cannot shrink a card that is already in the air', () => {
    let ms = battle({
      hands: [
        ['jam', 'lance', 'rake'],
        ['salvo', 'lance', 'rake'],
      ],
    });
    charge(ms, 0, 'jam', 4);
    charge(ms, 1, 'salvo', 3);
    const jamUid = card(ms, 0, 'jam').uid;
    const salvoUid = card(ms, 1, 'salvo').uid;
    const a: Plan = {
      ...idle(ms, 0),
      chargeTo: jamUid,
      basic: null,
      fire: { uid: jamUid, spec: { shape: 'strip', from: [{ uid: salvoUid, amount: 5 }] } },
    };
    const b: Plan = {
      ...idle(ms, 1),
      chargeTo: salvoUid,
      basic: null,
      fire: { uid: salvoUid, spec: { shape: 'cells', cells: [20, 21, 22, 23] } },
    };
    const res = run(ms, a, b);
    expect(res.events.filter((e) => e.t === 'shot' && e.by === 1)).toHaveLength(4);
  });

  it('moves stolen charges onto the named card', () => {
    let ms = battle({
      hands: [
        ['siphon', 'lance', 'rake'],
        ['lance', 'salvo', 'rake'],
      ],
    });
    charge(ms, 0, 'siphon', 2);
    charge(ms, 1, 'salvo', 4);
    const siphonUid = card(ms, 0, 'siphon').uid;
    const dest = card(ms, 0, 'rake').uid;
    const src = card(ms, 1, 'salvo').uid;
    const a: Plan = {
      ...idle(ms, 0),
      chargeTo: siphonUid,
      basic: null,
      fire: {
        uid: siphonUid,
        spec: { shape: 'steal', from: [{ uid: src, amount: 3 }], toUid: dest },
      },
    };
    const res = run(ms, a, idle(ms, 1));
    expect(res.state.players[1].hand.find((c) => c.uid === src)!.charges).toBe(1);
    expect(res.state.players[0].hand.find((c) => c.uid === dest)!.charges).toBe(3);
  });

  it('never hands out charges that were not there', () => {
    let ms = battle({
      hands: [
        ['siphon', 'jam', 'rake'],
        ['lance', 'salvo', 'rake'],
      ],
    });
    charge(ms, 0, 'siphon', 5);
    charge(ms, 1, 'salvo', 2);
    const siphonUid = card(ms, 0, 'siphon').uid;
    const dest = card(ms, 0, 'rake').uid;
    const src = card(ms, 1, 'salvo').uid;
    const a: Plan = {
      ...idle(ms, 0),
      chargeTo: siphonUid,
      basic: null,
      fire: {
        uid: siphonUid,
        spec: { shape: 'steal', from: [{ uid: src, amount: 6 }], toUid: dest },
      },
    };
    const res = run(ms, a, idle(ms, 1));
    expect(res.state.players[1].hand.find((c) => c.uid === src)!.charges).toBe(0);
    expect(res.state.players[0].hand.find((c) => c.uid === dest)!.charges).toBe(2);
  });
});

describe('ship abilities', () => {
  it('lets Kiln fire a second card at three extra charges', () => {
    let ms = battle({
      ships: [
        ['warhead', 'kiln', 'ember'],
        ['forge', 'beacon', 'pin'],
      ],
      hands: [
        ['salvo', 'lance', 'rake'],
        ['salvo', 'lance', 'rake'],
      ],
    });
    const salvoUid = card(ms, 0, 'salvo').uid;
    const lanceUid = card(ms, 0, 'lance').uid;
    const a: Plan = {
      ...idle(ms, 0),
      chargeTo: lanceUid,
      basic: null,
      fire: { uid: lanceUid, spec: { shape: 'line', origin: 30, dir: [1, 0] } },
      ability: {
        defId: 'kiln',
        spec: { shape: 'kiln', uid: salvoUid, inner: { shape: 'cells', cells: [24, 25, 26] } },
      },
    };
    const res = run(ms, a, idle(ms, 1));
    // Lance at 1 charge fires one cell; Salvo at 0+3 fires three.
    expect(res.events.filter((e) => e.t === 'shot' && e.by === 0)).toHaveLength(4);
    // Two cards gone from three, which trips the draw rule immediately.
    expect(res.state.players[0].graveyard).toHaveLength(2);
    expect(res.events.filter((e) => e.t === 'draw' && e.to === 0)).toHaveLength(1);
    expect(res.state.players[0].hand).toHaveLength(2);
  });

  it('stops a card being fired next round when Pin lands', () => {
    let ms = battle({
      ships: [
        ['warhead', 'beacon', 'pin'],
        ['forge', 'kiln', 'ember'],
      ],
      hands: [
        ['salvo', 'lance', 'rake'],
        ['salvo', 'lance', 'rake'],
      ],
    });
    const a: Plan = {
      ...idle(ms, 0),
      basic: null,
      ability: { defId: 'pin', spec: { shape: 'cell', cell: 0 } },
    };
    const res = run(ms, a, idle(ms, 1));
    expect(res.state.players[1].restrictions.noFire).toBe(true);
  });

  it('wipes every enemy charge when Spite dies', () => {
    let ms = battle({
      ships: [
        ['warhead', 'beacon', 'ember'],
        ['forge', 'kiln', 'spite'],
      ],
      place: [
        rows(['warhead', 'beacon', 'ember'], 0),
        [
          { defId: 'forge', cells: [0, 1, 2, 3] },
          { defId: 'kiln', cells: [6, 7, 8] },
          { defId: 'spite', cells: [12, 13] },
        ],
      ],
      hands: [
        ['salvo', 'lance', 'rake'],
        ['salvo', 'lance', 'rake'],
      ],
    });
    charge(ms, 0, 'salvo', 1);
    charge(ms, 0, 'rake', 4);
    const salvoUid = card(ms, 0, 'salvo').uid;
    const a: Plan = {
      ...idle(ms, 0),
      chargeTo: salvoUid,
      basic: 12,
      fire: { uid: salvoUid, spec: { shape: 'cells', cells: [13] } },
    };
    const res = run(ms, a, idle(ms, 1));
    expect(res.state.players[0].hand.every((c) => c.charges === 0)).toBe(true);
  });

  it('fires Thorn back along the salvo that killed it', () => {
    let ms = battle({
      ships: [
        ['warhead', 'beacon', 'ember'],
        ['forge', 'kiln', 'thorn'],
      ],
      place: [
        rows(['warhead', 'beacon', 'ember'], 0),
        [
          { defId: 'forge', cells: [0, 1, 2, 3] },
          { defId: 'kiln', cells: [6, 7, 8] },
          { defId: 'thorn', cells: [12, 13] },
        ],
      ],
      hands: [
        ['salvo', 'lance', 'rake'],
        ['salvo', 'lance', 'rake'],
      ],
    });
    charge(ms, 0, 'salvo', 1);
    const salvoUid = card(ms, 0, 'salvo').uid;
    const a: Plan = {
      ...idle(ms, 0),
      chargeTo: salvoUid,
      basic: 12,
      fire: { uid: salvoUid, spec: { shape: 'cells', cells: [13] } },
    };
    const res = run(ms, a, idle(ms, 1));
    const back = res.events.filter((e) => e.t === 'shot' && e.by === 1 && e.source === 'thorn');
    expect(back.length).toBeGreaterThan(0);
  });
});

describe('intel', () => {
  it('reports whether anything sits beside a Ping miss', () => {
    let ms = battle({
      hands: [
        ['ping', 'lance', 'rake'],
        ['salvo', 'lance', 'rake'],
      ],
    });
    charge(ms, 0, 'ping', 1);
    const uid = card(ms, 0, 'ping').uid;
    const a: Plan = {
      ...idle(ms, 0),
      chargeTo: uid,
      basic: null,
      fire: { uid, spec: { shape: 'cells', cells: [6, 30] } },
    };
    const res = run(ms, a, idle(ms, 1));
    const intel = res.events.filter((e) => e.t === 'intel');
    expect(intel.length).toBeGreaterThan(0);
  });

  it('withholds Sounding’s column count below two charges', () => {
    let ms = battle({
      hands: [
        ['sounding', 'lance', 'rake'],
        ['salvo', 'lance', 'rake'],
      ],
    });
    const uid = card(ms, 0, 'sounding').uid;
    const a: Plan = {
      ...idle(ms, 0),
      chargeTo: uid,
      basic: null,
      fire: { uid, spec: { shape: 'cell', cell: 20 } },
    };
    const res = run(ms, a, idle(ms, 1));
    expect(res.events.filter((e) => e.t === 'intel')).toHaveLength(0);
  });

  it('gives row and column at three charges', () => {
    let ms = battle({
      hands: [
        ['sounding', 'lance', 'rake'],
        ['salvo', 'lance', 'rake'],
      ],
    });
    charge(ms, 0, 'sounding', 2);
    const uid = card(ms, 0, 'sounding').uid;
    const a: Plan = {
      ...idle(ms, 0),
      chargeTo: uid,
      basic: null,
      fire: { uid, spec: { shape: 'cell', cell: 20 } },
    };
    const res = run(ms, a, idle(ms, 1));
    expect(res.events.filter((e) => e.t === 'intel')).toHaveLength(2);
  });
});

describe('endings', () => {
  it('forfeits after three missed timers', () => {
    let ms = battle({
      hands: [
        ['salvo', 'lance', 'rake'],
        ['salvo', 'lance', 'rake'],
      ],
    });
    for (let i = 0; i < 3; i++) {
      const timed: Plan = { ...idle(ms, 1), timedOut: true };
      ms = run(ms, idle(ms, 0), timed).state;
    }
    expect(ms.outcome).toEqual({ kind: 'win', winner: 0, reason: 'timeout-strikes' });
  });

  it('decides a round-20 match on remaining hull cells', () => {
    let ms = battle({
      hands: [
        ['salvo', 'lance', 'rake'],
        ['salvo', 'lance', 'rake'],
      ],
    });
    ms.players[1].ships[0].hits[0] = true;
    ms.round = 20;
    ms = run(ms, { ...idle(ms, 0), basic: null }, { ...idle(ms, 1), basic: null }).state;
    expect(ms.outcome).toEqual({ kind: 'win', winner: 0, reason: 'cells' });
  });

  it('draws a round-20 match with level fleets', () => {
    let ms = battle({
      hands: [
        ['salvo', 'lance', 'rake'],
        ['salvo', 'lance', 'rake'],
      ],
    });
    ms.round = 20;
    ms = run(ms, { ...idle(ms, 0), basic: null }, { ...idle(ms, 1), basic: null }).state;
    expect(ms.outcome).toEqual({ kind: 'draw', reason: 'cells' });
  });
});

describe('determinism and verification', () => {
  it('produces the same match twice from the same seed and inputs', () => {
    const play = () => {
      let ms = battle({
        seed: 'determinism',
        hands: [
          ['salvo', 'lance', 'rake'],
          ['salvo', 'lance', 'rake'],
        ],
      });
      for (let i = 0; i < 6 && ms.phase === 'battle'; i++) {
        const a: Plan = { ...idle(ms, 0), basic: (i * 7) % 36 };
        const b: Plan = { ...idle(ms, 1), basic: (i * 5 + 3) % 36 };
        ms = run(ms, a, b).state;
      }
      return ms;
    };
    expect(stableStringify(play())).toBe(stableStringify(play()));
  });

  it('replays a finished match and confirms the reported result', () => {
    let ms = createMatch({ seed: 'verify-me', players: ['A', 'B'] });
    for (let pack = 0; pack < 3; pack++) {
      ms = pickShip(ms, 0, currentPack(ms.shipDraft)[0]);
      ms = pickShip(ms, 1, currentPack(ms.shipDraft)[1]);
    }
    for (let pack = 0; pack < 3; pack++) {
      ms = pickCard(ms, 0, currentPack(ms.cardDraft)[0]);
      ms = pickCard(ms, 1, currentPack(ms.cardDraft)[1]);
    }
    const p0 = rows(ms.players[0].draftedShips, 0);
    const p1 = rows(ms.players[1].draftedShips, 3);
    ms = deploy(ms, 0, p0, 'nonce-a');
    ms = deploy(ms, 1, p1, 'nonce-b');
    for (let i = 0; i < 5 && ms.phase === 'battle'; i++) {
      ms = run(ms, { ...idle(ms, 0), basic: i }, { ...idle(ms, 1), basic: 35 - i }).state;
    }
    const t = transcriptOf(ms, 'match-1', ['keyA', 'keyB']);
    const result = verify(t);
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.roundsReplayed).toBe(5);
  });

  it('catches a server that lies about the result', () => {
    let ms = battle({
      seed: 'liar',
      hands: [
        ['salvo', 'lance', 'rake'],
        ['salvo', 'lance', 'rake'],
      ],
    });
    ms = run(ms, idle(ms, 0), idle(ms, 1)).state;
    const t = transcriptOf(ms, 'match-2', ['keyA', 'keyB']);
    t.reportedOutcome = { kind: 'win', winner: 0, reason: 'fleet' };
    const result = verify(t);
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toMatch(/does not match the replay/);
  });

  it('checks round signatures against the published session keys', async () => {
    const { issueSessionKey, signPlan } = await import('../chain/sessionKey');
    const keyA = issueSessionKey(0);
    const keyB = issueSessionKey(1);

    let ms = battle({
      seed: 'signed',
      hands: [
        ['salvo', 'lance', 'rake'],
        ['salvo', 'lance', 'rake'],
      ],
    });
    for (let i = 0; i < 3 && ms.phase === 'battle'; i++) {
      const a: Plan = { ...idle(ms, 0), basic: i };
      const b: Plan = { ...idle(ms, 1), basic: 35 - i };
      ms = playRound(ms, {
        plans: [
          commitPlan(a, `a${i}`, signPlan(keyA, a, `a${i}`)),
          commitPlan(b, `b${i}`, signPlan(keyB, b, `b${i}`)),
        ],
      }).state;
    }

    const t = transcriptOf(ms, 'signed-match', [keyA.publicKeyHex, keyB.publicKeyHex]);
    const good = verify(t);
    expect(good.problems).toEqual([]);
    expect(good.warnings).toEqual([]);

    // A plan signed by somebody else's key is not that player's plan.
    const impostor = issueSessionKey(2);
    t.rounds[1][0] = {
      ...t.rounds[1][0],
      signature: signPlan(impostor, t.rounds[1][0].plan, t.rounds[1][0].nonce),
    };
    const bad = verify(t);
    expect(bad.ok).toBe(false);
    expect(bad.problems.join(' ')).toMatch(/signature does not match/);
  });

  it('says so when a transcript publishes no session keys', () => {
    let ms = battle({
      seed: 'unsigned',
      hands: [
        ['salvo', 'lance', 'rake'],
        ['salvo', 'lance', 'rake'],
      ],
    });
    ms = run(ms, idle(ms, 0), idle(ms, 1)).state;
    const result = verify(transcriptOf(ms, 'm', ['keyA', 'keyB']));
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings.join(' ')).toMatch(/signatures unchecked/);
    // Unchecked is not the same as failed: the replay itself still stands.
    expect(result.ok).toBe(true);
  });

  it('catches a tampered deployment commitment', () => {
    let ms = battle({
      seed: 'tamper',
      hands: [
        ['salvo', 'lance', 'rake'],
        ['salvo', 'lance', 'rake'],
      ],
    });
    ms = run(ms, idle(ms, 0), idle(ms, 1)).state;
    const t = transcriptOf(ms, 'match-3', ['keyA', 'keyB']);
    t.deployments[0].placements[0].cells = [30, 31, 32, 33];
    const result = verify(t);
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toMatch(/on-chain commitment/);
  });
});
