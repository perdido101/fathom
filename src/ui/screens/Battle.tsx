import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { CellIndex, FireSpec, Plan } from '../../engine/types';
import { BOARD, emptyPlan, label, xy } from '../../engine/types';
import { CARDS, canFireAt } from '../../engine/cards';
import { SHIPS } from '../../engine/ships';
import { useStore } from '../../state/store';
import { Board } from '../components/Board';
import { GameCard, CardBack, ShipCard } from '../components/GameCard';
import { Sound } from '../sfx/SoundManager';
import { WhyNot } from '../feedback/Feedback';
import { whyCannotCommit, whyCannotFire } from '../feedback/reasons';
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
 * Their water is the biggest single thing on screen and the only place you
 * act. Your water is smaller and sits with the rest of your world below the
 * division, showing what has come in rather than offering anywhere to click.
 *
 * Build 6 took things away rather than adding them. The duplicate hull
 * readout, the second timer, the opponent's card count, the panel under the
 * prompt and four of the six hand buttons are all gone — every one of them
 * said something the screen already said elsewhere. What is left says each
 * fact once: the clock owns time, the pips own hull, the gems own charges,
 * and a card carries its own control only while the pointer is on it.
 *
 * Build 7 then rebuilt the arrangement around the thing removing that hull
 * caption exposed: **the screen never communicated ownership.** It had said
 * so in one string, and the string was a patch over a layout in which your
 * board was upper-right, your ships middle-right, your hand bottom-left and
 * your commit bottom-right — four corners, no rule a player could infer, and
 * both boards the same blue.
 *
 * Vertical position now carries it. Everything above the division is theirs:
 * their water, their fleet, their hand. Everything below it is yours, in one
 * continuous cluster — your water, your ships, your hand, and the button that
 * commits them, which finally sits beside the cards it commits. The two
 * boards no longer share a colour, and the pair differs in lightness as well
 * as hue so the distinction survives a colourblind simulation.
 *
 * Nothing here is labelled "yours". That is the whole point.
 *
 * Build 8 finished the composition. Below the division everything already
 * read as one cluster; above it, their board sat in the middle with their
 * fleet and their hand stacked in a rail to its left — two rows of different
 * widths, aligned to nothing — and the entire right-hand flank held a single
 * line of text. Worse, that line was *"Click their water to aim your free
 * shot"*: an instruction to you, rendered in their territory, on a screen
 * whose whole argument is that the two halves belong to different people.
 *
 * Their fleet and their hand now flank the board as two columns of equal
 * width, each vertically centred on it. The prompt moved to your panel and
 * sits over your hand, next to the cards it talks about; and the aiming
 * panel, which holds Cancel and Lock in, took the commit slot — commit is
 * disabled for exactly as long as a declaration is open, so the control you
 * need replaces the control you cannot use, and nothing of yours is left
 * rendering above the line.
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
  const [hoverCard, setHoverCard] = useState<number | null>(null);
  const [wipe, setWipe] = useState(false);

  const round = view?.round ?? 0;
  const lastRound = useRef(round);
  useEffect(() => {
    if (round === lastRound.current) return undefined;
    lastRound.current = round;
    setWipe(true);
    const id = setTimeout(() => setWipe(false), 720);
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
    setHoverCard(null);
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
    // Everything this plan aimed at. The feedback layer needs it to put
    // BLOCKED on the cells a Mirror eats, because a cancelled attack fires no
    // shots and so leaves no trace at all in the event stream.
    const aim = [...committedAim, ...(basic === null ? [] : [basic])];
    submitPlan(plan, aim);
    reset();
  }

  /**
   * A click on one of your own cards.
   *
   * Charging is the default action, because it is the action a player takes
   * every single round without exception. The two aiming modes that need a
   * card as their *target* — Siphon's destination, Kiln's payload — take
   * precedence while they are aiming, and only while they are aiming.
   */
  function onOwnCardTap(uid: number, charges: number): void {
    if (draft) {
      const shape = shapeOf(draft, innerDefId);
      if (shape === 'steal') {
        setDraft({ ...draft, toUid: uid });
        return;
      }
      if (draft.aiming.kind === 'ability' && SHIPS[draft.aiming.defId].shape === 'kiln') {
        setDraft({ ...draft, innerUid: uid, cells: [], dir: null });
      }
      return;
    }
    if (blocked.noCharge) return;
    setChargeTo(uid);
    // The click's pitch rises with the count the card will hold.
    Sound.play('charge-placed', { rate: 1 + 0.09 * Math.min(charges + 1, 8) });
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
  const commitReason = whyCannotCommit(
    chargeTo !== null,
    blocked,
    draft !== null,
    me.hand.length === 0,
  );
  const warn = clock <= 5;

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
        // Three bands, and the middle one is the argument: everything above
        // the division belongs to them, everything below it to you.
        gridTemplateRows: '72px minmax(0, 1fr) clamp(340px, 38vh, 420px)',
        gap: 10,
        padding: '10px 16px 12px',
        minHeight: 0,
        position: 'relative',
      }}
    >
      {/* --- top bar: round, hull pips, the clock, the stake --------------- */}
      <div
        className="panel tight"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          paddingRight: 300, // the wallet chip lives above this corner
        }}
      >
        <span className="pill">
          Round&nbsp;<span className="num">{view.round}</span>
          <span style={{ color: 'var(--ink-faint)' }}>/{view.roundCap}</span>
        </span>
        {/* Their hull sits on the left with the rest of their world, yours on
            the right — the top bar reads the same way round as the screen. */}
        <HullPips label={foe.name} value={foe.hullRemaining} colour="var(--danger)" />
        <div className="spacer" />
        {/* The screen's one level-1 element. Every decision a player makes
            here is a decision about how to spend this number. */}
        <span
          className={`big-num ${warn ? 'timer-hot' : ''}`}
          style={{ fontSize: 'var(--fs-hero)', color: warn ? 'var(--danger)' : undefined }}
        >
          {playingBack ? '—' : `${clock}`}
        </span>
        <div className="spacer" />
        <HullPips label="You" value={me.hullRemaining} colour="var(--own)" />
        {mode === 'arena' || mode === 'tournament' ? (
          <span className="pill gold">
            ◎ {(stake * (mode === 'tournament' ? 8 : 2)).toFixed(2)} pot
          </span>
        ) : (
          <span className="pill">{mode}</span>
        )}
      </div>

      {/* ================= THEIR WORLD ==================================== */}
      <div
        className="their-region"
        style={{ gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)' }}
      >
        {/* Their fleet, in a column against the board's left edge — the same
            column your own fleet occupies below the division. */}
        <div className="foe-rail flank-end">
          <span className="foe-who">
            {foe.name}
            {!foe.connected && ' · away'}
          </span>
          {foe.ships.map((s, i) => (
            <span key={i} className={s.defId ? `flip${s.sunk ? ' react' : ''}` : undefined}>
              <ShipCard
                defId={s.defId}
                length={s.length}
                revealed={s.defId !== null}
                sunk={s.sunk}
                used={s.abilityUsed}
                size="md"
              />
            </span>
          ))}
        </div>

        {/* Their water: still the dominant element, and still where you act. */}
        <div style={{ display: 'grid', placeItems: 'center', minHeight: 0, height: '100%' }}>
          <div style={{ width: 'var(--foe-board)', minWidth: 320 }}>
            <Board
              side="foe"
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

        {/* Their hand, against the board's right edge. It sat under their
            fleet in one left-hand rail until Build 8, which left this whole
            flank holding one line of text that was not even theirs. */}
        <div className="foe-hand flank-start">
          {foe.hand.map((c) => {
            const known = c.defId !== null && collidedCards.has(c.defId);
            const taking = draft?.from.find((f) => f.uid === c.uid)?.amount ?? 0;
            return (
              <button
                key={c.uid}
                onClick={() => onEnemyCardTap(c.uid)}
                data-anchor={`card:foe:${c.uid}`}
                aria-label={known && c.defId ? CARDS[c.defId].name : 'face-down enemy card'}
                className={`foe-card ${taking ? 'taking' : ''}`}
              >
                {known && c.defId ? (
                  <span
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: 9,
                      background: 'var(--panel)',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 'var(--fs-body)',
                      fontWeight: 800,
                      fontFamily: 'var(--display)',
                      lineHeight: 1.02,
                      color: 'var(--ink)',
                      padding: 4,
                      textAlign: 'center',
                    }}
                  >
                    {CARDS[c.defId].name}
                  </span>
                ) : (
                  <CardBack />
                )}
                <span
                  className="gem small num"
                  style={{ position: 'absolute', right: -10, bottom: -10 }}
                >
                  {c.charges}
                </span>
                {taking > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: -12,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      fontFamily: 'var(--display)',
                      fontWeight: 800,
                      color: 'var(--danger)',
                      fontSize: 'var(--fs-body)',
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

      {/* ================= YOUR WORLD ===================================== */}
      <div
        className="your-region"
        style={{ gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)' }}
      >
        {/* Your water and your fleet, together, on your side of the line. */}
        <div className="own-rail flank-end">
          <div style={{ width: 'clamp(170px, 20vh, 215px)', flex: 'none' }}>
            <Board
              side="mine"
              marks={foe.marks}
              hulls={me.ships}
              compact
              flash={playingBack ? shots.theirs : []}
              sinking={playingBack ? me.ships.filter((sh) => sh.sunk).flatMap((sh) => sh.cells) : []}
            />
          </div>
          <div className="col" style={{ gap: 6 }}>
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
        </div>

        {/* Your hand: the primary decision object, and now sized like one. */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 6,
            minHeight: 0,
          }}
        >
          {me.hand.map((c, i) => {
            const withCharge = c.charges + (chargeTo === c.uid ? 1 : 0);
            const fireReason = whyCannotFire(c.defId, withCharge, blocked, fire !== null);
            const mid = (me.hand.length - 1) / 2;
            const angle = (i - mid) * 3;
            const lift = Math.abs(i - mid) * 8;
            return (
              <div
                key={c.uid}
                className="hand-slot"
                onMouseEnter={() => setHoverCard(c.uid)}
                onMouseLeave={() => setHoverCard((u) => (u === c.uid ? null : u))}
                style={{
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  transform: `rotate(${angle}deg) translateY(${lift}px)`,
                  transition: 'transform var(--t-fast)',
                  zIndex: chargeTo === c.uid || fire?.uid === c.uid || hoverCard === c.uid ? 3 : 1,
                }}
              >
                <GameCard
                  defId={c.defId}
                  charges={withCharge}
                  size="lg"
                  anchor={`card:me:${c.uid}`}
                  selected={chargeTo === c.uid || fire?.uid === c.uid || draft?.innerUid === c.uid}
                  pulse={chargeTo === c.uid}
                  onClick={() => onOwnCardTap(c.uid, c.charges)}
                  className={`hand-card ${firingUid === c.uid ? 'card-firing' : ''}`}
                  style={{
                    transform: fire?.uid === c.uid ? 'translateY(-12px)' : undefined,
                    boxShadow:
                      fire?.uid === c.uid
                        ? '0 0 26px rgba(255,197,49,0.75), var(--shadow-soft)'
                        : undefined,
                  }}
                />
                {/* One control, on one card, only while the pointer is on it.
                    Six buttons used to sit here permanently for three cards.
                    When the card cannot fire, the same slot says why — which
                    is the gap a disabled button left open for five builds. */}
                {hoverCard === c.uid && (
                  <div className="card-action">
                    {fireReason === null ? (
                      <button
                        className="btn small gold"
                        onClick={() => beginCard(c.uid, c.defId, c.charges)}
                      >
                        Fire · {withCharge}
                      </button>
                    ) : (
                      <span className="cant">{fireReason}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Commit, beside the hand it commits. It sat at the far end of the
            screen from the decision until Build 7 — eye travel a player made
            twenty times a match, every match.

            While a card or an ability is aiming, the aiming panel takes this
            slot instead. That is not a compromise for space: commit is
            *disabled* for exactly as long as a declaration is open, so the
            control you need replaces the control you cannot use, in the place
            you are already looking. It also moves the last thing of yours
            that was rendering in their half. */}
        <div
          className="flank-start col"
          style={{ justifyContent: 'center', gap: 10, paddingLeft: 18, width: 340 }}
        >
          {draft ? (
            /* Aiming is the one state here that earns a surface, because it
               holds controls. The idle prompt above does not, and lost its. */
            <div className="panel tight" style={{ width: '100%' }}>
              <div className="col" style={{ gap: 8 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <strong style={{ fontFamily: 'var(--display)', fontSize: 'var(--fs-body)' }}>
                    {draft.aiming.kind === 'card'
                      ? CARDS[draft.aiming.defId].name
                      : SHIPS[draft.aiming.defId].name}
                  </strong>
                  <span
                    style={{ fontSize: 'var(--fs-fine)', fontWeight: 700, color: 'var(--ink-dim)' }}
                  >
                    {prompt(draft, draftCharges, innerDefId)}
                  </span>
                </div>
                {shapeOf(draft, innerDefId) === 'beacon' &&
                  draft.row !== null &&
                  draft.axis === null && (
                    <div className="row">
                      <button
                        className="btn small"
                        style={{ flex: 1 }}
                        onClick={() => setDraft({ ...draft, axis: 'row' })}
                      >
                        Read row {draft.row + 1}
                      </button>
                      <button
                        className="btn small"
                        style={{ flex: 1 }}
                        onClick={() => setDraft({ ...draft, axis: 'col' })}
                      >
                        Read column {String.fromCharCode(65 + (draft.col ?? 0))}
                      </button>
                    </div>
                  )}
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
                  <button
                    className="btn small ghost"
                    style={{ flex: 1 }}
                    onClick={() => setDraft(null)}
                  >
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
            </div>
          ) : (
            <>
              {/* What your next click does, immediately above the control
                  that ends the round. This sentence was rendered in *their*
                  half until Build 8 — an instruction to you, in the
                  opponent's territory, on a screen whose whole argument is
                  that the two halves belong to different people.

                  It sits here rather than over the hand because the band
                  above the hand already belongs to the hovered card's own
                  affordance, and two things wanting the same 40 pixels is a
                  bug this screen has produced once already. */}
              <div className="col prompt-line" style={{ gap: 6 }}>
                <span>
                  {blocked.noCharge && 'Blacked out — no charge this round. '}
                  {blocked.noFire && 'Locked — no card may be fired this round. '}
                  {basic === null
                    ? 'Click their water to aim your free shot.'
                    : `Free shot: ${label(basic)}.`}
                  {chargeTo === null && !blocked.noCharge ? ' Click a card to charge it.' : ''}
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
              <WhyNot reason={ready || playingBack ? null : commitReason}>
                <button
                  className="btn go huge commit-drain"
                  disabled={!ready || playingBack}
                  onClick={commit}
                  style={{ minWidth: 230 }}
                >
                {/* The second timer bar came out in Build 6. Pressure near the
                    decision now lives *in* the decision: one element, two jobs. */}
                <i
                  className={`drain ${warn ? 'warn' : ''}`}
                  style={{
                    width: `${100 - Math.max(0, Math.min(100, (clock / roundSeconds) * 100))}%`,
                  }}
                />
                <span style={{ position: 'relative' }}>
                  {playingBack ? (
                    <span className="thinking">
                      THEY ARE PLANNING <i />
                      <i />
                      <i />
                    </span>
                  ) : (
                    'COMMIT'
                  )}
                </span>
                </button>
              </WhyNot>
            </>
          )}
        </div>
      </div>

      {wipe && (
        <>
          <div className="round-wipe" />
          <span className="round-stamp">Round {view.round}</span>
        </>
      )}
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
      <span style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: 'var(--fs-fine)' }}>
        {who}
      </span>
      <span style={{ display: 'flex', gap: 3 }} aria-label={`${value} of 9 hull cells`}>
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
    case 'kiln':
      return specCells(spec.inner, defId);
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
