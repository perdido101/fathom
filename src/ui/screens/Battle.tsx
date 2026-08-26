import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { CellIndex, FireSpec, Plan } from '../../engine/types';
import { BOARD, emptyPlan, label, xy } from '../../engine/types';
import { CARDS, canFireAt } from '../../engine/cards';
import { SHIPS } from '../../engine/ships';
import { useStore } from '../../state/store';
import { Board } from '../components/Board';
import { ChargeNumber } from '../components/ChargeNumber';
import { CardArt, ShipArt } from '../art/registry';
import { Sound } from '../sfx/SoundManager';
import {
  bumpAllocation,
  isComplete,
  newDraft,
  previewCells,
  prompt,
  shapeOf,
  toSpec,
  wantsCells,
  type Draft,
} from '../targeting';

/**
 * The battle screen.
 *
 * Layout follows the brief exactly: their water dominant at the top, your
 * water smaller underneath, your cards along the bottom with charge numbers
 * big enough to read at a glance, their cards along the top with theirs. The
 * charges are the loudest thing on the screen because they are the game.
 */
export function Battle(): ReactElement | null {
  const view = useStore((s) => s.view());
  const clock = useStore((s) => s.clock);
  const submitPlan = useStore((s) => s.submitPlan);
  const roundSeconds = useStore((s) => s.match?.config.roundSeconds ?? 20);
  const lastEvents = useStore((s) => s.lastRoundEvents);
  const playingBack = useStore((s) => s.playback !== null);

  const [basic, setBasic] = useState<CellIndex | null>(null);
  const [chargeTo, setChargeTo] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [fire, setFire] = useState<{ uid: number; spec: FireSpec } | null>(null);
  const [ability, setAbility] = useState<{ defId: string; spec: FireSpec } | null>(null);
  const [firingUid, setFiringUid] = useState<number | null>(null);
  const [wipe, setWipe] = useState(false);

  // A short wipe between rounds. Without it the board simply changes under the
  // player's hands and the round boundary is invisible.
  const round = view?.round ?? 0;
  const lastRound = useRef(round);
  useEffect(() => {
    if (round === lastRound.current) return undefined;
    lastRound.current = round;
    setWipe(true);
    const id = setTimeout(() => setWipe(false), 520);
    return () => clearTimeout(id);
  }, [round]);

  // What resolved last round, taken from the engine's own event list so the
  // board can only ever animate something that actually happened.
  const shots = useMemo(() => {
    const mine: { cell: CellIndex; hit: boolean }[] = [];
    const theirs: { cell: CellIndex; hit: boolean }[] = [];
    for (const e of lastEvents) {
      if (e.t !== 'shot') continue;
      (e.by === (view?.you ?? 0) ? mine : theirs).push({ cell: e.cell, hit: e.hit });
    }
    return { mine, theirs };
  }, [lastEvents, view?.you]);

  const innerDefId = useMemo(() => {
    if (!draft || draft.innerUid === null || !view) return undefined;
    return view.me.hand.find((c) => c.uid === draft.innerUid)?.defId;
  }, [draft, view]);

  if (!view) return null;
  const { me, foe } = view;
  const blocked = me.restrictions;

  const draftCharges =
    draft?.aiming.kind === 'card'
      ? draft.aiming.charges
      : innerDefId
        ? (view.me.hand.find((c) => c.uid === draft?.innerUid)?.charges ?? 0) +
          (chargeTo === draft?.innerUid ? 1 : 0) +
          3
        : 0;

  const aimCells = draft ? previewCells(draft, draftCharges, innerDefId) : [];
  const committedAim = [
    ...(fire
      ? specCells(
          fire.spec,
          view.me.hand.find((c) => c.uid === fire.uid)?.defId ?? '',
          chargeTo === fire.uid,
        )
      : []),
    ...(ability ? specCells(ability.spec, ability.defId, false) : []),
  ];

  function reset(): void {
    setBasic(null);
    setChargeTo(null);
    setDraft(null);
    setFire(null);
    setAbility(null);
  }

  function onEnemyCell(cell: CellIndex): void {
    if (!draft) {
      setBasic(cell);
      Sound.play('basic-attack');
      return;
    }
    const shape = shapeOf(draft, innerDefId);
    if (shape === 'beacon' && (draft.row === null || draft.col === null)) {
      const [x, y] = xy(cell);
      setDraft({ ...draft, row: y, col: x });
      return;
    }
    const want = wantsCells(draft, innerDefId);
    if (want <= 0) return;
    if (want === 1) {
      setDraft({ ...draft, cells: [cell] });
      return;
    }
    const already = draft.cells.includes(cell);
    const cells = already
      ? draft.cells.filter((c) => c !== cell)
      : draft.cells.length >= want
        ? [...draft.cells.slice(1), cell]
        : [...draft.cells, cell];
    setDraft({ ...draft, cells });
  }

  function beginCard(uid: number, defId: string, charges: number): void {
    if (blocked.noFire) return;
    const withCharge = charges + (chargeTo === uid ? 1 : 0);
    if (!canFireAt(defId, withCharge)) return;
    if (blocked.chargeLock !== null && withCharge === blocked.chargeLock) return;
    setDraft(newDraft({ kind: 'card', uid, defId, charges: withCharge }));
  }

  function beginAbility(defId: string): void {
    const d = newDraft({ kind: 'ability', defId });
    if (SHIPS[defId].shape === 'none') {
      setAbility({ defId, spec: { shape: 'none' } });
      Sound.play('ability-activated');
      return;
    }
    setDraft(d);
  }

  function confirmDraft(): void {
    if (!draft) return;
    const spec = toSpec(
      draft,
      draftCharges,
      innerDefId,
      innerSpec(draft, draftCharges, innerDefId),
    );
    if (draft.aiming.kind === 'card') {
      setFire({ uid: draft.aiming.uid, spec });
      Sound.play('card-fired');
    } else {
      setAbility({
        defId: draft.aiming.defId,
        spec: wrapAbility(draft, spec, innerDefId, draftCharges),
      });
      Sound.play('ability-activated');
    }
    setDraft(null);
  }

  function commit(): void {
    if (fire) {
      setFiringUid(fire.uid);
      setTimeout(() => setFiringUid(null), 520);
    }
    const plan: Plan = {
      ...emptyPlan(),
      chargeTo: blocked.noCharge ? null : chargeTo,
      bonusTo: me.hand.find((c) => c.uid !== fire?.uid)?.uid ?? chargeTo,
      fire,
      ability,
      basic,
    };
    submitPlan(plan);
    reset();
  }

  const chargeReady = blocked.noCharge || chargeTo !== null || me.hand.length === 0;
  const ready = chargeReady && !draft;
  const warn = clock <= 5;

  return (
    <div className="screen" style={{ gap: 8, paddingBottom: 8 }}>
      {/* --- their side ---------------------------------------------------- */}
      {/* Everything the rules make public about them, in one row. A player
          should never have to count hits on the board to work out how close
          the opponent is to going down. */}
      <div className="row" style={{ justifyContent: 'space-between', gap: 6 }}>
        <span className="pill">
          round {view.round}/{view.roundCap}
        </span>
        <span className="pill" style={{ flex: 1, textAlign: 'center' }}>
          {foe.name}
          {!foe.connected && ' · away'}
        </span>
        <span className="pill mono" title="their hull cells left">
          hull {foe.hullRemaining}/9
        </span>
        <span className="pill mono" title="their banked charges">
          <ChargeNumber value={foe.hand.reduce((n, c) => n + c.charges, 0)} size={15} />
        </span>
      </div>

      <div className="row" style={{ gap: 6 }}>
        {foe.ships.map((s, i) => (
          <div key={i} className="row" style={{ gap: 4, opacity: s.sunk ? 0.35 : 1 }}>
            <span className={s.defId ? `flip${s.sunk ? ' react' : ''}` : undefined}>
              <ShipArt defId={s.defId} length={s.length} revealed={s.defId !== null} size={16} />
            </span>
            <span style={{ fontSize: 10, color: 'var(--ink-faint)' }}>
              {s.sunk ? 'sunk' : s.defId ? (s.abilityUsed ? 'spent' : SHIPS[s.defId].type) : '?'}
            </span>
          </div>
        ))}
        <div className="spacer" />
        <span style={{ fontSize: 9, color: 'var(--ink-faint)' }}>{foe.cardCount} cards</span>
        <div className="row" style={{ gap: 4 }}>
          {foe.hand.map((c) => (
            <button
              key={c.uid}
              onClick={() => onEnemyCardTap(c.uid)}
              style={{
                width: 30,
                height: 40,
                borderRadius: 6,
                border: `1px solid ${allocationFor(draft, c.uid) ? 'var(--charge)' : 'var(--panel-edge)'}`,
                background: 'repeating-linear-gradient(135deg,#16233a 0 5px,#1b2a44 5px 10px)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <ChargeNumber value={c.charges} size={16} />
              {allocationFor(draft, c.uid) ? (
                <span style={{ fontSize: 9, color: 'var(--danger)' }}>
                  -{allocationFor(draft, c.uid)}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {/* Their water is the dominant element, but it still has to leave room
          for the hand — a charge number you have to scroll to is not public
          information in any useful sense. */}
      <div style={{ width: '100%', maxWidth: 320, alignSelf: 'center' }}>
        <Board
          marks={me.marks}
          known={me.knownShipCells}
          aim={draft ? aimCells : committedAim}
          pick={basic}
          onCell={onEnemyCell}
          flash={playingBack ? shots.mine : []}
        />
      </div>

      {/* --- prompt / actions ---------------------------------------------- */}
      <div className="card-surface" style={{ padding: 10 }}>
        {draft ? (
          <div className="col" style={{ gap: 8 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong style={{ fontSize: 13 }}>
                {draft.aiming.kind === 'card'
                  ? CARDS[draft.aiming.defId].name
                  : SHIPS[draft.aiming.defId].name}
              </strong>
              <span style={{ fontSize: 12, color: 'var(--ink-dim)' }}>
                {prompt(draft, draftCharges, innerDefId)}
              </span>
            </div>
            {shapeOf(draft, innerDefId) === 'line' && draft.cells.length > 0 && (
              <div className="row">
                {(
                  [
                    ['right', [1, 0]],
                    ['left', [-1, 0]],
                    ['down', [0, 1]],
                    ['up', [0, -1]],
                  ] as [string, [number, number]][]
                ).map(([name, dir]) => (
                  <button
                    key={name}
                    className="btn"
                    style={{ flex: 1, padding: 8, fontSize: 12 }}
                    onClick={() => setDraft({ ...draft, dir })}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
            <div className="row">
              <button className="btn ghost" style={{ flex: 1 }} onClick={() => setDraft(null)}>
                cancel
              </button>
              <button
                className="btn go"
                style={{ flex: 2 }}
                disabled={!isComplete(draft, innerDefId)}
                onClick={confirmDraft}
              >
                lock in
              </button>
            </div>
          </div>
        ) : (
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--ink-dim)', flex: 1 }}>
              {blocked.noCharge && 'Blacked out — no charge this round. '}
              {blocked.noFire && 'Pinned — no card may be fired. '}
              {blocked.chargeLock !== null && `Cards on exactly ${blocked.chargeLock} are locked. `}
              {basic === null
                ? 'Tap their water to aim your free shot.'
                : `Free shot: ${label(basic)}`}
              {chargeTo === null && !blocked.noCharge ? ' Tap a card to charge it.' : ''}
            </span>
            {fire && (
              <button className="pill" onClick={() => setFire(null)}>
                firing {CARDS[me.hand.find((c) => c.uid === fire.uid)?.defId ?? '']?.name} x
              </button>
            )}
            {ability && (
              <button className="pill" onClick={() => setAbility(null)}>
                {SHIPS[ability.defId].name} x
              </button>
            )}
          </div>
        )}
      </div>

      {/* --- your side ------------------------------------------------------ */}
      <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
        <div className="col" style={{ width: '42%', gap: 4 }}>
          <Board
            marks={foe.marks}
            hulls={me.ships}
            compact
            flash={playingBack ? shots.theirs : []}
            sinking={playingBack ? me.ships.filter((sh) => sh.sunk).flatMap((sh) => sh.cells) : []}
          />
          <span style={{ fontSize: 10, color: 'var(--ink-dim)', textAlign: 'center' }}>
            your hull {me.hullRemaining}/9
          </span>
        </div>
        <div className="col" style={{ flex: 1, gap: 6 }}>
          {me.ships.map((s) => {
            const def = SHIPS[s.defId];
            const usable = !s.sunk && !s.abilityUsed && def.type !== 'REACT';
            return (
              <button
                key={s.defId}
                className="row"
                onClick={() => usable && beginAbility(s.defId)}
                style={{
                  gap: 6,
                  padding: 5,
                  borderRadius: 8,
                  border: `1px solid ${ability?.defId === s.defId ? 'var(--charge)' : 'var(--panel-edge)'}`,
                  opacity: s.sunk ? 0.3 : usable ? 1 : 0.55,
                  textAlign: 'left',
                }}
              >
                <ShipArt defId={s.defId} length={1} size={16} />
                <span
                  className={s.abilityUsed || s.sunk ? 'flip' : undefined}
                  style={{ fontSize: 11, flex: 1 }}
                >
                  {def.name}
                </span>
                <span style={{ fontSize: 9, color: 'var(--ink-faint)' }}>
                  {s.sunk ? 'sunk' : s.abilityUsed ? 'spent' : def.type}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="row" style={{ gap: 6 }}>
        {me.hand.map((c) => {
          const withCharge = c.charges + (chargeTo === c.uid ? 1 : 0);
          const firable =
            !blocked.noFire &&
            canFireAt(c.defId, withCharge) &&
            !(blocked.chargeLock !== null && withCharge === blocked.chargeLock);
          return (
            <div key={c.uid} className="col" style={{ flex: 1, gap: 4, minWidth: 0 }}>
              <CardArt
                defId={c.defId}
                charges={withCharge}
                selected={chargeTo === c.uid || fire?.uid === c.uid || draft?.innerUid === c.uid}
                onClick={() => onOwnCardTap(c.uid)}
                compact
                className={firingUid === c.uid ? 'card-firing' : undefined}
                style={{
                  aspectRatio: 'auto',
                  height: 104,
                  // A card queued to fire sits proud of the others, so the
                  // commitment is visible without reading the status line.
                  transform: fire?.uid === c.uid ? 'translateY(-6px)' : undefined,
                  boxShadow: fire?.uid === c.uid ? '0 0 18px -2px var(--charge-glow)' : undefined,
                }}
              />
              <div className="row" style={{ gap: 4 }}>
                <button
                  className="btn"
                  style={{ flex: 1, padding: 6, fontSize: 10 }}
                  disabled={blocked.noCharge}
                  onClick={() => {
                    setChargeTo(c.uid);
                    Sound.play('charge-placed');
                  }}
                >
                  charge
                </button>
                <button
                  className="btn"
                  style={{ flex: 1, padding: 6, fontSize: 10 }}
                  disabled={!firable || fire !== null}
                  onClick={() => beginCard(c.uid, c.defId, c.charges)}
                >
                  fire
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className={`timer-bar ${warn ? 'warn' : ''}`}>
        <i style={{ width: `${Math.max(0, (clock / roundSeconds) * 100)}%` }} />
      </div>
      <button className="btn go" disabled={!ready} onClick={commit}>
        {playingBack ? (
          <span className="thinking">
            they are planning <i />
            <i />
            <i />
          </span>
        ) : (
          `commit — ${clock}s`
        )}
      </button>
      {wipe && <div className="round-wipe" />}
    </div>
  );

  // --- tap handlers that need the closures above ---------------------------

  function onOwnCardTap(uid: number): void {
    if (!draft) return;
    const shape = shapeOf(draft, innerDefId);
    if (shape === 'steal') {
      setDraft({ ...draft, toUid: uid });
      return;
    }
    if (draft.aiming.kind === 'ability' && SHIPS[draft.aiming.defId].shape === 'kiln') {
      setDraft({ ...draft, innerUid: uid, cells: [], dir: null });
    }
  }

  function onEnemyCardTap(uid: number): void {
    if (!draft) return;
    const shape = shapeOf(draft, innerDefId);
    if (shape !== 'strip' && shape !== 'steal') return;
    const budget = draft.aiming.kind === 'card' ? draft.aiming.charges : 3;
    const available = foe.hand.find((c) => c.uid === uid)?.charges ?? 0;
    setDraft({ ...draft, from: bumpAllocation(draft.from, uid, budget, available) });
    Sound.play('charges-stolen');
  }
}

function allocationFor(draft: Draft | null, uid: number): number {
  if (!draft) return 0;
  return draft.from.find((f) => f.uid === uid)?.amount ?? 0;
}

/** Cells a locked-in declaration covers, for the confirmed-aim overlay. */
function specCells(spec: FireSpec, defId: string, _charged: boolean): CellIndex[] {
  switch (spec.shape) {
    case 'cells':
      return spec.cells;
    case 'cell':
      return [spec.cell];
    case 'beacon':
      return spec.cells;
    case 'block':
      return blockCells(spec.anchor, defId === 'burst' ? 2 : 2);
    case 'row':
      return [spec.origin];
    case 'line':
      return [spec.origin];
    default:
      return [];
  }
}

function blockCells(anchor: CellIndex, size: number): CellIndex[] {
  const [x, y] = xy(anchor);
  const out: CellIndex[] = [];
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      if (x + dx < BOARD && y + dy < BOARD) out.push((y + dy) * BOARD + (x + dx));
    }
  }
  return out;
}

/** Kiln's declaration wraps the card it fires. */
function wrapAbility(draft: Draft, spec: FireSpec, innerDefId?: string, charges = 0): FireSpec {
  if (draft.aiming.kind !== 'ability') return spec;
  if (SHIPS[draft.aiming.defId].shape !== 'kiln') return spec;
  return {
    shape: 'kiln',
    uid: draft.innerUid ?? 0,
    inner: innerSpec(draft, charges, innerDefId) ?? spec,
  };
}

function innerSpec(draft: Draft, charges: number, innerDefId?: string): FireSpec | undefined {
  if (!innerDefId) return undefined;
  return toSpec(
    { ...draft, aiming: { kind: 'card', uid: draft.innerUid ?? 0, defId: innerDefId, charges } },
    charges,
  );
}
