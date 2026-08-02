import type { CardDef, CellIndex, MatchState, PlayerId, TargetPayload } from '../types';
import { cellRC, rcCell, inBounds, other } from '../types';
import { SHIPS } from '../../content/ships';
import { MODIFIERS, type ModifierEffect } from '../../content/modifiers';
import { nextInt } from '../rng';
import { grantHitEnergy } from './energy';
import { updateEndangered } from './victory';

/** Player-facing cell name, e.g. "D7". Never expose indices to the player. */
export function cellName(cell: CellIndex, w: number): string {
  const [r, c] = cellRC(cell, w);
  return `${String.fromCharCode(65 + c)}${r + 1}`;
}

/** Is the match's face-up terrain modifier of this kind? */
export function modIs(ms: MatchState, kind: ModifierEffect['kind']): boolean {
  return MODIFIERS[ms.modifierId]?.effect.kind === kind;
}

export interface ShotOpts {
  /** Barrage-style: apply damage but do not mark per-cell intel. */
  aggregate?: boolean;
  /** Whether real hits earn next-turn energy bonus (default true). */
  countsForBonus?: boolean;
  /** Player-facing source name for the log ("Torpedo", "Wake"…). */
  source: string;
  /** Suppress the ordinary per-shot log line (aggregate effects log once). */
  quiet?: boolean;
}

export type ShotOutcome = 'miss' | 'hit' | 'decoy' | 'dodge' | 'wreck';

function log(ms: MatchState, p: PlayerId, text: string, kind: 'shot' | 'info' | 'card' = 'shot') {
  ms.log.push({ turn: ms.turn, player: p, text, kind });
}

/** Is this cell part of an unsunk enemy ship? (Ground truth.) */
export function isOccupied(ms: MatchState, owner: PlayerId, cell: CellIndex): boolean {
  return ms.players[owner].ships.some((s) => !s.sunk && s.cells.includes(cell));
}

/** Is this cell part of a fully sunk ship (wreckage)? */
export function isWreckage(ms: MatchState, owner: PlayerId, cell: CellIndex): boolean {
  return ms.players[owner].ships.some((s) => s.sunk && s.cells.includes(cell));
}

/**
 * Can detection see into this cell at all? Spring Tide blinds fog; Deep
 * Water blinds trench. Blind cells return no reading — not a false "empty".
 */
export function isDetectable(ms: MatchState, cell: CellIndex): boolean {
  if (modIs(ms, 'fog_blocks_detection') && ms.terrain[cell] === 'FOG') return false;
  if (modIs(ms, 'trench_hides_from_detection') && ms.terrain[cell] === 'TRENCH') return false;
  return true;
}

function orthNeighbours(cell: CellIndex, w: number, h: number): CellIndex[] {
  const [r, c] = cellRC(cell, w);
  const out: CellIndex[] = [];
  for (const [nr, nc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]] as [number, number][]) {
    if (inBounds(nr, nc, w, h)) out.push(rcCell(nr, nc, w));
  }
  return out;
}

function allNeighbours(cell: CellIndex, w: number, h: number): CellIndex[] {
  const [r, c] = cellRC(cell, w);
  const out: CellIndex[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      if (inBounds(r + dr, c + dc, w, h)) out.push(rcCell(r + dr, c + dc, w));
    }
  }
  return out;
}

/**
 * Resolve a single shot from `shooter` at `cell` on the enemy grid.
 * Handles mines, decoys, evasion, trench/armor damage, fog reporting,
 * shallows reveal, retaliate, sinking, the leviathan's wake, and the
 * match's terrain modifier.
 */
export function applyShot(ms: MatchState, shooter: PlayerId, cell: CellIndex, opts: ShotOpts): ShotOutcome {
  const shooterP = ms.players[shooter];
  const defenderP = ms.players[other(shooter)];
  const w = ms.gridW;
  const intel = shooterP.intel[cell];
  const name = cellName(cell, w);
  shooterP.shotsFired += 1;
  intel.fired = true;
  intel.fireCount += 1;

  // Sharp Shoals: firing at a reef cell costs 1 extra energy.
  if (modIs(ms, 'reef_shot_penalty') && ms.terrain[cell] === 'REEF') {
    shooterP.energy = Math.max(0, shooterP.energy - 1);
  }

  // Mines detonate on any enemy shot at their cell, once.
  const mine = defenderP.mines.find((m) => !m.spent && m.cell === cell);
  if (mine) {
    mine.spent = true;
    shooterP.energy = Math.max(0, shooterP.energy - 2);
    log(ms, shooter, `A mine detonated at ${name} — ${shooterP.name} loses 2 energy.`, 'info');
  }

  const ship = defenderP.ships.find((s) => s.cells.includes(cell));

  if (ship && !ship.sunk) {
    const ci = ship.cells.indexOf(cell);
    const def = SHIPS[ship.typeId];

    // Already-destroyed cell of a floating ship: a wreck. No new damage, and
    // the shooter is told there is nothing left to finish here.
    if (ship.destroyed[ci]) {
      if (!opts.aggregate) {
        intel.mark = 'hit';
        intel.partial = false;
      }
      if (!opts.quiet) log(ms, shooter, `${opts.source} strikes wreckage at ${name}.`);
      return 'wreck';
    }

    // Real hit. Trench terrain and armor each add a required hit
    // (Silted Up removes the trench bonus).
    const trenchBonus = ms.terrain[cell] === 'TRENCH' && !modIs(ms, 'trench_single_hit') ? 1 : 0;
    const required = 1 + trenchBonus + (def.ability === 'armored' ? 1 : 0);
    ship.damage[ci] += 1;
    shooterP.hitsScored += 1;
    const inFog = ms.terrain[cell] === 'FOG' && !modIs(ms, 'fog_reveals_identity');
    if (ms.stats.firstHitBy === null) ms.stats.firstHitBy = shooter;
    if (opts.countsForBonus !== false) {
      // Hit income lands immediately and is spendable this turn.
      // Rolling Fog: hits in fog earn no bonus. Ebb Tide: shallows pay extra.
      if (!(ms.terrain[cell] === 'FOG' && modIs(ms, 'fog_no_hit_bonus'))) {
        let bonus = ms.hitBonus;
        if (ms.terrain[cell] === 'SHALLOWS' && modIs(ms, 'shallows_bonus_energy')) bonus += 1;
        grantHitEnergy(ms, shooter, bonus);
      }
    }
    const destroyedNow = ship.damage[ci] >= required;
    if (destroyedNow) ship.destroyed[ci] = true;

    if (!opts.aggregate) {
      intel.mark = 'hit';
      // Outside fog the shooter is told whether the cell held.
      if (!inFog) intel.partial = !destroyedNow;
    }
    if (!opts.quiet) {
      if (inFog) log(ms, shooter, `${opts.source} at ${name} — a hit, somewhere in the fog.`);
      else if (!destroyedNow) log(ms, shooter, `${opts.source} at ${name} — hit, but it holds.`);
      else log(ms, shooter, `${opts.source} at ${name} — hit.`);
    }

    // Shallows: a hit here also reveals the orthogonal neighbours
    // (Murky Water suppresses; Clear Water widens to eight).
    if (ms.terrain[cell] === 'SHALLOWS' && !modIs(ms, 'shallows_no_reveal')) {
      const neigh = modIs(ms, 'shallows_reveal_eight')
        ? allNeighbours(cell, w, ms.gridH)
        : orthNeighbours(cell, w, ms.gridH);
      for (const n of neigh) {
        if (!isDetectable(ms, n)) continue;
        shooterP.intel[n].known = isOccupied(ms, other(shooter), n) ? 'occupied' : 'empty';
      }
      log(ms, shooter, `The shallows at ${name} betray what surrounds them.`, 'info');
    }

    // Retaliate: the frigate reveals one random occupied cell of the shooter's grid.
    if (def.ability === 'retaliate') {
      const candidates: CellIndex[] = [];
      for (const s of shooterP.ships) {
        if (s.sunk) continue;
        for (const sc of s.cells) {
          if (defenderP.intel[sc].known !== 'occupied' && defenderP.intel[sc].mark === null) {
            candidates.push(sc);
          }
        }
      }
      if (candidates.length > 0) {
        let i: number;
        [i, ms.rng] = nextInt(ms.rng, candidates.length);
        defenderP.intel[candidates[i]].known = 'occupied';
        log(ms, other(shooter), `A ship retaliates — an enemy position is revealed.`, 'info');
      }
    }

    if (destroyedNow && ship.destroyed.every(Boolean)) {
      sinkShip(ms, shooter, ship.uid);
    }
    return 'hit';
  }

  // Decoy: an active enemy decoy on an empty cell reports as a hit.
  const decoy = defenderP.decoys.find((d) => d.cell === cell && defenderP.turnCount < d.expiresAt);
  if (decoy) {
    if (!opts.aggregate) intel.mark = 'hit';
    if (!opts.quiet) log(ms, shooter, `${opts.source} at ${name} — hit.`);
    return 'decoy';
  }

  // Salvage Rights: firing at empty wreckage grants the shooter 2 energy.
  if (isWreckage(ms, other(shooter), cell) && modIs(ms, 'wreck_salvage_energy')) {
    shooterP.energy += 2;
    log(ms, shooter, `${shooterP.name} salvages the wreck at ${name} — +2 energy.`, 'info');
  }

  // Plain miss (open water, reef, or a fully sunk wreck). A miss is only a
  // report — it does not verify emptiness (an evasive dodge looks identical).
  if (!opts.aggregate) {
    if (intel.mark !== 'sunk') intel.mark = 'miss';
  }
  if (!opts.quiet) log(ms, shooter, `${opts.source} at ${name} — miss.`);
  return 'miss';
}

/**
 * Sink bookkeeping. Fleet composition is never declared: an announced sink
 * reveals only the ship's LENGTH. Fog (unless Burn-Off), camouflage on
 * reef/fog, and Coral Growth adjacency suppress the announcement entirely.
 */
function sinkShip(ms: MatchState, shooter: PlayerId, shipUid: number): void {
  const defenderP = ms.players[other(shooter)];
  const shooterP = ms.players[shooter];
  const ship = defenderP.ships.find((s) => s.uid === shipUid)!;
  ship.sunk = true;
  const def = SHIPS[ship.typeId];
  const w = ms.gridW;
  const h = ms.gridH;

  const fogHides = (c: CellIndex) =>
    ms.terrain[c] === 'FOG' && !modIs(ms, 'fog_reveals_identity');

  // Silent Running: this hull's sinking is never announced at all.
  const silent = def.ability === 'silent';
  const camouflaged =
    def.ability === 'camouflage' &&
    ship.cells.some((c) => ms.terrain[c] === 'REEF' || ms.terrain[c] === 'FOG');
  const coralConcealed =
    modIs(ms, 'reef_conceals_adjacent') &&
    ship.cells.some((c) => orthNeighbours(c, w, h).some((n) => ms.terrain[n] === 'REEF'));
  const allFogged = ship.cells.every(fogHides);
  const suppressed = silent || camouflaged || coralConcealed || allFogged;

  if (!suppressed) {
    for (const c of ship.cells) {
      if (fogHides(c)) continue; // fog suppresses per-cell sink marks
      shooterP.intel[c].mark = 'sunk';
      shooterP.intel[c].known = 'empty'; // nothing left to hunt here
    }
    ship.sinkAnnounced = true;
    shooterP.enemySunkLengths.push(def.size);
    log(ms, shooter, `A ship of length ${def.size} goes down.`, 'info');
  }
  updateEndangered(ms);

  // Wake: when the leviathan sinks it deals one automatic hit to a random
  // occupied enemy cell (from its owner's point of view, the shooter's fleet).
  if (def.ability === 'wake') {
    const targets: CellIndex[] = [];
    for (const s of shooterP.ships) {
      if (s.sunk) continue;
      for (let i = 0; i < s.cells.length; i++) {
        if (!s.destroyed[i]) targets.push(s.cells[i]);
      }
    }
    if (targets.length > 0) {
      let i: number;
      [i, ms.rng] = nextInt(ms.rng, targets.length);
      log(ms, other(shooter), `Something vast turns over in the deep — its wake surges outward.`, 'info');
      applyShot(ms, other(shooter), targets[i], { source: 'The wake', countsForBonus: false });
    }
  }
}

// ---------------------------------------------------------------------------
// Card effect execution. All effects resolve through applyShot / probe helpers
// so terrain, abilities, modifiers and reporting behave identically everywhere.
// ---------------------------------------------------------------------------

function addReport(
  ms: MatchState,
  p: PlayerId,
  kind: 'count' | 'flag',
  cells: CellIndex[],
  value: number,
  label: string,
): void {
  const enemySunk = ms.players[p].enemySunkLengths.length;
  ms.players[p].reports.push({ kind, cells, value, turn: ms.turn, label, enemySunk });
}

function countOccupied(ms: MatchState, owner: PlayerId, cells: CellIndex[]): number {
  return cells.filter((c) => isOccupied(ms, owner, c)).length;
}

/** Does a line effect stop at this cell before resolving it? */
function lineBlocked(ms: MatchState, defender: PlayerId, cell: CellIndex): boolean {
  if (ms.terrain[cell] === 'REEF' && !modIs(ms, 'reef_no_line_block')) return true;
  if (modIs(ms, 'wreck_blocks_lines') && isWreckage(ms, defender, cell)) return true;
  return false;
}

export function zoneCells(origin: CellIndex, zone: number, w: number): CellIndex[] {
  const [r0, c0] = cellRC(origin, w);
  const cells: CellIndex[] = [];
  for (let r = r0; r < r0 + zone; r++) {
    for (let c = c0; c < c0 + zone; c++) cells.push(rcCell(r, c, w));
  }
  return cells;
}

export function zoneFits(origin: CellIndex, zone: number, w: number, h: number): boolean {
  const [r0, c0] = cellRC(origin, w);
  return r0 >= 0 && c0 >= 0 && r0 + zone <= h && c0 + zone <= w;
}

function assertCells(cells: CellIndex[] | undefined, n: number, area: number): CellIndex[] {
  if (!cells || cells.length !== n) throw new Error(`Expected ${n} target cells`);
  const seen = new Set<number>();
  for (const c of cells) {
    if (c < 0 || c >= area) throw new Error('Target cell out of bounds');
    if (seen.has(c)) throw new Error('Duplicate target cell');
    seen.add(c);
  }
  return cells;
}

/** Straight contiguous ORTHOGONAL segment (probes and launches), or throws. */
function assertSegment(cells: CellIndex[] | undefined, n: number, w: number, area: number): CellIndex[] {
  const cs = assertCells(cells, n, area);
  const rcs = cs.map((c) => cellRC(c, w));
  const sameRow = rcs.every(([r]) => r === rcs[0][0]);
  const sameCol = rcs.every(([, c]) => c === rcs[0][1]);
  if (!sameRow && !sameCol) throw new Error('Cells must form a straight line');
  const vals = rcs.map(([r, c]) => (sameRow ? c : r)).sort((a, b) => a - b);
  for (let i = 1; i < vals.length; i++) {
    if (vals[i] !== vals[i - 1] + 1) throw new Error('Cells must be contiguous');
  }
  return cs;
}

/**
 * Execute a card's effect for `p`. Legality of the target shape is validated
 * here; affordability/cooldown are validated by the reducer before calling.
 */
export function executeEffect(
  ms: MatchState,
  p: PlayerId,
  def: CardDef,
  target: TargetPayload,
): void {
  const w = ms.gridW;
  const h = ms.gridH;
  const area = w * h;
  const enemy = other(p);
  const ps = ms.players[p];
  const effect = def.effect;
  const src = def.name;

  switch (effect.kind) {
    case 'fire_cells': {
      const cells = assertCells(target.cells, effect.count, area);
      for (const c of cells) applyShot(ms, p, c, { source: src });
      break;
    }

    case 'fire_scatter': {
      if (target.origin === undefined || !zoneFits(target.origin, effect.zone, w, h)) {
        throw new Error('Scatter zone does not fit');
      }
      const zone = zoneCells(target.origin, effect.zone, w);
      const pool = zone.slice();
      for (let i = 0; i < effect.shots && pool.length > 0; i++) {
        let j: number;
        [j, ms.rng] = nextInt(ms.rng, pool.length);
        const c = pool.splice(j, 1)[0];
        applyShot(ms, p, c, { source: src });
      }
      break;
    }

    case 'fire_plus': {
      if (target.origin === undefined) throw new Error('Cross salvo needs a centre');
      const [r, c] = cellRC(target.origin, w);
      const shape: [number, number][] = [[r, c], [r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
      for (const [sr, sc] of shape) {
        if (!inBounds(sr, sc, w, h)) continue;
        applyShot(ms, p, rcCell(sr, sc, w), { source: src });
      }
      break;
    }

    case 'fire_row_sweep': {
      // Barrage: an entire row swept from one edge; reef (and Flotsam wrecks)
      // stop it. The report is aggregate — total hits only, no per-cell marks.
      const line = target.line;
      if (!line || line.axis !== 'row' || line.index < 0 || line.index >= h) {
        throw new Error('Barrage needs a row');
      }
      const cols = Array.from({ length: w }, (_, i) => (line.dir === 1 ? i : w - 1 - i));
      let hits = 0;
      const swept: CellIndex[] = [];
      let stopped = false;
      for (const c of cols) {
        const cell = rcCell(line.index, c, w);
        if (lineBlocked(ms, enemy, cell)) {
          stopped = true;
          break;
        }
        swept.push(cell);
        const outcome = applyShot(ms, p, cell, { source: src, aggregate: true, quiet: true });
        if (outcome === 'hit' || outcome === 'decoy' || outcome === 'wreck') hits += 1;
      }
      addReport(ms, p, 'count', swept, hits, `Barrage, row ${line.index + 1}`);
      log(
        ms,
        p,
        `Barrage swept row ${line.index + 1}${stopped ? ' until it broke against something' : ''} — ${hits} hit${hits === 1 ? '' : 's'}.`,
        'card',
      );
      break;
    }

    case 'fire_torpedo': {
      const line = target.line;
      if (!line) throw new Error('Torpedo needs a lane');
      const laneLen = line.axis === 'row' ? w : h;
      const laneMax = line.axis === 'row' ? h : w;
      if (line.index < 0 || line.index >= laneMax) throw new Error('Torpedo lane out of range');
      const lane: CellIndex[] = [];
      for (let i = 0; i < laneLen; i++) {
        const along = line.dir === 1 ? i : laneLen - 1 - i;
        lane.push(line.axis === 'row' ? rcCell(line.index, along, w) : rcCell(along, line.index, w));
      }
      const laneName =
        line.axis === 'row' ? `row ${line.index + 1}` : `column ${String.fromCharCode(65 + line.index)}`;
      let ended = '';
      for (const cell of lane) {
        if (lineBlocked(ms, enemy, cell)) {
          ended = `Stopped short — something blocked the lane.`;
          break;
        }
        const outcome = applyShot(ms, p, cell, { source: src, quiet: true });
        if (outcome === 'hit' || outcome === 'decoy' || outcome === 'wreck') {
          ended = `Struck at ${cellName(cell, w)}.`;
          break;
        }
      }
      log(ms, p, `Torpedo fired down ${laneName}. ${ended || 'Ran the length — nothing.'}`, 'card');
      break;
    }

    case 'fire_zone': {
      if (target.origin === undefined || !zoneFits(target.origin, effect.zone, w, h)) {
        throw new Error('Zone does not fit');
      }
      for (const c of zoneCells(target.origin, effect.zone, w)) {
        applyShot(ms, p, c, { source: src });
      }
      break;
    }

    case 'fire_marked_column': {
      const col = target.colIndex;
      if (col === undefined || col < 0 || col >= w) throw new Error('Dredge needs a column');
      const colCells = Array.from({ length: h }, (_, r) => rcCell(r, col, w));
      if (!colCells.some((c) => ps.intel[c].fired)) {
        throw new Error('Dredge requires a column you have fired on before');
      }
      log(ms, p, `Dredge rakes column ${String.fromCharCode(65 + col)}.`, 'card');
      for (const c of colCells) {
        if (lineBlocked(ms, enemy, c)) continue; // dredge is not line-travel; only wrecks/reef cells themselves are skipped
        applyShot(ms, p, c, { source: src });
      }
      break;
    }

    case 'probe_line': {
      const cells = assertSegment(target.cells, effect.length, w, area);
      const visible = cells.filter((c) => isDetectable(ms, c));
      const n = countOccupied(ms, enemy, visible);
      if (n === 0) for (const c of visible) ps.intel[c].known = 'empty';
      if (n === visible.length && visible.length > 0) {
        for (const c of visible) ps.intel[c].known = 'occupied';
      }
      addReport(ms, p, 'count', visible, n, 'Line probe');
      const obscured = cells.length - visible.length;
      log(
        ms,
        p,
        `Line probe: ${n} of ${visible.length} cells occupied${obscured > 0 ? ` (${obscured} unreadable)` : ''}.`,
        'card',
      );
      break;
    }

    case 'fire_probe_adjacent': {
      const cells = assertCells(target.cells, 1, area);
      applyShot(ms, p, cells[0], { source: src });
      // Depth charge adjacency is deliberately ORTHOGONAL-only (design call).
      const neigh = orthNeighbours(cells[0], w, h).filter((n) => isDetectable(ms, n));
      const any = countOccupied(ms, enemy, neigh) > 0;
      if (!any) for (const n of neigh) ps.intel[n].known = 'empty';
      addReport(ms, p, 'flag', neigh, any ? 1 : 0, 'Depth charge echo');
      log(ms, p, `Depth charge echo: ${any ? 'something' : 'nothing'} lies adjacent.`, 'card');
      break;
    }

    case 'probe_delayed': {
      const cells = assertCells(target.cells, 1, area);
      ps.buoys.push({ cell: cells[0] });
      log(ms, p, `A buoy drops at ${cellName(cells[0], w)}.`, 'card');
      break;
    }

    case 'probe_zone_count': {
      if (target.origin === undefined || !zoneFits(target.origin, effect.zone, w, h)) {
        throw new Error('Zone does not fit');
      }
      const cells = zoneCells(target.origin, effect.zone, w);
      const visible = cells.filter((c) => isDetectable(ms, c));
      const n = countOccupied(ms, enemy, visible);
      if (n === 0) for (const c of visible) ps.intel[c].known = 'empty';
      addReport(ms, p, 'count', visible, n, 'Sonar sweep');
      log(ms, p, `Sonar sweep: ${n} occupied in the zone.`, 'card');
      break;
    }

    case 'reveal_zone': {
      if (target.origin === undefined || !zoneFits(target.origin, effect.zone, w, h)) {
        throw new Error('Zone does not fit');
      }
      let found = 0;
      for (const c of zoneCells(target.origin, effect.zone, w)) {
        if (!isDetectable(ms, c)) continue;
        const occ = isOccupied(ms, enemy, c);
        ps.intel[c].known = occ ? 'occupied' : 'empty';
        if (occ) found += 1;
      }
      log(ms, p, `Satellite pass: ${found} occupied cells revealed.`, 'card');
      break;
    }

    case 'energy_delayed': {
      ps.pendingEnergy += effect.amount;
      log(ms, p, `${ps.name} shifts ballast — energy banked for next turn.`, 'card');
      break;
    }

    case 'decoy': {
      const cells = assertCells(target.cells, effect.count, area);
      for (const c of cells) {
        const onShip = ms.players[p].ships.some((s) => s.cells.includes(c));
        if (onShip) throw new Error('Decoys must sit on empty cells');
        // False Lights: decoys on open water last 2 extra turns.
        const extra = modIs(ms, 'open_decoy_extended') && ms.terrain[c] === 'OPEN' ? 2 : 0;
        ps.decoys.push({ cell: c, expiresAt: ps.turnCount + effect.turns + extra });
      }
      log(ms, p, `${ps.name} deploys decoys.`, 'card');
      break;
    }

    case 'repair': {
      const cells = assertCells(target.cells, 1, area);
      // Undertow: trench cells cannot be repaired.
      if (modIs(ms, 'trench_no_repair') && ms.terrain[cells[0]] === 'TRENCH') {
        throw new Error('The undertow makes trench repairs impossible');
      }
      const ship = ms.players[p].ships.find((s) => !s.sunk && s.cells.includes(cells[0]));
      if (!ship) throw new Error('Repair needs a damaged cell of an unsunk ship');
      const ci = ship.cells.indexOf(cells[0]);
      if (ship.damage[ci] <= 0) throw new Error('That cell is not damaged');
      // A section can be rebuilt once and once only. Unlimited restoration
      // let a tough hull outlast any attacker; a single rebuild per cell
      // keeps repair a real play without making a fleet unkillable.
      if (ship.repaired[ci]) throw new Error('That section has already been rebuilt');
      ship.repaired[ci] = true;
      ship.damage[ci] = 0;
      ship.destroyed[ci] = false;
      log(ms, p, `${ps.name} patches a hull breach.`, 'card');
      break;
    }

    case 'emp': {
      ms.players[enemy].empTurns = Math.max(ms.players[enemy].empTurns, effect.turns);
      log(ms, p, `An EMP burst crackles across the enemy fleet.`, 'card');
      break;
    }

    case 'blockade': {
      ms.players[enemy].blockadeTurns = Math.max(ms.players[enemy].blockadeTurns, effect.turns);
      log(ms, p, `${ps.name} blockades the enemy's sensors.`, 'card');
      break;
    }

    default: {
      const _exhaustive: never = effect;
      throw new Error(`Unknown effect ${(_exhaustive as { kind: string }).kind}`);
    }
  }
}
