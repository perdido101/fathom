import type { MatchState, PlayerId } from './types';
import { other } from './types';
import type { MatchAction, PlaceFleetAction } from './actions';
import { SHIPS } from '../content/ships';
import { CARDS } from '../content/cards';
import { TERRAIN } from '../content/terrain';
import { isLegalPlacement } from './fleet/placement';
import { handleShipAbility } from './fleet/abilities';
import { applyShot, executeEffect, cellName, isDetectable, isOccupied } from './resolve/shot';
import { applyIncome, effectiveCost } from './resolve/energy';
import { isAvailable, markPlayed } from './resolve/availability';
import { checkVictory } from './resolve/victory';

/**
 * The one entry point: (state, action) -> new state. Pure — the input state
 * is never mutated; illegal actions throw.
 */
export function reduce(state: MatchState, action: MatchAction): MatchState {
  const ms = structuredClone(state);
  switch (action.type) {
    case 'PLACE_FLEET':
      placeFleet(ms, action);
      break;

    case 'PLAY_CARD': {
      requireTurn(ms, action.player);
      const ps = ms.players[action.player];
      const card = ps.tray.find((c) => c.uid === action.cardUid);
      if (!card) throw new Error('No such card in tray');
      if (card.spent) throw new Error('Card is spent');
      if (!isAvailable(ps, card)) throw new Error('Card is unavailable this turn');
      const def = CARDS[card.typeId];
      const cost = effectiveCost(ms, ps, def);
      if (ps.energy < cost) throw new Error('Not enough energy');
      ps.energy -= cost;
      ms.stats.energySpent[action.player] += cost;
      executeEffect(ms, action.player, def, action.target);
      markPlayed(ps, card);
      // Played cards are permanently public knowledge.
      card.revealed = true;
      const plays = ms.stats.cardPlays[action.player];
      plays[def.id] = (plays[def.id] ?? 0) + 1;
      checkVictory(ms, action.player);
      break;
    }

    case 'SHIP_ABILITY': {
      requireTurn(ms, action.player);
      handleShipAbility(ms, action);
      checkVictory(ms, action.player);
      break;
    }

    case 'END_TURN': {
      requireTurn(ms, action.player);
      const ps = ms.players[action.player];
      // Blockade wears off at the end of the affected player's turn.
      if (ps.blockadeTurns > 0) ps.blockadeTurns -= 1;
      ms.current = other(action.player);
      startTurn(ms, ms.current);
      break;
    }

    default: {
      const _exhaustive: never = action;
      throw new Error(`Unknown action ${(_exhaustive as { type: string }).type}`);
    }
  }
  return ms;
}

function requireTurn(ms: MatchState, p: PlayerId): void {
  if (ms.phase !== 'battle') throw new Error(`No actions during ${ms.phase}`);
  if (ms.current !== p) throw new Error('Not your turn');
}

function placeFleet(ms: MatchState, action: PlaceFleetAction): void {
  if (ms.phase !== 'placement') throw new Error('Placement is over');
  const ps = ms.players[action.player];
  if (ps.placed) throw new Error('Fleet already placed');

  // The placements must exactly cover the fleet-to-place multiset.
  const wanted = ps.fleetToPlace.slice().sort();
  const got = action.placements.map((p) => p.typeId).sort();
  if (wanted.length !== got.length || wanted.some((w, i) => w !== got[i])) {
    throw new Error('Placements do not match the fleet');
  }

  const occupied = new Set<number>();
  for (const placement of action.placements) {
    const def = SHIPS[placement.typeId];
    if (!isLegalPlacement(placement.cells, def.size, ms.gridW, ms.gridH, ms.terrain, occupied)) {
      throw new Error(`Illegal placement for ${def.name}`);
    }
    for (const c of placement.cells) occupied.add(c);
  }

  // Minelayers deploy 2 mines each on own empty, non-reef cells.
  const minelayers = action.placements.filter((p) => SHIPS[p.typeId].ability === 'deploy').length;
  const mines = action.mines ?? [];
  if (mines.length !== minelayers * 2) {
    throw new Error(`Expected ${minelayers * 2} mines, got ${mines.length}`);
  }
  const mineSet = new Set<number>();
  for (const m of mines) {
    if (m < 0 || m >= ms.gridW * ms.gridH) throw new Error('Mine out of bounds');
    if (occupied.has(m)) throw new Error('Mines cannot sit under ships');
    if (!TERRAIN[ms.terrain[m]].placeable) throw new Error('Mines cannot sit on reef');
    if (mineSet.has(m)) throw new Error('Duplicate mine cell');
    mineSet.add(m);
  }

  for (const placement of action.placements) {
    ps.ships.push({
      uid: ms.nextUid++,
      typeId: placement.typeId,
      cells: placement.cells.slice(),
      damage: placement.cells.map(() => 0),
      destroyed: placement.cells.map(() => false),
      sunk: false,
      sinkAnnounced: false,
      evasiveUsed: false,
      swiftUsed: false,
      launchUsed: false,
    });
  }
  ps.mines = mines.map((cell) => ({ cell, spent: false }));
  ps.fleetToPlace = [];
  ps.placed = true;
  ms.log.push({
    turn: ms.turn,
    player: action.player,
    text: `${ps.name} has deployed.`,
    kind: 'system',
  });

  if (ms.players[0].placed && ms.players[1].placed) {
    ms.phase = 'battle';
    ms.current = ms.firstPlayer;
    // Going second is compensated with a one-off energy grant.
    ms.players[other(ms.firstPlayer)].pendingEnergy += ms.secondPlayerComp;
    ms.log.push({
      turn: ms.turn,
      player: ms.firstPlayer,
      text: `Battle begins on ${ms.seedName}. ${ms.players[ms.firstPlayer].name} fires first.`,
      kind: 'system',
    });
    startTurn(ms, ms.firstPlayer);
  }
}

function startTurn(ms: MatchState, p: PlayerId): void {
  const ps = ms.players[p];
  ms.turn += 1;
  ps.turnCount += 1;
  applyIncome(ms, p);
  // Buoys report at the start of the owner's next turn.
  for (const buoy of ps.buoys) {
    if (!isDetectable(ms, buoy.cell)) {
      ms.log.push({
        turn: ms.turn,
        player: p,
        text: `The buoy at ${cellName(buoy.cell, ms.gridW)} returns no reading.`,
        kind: 'info',
      });
      continue;
    }
    const occ = isOccupied(ms, other(p), buoy.cell);
    ps.intel[buoy.cell].known = occ ? 'occupied' : 'empty';
    ms.log.push({
      turn: ms.turn,
      player: p,
      text: `The buoy at ${cellName(buoy.cell, ms.gridW)} pings: ${occ ? 'contact' : 'nothing'}.`,
      kind: 'info',
    });
  }
  ps.buoys = [];
  // Expired decoys wash away.
  ps.decoys = ps.decoys.filter((d) => ps.turnCount < d.expiresAt);
}

export { applyShot };
