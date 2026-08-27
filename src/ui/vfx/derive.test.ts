import { describe, expect, it } from 'vitest';
import type { ClientView } from '../../engine/view';
import type { ResolveEvent } from '../../engine/types';
import { roundVfx } from './derive';

/**
 * The charge-theft effect, tested rather than hunted with a camera.
 *
 * This exists because of a bug the clip harness found and three runs failed to
 * explain. The effect that draws charges crossing from one card to another
 * required "exactly one card gained and exactly one card lost" — and every
 * round of ARMADA places a *mandatory* charge, which is always a gain. So a
 * Siphon taking from their card and giving to mine produced two gains, the
 * condition never held, and the effect could not fire in any real match.
 *
 * The camera kept coming back empty and the code was wrong. A unit test is the
 * right place for this: it is deterministic, it runs in milliseconds, and it
 * fails on the commit that breaks it rather than on a clip run half an hour
 * later.
 */

/** The smallest view the effect derivation actually reads. */
function view(
  mine: { uid: number; charges: number }[],
  theirs: { uid: number; charges: number }[],
): ClientView {
  return {
    you: 0,
    round: 3,
    roundCap: 20,
    me: { hand: mine, ships: [], graveyard: [], marks: {}, knownShipCells: [], hullRemaining: 9, restrictions: {} },
    foe: { hand: theirs, ships: [], graveyard: [], marks: {}, hullRemaining: 9, name: 'Mate', connected: true },
    cardDraft: { collisions: [], myPicks: [] },
  } as unknown as ClientView;
}

const CHARGE_BEAT: ResolveEvent[] = [{ t: 'charges' } as ResolveEvent];

const kinds = (v: ReturnType<typeof roundVfx>): string[] => v.fx.map((f) => f.kind);

describe('charges crossing between cards', () => {
  it('draws a theft even though the mandatory charge also lands that round', () => {
    // Their card 9 loses 3; my card 1 gains those 3; my card 2 gains the one
    // mandatory charge every round places. Two gains, one loss — the shape
    // every real Siphon produces, and the shape the first version missed.
    const before = view(
      [
        { uid: 1, charges: 0 },
        { uid: 2, charges: 4 },
      ],
      [{ uid: 9, charges: 5 }],
    );
    const after = view(
      [
        { uid: 1, charges: 3 },
        { uid: 2, charges: 5 },
      ],
      [{ uid: 9, charges: 2 }],
    );

    const out = roundVfx(before, after, CHARGE_BEAT, false);
    const carries = out.fx.filter((f) => f.kind === 'carry');
    expect(carries.length).toBe(3);
    // From their card, to mine — the direction is the whole point.
    expect(carries[0].from).toBe('card:foe:9');
    expect(carries[0].anchor).toBe('card:me:1');
    // Every card that moved still takes its own weight.
    expect(out.fx.filter((f) => f.kind === 'gempop').length).toBe(3);
  });

  it('does not invent a link when several cards lost at once', () => {
    // A Spite wipe: every enemy card loses. Nothing here says which loss paid
    // for which gain, so nothing is drawn crossing.
    const before = view([{ uid: 1, charges: 0 }], [
      { uid: 9, charges: 3 },
      { uid: 8, charges: 2 },
    ]);
    const after = view([{ uid: 1, charges: 1 }], [
      { uid: 9, charges: 0 },
      { uid: 8, charges: 0 },
    ]);
    const out = roundVfx(before, after, CHARGE_BEAT, false);
    expect(kinds(out)).not.toContain('carry');
    expect(out.fx.filter((f) => f.kind === 'gempop').length).toBe(3);
  });

  it('does not draw a theft for a loss and a gain on the same side', () => {
    // Kiln moves a charge between two of my own cards. That is not a theft
    // across the division and must not be drawn as one.
    const before = view([
      { uid: 1, charges: 4 },
      { uid: 2, charges: 0 },
    ], [{ uid: 9, charges: 3 }]);
    const after = view([
      { uid: 1, charges: 2 },
      { uid: 2, charges: 2 },
    ], [{ uid: 9, charges: 3 }]);
    const out = roundVfx(before, after, CHARGE_BEAT, false);
    expect(kinds(out)).not.toContain('carry');
  });

  it('caps the motes at four however many charges moved', () => {
    const before = view([{ uid: 1, charges: 0 }], [{ uid: 9, charges: 9 }]);
    const after = view([{ uid: 1, charges: 9 }], [{ uid: 9, charges: 0 }]);
    const out = roundVfx(before, after, CHARGE_BEAT, false);
    // Nine motes crossing at 70ms apart would outlast the beat they belong to.
    expect(out.fx.filter((f) => f.kind === 'carry').length).toBe(4);
  });
});

describe('the shake', () => {
  it('fires once per round however many cells landed, and scales with them', () => {
    const shots: ResolveEvent[] = Array.from(
      { length: 9 },
      (_, i) => ({ t: 'shot', by: 0, cell: i, hit: true }) as ResolveEvent,
    );
    const v = view([], []);
    const out = roundVfx(v, v, shots, false);
    // One jolt, not nine: nine 190ms apart would still be moving when the
    // next beat arrived.
    expect(out.quakes.length).toBe(1);
    expect(out.quakes[0].weight).toBeGreaterThan(
      roundVfx(v, v, [shots[0]], false).quakes[0].weight,
    );
  });

  it('says nothing at all when every shot missed', () => {
    const misses: ResolveEvent[] = [
      { t: 'shot', by: 0, cell: 1, hit: false } as ResolveEvent,
      { t: 'shot', by: 0, cell: 2, hit: false } as ResolveEvent,
    ];
    const v = view([], []);
    const out = roundVfx(v, v, misses, false);
    expect(out.quakes.length).toBe(0);
    expect(kinds(out)).toContain('splash');
    expect(kinds(out)).not.toContain('impact');
  });
});
