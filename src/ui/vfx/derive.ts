import type { CellIndex, ResolveEvent } from '../../engine/types';
import type { ClientView } from '../../engine/view';
import { SHIPS } from '../../engine/ships';
import { beatOffsets, stepMs } from '../feedback/timing';
import { cardAnchor, cellAnchor } from '../feedback/store';
import { useVfx, type Vfx } from './store';

/**
 * One round's worth of visual effects, derived from exactly the same two
 * inputs the feedback layer uses: the event stream, and the difference
 * between the view before the round and the view after it.
 *
 * That is not a coincidence or a convenience. The event stream carries no
 * plan payload — Build 5's leak test enforces it — so anything this module
 * could not derive is something the player is not entitled to see. A charge
 * crossing between two cards is visible in the diff; which card ordered it is
 * not, and the effect does not show it.
 *
 * Timing comes from `feedback/timing.ts`, the same clock the resolve overlay
 * and the floaters run on. An impact that lands 200ms after the overlay says
 * "hit" is worse than no impact at all.
 */

/** Milliseconds between two effects spawned by the same beat. */
const STAGGER = 55;

/** How long a shot is in the air before it arrives. */
const TRACER_MS = 260;

/** Motes thrown off one hit. Four is enough to read as debris; eight is soup. */
const DEBRIS = 4;
/** Rings a splash settles into. */
const RIPPLES = 3;

export const VFX_LIFE: Record<string, number> = {
  tracer: TRACER_MS,
  impact: 520,
  shock: 620,
  debris: 640,
  splash: 560,
  ripple: 900,
  blocked: 520,
  douse: 460,
  slick: 1600,
  carry: 460,
  gempop: 420,
  flip: 560,
  react: 320,
  foretold: 1000,
};

type Spawn = Omit<Vfx, 'id'>;

export interface RoundVfx {
  fx: Spawn[];
  /** Screen shakes: weight 0–1 and when. */
  quakes: { weight: number; delay: number }[];
}

export function roundVfx(
  prev: ClientView | null,
  next: ClientView,
  events: ResolveEvent[],
  fast: boolean,
  /** The cells this client declared, for the shot that never got to happen. */
  myAim: CellIndex[] = [],
): RoundVfx {
  const you = next.you;
  const out: RoundVfx = { fx: [], quakes: [] };
  const at = beatOffsets(
    events.map((e) => e.t),
    fast,
  );
  const total = at.length ? at[at.length - 1] + stepMs(events[events.length - 1].t, fast) : 0;

  const push = (kind: Vfx['kind'], anchor: string, delay: number, extra: Partial<Spawn> = {}): void => {
    out.fx.push({ kind, anchor, delay: Math.max(0, delay), life: VFX_LIFE[kind] ?? 400, weight: 1, ...extra });
  };

  // --- shots: leave a board, arrive at a cell -----------------------------
  //
  // The tracer is scheduled *before* its beat so the shot arrives on the beat
  // rather than setting off on it. A projectile that launches when the
  // overlay says "hit" lands 260ms after the word, which reads as a delay
  // rather than as a cause.
  const myHitCells: CellIndex[] = [];
  let hitsThisRound = 0;
  events.forEach((e, i) => {
    if (e.t !== 'shot') return;
    const mine = e.by === you;
    const target = cellAnchor(mine ? 'foe' : 'mine', e.cell);
    if (mine && e.hit) myHitCells.push(e.cell);

    push('tracer', target, at[i] - TRACER_MS, { from: `board:${mine ? 'mine' : 'foe'}` });

    if (e.hit) {
      hitsThisRound++;
      push('impact', target, at[i]);
      push('shock', target, at[i]);
      for (let d = 0; d < DEBRIS; d++) push('debris', target, at[i] + d * 12, { index: d });
    } else {
      push('splash', target, at[i]);
      for (let r = 0; r < RIPPLES; r++) push('ripple', target, at[i] + r * 90, { index: r });
    }
  });

  /*
   * One shake per round, not one per cell.
   *
   * Nine cells landing 190ms apart would otherwise queue nine jolts and the
   * screen would still be moving when the next beat arrived. The weight is
   * the round's total, so a Burst that finds nine cells is a real jolt and a
   * single deck-gun hit is a nudge — and it fires on the first hit, which is
   * the moment the player is looking.
   */
  if (hitsThisRound > 0) {
    const first = events.findIndex((e) => e.t === 'shot' && e.hit);
    out.quakes.push({ weight: Math.min(1, 0.25 + hitsThisRound * 0.11), delay: at[first] ?? 0 });
  }

  // --- sinks: the cells go dark in sequence, then leave a slick ----------
  //
  // My own ship's cells are mine to show. Theirs are not — a sink announces a
  // length and never a position — so the effect rides the cells I actually
  // hit this round, which is the most the rules allow to be drawn on their
  // water. The same rule the SUNK floater follows.
  const sunkNow = next.me.ships.filter((s, i) => s.sunk && !(prev?.me.ships[i]?.sunk ?? false));
  let sunkMineIdx = 0;
  events.forEach((e, i) => {
    if (e.t !== 'sink') return;
    const mine = e.owner === you;
    const cells = mine
      ? (sunkNow[sunkMineIdx++]?.cells ?? [])
      : myHitCells.slice(-Math.min(myHitCells.length, e.length));
    cells.forEach((c, k) => {
      const anchor = cellAnchor(mine ? 'mine' : 'foe', c);
      push('douse', anchor, at[i] + k * 110);
      push('slick', anchor, at[i] + k * 110 + 200);
    });
    // A longer ship going down is a bigger event, and the shake says so.
    out.quakes.push({ weight: Math.min(1, 0.4 + e.length * 0.12), delay: at[i] + 60 });
  });

  // --- a shot that arrived and was eaten ---------------------------------
  events.forEach((e, i) => {
    if (e.t !== 'prediction' || !e.triggered) return;
    const mine = e.by === you;
    // The read landing is the rarest and best moment in the game.
    push('foretold', mine ? 'board:foe' : 'board:mine', at[i], { weight: 1 });
    out.quakes.push({ weight: 0.75, delay: at[i] });
    if (e.card === 'mirror' && !mine) {
      myAim.forEach((c, k) => push('blocked', cellAnchor('foe', c), at[i] + k * STAGGER));
    }
  });

  // --- charges: gems taking weight, and charges physically crossing ------
  //
  // The diff shows a card gaining and a card losing in the same beat. Where
  // exactly one of each exists, the charges are drawn crossing between them;
  // where several moved at once, each card pops on its own, because guessing
  // which loss paid for which gain would be inventing information.
  if (prev) {
    const chargeBeat = (() => {
      const i = events.findIndex((e) => e.t === 'charges');
      return i < 0 ? total : at[i];
    })();
    const moves: { anchor: string; d: number; now: number; side: 'me' | 'foe' }[] = [];
    const diff = (
      before: { uid: number; charges: number }[],
      after: { uid: number; charges: number }[],
      side: 'me' | 'foe',
    ): void => {
      for (const card of after) {
        const was = before.find((c) => c.uid === card.uid);
        if (!was) continue; // a card that was not in hand before is a draw
        const d = card.charges - was.charges;
        if (d !== 0) moves.push({ anchor: cardAnchor(side, card.uid), d, now: card.charges, side });
      }
    };
    diff(prev.me.hand, next.me.hand, 'me');
    diff(prev.foe.hand, next.foe.hand, 'foe');

    /*
     * A theft is a movement *across the division*, and the pairing has to say
     * so — which the first version of this did not.
     *
     * It looked for exactly one gain and exactly one loss anywhere. That can
     * essentially never happen: every round places a mandatory charge, which
     * is always a gain, so a Siphon taking from their card and giving to mine
     * produces two gains and the condition never held. Three clip runs went
     * looking for a charge-theft effect that could not fire, which is what
     * finally exposed it. The camera was right and the code was wrong.
     *
     * The rule now: exactly one card lost, exactly one card on the *other*
     * side gained at least what it lost. That is what a theft looks like from
     * the diff, and it is the most that can be claimed without inventing the
     * link — where several cards moved on either side, each pops on its own,
     * because guessing which loss paid for which gain would be making
     * information up.
     */
    const losses = moves.filter((m) => m.d < 0);
    const thief =
      losses.length === 1
        ? moves.filter((m) => m.d > 0 && m.side !== losses[0].side && m.d >= -losses[0].d)
        : [];

    if (thief.length === 1) {
      const took = -losses[0].d;
      for (let k = 0; k < Math.min(took, 4); k++) {
        push('carry', thief[0].anchor, chargeBeat + k * 70, { from: losses[0].anchor, index: k });
      }
      // Every card that moved still takes its own weight when the dust lands.
      moves.forEach((m, k) =>
        push('gempop', m.anchor, chargeBeat + 260 + k * STAGGER, { weight: gemWeight(m.now) }),
      );
    } else {
      moves.forEach((m, k) =>
        push('gempop', m.anchor, chargeBeat + k * STAGGER, { weight: gemWeight(m.now) }),
      );
    }
  }

  // --- abilities and reactions, on the ship card that did it --------------
  if (prev) {
    // Only the two fields both sides expose: a foe's ship hides its cells and
    // its hits, and this needs neither.
    type Acted = { defId: string | null; abilityUsed: boolean };
    const flip = (side: 'me' | 'foe', ships: Acted[], before: Acted[]): void => {
      ships.forEach((s, i) => {
        if (!s.defId || !s.abilityUsed || (before[i]?.abilityUsed ?? false)) return;
        push('flip', shipAnchor(side, s.defId), 0, { weight: typeWeight(s.defId) });
      });
    };
    flip('me', next.me.ships, prev.me.ships);
    flip('foe', next.foe.ships, prev.foe.ships);
  }
  events.forEach((e, i) => {
    if (e.t !== 'react') return;
    push('react', shipAnchor(e.owner === you ? 'me' : 'foe', e.defId), at[i], {
      weight: typeWeight(e.defId),
    });
  });

  return out;
}

/** A gem visibly heavier at five than at one, flattening off past eight. */
function gemWeight(charges: number): number {
  return Math.min(1, 0.3 + charges * 0.09);
}

/** The type colour an effect burns in, as a 0–1 index the CSS reads. */
function typeWeight(defId: string): number {
  const t = SHIPS[defId]?.type;
  return t === 'ACTIVE' ? 0.2 : t === 'NERF' ? 0.5 : 0.8;
}

export function shipAnchor(side: 'me' | 'foe', defId: string): string {
  return `ship:${side}:${defId}`;
}

/** Push a whole round's effects into the live layer. */
export function playRoundVfx(
  prev: ClientView | null,
  next: ClientView,
  events: ResolveEvent[],
  fast: boolean,
  myAim: CellIndex[] = [],
): void {
  const { fx, quakes } = roundVfx(prev, next, events, fast, myAim);
  const v = useVfx.getState();
  for (const f of fx) v.spawn(f);
  for (const q of quakes) v.quake(q.weight, q.delay);
}
