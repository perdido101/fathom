import type { TerrainId } from '../engine/types';

export interface TerrainDef {
  id: TerrainId;
  name: string;
  text: string;
  /** May ships be placed on this tile? */
  placeable: boolean;
}

export const TERRAIN: Record<TerrainId, TerrainDef> = {
  OPEN: {
    id: 'OPEN',
    name: 'Open Water',
    text: 'Nothing.',
    placeable: true,
  },
  REEF: {
    id: 'REEF',
    name: 'Reef',
    text: 'Blocks line effects — torpedoes and row barrages stop here. Ships may not be placed on reef.',
    placeable: false,
  },
  FOG: {
    id: 'FOG',
    name: 'Fog',
    text: 'Hits here are reported but never reveal which ship was struck, and sink reports skip fogged cells.',
    placeable: true,
  },
  TRENCH: {
    id: 'TRENCH',
    name: 'Trench',
    text: 'A ship cell here takes two hits to destroy.',
    placeable: true,
  },
  SHALLOWS: {
    id: 'SHALLOWS',
    name: 'Shallows',
    text: 'A hit here also reveals whether the four orthogonal neighbours are occupied.',
    placeable: true,
  },
};

export const TERRAIN_IDS: TerrainId[] = ['OPEN', 'REEF', 'FOG', 'TRENCH', 'SHALLOWS'];
