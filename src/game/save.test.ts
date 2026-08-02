import { describe, it, expect, beforeEach } from 'vitest';
import { migrateSaves, SAVE_PREFIX } from './save';

/** Minimal in-memory Storage stand-in. */
function makeStore(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    _dump: () => Object.fromEntries(map),
  };
}

describe('save migration', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore();
  });

  it('rewrites legacy keys to the fathom. prefix', () => {
    store = makeStore({ 'salvodraft.run': '{"a":1}', 'salvodraft.settings': '{"b":2}' });
    const n = migrateSaves(store);
    expect(n).toBe(2);
    expect(store.getItem(`${SAVE_PREFIX}run`)).toBe('{"a":1}');
    expect(store.getItem(`${SAVE_PREFIX}settings`)).toBe('{"b":2}');
    // The old keys are gone.
    expect(store.getItem('salvodraft.run')).toBeNull();
  });

  it('is a no-op when there is no old data', () => {
    store = makeStore({ 'fathom.run': '{"keep":true}' });
    expect(migrateSaves(store)).toBe(0);
    expect(store.getItem('fathom.run')).toBe('{"keep":true}');
  });

  it('never clobbers newer data with a legacy value', () => {
    store = makeStore({ 'fathom.run': '{"new":true}', 'salvodraft.run': '{"old":true}' });
    migrateSaves(store);
    expect(store.getItem('fathom.run')).toBe('{"new":true}');
    expect(store.getItem('salvodraft.run')).toBeNull();
  });

  it('is safe to run twice', () => {
    store = makeStore({ 'salvo_draft.run': '{"a":1}' });
    migrateSaves(store);
    const after = store._dump();
    migrateSaves(store);
    expect(store._dump()).toEqual(after);
  });

  it('tolerates absent storage', () => {
    expect(migrateSaves(null)).toBe(0);
  });
});
