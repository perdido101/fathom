import type { FC } from 'react';
import { PlaceholderShip } from './placeholders/Ships';
import { PlaceholderMarker } from './placeholders/Markers';
import { PlaceholderTile } from './placeholders/Tiles';
import { PlaceholderCard } from './placeholders/Cards';
import { PlaceholderAbilityIcon, PlaceholderUi } from './placeholders/Icons';
import { SHIP_IDS } from '../content/ships';
import { CARD_IDS } from '../content/cards';
import { TERRAIN_IDS } from '../content/terrain';

/**
 * THE SINGLE SWAP POINT. Every asset in the game resolves through this map.
 * Replacing a placeholder with final art is a one-line change here, and the
 * replacement takes the same props, so nothing else in the app moves.
 */
export interface ArtProps {
  id: string;
  size?: number;
  state?: 'normal' | 'damaged' | 'sunk' | 'ready' | 'unavailable';
  accent?: string;
}

export type ArtComponent = FC<ArtProps>;

const entries: Record<string, ArtComponent> = {};

// Ships — 10, one per hull.
for (const id of SHIP_IDS) entries[`ship.${id}`] = PlaceholderShip;
// Ship ability icons — 10.
for (const id of SHIP_IDS) entries[`icon.ability.${id}`] = PlaceholderAbilityIcon;
// Cards — every draftable card plus the permanent basic salvo.
for (const id of CARD_IDS) entries[`card.${id}`] = PlaceholderCard;
// Terrain tiles — one per terrain type.
for (const id of TERRAIN_IDS) entries[`tile.${id.toLowerCase()}`] = PlaceholderTile;
// Grid markers — 6.
for (const id of ['hit', 'miss', 'sunk', 'probe', 'mine', 'decoy']) {
  entries[`marker.${id}`] = PlaceholderMarker;
}
// UI marks — 3.
for (const id of ['energy', 'seed_badge', 'bot']) entries[`ui.${id}`] = PlaceholderUi;

export const ART: Record<string, ArtComponent> = entries;

export const ART_IDS = Object.keys(ART).sort();

/** Resolve an asset. Returns null for an unknown id rather than throwing. */
export function art(id: string): ArtComponent | null {
  return ART[id] ?? null;
}

/** Every asset id the game can ask for — used by the manifest test. */
export function expectedArtIds(): string[] {
  return [
    ...SHIP_IDS.map((id) => `ship.${id}`),
    ...SHIP_IDS.map((id) => `icon.ability.${id}`),
    ...CARD_IDS.map((id) => `card.${id}`),
    ...TERRAIN_IDS.map((id) => `tile.${id.toLowerCase()}`),
    ...['hit', 'miss', 'sunk', 'probe', 'mine', 'decoy'].map((id) => `marker.${id}`),
    ...['energy', 'seed_badge', 'bot'].map((id) => `ui.${id}`),
  ].sort();
}
