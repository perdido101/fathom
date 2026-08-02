import { describe, it, expect } from 'vitest';
import { ART, ART_IDS, expectedArtIds, art } from './registry';
import { PALETTE } from './tokens';

describe('art registry', () => {
  it('resolves every expected asset id with no gaps', () => {
    const expected = expectedArtIds();
    for (const id of expected) {
      expect(art(id), `missing art for ${id}`).not.toBeNull();
    }
    expect(ART_IDS).toEqual(expected);
  });

  it('has no entries the game never asks for', () => {
    expect(new Set(ART_IDS)).toEqual(new Set(expectedArtIds()));
  });

  it('every registry entry is a component, so nothing renders as a box', () => {
    for (const [id, Component] of Object.entries(ART)) {
      expect(typeof Component, `${id} is not a component`).toBe('function');
    }
  });

  it('palette covers the whole encoding map', () => {
    for (const key of ['void', 'hull', 'deck', 'panel', 'line', 'green', 'amber', 'red', 'cyan', 'magenta', 'violet', 'bone', 'boneDim', 'boneFaint'] as const) {
      expect(PALETTE[key]).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});
