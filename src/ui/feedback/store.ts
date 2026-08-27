import { create } from 'zustand';
import type { Explainer } from './content';
import { EXPLAINER_BY_KEY } from './content';
import type { FloaterKind } from './content';

/**
 * The three tiers, held in one small store so the budget rule can be enforced
 * in one place rather than negotiated between components.
 *
 * The budget: at most one Tier 2 line and one Tier 3 card on screen at once.
 * Tier 1 has no budget — floaters are wordless, they overlap harmlessly, and
 * six cells resolving should read as six things happening.
 */

/**
 * Where a floater rises from. Resolved to a screen rectangle at spawn time by
 * looking up `[data-anchor]`, so the layer never has to know the layout.
 */
export type Anchor = string;

export function cellAnchor(board: 'foe' | 'mine', cell: number): Anchor {
  return `cell:${board}:${cell}`;
}

export function cardAnchor(side: 'me' | 'foe', uid: number): Anchor {
  return `card:${side}:${uid}`;
}

export interface Floater {
  id: number;
  anchor: Anchor;
  text: string;
  kind: FloaterKind;
  /** Milliseconds from now. Staggering, never queueing. */
  delay: number;
}

export interface NamedEvent {
  id: number;
  text: string;
}

export const FLOATER_MS = 600;
const NAMED_MS = 2200;
/** Two deep is the hard ceiling; the third would be a wall of text. */
const NAMED_MAX = 2;

interface FeedbackStore {
  floaters: Floater[];
  named: NamedEvent[];
  /** The one first-time card on screen, if any. */
  explainer: Explainer | null;
  /** Mechanic keys this player has already had explained. */
  seen: Record<string, true>;

  float(anchor: Anchor, text: string, kind: FloaterKind, delay?: number): void;
  name(text: string, delay?: number): void;
  /** Show the first-time card for `key`, unless it has been seen or one is up. */
  explain(key: string, delay?: number): void;
  dismissExplainer(): void;
  /** Has this player already been shown `key`? Also covers the one-off
   *  coaches that are not explainer cards, like the draft's first-run line. */
  seenOnce(key: string): boolean;
  markSeen(key: string): void;
  /** Settings: make every mechanic first-time again. */
  resetSeen(): void;
  /** Screen changes drop anything still in flight. */
  clear(): void;
}

const SEEN_KEY = 'shadow-armada:seen-mechanics';

function loadSeen(): Record<string, true> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, true>;
  } catch {
    // A private window refuses storage. The cost is that explainers come back
    // next session, which is a far smaller failure than a crash on load.
    return {};
  }
}

function saveSeen(seen: Record<string, true>): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    // As above.
  }
}

let nextId = 1;
/** Keys whose card is scheduled but not yet on screen, so a round that raises
 *  the same mechanic twice does not queue it twice. */
const pending = new Set<string>();

export const useFeedback = create<FeedbackStore>((set, get) => ({
  floaters: [],
  named: [],
  explainer: null,
  seen: loadSeen(),

  float(anchor, text, kind, delay = 0) {
    const id = nextId++;
    set({ floaters: [...get().floaters, { id, anchor, text, kind, delay }] });
    setTimeout(
      () => set({ floaters: get().floaters.filter((f) => f.id !== id) }),
      delay + FLOATER_MS + 120,
    );
  },

  name(text, delay = 0) {
    const emit = (): void => {
      const id = nextId++;
      // Oldest out first: the newest line is the one the player is looking for.
      const named = [...get().named, { id, text }].slice(-NAMED_MAX);
      set({ named });
      setTimeout(() => set({ named: get().named.filter((n) => n.id !== id) }), NAMED_MS);
    };
    if (delay <= 0) emit();
    else setTimeout(emit, delay);
  },

  explain(key, delay = 0) {
    const entry = EXPLAINER_BY_KEY[key];
    if (!entry) return;
    if (get().seen[key] || pending.has(key)) return;
    pending.add(key);
    setTimeout(() => {
      pending.delete(key);
      if (get().seen[key]) return;
      // The budget. A card still on screen from an earlier round wins, and
      // this mechanic stays unmarked — it is still first-time, so it gets its
      // explanation the next time it happens rather than losing it silently.
      // The resolve overlay carried it this round either way.
      if (get().explainer) return;
      const seen = { ...get().seen, [key]: true as const };
      set({ seen, explainer: entry });
      saveSeen(seen);
    }, delay);
  },

  dismissExplainer() {
    set({ explainer: null });
  },

  seenOnce(key) {
    return Boolean(get().seen[key]);
  },

  markSeen(key) {
    const seen = { ...get().seen, [key]: true as const };
    set({ seen });
    saveSeen(seen);
  },

  resetSeen() {
    set({ seen: {}, explainer: null });
    saveSeen({});
  },

  clear() {
    set({ floaters: [], named: [], explainer: null });
  },
}));
