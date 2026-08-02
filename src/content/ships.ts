import type { ShipDef } from '../engine/types';

export const SHIPS: Record<string, ShipDef> = {
  skiff: {
    id: 'skiff',
    name: 'Skiff',
    size: 1,
    tier: 1,
    ability: 'evasive',
    abilityName: 'Evasive',
    abilityText: 'The first hit ever scored on it is reported to the shooter as a miss.',
  },
  cutter: {
    id: 'cutter',
    name: 'Cutter',
    size: 2,
    tier: 1,
    ability: 'swift',
    abilityName: 'Swift',
    abilityText: 'Once per match, relocate one cell orthogonally.',
  },
  reefrunner: {
    id: 'reefrunner',
    name: 'Reefrunner',
    size: 2,
    tier: 1,
    ability: 'camouflage',
    abilityName: 'Camouflage',
    abilityText: 'While any of its cells sit on reef or fog, hits on it never reveal ship identity.',
  },
  tender: {
    id: 'tender',
    name: 'Tender',
    size: 3,
    tier: 1,
    ability: 'supply',
    abilityName: 'Supply',
    abilityText: '+1 energy income per turn while alive.',
  },
  frigate: {
    id: 'frigate',
    name: 'Frigate',
    size: 3,
    tier: 2,
    ability: 'retaliate',
    abilityName: 'Retaliate',
    abilityText: 'When hit, reveals one random occupied enemy cell to you.',
  },
  minelayer: {
    id: 'minelayer',
    name: 'Minelayer',
    size: 3,
    tier: 2,
    ability: 'deploy',
    abilityName: 'Deploy',
    abilityText: 'At placement, put 2 mines on your own grid. An enemy shot on a mine costs them 2 energy.',
  },
  sonarship: {
    id: 'sonarship',
    name: 'Array Ship',
    size: 4,
    tier: 2,
    ability: 'array',
    abilityName: 'Array',
    abilityText: 'All detection cards cost 1 less while it is alive.',
  },
  carrier: {
    id: 'carrier',
    name: 'Carrier',
    size: 4,
    tier: 2,
    ability: 'launch',
    abilityName: 'Launch',
    abilityText: 'Once per match, fire a free 3-cell line.',
  },
  dreadnought: {
    id: 'dreadnought',
    name: 'Dreadnought',
    size: 5,
    tier: 3,
    ability: 'armored',
    abilityName: 'Armored',
    abilityText: 'Every one of its cells requires 2 hits.',
  },
  leviathan: {
    id: 'leviathan',
    name: 'Leviathan',
    size: 5,
    tier: 3,
    ability: 'wake',
    abilityName: 'Wake',
    abilityText: 'When it sinks, it deals one automatic hit to a random enemy occupied cell.',
  },
};

export const SHIP_IDS = Object.keys(SHIPS);

export function shipsOfTiers(tiers: number[]): ShipDef[] {
  return SHIP_IDS.map((id) => SHIPS[id]).filter((s) => tiers.includes(s.tier));
}
