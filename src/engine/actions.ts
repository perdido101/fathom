import type { CellIndex, PlayerId, TargetPayload } from './types';

export interface PlaceFleetAction {
  type: 'PLACE_FLEET';
  player: PlayerId;
  placements: { typeId: string; cells: CellIndex[] }[];
  /** Mine cells, 2 per minelayer in the fleet. */
  mines?: CellIndex[];
}

export interface PlayCardAction {
  type: 'PLAY_CARD';
  player: PlayerId;
  cardUid: number;
  target: TargetPayload;
}

export interface ShipAbilityAction {
  type: 'SHIP_ABILITY';
  player: PlayerId;
  shipUid: number;
  target: TargetPayload;
}

export interface EndTurnAction {
  type: 'END_TURN';
  player: PlayerId;
}

export type MatchAction =
  | PlaceFleetAction
  | PlayCardAction
  | ShipAbilityAction
  | EndTurnAction;
