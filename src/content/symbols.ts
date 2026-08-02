/**
 * The eight sea symbols. Ported from FATHOM_RULEBOOK v2.0 §05.
 *
 * Terrain is public and identical on both boards. Only the symbol changes
 * what a cell does; everything else about a cell is the same.
 */
export type SymbolId =
  | 'OPEN'
  | 'REEF'
  | 'TRENCH'
  | 'SHALLOWS'
  | 'STORM'
  | 'FOG'
  | 'WRECKAGE'
  | 'UPWELLING';

export interface SymbolDef {
  id: SymbolId;
  name: string;
  effect: string;
  /** May a hull be deployed on this cell? */
  deploy: boolean;
}

export const SYMBOLS: Record<SymbolId, SymbolDef> = {
  OPEN: {
    id: 'OPEN',
    name: 'Open Water',
    effect: 'Nothing. Most of the board.',
    deploy: true,
  },
  REEF: {
    id: 'REEF',
    name: 'Reef',
    effect: 'Line effects (Torpedo, Dredge) stop here.',
    deploy: false,
  },
  TRENCH: {
    id: 'TRENCH',
    name: 'Trench',
    effect:
      'Cells here take two hits. First hit: red disc with a cube on it. Second: remove the cube.',
    deploy: true,
  },
  SHALLOWS: {
    id: 'SHALLOWS',
    name: 'Shallows',
    effect:
      'A hit here also reveals whether the four orthogonal neighbours are occupied.',
    deploy: true,
  },
  STORM: {
    id: 'STORM',
    name: 'Storm Front',
    effect: 'Detection effects return nothing about these cells.',
    deploy: true,
  },
  FOG: {
    id: 'FOG',
    name: 'Fog Bank',
    effect: 'Hits here never name the hull; a hull sinking here sinks silently.',
    deploy: true,
  },
  WRECKAGE: {
    id: 'WRECKAGE',
    name: 'Wreckage',
    effect: 'Always answers "hit" when empty. Hulls may hide here.',
    deploy: true,
  },
  UPWELLING: {
    id: 'UPWELLING',
    name: 'Upwelling',
    effect: 'When your hull is hit here, you take 2 cubes.',
    deploy: true,
  },
};

export const SYMBOL_IDS = Object.keys(SYMBOLS) as SymbolId[];

/** Only reef blocks deployment (rulebook §05, confirmed four times over). */
export function canDeployOn(s: SymbolId): boolean {
  return SYMBOLS[s].deploy;
}
