import type { TournamentState } from '../engine/tournament';
import { SAVE_VERSION } from '../engine/tournament';

/**
 * Save slots. Keys are prefixed `fathom.`; a one-time migration rewrites any
 * older prefix so an in-progress run is never lost to a rename. If no old
 * data exists the migration is a no-op.
 */
export const SAVE_PREFIX = 'fathom.';
export const LEGACY_PREFIXES = ['salvodraft.', 'salvo_draft.', 'salvoDraft.'];

export const RUN_KEY = `${SAVE_PREFIX}run`;
export const SETTINGS_KEY = `${SAVE_PREFIX}settings`;

export interface Settings {
  colourblind: boolean;
  showTurnLog: boolean;
}

export const DEFAULT_SETTINGS: Settings = { colourblind: false, showTurnLog: true };

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null; // private mode, blocked storage
  }
}

/**
 * One-time migration from any legacy prefix to `fathom.`. Existing `fathom.`
 * keys always win, so a repeat run cannot clobber newer data.
 */
export function migrateSaves(store: Storage | null = storage()): number {
  if (!store) return 0;
  let migrated = 0;
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k) keys.push(k);
  }
  for (const key of keys) {
    const legacy = LEGACY_PREFIXES.find((p) => key.startsWith(p));
    if (!legacy) continue;
    const suffix = key.slice(legacy.length);
    const target = SAVE_PREFIX + suffix;
    const value = store.getItem(key);
    if (value !== null && store.getItem(target) === null) {
      store.setItem(target, value);
      migrated += 1;
    }
    store.removeItem(key);
  }
  return migrated;
}

export function saveRun(ts: TournamentState): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(RUN_KEY, JSON.stringify(ts));
  } catch {
    // Storage full or blocked — the run simply won't persist.
  }
}

export function loadRun(): TournamentState | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(RUN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TournamentState;
    // A save from an incompatible engine is discarded rather than crashing.
    if (parsed.saveVersion !== SAVE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearRun(): void {
  storage()?.removeItem(RUN_KEY);
}

export function loadSettings(): Settings {
  const store = storage();
  if (!store) return { ...DEFAULT_SETTINGS };
  try {
    const raw = store.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    storage()?.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
