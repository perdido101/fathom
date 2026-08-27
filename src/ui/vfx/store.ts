import { create } from 'zustand';

/**
 * The visual effects layer.
 *
 * Deliberately a sibling of the feedback layer rather than part of it. They
 * answer different questions: a floater says *what happened* in words a player
 * reads, an effect shows *that it happened* to something a player is already
 * looking at. Six cells resolving should produce six impacts and, at most, one
 * sentence.
 *
 * Everything here is short-lived, absolutely positioned, and animated with
 * transform and opacity only — no layout properties, so every effect stays on
 * the compositor and a round with twelve simultaneous shots does not drop a
 * frame. Effects are anchored by `[data-anchor]` exactly as floaters are, so
 * the layer knows nothing about any screen's layout and nothing here has to
 * change when one moves.
 *
 * **No canvas, and that is a decision rather than an omission.** The heaviest
 * moment in the game is a four-charge Burst: nine cells, each spawning an
 * impact, a shockwave and four debris motes, plus nine incoming projectiles —
 * about 55 elements alive at once for under a second, each running one
 * compositor-only animation. That is comfortably inside a frame budget, and a
 * canvas would buy nothing while costing a second rendering model, its own
 * resize handling, and a reduced-motion path that has to be written twice.
 */

export type VfxKind =
  /** A shot leaving the shooter's water and arriving at a cell. */
  | 'tracer'
  /** Impact flare at a cell that took a hit. */
  | 'impact'
  /** The ring that expands out of an impact. */
  | 'shock'
  /** A mote of debris flung off a hit. */
  | 'debris'
  /** Water thrown up by a shot that found nothing. */
  | 'splash'
  /** A ring settling on the water after a splash. */
  | 'ripple'
  /** A shot that arrived and was eaten by a Mirror. */
  | 'blocked'
  /** One cell of a sinking ship going dark. */
  | 'douse'
  /** What a sunk ship leaves on the water. */
  | 'slick'
  /** Charges crossing from one card to another. */
  | 'carry'
  /** A gem taking a charge — heavier the more it already holds. */
  | 'gempop'
  /** A ship card turning over as its ability fires. */
  | 'flip'
  /** A dead ship answering. Sharper and faster than a flip. */
  | 'react'
  /** A read landing. The loudest thing in the game. */
  | 'foretold';

export interface Vfx {
  id: number;
  kind: VfxKind;
  /** Where it happens. Resolved to a rectangle at spawn. */
  anchor: string;
  /** Where it comes from, for the two effects that travel. */
  from?: string;
  /** Milliseconds from now. Staggering, never queueing. */
  delay: number;
  /** How long the element lives, in ms. Drives removal, not the animation. */
  life: number;
  /**
   * 0–1. Scales whatever the effect's loudest dimension is: a gem's pop with
   * the count it now holds, an impact's flare with nothing, a screen shake
   * with the number of cells that took a hit.
   */
  weight: number;
  /** Debris motes and ripples fan out; this is which one of n this is. */
  index?: number;
}

interface VfxStore {
  fx: Vfx[];
  /** 0 when still. Scaled by hit count; the app root reads it. */
  shake: number;
  spawn(v: Omit<Vfx, 'id'>): void;
  quake(weight: number, delay: number): void;
  clear(): void;
}

let nextId = 1;

export const useVfx = create<VfxStore>((set, get) => ({
  fx: [],
  shake: 0,

  spawn(v) {
    const id = nextId++;
    const add = (): void => {
      set((s) => ({ fx: [...s.fx, { ...v, id, delay: 0 }] }));
      setTimeout(() => set((s) => ({ fx: s.fx.filter((x) => x.id !== id) })), v.life);
    };
    if (v.delay <= 0) add();
    else setTimeout(add, v.delay);
  },

  /**
   * Screen shake, scaled to how much landed.
   *
   * One cell is a nudge; nine is a real jolt. It decays on its own rather
   * than being cleared by whoever set it, so two hits landing 55ms apart do
   * not cancel each other — the louder one wins and both decay together.
   */
  quake(weight, delay) {
    const fire = (): void => {
      set((s) => ({ shake: Math.max(s.shake, Math.min(1, weight)) }));
      setTimeout(() => set({ shake: 0 }), 320);
    };
    if (delay <= 0) fire();
    else setTimeout(fire, delay);
  },

  clear() {
    if (get().fx.length === 0 && get().shake === 0) return;
    set({ fx: [], shake: 0 });
  },
}));
