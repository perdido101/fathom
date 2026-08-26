import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { CellIndex, FireSpec, Plan } from '../../engine/types';
import { BOARD, emptyPlan, label, xy } from '../../engine/types';
import { CARDS, canFireAt } from '../../engine/cards';
import { SHIPS } from '../../engine/ships';
import { useStore } from '../../state/store';
import { Board } from '../components/Board';
import { ChargeNumber } from '../components/ChargeNumber';
import { GameCard, CardBack, ShipCard } from '../components/GameCard';
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
 * The battle screen at 16:9.
 *
 * Their water is the biggest single thing on screen, centre-left. Your water
 * sits lower-right, smaller, showing what has come in. Your hand is three
 * real cards fanned at the bottom centre; the commit button is huge, green,
 * and bottom-right, because it is the one control that ends a round. The
 * stake rides the top bar in gold the whole match.
 *
 * Desktop means hover exists: moving over their water previews exactly the
 * cells the current declaration would strike before anything locks in.
 */
export function Battle(): ReactElement | null {
  const view = useStore((s) => s.view());
  const clock = useStore((s) => s.clock);
  const submitPlan = useStore((s) => s.submitPlan);
  const stake = useStore((s) => s.stake);
  const mode = useStore((s) => s.mode);
  const lastEvents = useStore((s) => s.lastRoundEvents);
  const playingBack = useStore((s) => s.playback !== null);

  const [basic, setBasic] = useState<CellIndex | null>(null);
  const [chargeTo, setChargeTo] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [fire, setFire] = useState<{ uid: number; spec: FireSpec } | null>(null);
  const [ability, setAbility] = useState<{ defId: string; spec: FireSpec } | null>(null);
  const [firingUid, setFiringUid] = useState<number | null>(null);
  const [hoverCell, setHoverCell] = useState<CellIndex | null>(null);
  const [wipe, setWipe] = useState(false);

  const round = view?.round ?? 0;
  const lastRound = useRef(round);
  useEffect(() => {
    if (round === lastRound.current) return undefined;
    lastRound.current = round;
    setWipe(true);
    const id = setTimeout(() => setWipe(false), 520);
    return () => clearTimeout(id);
  }, [round]);

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
  const roundSeconds = 20;

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
      ? specCells(fire.spec, view.me.hand.find((c) => c.uid === fire.uid)?.defId ?? '')
      : []),
    ...(ability ? specCells(ability.spec, ability.defId) : []),
  ];

  // The hover preview: the exact cells the current declaration would strike
  // if the next click landed here. Basic aiming previews its single cell via
  // the cell's own hover ring, so this only fires while a card is aiming.
  const hoverPreview = useMemo((): CellIndex[] => {
    if (hoverCell === null || !draft) return [];
    const shape = shapeOf(draft, innerDefId);
    if (shape === 'cell' || shape === 'block' || shape === 'row') {
      return previewCells({ ...draft, cells: [hoverCell] }, draftCharges, innerDefId);
    }
    if (shape === 'line' && draft.cells.length === 0) return [hoverCell];
    if (shape === 'cells' || shape === 'beacon') return [hoverCell];
    return [];
  }, [hoverCell, draft, draftCharges, innerDefId]);

  function reset(): void {
    setBasic(null);
    setChargeTo(null);
    setDraft(null);
    setFire(null);
    setAbility(null);
    setHoverCell(null);
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
    const spec = toSpec(draft, draftCharges, innerDefId, innerSpec(draft, draftCharges, innerDefId));
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

  const chargeReady = blocked.noCharge || chargeTo !== null || me.hand.length === 0;
  const ready = chargeReady && !draft;
  const warn = clock <= 5;
  const foeBank = foe.hand.reduce((n, c) => n + c.charges, 0);

  const collidedCards = new Set(
    view.cardDraft.collisions
      .map((c, i) => (c ? view.cardDraft.myPicks[i] : null))
      .filter((x): x is string => x !== null),
  );

  return (
    <div
      className="battle-grid"
      style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) clamp(360px, 26vw, 470px)',
        gridTemplateRows: '64px 86px minmax(0, 1fr) clamp(240px, 27vh, 300px)',
        gridTemplateAreas: `
          "top top"
          "foestrip foestrip"
          "enemy side"
          "hand commit"
        `,
        gap: '10px 16px',
        padding: '12px 18px 16px',
        minHeight: 0,
        position: 'relative',
      }}
    >
      {/* --- top bar: round, hull pips, the big timer, the stake ----------- */}
      <div
        className="panel tight"
        style={{
          gridArea: 'top',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          paddingRight: 300, // the wallet chip lives above this corner
        }}
      >
        <span className="pill">
          Round {view.round}/{view.roundCap}
        </span>
        <HullPips label="You" value={me.hullRemaining} colour="var(--confirm)" />
        <div className="spacer" />
        <span
          className={`big-num ${warn ? 'timer-hot' : ''}`}
          style={{ fontSize: 40, color: warn ? 'var(--danger)' : undefined }}
        >
          {playingBack ? '—' : `${clock}`}
        </span>
        <div className="spacer" />
        <HullPips label={foe.name} value={foe.hullRemaining} colour="var(--danger)" />
        {mode === 'arena' || mode === 'tournament' ? (
          <span className="pill gold" style={{ fontSize: 16 }}>
            ◎ {(stake * (mode === 'tournament' ? 8 : 2)).toFixed(2)} pot
          </span>
        ) : (
          <span className="pill">{mode}</span>
        )}
      </div>

      {/* --- opponent strip: their hand and their fleet, honestly ---------- */}
      <div
        className="panel tight"
        style={{ gridArea: 'foestrip', display: 'flex', alignItems: 'center', gap: 14 }}
      >
        <span style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: 15 }}>
          {foe.name}
          {!foe.connected && ' · away'}
        </span>
        <div className="row" style={{ gap: 8 }}>
          {foe.ships.map((s, i) => (
            <span key={i} className={s.defId ? `flip${s.sunk ? ' react' : ''}` : undefined}>
              <ShipCard
                defId={s.defId}
                length={s.length}
                revealed={s.defId !== null}
                sunk={s.sunk}
                used={s.abilityUsed}
                size="sm"
              />
            </span>
          ))}
        </div>
        <div className="spacer" />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-dim)' }}>
          {foe.cardCount} cards · bank{' '}
          <ChargeNumber value={foeBank} size={18} style={{ color: 'var(--gold-deep)' }} />
        </span>
        <div className="row" style={{ gap: 10 }}>
          {foe.hand.map((c) => {
            const known = c.defId !== null && collidedCards.has(c.defId);
            const taking = draft?.from.find((f) => f.uid === c.uid)?.amount ?? 0;
            return (
              <button
                key={c.uid}
                onClick={() => onEnemyCardTap(c.uid)}
                aria-label={known && c.defId ? CARDS[c.defId].name : 'face-down enemy card'}
                style={{
                  position: 'relative',
                  width: 44,
                  height: 62,
                  borderRadius: 8,
                  border: `2px solid ${taking ? 'var(--gold)' : 'rgba(255,255,255,0.7)'}`,
                  overflow: 'visible',
                  boxShadow: 'var(--shadow-soft)',
                  flex: 'none',
                  padding: 0,
                }}
              >
                {known && c.defId ? (
                  <span
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: 6,
                      background: 'var(--panel)',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 8,
                      fontWeight: 800,
                      fontFamily: 'var(--display)',
                      color: 'var(--ink)',
                      padding: 2,
                      textAlign: 'center',
                    }}
                  >
                    {CARDS[c.defId].name}
                  </span>
                ) : (
                  <CardBack />
                )}
                <span
                  className="gem small"
                  style={{ position: 'absolute', right: -8, bottom: -8, fontSize: 13 }}
                >
                  {c.charges}
                </span>
                {taking > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: -10,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      fontFamily: 'var(--display)',
                      fontWeight: 800,
                      color: 'var(--danger)',
                      fontSize: 14,
                    }}
                  >
                    −{taking}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* --- their water: the dominant element ----------------------------- */}
      <div
        style={{
          gridArea: 'enemy',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 0,
        }}
      >
        <div style={{ width: 'min(100%, 56vh)', minWidth: 320 }}>
          <Board
            marks={me.marks}
            known={me.knownShipCells}
            aim={draft ? [...aimCells, ...hoverPreview] : committedAim}
            pick={basic}
            onCell={onEnemyCell}
            onHoverCell={draft ? setHoverCell : undefined}
            flash={playingBack ? shots.mine : []}
          />
        </div>
      </div>

      {/* --- side column: prompt, your fleet, your water ------------------- */}
      <div style={{ gridArea: 'side', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
        <div className="panel tight" style={{ minHeight: 92 }}>
          {draft ? (
            <div className="col" style={{ gap: 8 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong style={{ fontFamily: 'var(--display)', fontSize: 16 }}>
                  {draft.aiming.kind === 'card'
                    ? CARDS[draft.aiming.defId].name
                    : SHIPS[draft.aiming.defId].name}
                </strong>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-dim)' }}>
                  {prompt(draft, draftCharges, innerDefId)}
                </span>
              </div>
              {shapeOf(draft, innerDefId) === 'line' && draft.cells.length > 0 && (
                <div className="row">
                  {(
                    [
                      ['→', [1, 0]],
                      ['←', [-1, 0]],
                      ['↓', [0, 1]],
                      ['↑', [0, -1]],
                    ] as [string, [number, number]][]
                  ).map(([name, dir]) => (
                    <button
                      key={name}
                      className="btn small"
                      style={{ flex: 1 }}
                      onClick={() => setDraft({ ...draft, dir })}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
              <div className="row">
                <button className="btn small ghost" style={{ flex: 1 }} onClick={() => setDraft(null)}>
                  Cancel
                </button>
                <button
                  className="btn small go"
                  style={{ flex: 2 }}
                  disabled={!isComplete(draft, innerDefId)}
                  onClick={confirmDraft}
                >
                  Lock in
                </button>
              </div>
            </div>
          ) : (
            <div className="col" style={{ gap: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-dim)' }}>
                {blocked.noCharge && 'Blacked out — no charge this round. '}
                {blocked.noFire && 'Locked — no card may be fired this round. '}
                {basic === null
                  ? 'Click their water to aim your free shot.'
                  : `Free shot: ${label(basic)}.`}
                {chargeTo === null && !blocked.noCharge ? ' Charge a card below.' : ''}
              </span>
              <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                {fire && (
                  <button className="pill" onClick={() => setFire(null)}>
                    Firing {CARDS[me.hand.find((c) => c.uid === fire.uid)?.defId ?? '']?.name} ✕
                  </button>
                )}
                {ability && (
                  <button className="pill" onClick={() => setAbility(null)}>
                    {SHIPS[ability.defId].name} ✕
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {me.ships.map((s) => {
            const def = SHIPS[s.defId];
            const usable = !s.sunk && !s.abilityUsed && def.type !== 'REACT';
            return (
              <ShipCard
                key={s.defId}
                defId={s.defId}
                length={s.length}
                sunk={s.sunk}
                used={s.abilityUsed}
                selected={ability?.defId === s.defId}
                size="sm"
                onClick={() => usable && beginAbility(s.defId)}
              />
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', minHeight: 0, flex: 1 }}>
          <div style={{ width: 'min(100%, 30vh)', marginLeft: 'auto' }}>
            <Board
              marks={foe.marks}
              hulls={me.ships}
              compact
              flash={playingBack ? shots.theirs : []}
              sinking={
                playingBack ? me.ships.filter((sh) => sh.sunk).flatMap((sh) => sh.cells) : []
              }
            />
            <p style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, marginTop: 4 }}>
              Your waters · hull {me.hullRemaining}/9
            </p>
          </div>
        </div>
      </div>

      {/* --- your hand: real cards, fanned --------------------------------- */}
      <div
        style={{
          gridArea: 'hand',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-end',
          gap: 4,
          paddingBottom: 6,
        }}
      >
        {me.hand.map((c, i) => {
          const withCharge = c.charges + (chargeTo === c.uid ? 1 : 0);
          const firable = !blocked.noFire && canFireAt(c.defId, withCharge);
          const mid = (me.hand.length - 1) / 2;
          const angle = (i - mid) * 4;
          const lift = Math.abs(i - mid) * 10;
          return (
            <div
              key={c.uid}
              className="hand-slot"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                transform: `rotate(${angle}deg) translateY(${lift}px)`,
                transition: 'transform var(--t-fast)',
                zIndex: chargeTo === c.uid || fire?.uid === c.uid ? 2 : 1,
              }}
            >
              <GameCard
                defId={c.defId}
                charges={withCharge}
                size="md"
                selected={chargeTo === c.uid || fire?.uid === c.uid || draft?.innerUid === c.uid}
                pulse={chargeTo === c.uid}
                onClick={() => onOwnCardTap(c.uid)}
                className={`hand-card ${firingUid === c.uid ? 'card-firing' : ''}`}
                style={{
                  transform: fire?.uid === c.uid ? 'translateY(-14px)' : undefined,
                  boxShadow:
                    fire?.uid === c.uid
                      ? '0 0 26px rgba(255,197,49,0.75), var(--shadow-soft)'
                      : undefined,
                }}
              />
              <div className="row" style={{ gap: 6 }}>
                <button
                  className="btn small"
                  disabled={blocked.noCharge}
                  onClick={() => {
                    setChargeTo(c.uid);
                    // The click's pitch rises with the count the card will hold.
                    Sound.play('charge-placed', { rate: 1 + 0.09 * Math.min(withCharge, 8) });
                  }}
                >
                  Charge
                </button>
                <button
                  className="btn small gold"
                  disabled={!firable || fire !== null}
                  onClick={() => beginCard(c.uid, c.defId, c.charges)}
                >
                  Fire
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* --- commit: the most prominent control in the game ---------------- */}
      <div
        style={{
          gridArea: 'commit',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          alignItems: 'stretch',
          gap: 10,
          paddingBottom: 6,
        }}
      >
        <div className={`timer-bar ${warn ? 'warn' : ''}`}>
          <i style={{ width: `${Math.max(0, (clock / roundSeconds) * 100)}%` }} />
        </div>
        <button className="btn go huge" disabled={!ready} onClick={commit}>
          {playingBack ? (
            <span className="thinking">
              THEY ARE PLANNING <i />
              <i />
              <i />
            </span>
          ) : (
            `COMMIT · ${clock}s`
          )}
        </button>
      </div>

      {wipe && <div className="round-wipe" />}
    </div>
  );
}

/** Nine hull cells as pips, filled while they stand. */
function HullPips({
  label: who,
  value,
  colour,
}: {
  label: string;
  value: number;
  colour: string;
}): ReactElement {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: 14 }}>{who}</span>
      <span style={{ display: 'flex', gap: 3 }}>
        {Array.from({ length: 9 }, (_, i) => (
          <i
            key={i}
            style={{
              width: 10,
              height: 14,
              borderRadius: 3,
              background: i < value ? colour : 'rgba(18,58,94,0.15)',
              border: '2px solid rgba(255,255,255,0.7)',
            }}
          />
        ))}
      </span>
    </span>
  );
}

/** Cells a locked-in declaration covers, for the confirmed-aim overlay. */
function specCells(spec: FireSpec, defId: string): CellIndex[] {
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
