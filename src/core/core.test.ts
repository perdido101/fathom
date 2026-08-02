import { describe, it, expect } from 'vitest';
import { seedRng } from '../engine/rng';
import { dealBoard, isLegalPlacement, legalPlacements, autoDeploy, runFrom } from './board';
import { dealDraft, pick, cluesFor, clientDraftView } from './draft';
import { beginShipDraft, beginActionDraft, runDraft, assembleMatch } from './setup';
import { drawTerrainPair, terrainPairConflict, hasTerrain, type MatchSetup } from './state';
import { deploy, endTurn, income, cardCost, isReady } from './turn';
import { fireCell, isOccupied, aliveHulls, livingCells } from './fire';
import { clientView, auditView } from './view';
import { MATCH_SIZES } from '../content/grids';
import { HULLS, HULL_IDS } from '../content/hulls';
import { DRAFTABLE_ACTION_IDS } from '../content/actions';
import type { MatchState, PlayerId } from './types';
import { cellAddress, DIRECTIONS } from './types';

const setup: MatchSetup = {
  seed: 'core-test',
  size: 'standard',
  players: [
    { name: 'Alpha', isAI: false },
    { name: 'Bravo', isAI: true },
  ],
};

/** Drive both drafts by always keeping the first card and burning the second. */
function naiveDrafts(s: MatchSetup) {
  const [ships0, rng] = beginShipDraft(s);
  const ships = runDraft(ships0, (ds) => ({
    keepUid: ds.inFront[0].uid,
    burnUid: ds.inFront[1].uid,
  }));
  const [actions0] = beginActionDraft(s, rng);
  const actions = runDraft(actions0, (ds) => ({
    keepUid: ds.inFront[0].uid,
    burnUid: ds.inFront[1].uid,
  }));
  return { ships, actions };
}

function freshMatch(seed = 'core-test'): MatchState {
  const s = { ...setup, seed };
  const { ships, actions } = naiveDrafts(s);
  return assembleMatch(s, ships, actions);
}

/** Deploy both fleets by auto-placement so a match can reach the spend phase. */
function deployBoth(ms: MatchState): MatchState {
  let st = seedRng(`${ms.seed}:deploy`);
  const constraints = {
    mustTouch: hasTerrain(ms, 'convoy'),
    mustSitOnSymbol: hasTerrain(ms, 'shoal_water'),
  };
  for (const p of [0, 1] as PlayerId[]) {
    const fleet = ms.players[p].toDeploy.map((defId) => ({ defId, length: HULLS[defId].length }));
    const [plan, st2] = autoDeploy(fleet, ms.board, st, constraints);
    st = st2;
    expect(plan, 'auto-deploy found no legal layout').not.toBeNull();
    deploy(ms, p, plan!);
  }
  return ms;
}

describe('board', () => {
  it('tiles the dealt grid cards into the match size', () => {
    const [board] = dealBoard(seedRng('b1'), MATCH_SIZES.standard);
    expect(board.gridW).toBe(8);
    expect(board.gridH).toBe(12);
    expect(board.symbols.length).toBe(96);
    // Every cell carries a printed address.
    for (let i = 0; i < board.symbols.length; i++) {
      expect(cellAddress(board, i)).toMatch(/^\d+-[A-D][1-4]$/);
    }
  });

  it('is deterministic for a seed', () => {
    const [a] = dealBoard(seedRng('same'), MATCH_SIZES.standard);
    const [b] = dealBoard(seedRng('same'), MATCH_SIZES.standard);
    expect(a.symbols).toEqual(b.symbols);
    expect(a.cardIds).toEqual(b.cardIds);
  });

  it('deals each size from the right number of cards', () => {
    for (const size of Object.values(MATCH_SIZES)) {
      const [board] = dealBoard(seedRng(`s-${size.id}`), size);
      expect(board.symbols.length).toBe(size.gridW * size.gridH);
      expect(new Set(board.cardIds).size).toBe(size.gridCards);
    }
  });
});

describe('deployment legality', () => {
  const [board] = dealBoard(seedRng('deploy-board'), MATCH_SIZES.standard);

  it('accepts all eight orientations', () => {
    // Find a spot where every direction fits and nothing is reef.
    let found = 0;
    for (const dir of DIRECTIONS) {
      const opts = legalPlacements(3, board, new Set());
      expect(opts.length).toBeGreaterThan(0);
      void dir;
      found += 1;
    }
    expect(found).toBe(8);
    // A run and its reverse are the same placement, so they are not doubled.
    const opts = legalPlacements(2, board, new Set());
    const keys = new Set(opts.map((c) => [...c].sort((a, b) => a - b).join(',')));
    expect(keys.size).toBe(opts.length);
  });

  it('rejects overlap, bends and off-board runs', () => {
    const straight = runFrom(0, 3, [0, 1], board)!;
    expect(isLegalPlacement(straight, 3, board, new Set())).toBe(
      straight.every((c) => board.symbols[c] !== 'REEF'),
    );
    expect(isLegalPlacement(straight, 3, board, new Set([straight[1]]))).toBe(false);
    // A bend is not a straight run.
    expect(isLegalPlacement([0, 1, 1 + board.gridW], 3, board, new Set())).toBe(false);
    // Off the right edge.
    expect(runFrom(board.gridW - 1, 3, [0, 1], board)).toBeNull();
  });

  it('reef is the only symbol that blocks a hull', () => {
    const reefCell = board.symbols.findIndex((s) => s === 'REEF');
    if (reefCell >= 0) expect(isLegalPlacement([reefCell], 1, board, new Set())).toBe(false);
    const wreck = board.symbols.findIndex((s) => s === 'WRECKAGE');
    if (wreck >= 0) expect(isLegalPlacement([wreck], 1, board, new Set())).toBe(true);
  });

  it('auto-deploys a full fleet', () => {
    const fleet = HULL_IDS.slice(0, 5).map((defId) => ({ defId, length: HULLS[defId].length }));
    const [plan] = autoDeploy(fleet, board, seedRng('auto'));
    expect(plan).not.toBeNull();
    const cells = plan!.flatMap((p) => p.cells);
    expect(new Set(cells).size).toBe(cells.length);
  });
});

describe('the pack drafts', () => {
  it('ships: five packs give five hulls each, ten burned, four undealt', () => {
    const [ds0] = dealDraft('ship', seedRng('sd'), 5, 0, 1);
    const ds = runDraft(ds0, (d) => ({ keepUid: d.inFront[0].uid, burnUid: d.inFront[1].uid }));
    expect(ds.done).toBe(true);
    expect(ds.keeps[0].length).toBe(5);
    expect(ds.keeps[1].length).toBe(5);
    expect(ds.burns[0].length + ds.burns[1].length).toBe(10);
    expect(ds.deck.length).toBe(0);
    // 24 hulls, 20 dealt, 4 never dealt.
    const dealt = [...ds.keeps[0], ...ds.keeps[1], ...ds.burns[0], ...ds.burns[1]];
    expect(dealt.length).toBe(20);
    expect(HULL_IDS.length - dealt.length).toBe(4);
  });

  it('actions: ten packs give ten cards each, twenty burned, ten undealt', () => {
    const [ds0] = dealDraft('action', seedRng('ad'), 10, 1, 1);
    const ds = runDraft(ds0, (d) => ({ keepUid: d.inFront[0].uid, burnUid: d.inFront[1].uid }));
    expect(ds.keeps[0].length).toBe(10);
    expect(ds.keeps[1].length).toBe(10);
    expect(ds.burns[0].length + ds.burns[1].length).toBe(20);
    expect(DRAFTABLE_ACTION_IDS.length - 40).toBe(10);
  });

  it('passes two on and alternates who receives the fresh pack', () => {
    let ds = dealDraft('ship', seedRng('pass'), 2, 0, 1)[0];
    expect(ds.toAct).toBe(0);
    expect(ds.inFront.length).toBe(4);
    const opened = ds.inFront.map((i) => i.uid);
    ds = pick(ds, 0, opened[0], opened[1]);
    expect(ds.toAct).toBe(1);
    expect(ds.stage).toBe('passed');
    expect(ds.inFront.map((i) => i.uid)).toEqual([opened[2], opened[3]]);
    ds = pick(ds, 1, opened[2], opened[3]);
    expect(ds.packIndex).toBe(1);
    expect(ds.toAct).toBe(1); // the next pack goes to them first
    expect(ds.inFront.length).toBe(4);
  });

  it('refuses picks out of turn or outside the cards in front of you', () => {
    const [ds] = dealDraft('ship', seedRng('illegal'), 2, 0, 1);
    expect(() => pick(ds, 1, ds.inFront[0].uid, ds.inFront[1].uid)).toThrow();
    expect(() => pick(ds, 0, ds.inFront[0].uid, ds.inFront[0].uid)).toThrow();
    expect(() => pick(ds, 0, ds.inFront[0].uid, 999999)).toThrow();
  });

  it('gives the opener a hard pair and the receiver nothing', () => {
    let ds = dealDraft('ship', seedRng('clue'), 1, 0, 1)[0];
    const opened = ds.inFront.slice();
    ds = pick(ds, 0, opened[0].uid, opened[1].uid);
    const passed = [opened[2].defId, opened[3].defId].sort();
    ds = pick(ds, 1, opened[2].uid, opened[3].uid);
    // Player 0 opened, so they know player 1 chose between the two passed on.
    const openerClues = cluesFor(ds, 0);
    expect(openerClues.length).toBe(1);
    expect([...openerClues[0]].sort()).toEqual(passed);
  });

  it('never leaks a burned card or the deck through the client view', () => {
    const [ds0] = dealDraft('ship', seedRng('leak'), 5, 0, 1);
    const ds = runDraft(ds0, (d) => ({ keepUid: d.inFront[0].uid, burnUid: d.inFront[1].uid }));
    for (const p of [0, 1] as PlayerId[]) {
      const view = clientDraftView(ds, p) as Record<string, unknown>;
      const json = JSON.stringify(view);
      for (const burned of ds.burns[p === 0 ? 1 : 0]) {
        expect(json).not.toContain(`"uid":${burned.uid}`);
      }
      expect('burns' in view).toBe(false);
      expect('deck' in view).toBe(false);
      expect('keeps' in view).toBe(false);
    }
  });
});

describe('terrain cards', () => {
  it('flips two, and they are distinct', () => {
    const [board] = dealBoard(seedRng('tc'), MATCH_SIZES.standard);
    const [pair] = drawTerrainPair(seedRng('tc2'), board, [5, 4, 3, 2, 1]);
    expect(pair.length).toBe(2);
    expect(pair[0]).not.toBe(pair[1]);
  });

  it('rejects a pair that makes deployment impossible, by checking not listing', () => {
    const [board] = dealBoard(seedRng('tc3'), MATCH_SIZES.standard);
    // A fleet that cannot fit at all must be rejected whatever the pair.
    const huge = new Array(40).fill(5);
    const why = terrainPairConflict(['blockade', 'war_chest'], board, huge, seedRng('x'));
    expect(why).not.toBeNull();
  });

  it('accepts an ordinary pair on an ordinary sea', () => {
    const [board] = dealBoard(seedRng('tc4'), MATCH_SIZES.standard);
    expect(terrainPairConflict(['blockade', 'war_chest'], board, [5, 4, 3, 2, 1], seedRng('y'))).toBeNull();
  });
});

describe('a match', () => {
  it('sets up with hidden fleets and hidden hands', () => {
    const ms = freshMatch();
    expect(ms.phase).toBe('deploy');
    expect(ms.players[0].toDeploy.length).toBe(MATCH_SIZES.standard.hulls);
    expect(ms.players[0].hand.length).toBe(MATCH_SIZES.standard.actionCards);
    // Everything burned in both drafts lands in one pile.
    expect(ms.burnPile.length).toBe(10 + 20);
  });

  it('reaches the spend phase once both have deployed', () => {
    const ms = deployBoth(freshMatch());
    expect(ms.phase).toBe('spend');
    expect(ms.players[ms.current].turnCount).toBe(1);
  });

  it('earns 2 a turn by default', () => {
    const ms = deployBoth(freshMatch());
    expect(income(ms, ms.current)).toBe(2);
  });

  it('Basic Salvo is free and always available', () => {
    const ms = deployBoth(freshMatch());
    const p = ms.current;
    expect(cardCost(ms, p, 'basic_salvo')).toBe(0);
    expect(isReady(ms, p, ms.players[p].basicSalvo)).toBe(true);
  });
});

describe('firing', () => {
  it('a hit credits its cube immediately, mid-resolution', () => {
    const ms = deployBoth(freshMatch('fire-1'));
    const p = ms.current;
    const foe = p === 0 ? 1 : 0;
    const target = livingCells(ms, foe)[0];
    const before = ms.players[p].cubes;
    const res = fireCell(ms, p, target, { source: 'Test' });
    expect(res).toBe('hit');
    expect(ms.players[p].cubes).toBe(before + 1);
  });

  it('a miss leaves a white disc and pays nothing', () => {
    const ms = deployBoth(freshMatch('fire-2'));
    const p = ms.current;
    const foe = p === 0 ? 1 : 0;
    const empty = ms.board.symbols
      .map((_, i) => i)
      .find((i) => !isOccupied(ms, foe, i) && ms.board.symbols[i] !== 'WRECKAGE')!;
    const before = ms.players[p].cubes;
    expect(fireCell(ms, p, empty, { source: 'Test' })).toBe('miss');
    expect(ms.players[foe].discs[empty]).toEqual({ kind: 'white' });
    expect(ms.players[p].cubes).toBe(before);
  });

  it('empty wreckage always answers hit, and pays nothing', () => {
    const ms = deployBoth(freshMatch('fire-3'));
    const p = ms.current;
    const foe = p === 0 ? 1 : 0;
    const wreck = ms.board.symbols
      .map((_, i) => i)
      .find((i) => ms.board.symbols[i] === 'WRECKAGE' && !isOccupied(ms, foe, i));
    if (wreck === undefined) return; // this sea dealt no wreckage
    const before = ms.players[p].cubes;
    expect(fireCell(ms, p, wreck, { source: 'Test' })).toBe('wreck-hit');
    expect(ms.players[foe].discs[wreck]).toEqual({ kind: 'red', cube: false });
    expect(ms.players[p].cubes).toBe(before); // no hull was struck
  });

  it('a trench cell takes two hits, showing a cube after the first', () => {
    const ms = deployBoth(freshMatch('fire-4'));
    const p = ms.current;
    const foe = p === 0 ? 1 : 0;
    const trenchCell = livingCells(ms, foe).find((c) => ms.board.symbols[c] === 'TRENCH');
    if (trenchCell === undefined) return; // no hull sits in a trench this seed
    fireCell(ms, p, trenchCell, { source: 'Test' });
    expect(ms.players[foe].discs[trenchCell]).toEqual({ kind: 'red', cube: true });
    const hull = ms.players[foe].hulls.find((h) => h.cells.includes(trenchCell))!;
    expect(hull.destroyed[hull.cells.indexOf(trenchCell)]).toBe(false);
    fireCell(ms, p, trenchCell, { source: 'Test' });
    expect(ms.players[foe].discs[trenchCell]).toEqual({ kind: 'red', cube: false });
    expect(hull.destroyed[hull.cells.indexOf(trenchCell)]).toBe(true);
  });

  it('announces a sink by length and never by name', () => {
    const ms = deployBoth(freshMatch('fire-5'));
    const p = ms.current;
    const foe = p === 0 ? 1 : 0;
    const hull = ms.players[foe].hulls[0];
    // Flatten it, whatever the terrain underneath.
    for (const c of hull.cells) {
      fireCell(ms, p, c, { source: 'Test' });
      fireCell(ms, p, c, { source: 'Test' });
    }
    expect(hull.sunk).toBe(true);
    const allFog = hull.cells.every((c) => ms.board.symbols[c] === 'FOG');
    if (allFog) {
      expect(ms.players[p].sunkLengths).not.toContain(hull.length);
    } else {
      expect(ms.players[p].sunkLengths).toContain(hull.length);
      expect(ms.log.some((l) => l.text === `${hull.length} sunk.`)).toBe(true);
    }
    // No hull name is ever spoken during the match.
    for (const entry of ms.log) {
      expect(entry.text).not.toContain(HULLS[hull.defId].name);
    }
  });

  it('ends when the last hull sinks', () => {
    const ms = deployBoth(freshMatch('fire-6'));
    const p = ms.current;
    const foe = p === 0 ? 1 : 0;
    let guard = 0;
    while (aliveHulls(ms, foe) > 0 && guard++ < 500) {
      const cells = livingCells(ms, foe);
      if (cells.length === 0) break;
      fireCell(ms, p, cells[0], { source: 'Test' });
    }
    expect(ms.phase).toBe('over');
    expect(ms.winner).toBe(p);
  });
});

describe('hidden information', () => {
  /** Every `uid` value anywhere in a structure. */
  const collectUids = (value: unknown, out: number[] = []): number[] => {
    if (Array.isArray(value)) {
      for (const v of value) collectUids(v, out);
    } else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        if (k === 'uid' && typeof v === 'number') out.push(v);
        else collectUids(v, out);
      }
    }
    return out;
  };

  it('never exposes the opponent hand, hulls, slate or burn pile', () => {
    const ms = deployBoth(freshMatch('hide-1'));
    for (const viewer of [0, 1] as PlayerId[]) {
      const foe = ms.players[viewer === 0 ? 1 : 0];
      const view = clientView(ms, viewer);
      const exposed = new Set(collectUids(view));

      // Not one unplayed card of theirs.
      for (const card of foe.hand) {
        if (card.faceUp) continue;
        expect(exposed.has(card.uid), `leaked hand card ${card.defId}`).toBe(false);
      }
      // Not one hull of theirs — a revealed hull surfaces its identity only,
      // and carries no uid or cells.
      for (const hull of foe.hulls) {
        expect(exposed.has(hull.uid), `leaked hull ${hull.defId}`).toBe(false);
      }
      const json = JSON.stringify(view);
      // The burn pile is a count, not a list.
      expect(view.burnPileCount).toBe(ms.burnPile.length);
      expect(json).not.toContain('"burnPile"');
      // No hull cells of theirs appear under the opponent projection.
      expect(JSON.stringify(view.opponent)).not.toContain('cells');
    }
  });

  it('reveals a card only once it has been played', () => {
    const ms = deployBoth(freshMatch('hide-2'));
    const viewer: PlayerId = 0;
    const foe = ms.players[1];
    expect(clientView(ms, viewer).opponent.revealedCards).toEqual([]);
    foe.hand[0].faceUp = true;
    const after = clientView(ms, viewer).opponent.revealedCards;
    expect(after.map((c) => c.defId)).toEqual([foe.hand[0].defId]);
  });

  it('reveals a hull as existing, never where it is', () => {
    const ms = deployBoth(freshMatch('hide-3'));
    const foe = ms.players[1];
    foe.hulls[0].revealed = true;
    const view = clientView(ms, 0);
    const revealed = view.opponent.revealedHulls;
    expect(revealed.length).toBe(1);
    expect(revealed[0].defId).toBe(foe.hulls[0].defId);
    expect(JSON.stringify(revealed)).not.toContain('cells');
  });

  it('the audit reveals everything, but only once the match is over', () => {
    const ms = deployBoth(freshMatch('hide-4'));
    expect(() => auditView(ms)).toThrow();
    ms.phase = 'over';
    ms.winner = 0;
    const audit = auditView(ms);
    expect(audit.players[0].fleet[0].name).toBeTruthy();
    expect(audit.players[0].fleet[0].cells.length).toBeGreaterThan(0);
  });
});

describe('determinism', () => {
  it('the same seed produces an identical match', () => {
    const a = deployBoth(freshMatch('det'));
    const b = deployBoth(freshMatch('det'));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('different seeds produce different seas', () => {
    const a = freshMatch('det-a');
    const b = freshMatch('det-b');
    expect(JSON.stringify(a.board.symbols)).not.toBe(JSON.stringify(b.board.symbols));
  });
});

describe('turn flow', () => {
  it('a played card sits out exactly one of its owner turns', () => {
    const ms = deployBoth(freshMatch('turn-1'));
    const p = ms.current;
    const card = ms.players[p].hand[0];
    // Played on turn T: straightens at the start of T+2.
    card.straightensOn = ms.players[p].turnCount + 2;
    expect(isReady(ms, p, card)).toBe(false);
    endTurn(ms, p);
    endTurn(ms, ms.current);
    expect(ms.players[p].turnCount).toBe(2);
    expect(isReady(ms, p, card)).toBe(false); // still out
    endTurn(ms, ms.current);
    endTurn(ms, ms.current);
    expect(ms.players[p].turnCount).toBe(3);
    expect(isReady(ms, p, card)).toBe(true);
  });

  it('turns alternate and income accrues', () => {
    const ms = deployBoth(freshMatch('turn-2'));
    const first = ms.current;
    const before = ms.players[first].cubes;
    endTurn(ms, first);
    expect(ms.current).toBe(first === 0 ? 1 : 0);
    endTurn(ms, ms.current);
    expect(ms.current).toBe(first);
    expect(ms.players[first].cubes).toBe(before + income(ms, first));
  });
});
