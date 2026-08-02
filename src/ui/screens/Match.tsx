import { useState } from 'react';
import { useGame } from '../../game/store';
import { other, type CellIndex, type TargetPayload } from '../../engine/types';
import { CARDS } from '../../content/cards';
import { SHIPS } from '../../content/ships';
import { MODIFIERS } from '../../content/modifiers';
import { cardUiState, isAvailable } from '../../engine/resolve/availability';
import { effectiveCost } from '../../engine/resolve/energy';
import { zoneFits } from '../../engine/resolve/shot';
import { Grid, enemyDecorator, ownDecorator, type CellDecoration } from '../components/Grid';
import { CardTile } from '../components/Card';
import { Art } from '../../art/Art';

/**
 * The match screen. Enemy grid dominates, tray is thumb-reachable, energy is
 * always visible, and the turn log tells the story in plain language.
 */
export function MatchScreen() {
  const {
    battle, humanSide, aiming, beginAiming, cancelAiming, tapCell,
    playCardWith, useAbility, endTurn, settings,
  } = useGame();
  const [peek, setPeek] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

  if (!battle) return null;
  const me = battle.players[humanSide];
  const foe = battle.players[other(humanSide)];
  const myTurn = battle.current === humanSide && battle.phase === 'battle';
  const mod = MODIFIERS[battle.modifierId];

  const aimCard = aiming ? me.tray.find((c) => c.uid === aiming.cardUid) : null;
  const aimDef = aimCard ? CARDS[aimCard.typeId] : null;
  const need = aimDef ? cellsRequired(aimDef.effect) : 0;
  const ready = aimDef ? canFire(aimDef.effect, aiming!.cells, battle.gridW, battle.gridH) : false;
  // Repair and decoy act on your own waters, so the aiming grid flips.
  const aimsOwn = aimDef ? ownGridCard(aimDef.effect) : false;

  const fire = () => {
    if (!aimCard || !aimDef || !aiming) return;
    const target = buildTarget(aimDef.effect, aiming.cells, battle.gridW, battle.gridH);
    if (!target) return;
    playCardWith(aimCard.uid, target);
  };

  return (
    <div className="screen">
      <div className="topbar">
        <h1>{foe.name}</h1>
        <span className="energy">
          <Art id="ui.energy" size={14} />
          {me.energy}
        </span>
        <span className="chip" data-on={myTurn ? 'true' : undefined}>
          {battle.phase === 'over' ? 'Over' : myTurn ? 'Your turn' : 'Waiting'}
        </span>
      </div>

      <div className="scroll" style={{ paddingBottom: 4 }}>
        <div className="panel" style={{ padding: 6, marginBottom: 6 }}>
          {aimsOwn ? (
            <>
              <div className="tiny dim" style={{ marginBottom: 4 }}>Your waters</div>
              <Grid
                w={battle.gridW}
                h={battle.gridH}
                terrain={battle.terrain}
                decorate={ownAimDecorator(battle, humanSide, aiming?.cells ?? [])}
                onCell={myTurn ? (c) => tapCell(c) : undefined}
                own
                label="Your waters"
              />
            </>
          ) : (
            <Grid
              w={battle.gridW}
              h={battle.gridH}
              terrain={battle.terrain}
              decorate={enemyDecorator(battle, humanSide, aiming?.cells ?? [])}
              onCell={aiming && myTurn ? (c) => tapCell(c) : undefined}
              label="Enemy waters"
            />
          )}
        </div>

        <div className="statRow" style={{ padding: '0 2px 6px' }}>
          <span className="tiny dim">{battle.seedName}</span>
          <span className="tiny" style={{ color: 'var(--violet)' }}>{mod?.name}</span>
          <button className="btn small ghost" onClick={() => setPeek((v) => !v)}>
            {peek ? 'Hide my waters' : 'My waters'}
          </button>
          <button className="btn small ghost" onClick={() => setLogOpen((v) => !v)}>
            Log
          </button>
        </div>

        {peek && (
          <div className="panel" style={{ padding: 6 }}>
            <Grid
              w={battle.gridW}
              h={battle.gridH}
              terrain={battle.terrain}
              decorate={ownDecorator(battle, humanSide)}
              own
              label="Your waters"
            />
          </div>
        )}

        {logOpen && (
          <div className="panel log">
            {battle.log
              .slice(-40)
              .reverse()
              .map((l, i) => (
                <div key={i} className="logLine" data-kind={l.kind}>
                  {l.text}
                </div>
              ))}
          </div>
        )}

        <EnemyIntel />
      </div>

      <div className="bottombar">
        {aiming && aimDef ? (
          <>
            <div className="statRow" style={{ marginBottom: 8 }}>
              <strong>{aimDef.name}</strong>
              <span className="small dim">{targetHint(aimDef.effect, aiming.cells.length, need)}</span>
            </div>
            <div className="btnRow">
              <button className="btn ghost" onClick={cancelAiming}>
                Cancel
              </button>
              <button className="btn primary" disabled={!ready} onClick={fire}>
                Fire
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="tray" style={{ marginBottom: 8 }}>
              {me.tray.map((card) => {
                const state = cardUiState(battle, me, card);
                return (
                  <CardTile
                    key={card.uid}
                    typeId={card.typeId}
                    state={state}
                    cost={effectiveCost(battle, me, CARDS[card.typeId])}
                    onClick={
                      myTurn && state === 'ready' ? () => beginAiming(card.uid) : undefined
                    }
                  />
                );
              })}
            </div>
            <Abilities onUse={useAbility} />
            <button className="btn wide" onClick={endTurn} disabled={!myTurn}>
              End turn
            </button>
          </>
        )}
      </div>
      {settings.colourblind && <span hidden />}
    </div>
  );
}

/** Once-per-match ship abilities, surfaced only when actually usable. */
function Abilities({ onUse }: { onUse: (shipUid: number, t: TargetPayload) => void }) {
  const { battle, humanSide } = useGame();
  if (!battle) return null;
  const me = battle.players[humanSide];
  const usable = me.ships.filter(
    (s) => !s.sunk && SHIPS[s.typeId].ability === 'swift' && !s.swiftUsed,
  );
  if (usable.length === 0) return null;
  return (
    <div className="btnRow" style={{ marginBottom: 8 }}>
      {usable.map((s) => (
        <button
          key={s.uid}
          className="btn small"
          onClick={() => onUse(s.uid, { shift: [0, 1] })}
        >
          Slip {SHIPS[s.typeId].name} east
        </button>
      ))}
    </div>
  );
}

/** What the player has legitimately learned about the enemy fleet. */
function EnemyIntel() {
  const { battle, humanSide } = useGame();
  if (!battle) return null;
  const me = battle.players[humanSide];
  const foe = battle.players[other(humanSide)];
  const revealed = foe.tray.filter((c) => c.revealed);
  return (
    <div className="panel">
      <h2>What you know</h2>
      <div className="small dim">
        {foe.name} fields {foe.ships.length} hull{foe.ships.length === 1 ? '' : 's'}.
      </div>
      <div className="small dim" style={{ marginBottom: 6 }}>
        {me.enemySunkLengths.length > 0 ? (
          <>Sunk so far: {me.enemySunkLengths.map((n) => `length ${n}`).join(', ')}.</>
        ) : (
          'Nothing confirmed sunk.'
        )}
      </div>
      <div className="tiny dim">Cards they have shown</div>
      <div className="chipRow">
        {revealed.length === 0 ? (
          <span className="chip">none yet</span>
        ) : (
          revealed.map((c) => (
            <span key={c.uid} className="chip" data-on={isAvailable(foe, c) ? 'true' : undefined}>
              {CARDS[c.typeId].name}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Targeting
// ---------------------------------------------------------------------------

/** Cards that act on your own waters rather than the enemy's. */
function ownGridCard(e: Effect): boolean {
  return e.kind === 'repair' || e.kind === 'decoy';
}

/** Your own grid, with the cells you are currently choosing highlighted. */
function ownAimDecorator(
  ms: Parameters<typeof ownDecorator>[0],
  viewer: Parameters<typeof ownDecorator>[1],
  aim: CellIndex[],
) {
  const base = ownDecorator(ms, viewer);
  return (cell: CellIndex): CellDecoration => ({ ...base(cell), aim: aim.includes(cell) });
}

type Effect = (typeof CARDS)[string]['effect'];

function cellsRequired(e: Effect): number {
  switch (e.kind) {
    case 'fire_cells':
      return e.count;
    case 'probe_line':
      return e.length;
    case 'decoy':
      return e.count;
    case 'fire_probe_adjacent':
    case 'probe_delayed':
    case 'repair':
      return 1;
    case 'fire_scatter':
    case 'fire_zone':
    case 'probe_zone_count':
    case 'reveal_zone':
    case 'fire_plus':
      return 1; // one tap picks the zone/centre
    case 'fire_torpedo':
    case 'fire_row_sweep':
    case 'fire_marked_column':
      return 1; // one tap picks the lane
    default:
      return 0;
  }
}

function canFire(e: Effect, cells: CellIndex[], w: number, h: number): boolean {
  const need = cellsRequired(e);
  if (cells.length !== need) return false;
  if (e.kind === 'fire_scatter' || e.kind === 'fire_zone' || e.kind === 'probe_zone_count' || e.kind === 'reveal_zone') {
    const zone = 'zone' in e ? e.zone : 3;
    return zoneFits(zoneOrigin(cells[0], zone, w, h), zone, w, h);
  }
  return true;
}

/** Clamp a tapped cell to a legal zone origin so the zone always fits. */
function zoneOrigin(cell: CellIndex, zone: number, w: number, h: number): CellIndex {
  const r = Math.min(Math.floor(cell / w), h - zone);
  const c = Math.min(cell % w, w - zone);
  return Math.max(0, r) * w + Math.max(0, c);
}

function buildTarget(e: Effect, cells: CellIndex[], w: number, h: number): TargetPayload | null {
  switch (e.kind) {
    case 'fire_cells':
    case 'probe_line':
    case 'decoy':
    case 'fire_probe_adjacent':
    case 'probe_delayed':
    case 'repair':
      return { cells };
    case 'fire_plus':
      return { origin: cells[0] };
    case 'fire_scatter':
    case 'fire_zone':
    case 'probe_zone_count':
    case 'reveal_zone': {
      const zone = 'zone' in e ? e.zone : 3;
      // Clamp the tap to a legal origin so aiming near an edge still works.
      return { origin: zoneOrigin(cells[0], zone, w, h) };
    }
    case 'fire_torpedo':
      return { line: { axis: 'col', index: cells[0] % w, dir: 1 } };
    case 'fire_row_sweep':
      return { line: { axis: 'row', index: Math.floor(cells[0] / w), dir: 1 } };
    case 'fire_marked_column':
      return { colIndex: cells[0] % w };
    case 'energy_delayed':
    case 'emp':
    case 'blockade':
      return {};
    default:
      return {};
  }
}

function targetHint(e: Effect, chosen: number, need: number): string {
  switch (e.kind) {
    case 'fire_torpedo':
      return 'Tap a column to run the torpedo down.';
    case 'fire_row_sweep':
      return 'Tap a row to sweep.';
    case 'fire_marked_column':
      return 'Tap a column you have already fired into.';
    case 'fire_scatter':
    case 'fire_zone':
    case 'probe_zone_count':
    case 'reveal_zone':
      return 'Tap the top-left of the zone.';
    case 'fire_plus':
      return 'Tap the centre of the cross.';
    case 'repair':
      return 'Tap a damaged cell of your own fleet.';
    case 'decoy':
      return `Tap ${need} empty cells of your own waters. (${chosen}/${need})`;
    default:
      return `Tap ${need} cell${need === 1 ? '' : 's'}. (${chosen}/${need})`;
  }
}
