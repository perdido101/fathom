import type { CellIndex, FireSpec } from '../engine/types';
import { BOARD, cellAt, xy } from '../engine/types';
import { CARDS } from '../engine/cards';
import { SHIPS } from '../engine/ships';
import { block, orthLine, rowRun } from '../engine/board';

/**
 * Building a declaration by tapping.
 *
 * Every card and ability aims differently, and a phone has one finger. This is
 * the little state machine that turns a sequence of taps into a `FireSpec`,
 * plus a one-line prompt telling the player what the next tap does. It is
 * deliberately the only place in the UI that knows how a shape is assembled —
 * the engine knows what a shape *means*, and these two agree through the same
 * geometry helpers rather than through duplicated arithmetic.
 */

export type Aiming =
  | { kind: 'card'; uid: number; defId: string; charges: number }
  | { kind: 'ability'; defId: string };

export interface Draft {
  aiming: Aiming;
  cells: CellIndex[];
  dir: [number, number] | null;
  /** Charge allocations for Jam, Siphon and Leech. */
  from: { uid: number; amount: number }[];
  toUid: number | null;
  /** Beacon's readout, and Kiln's chosen card. */
  row: number | null;
  col: number | null;
  innerUid: number | null;
}

export function newDraft(aiming: Aiming): Draft {
  return {
    aiming,
    cells: [],
    dir: null,
    from: [],
    toUid: null,
    row: null,
    col: null,
    innerUid: null,
  };
}

export function shapeOf(d: Draft, innerDefId?: string): FireSpec['shape'] {
  if (d.aiming.kind === 'card') return CARDS[d.aiming.defId].shape;
  const shape = SHIPS[d.aiming.defId].shape;
  if (shape === 'kiln' && innerDefId) return CARDS[innerDefId].shape;
  return shape;
}

/** How many cells this declaration wants. */
export function wantsCells(d: Draft, innerDefId?: string): number {
  const shape = shapeOf(d, innerDefId);
  if (shape === 'cells') {
    if (d.aiming.kind === 'ability') return 4; // Ember and Beacon both fire four
    return Math.max(1, effectiveCharges(d));
  }
  if (shape === 'beacon') return 4;
  if (shape === 'cell' || shape === 'row' || shape === 'block' || shape === 'line') return 1;
  return 0;
}

export function effectiveCharges(d: Draft): number {
  return d.aiming.kind === 'card' ? d.aiming.charges : 0;
}

/** Cells the current declaration would actually strike, for the preview. */
export function previewCells(d: Draft, charges: number, innerDefId?: string): CellIndex[] {
  const shape = shapeOf(d, innerDefId);
  const defId = innerDefId ?? d.aiming.defId;
  switch (shape) {
    case 'cells':
      return d.cells;
    case 'cell':
      return d.cells.slice(0, 1);
    case 'beacon':
      return d.cells;
    case 'line': {
      if (d.cells.length === 0) return [];
      const length = d.aiming.kind === 'ability' ? 3 : charges;
      return d.dir ? orthLine(d.cells[0], d.dir, length) : [d.cells[0]];
    }
    case 'block': {
      if (d.cells.length === 0) return [];
      const size = defId === 'burst' && charges >= 4 ? 3 : 2;
      return block(clampAnchor(d.cells[0], size), size);
    }
    case 'row': {
      if (d.cells.length === 0) return [];
      return rowRun(d.cells[0], 3 + Math.max(0, charges - 1));
    }
    default:
      return [];
  }
}

/** Keep a block on the board when the player taps near an edge. */
export function clampAnchor(cell: CellIndex, size: number): CellIndex {
  const [x, y] = xy(cell);
  return cellAt(Math.min(x, BOARD - size), Math.min(y, BOARD - size));
}

export function isComplete(d: Draft, innerDefId?: string): boolean {
  // Kiln aims the card it fires, so completeness is that card's question, not
  // Kiln's — but the card has to have been chosen first.
  if (d.aiming.kind === 'ability' && SHIPS[d.aiming.defId].shape === 'kiln') {
    if (d.innerUid === null || innerDefId === undefined) return false;
  }
  const shape = shapeOf(d, innerDefId);
  switch (shape) {
    case 'cells':
      return d.cells.length > 0;
    case 'cell':
    case 'row':
    case 'block':
      return d.cells.length === 1;
    case 'line':
      return d.cells.length === 1 && d.dir !== null;
    case 'beacon':
      return d.row !== null && d.col !== null && d.cells.length === 4;
    case 'strip':
      return total(d.from) > 0;
    case 'steal':
      return total(d.from) > 0 && d.toUid !== null;
    case 'kiln':
      return false; // unreachable: shapeOf resolves Kiln to the inner card
    case 'none':
      return true;
    default:
      return false;
  }
}

export function total(from: { amount: number }[]): number {
  return from.reduce((n, f) => n + f.amount, 0);
}

/** What the player should do next, in words. */
export function prompt(d: Draft, charges: number, innerDefId?: string): string {
  const shape = shapeOf(d, innerDefId);
  switch (shape) {
    case 'cells': {
      const want = wantsCells(d, innerDefId);
      return `tap up to ${want} cell${want === 1 ? '' : 's'} — ${d.cells.length} chosen`;
    }
    case 'cell':
      return d.cells.length ? 'ready' : 'tap the cell';
    case 'row':
      return d.cells.length
        ? 'ready'
        : `tap where the ${3 + Math.max(0, charges - 1)}-cell row starts`;
    case 'block':
      return d.cells.length ? 'ready' : 'tap the top-left of the block';
    case 'line':
      if (!d.cells.length) return 'tap where the line starts';
      return d.dir ? 'ready' : 'choose a direction';
    case 'beacon':
      if (d.row === null || d.col === null) return 'tap a cell to set the row and column to read';
      return `tap 4 cells to fire — ${d.cells.length} chosen`;
    case 'strip':
      return `take ${total(d.from)} of ${charges} — tap their cards`;
    case 'steal':
      if (total(d.from) === 0) return `tap their cards to take up to ${charges}`;
      return d.toUid === null ? 'tap one of your cards to receive them' : 'ready';
    case 'kiln':
      return d.innerUid === null ? 'tap a card in your hand to fire at +3' : 'aim it';
    case 'none':
      return 'ready';
    default:
      return '';
  }
}

/** Assemble the declaration the engine will be handed. */
export function toSpec(d: Draft, charges: number, innerDefId?: string, inner?: FireSpec): FireSpec {
  const shape = shapeOf(d, innerDefId);
  switch (shape) {
    case 'cells':
      return { shape: 'cells', cells: d.cells };
    case 'cell':
      return { shape: 'cell', cell: d.cells[0] ?? 0 };
    case 'row':
      return { shape: 'row', origin: d.cells[0] ?? 0 };
    case 'block': {
      const size = (innerDefId ?? d.aiming.defId) === 'burst' && charges >= 4 ? 3 : 2;
      return { shape: 'block', anchor: clampAnchor(d.cells[0] ?? 0, size) };
    }
    case 'line':
      return { shape: 'line', origin: d.cells[0] ?? 0, dir: d.dir ?? [1, 0] };
    case 'beacon':
      return { shape: 'beacon', row: d.row ?? 0, col: d.col ?? 0, cells: d.cells };
    case 'strip':
      return { shape: 'strip', from: d.from };
    case 'steal':
      return { shape: 'steal', from: d.from, toUid: d.toUid ?? 0 };
    case 'kiln':
      return { shape: 'kiln', uid: d.innerUid ?? 0, inner: inner ?? { shape: 'none' } };
    default:
      return { shape: 'none' };
  }
}

/** Add or remove one charge from an allocation, in a tap. */
export function bumpAllocation(
  from: { uid: number; amount: number }[],
  uid: number,
  budget: number,
  available: number,
): { uid: number; amount: number }[] {
  const next = from.map((f) => ({ ...f }));
  const existing = next.find((f) => f.uid === uid);
  const used = total(next);
  if (existing) {
    // Tapping past the card's own supply wraps back to nothing, so a misfire
    // is one more tap rather than a reset button.
    if (existing.amount >= Math.min(available, budget - (used - existing.amount))) {
      return next.filter((f) => f.uid !== uid);
    }
    existing.amount += 1;
    return next;
  }
  if (used >= budget || available <= 0) return next;
  next.push({ uid, amount: 1 });
  return next;
}
