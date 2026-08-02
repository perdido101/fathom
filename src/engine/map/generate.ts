import type { TerrainId } from '../types';
import { rcCell } from '../types';
import { PATCHES, PATCH_SIZE, rotatePatch } from '../../content/patches';
import { seedRng, nextInt, type RngState } from '../rng';
import { autoPlaceFleet } from '../fleet/placement';

export const MAP_VALIDATION_ATTEMPTS = 100;

/**
 * Assemble a board from dealt 4×4 patches: 4 → 8×8, 6 → 8×12, 9 → 12×12.
 * Patches and their rotations are drawn by seed; both players receive the
 * identical layout. A board is accepted only when the full fleet can be
 * auto-placed 100 times in a row; otherwise redeal.
 */
export function generateMap(
  seed: string,
  gridW: number,
  gridH: number,
  validationFleet: string[],
): TerrainId[] {
  const cols = gridW / PATCH_SIZE;
  const rows = gridH / PATCH_SIZE;
  if (!Number.isInteger(cols) || !Number.isInteger(rows)) {
    throw new Error(`Grid ${gridW}×${gridH} is not patch-aligned`);
  }
  for (let attempt = 0; attempt < 50; attempt++) {
    const terrain = assemble(`${seed}#deal${attempt}`, gridW, gridH, cols, rows);
    if (validate(terrain, gridW, gridH, validationFleet, `${seed}#val${attempt}`)) {
      return terrain;
    }
  }
  // Effectively unreachable at these densities; fall back to open water.
  return new Array<TerrainId>(gridW * gridH).fill('OPEN');
}

function assemble(
  seed: string,
  gridW: number,
  gridH: number,
  cols: number,
  rows: number,
): TerrainId[] {
  let st: RngState = seedRng(seed);
  const terrain = new Array<TerrainId>(gridW * gridH).fill('OPEN');
  for (let pr = 0; pr < rows; pr++) {
    for (let pc = 0; pc < cols; pc++) {
      let pi: number;
      let turns: number;
      [pi, st] = nextInt(st, PATCHES.length);
      [turns, st] = nextInt(st, 4);
      const cells = rotatePatch(PATCHES[pi].cells, turns);
      for (let r = 0; r < PATCH_SIZE; r++) {
        for (let c = 0; c < PATCH_SIZE; c++) {
          terrain[rcCell(pr * PATCH_SIZE + r, pc * PATCH_SIZE + c, gridW)] =
            cells[r * PATCH_SIZE + c];
        }
      }
    }
  }
  return terrain;
}

function validate(
  terrain: TerrainId[],
  gridW: number,
  gridH: number,
  fleet: string[],
  seed: string,
): boolean {
  let st = seedRng(seed);
  for (let i = 0; i < MAP_VALIDATION_ATTEMPTS; i++) {
    let result;
    [result, st] = autoPlaceFleet(fleet, gridW, gridH, terrain, st);
    if (result === null) return false;
  }
  return true;
}
