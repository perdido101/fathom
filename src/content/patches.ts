import type { TerrainId } from '../engine/types';

/**
 * Dealt map patches: every board is assembled from 4×4 terrain tiles, so the
 * digital and physical games share one map language. 20 authored designs.
 *
 * Legend: . open · R reef · F fog · T trench · S shallows
 */
const RAW: Record<string, string[]> = {
  open_water: ['....', '....', '....', '....'],
  calm_pass: ['....', '....', '..S.', '....'],
  reef_spur: ['....', '.RR.', '..R.', '....'],
  reef_wall: ['..R.', '..R.', '..R.', '....'],
  reef_corner: ['RR..', 'R...', '....', '....'],
  fog_bank: ['....', '.FF.', '.FF.', '....'],
  fog_drift: ['F...', 'FF..', '....', '...F'],
  fog_lane: ['....', 'FFFF', '....', '....'],
  trench_line: ['....', 'TTT.', '....', '....'],
  trench_pit: ['....', '.TT.', '.TT.', '....'],
  trench_edge: ['T...', 'T...', 'TT..', '....'],
  shallow_bar: ['....', '....', 'SSS.', '....'],
  shallow_fan: ['..S.', '.SS.', '..S.', '....'],
  shallow_shore: ['S..S', 'S...', '....', '....'],
  mixed_strait: ['R...', '....', '...F', '...F'],
  mixed_ledge: ['....', 'TT..', '....', '..SS'],
  mixed_haven: ['.F..', '....', '..R.', '....'],
  mixed_deeps: ['T...', '....', '....', '...S'],
  broken_reef: ['....', 'R.R.', '....', '....'],
  quiet_deep: ['....', '..T.', '....', 'F...'],
};

const CHAR_TO_TERRAIN: Record<string, TerrainId> = {
  '.': 'OPEN',
  R: 'REEF',
  F: 'FOG',
  T: 'TRENCH',
  S: 'SHALLOWS',
};

export interface PatchDef {
  id: string;
  /** Row-major 16 cells of terrain. */
  cells: TerrainId[];
}

export const PATCH_SIZE = 4;

export const PATCHES: PatchDef[] = Object.entries(RAW).map(([id, rows]) => ({
  id,
  cells: rows.flatMap((row) => row.split('').map((ch) => CHAR_TO_TERRAIN[ch])),
}));

/** Rotate a patch 90° clockwise `turns` times. */
export function rotatePatch(cells: TerrainId[], turns: number): TerrainId[] {
  let out = cells.slice();
  for (let t = 0; t < ((turns % 4) + 4) % 4; t++) {
    const next = new Array<TerrainId>(16);
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        next[c * 4 + (3 - r)] = out[r * 4 + c];
      }
    }
    out = next;
  }
  return out;
}
