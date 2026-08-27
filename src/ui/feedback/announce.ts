import type { CellIndex, ResolveEvent } from '../../engine/types';
import type { ClientView } from '../../engine/view';
import { SHIPS } from '../../engine/ships';
import { abilityLine, type FloaterKind } from './content';
import { beatOffsets, stepMs } from './timing';
import { cardAnchor, cellAnchor, useFeedback } from './store';

/**
 * One round's worth of feedback, derived from what the player is entitled to
 * know rather than from the plans that produced it.
 *
 * That constraint is the whole design. The event stream deliberately carries
 * no plan payload — Build 5's leak test made sure of it — so this module works
 * from two things: the events, and the difference between the view before the
 * round and the view after it. A charge that vanished off an opponent's card
 * is visible in the diff; the Jam that took it is not, and does not need to
 * be. The one thing a diff cannot show is a shot that never happened, so the
 * cells a cancelled attack *would* have struck come from the aim the local
 * player themselves declared, and from nowhere else.
 */

export interface RoundFeedback {
  floaters: { anchor: string; text: string; kind: FloaterKind; delay: number }[];
  named: { text: string; delay: number }[];
  /** Explainer keys, in the order they became due. Only the first is shown. */
  explain: string[];
}

/** Milliseconds between two floaters spawned by the same beat. */
const STAGGER = 55;

export function roundFeedback(
  prev: ClientView | null,
  next: ClientView,
  events: ResolveEvent[],
  fast: boolean,
  /** The cells this client declared this round, for the cancelled-attack case. */
  myAim: CellIndex[] = [],
): RoundFeedback {
  const you = next.you;
  const out: RoundFeedback = { floaters: [], named: [], explain: [] };
  const at = beatOffsets(
    events.map((e) => e.t),
    fast,
  );
  const total = at.length ? at[at.length - 1] + stepMs(events[events.length - 1].t, fast) : 0;
  const firstOf = (kind: string): number => {
    const i = events.findIndex((e) => e.t === kind);
    return i < 0 ? total : at[i];
  };

  // --- Tier 1: shots, on the board they landed on -------------------------
  // My hits on their water are the anchors a sink can use, so collect them.
  const myHitCells: CellIndex[] = [];
  events.forEach((e, i) => {
    if (e.t !== 'shot') return;
    const mine = e.by === you;
    if (mine && e.hit) myHitCells.push(e.cell);
    out.floaters.push({
      anchor: cellAnchor(mine ? 'foe' : 'mine', e.cell),
      text: e.hit ? 'HIT' : 'MISS',
      kind: e.hit ? 'hit' : 'miss',
      delay: at[i],
    });
  });

  // --- Tier 1: sinks ------------------------------------------------------
  // My own ship's cells are mine to show. Theirs are not: a sink announces a
  // length and never a position, so the floater rides the cells I actually hit
  // this round, which is the most the rules let me put on their water.
  const sunkNow = next.me.ships.filter(
    (s, i) => s.sunk && !(prev?.me.ships[i]?.sunk ?? false),
  );
  let sunkMineIdx = 0;
  events.forEach((e, i) => {
    if (e.t !== 'sink') return;
    const mine = e.owner === you;
    const cells = mine
      ? (sunkNow[sunkMineIdx++]?.cells ?? [])
      : myHitCells.slice(-Math.min(myHitCells.length, e.length));
    cells.forEach((c, k) => {
      out.floaters.push({
        anchor: cellAnchor(mine ? 'mine' : 'foe', c),
        text: k === 0 ? `SUNK · ${e.length}` : '',
        kind: 'sunk',
        delay: at[i] + k * 90,
      });
    });
  });

  // --- Tier 1: charges moving, from the diff ------------------------------
  if (prev) {
    const chargeBeat = firstOf('charges');
    let n = 0;
    const diff = (
      before: { uid: number; charges: number }[],
      after: { uid: number; charges: number }[],
      side: 'me' | 'foe',
    ): void => {
      for (const card of after) {
        const was = before.find((c) => c.uid === card.uid);
        // A card that was not in hand before is a draw, not a charge change.
        if (!was) continue;
        const d = card.charges - was.charges;
        if (d === 0) continue;
        out.floaters.push({
          anchor: cardAnchor(side, card.uid),
          text: d > 0 ? `+${d}` : `−${-d}`,
          kind: d > 0 ? 'gain' : 'loss',
          delay: chargeBeat + n++ * STAGGER,
        });
      }
    };
    diff(prev.me.hand, next.me.hand, 'me');
    diff(prev.foe.hand, next.foe.hand, 'foe');
  }

  // --- Tier 1 and 2: predictions ------------------------------------------
  events.forEach((e, i) => {
    if (e.t !== 'prediction' || !e.triggered) return;
    const mine = e.by === you;
    const name = e.card === 'mirror' ? 'MIRROR' : 'AMBUSH';
    if (e.card === 'mirror') {
      out.named.push({
        text: mine ? `${name} — their whole round missed.` : `${name} — your whole round missed.`,
        delay: at[i],
      });
      // The cells that were eaten. Only knowable for my own declaration.
      if (!mine) {
        myAim.forEach((c, k) =>
          out.floaters.push({
            anchor: cellAnchor('foe', c),
            text: 'BLOCKED',
            kind: 'blocked',
            delay: at[i] + k * STAGGER,
          }),
        );
      }
    } else {
      out.named.push({
        text: mine
          ? `${name} — you fire back where they came from.`
          : `${name} — they fire back where you came from.`,
        delay: at[i],
      });
    }
  });

  // --- Tier 2: reactions --------------------------------------------------
  events.forEach((e, i) => {
    if (e.t !== 'react') return;
    out.named.push({ text: reactLine(e.defId, e.owner === you), delay: at[i] });
    out.explain.push(`react:${e.defId}`);
  });

  // --- Tier 2: abilities activated, either side ---------------------------
  if (prev) {
    for (const [i, s] of next.me.ships.entries()) {
      if (s.abilityUsed && !(prev.me.ships[i]?.abilityUsed ?? false)) {
        out.named.push({ text: abilityLine(s.defId, true), delay: 0 });
        out.explain.push(`ability:${s.defId}`);
      }
    }
    for (const [i, s] of next.foe.ships.entries()) {
      if (s.defId && s.abilityUsed && !(prev.foe.ships[i]?.abilityUsed ?? false)) {
        out.named.push({ text: abilityLine(s.defId, false), delay: 0 });
        out.explain.push(`ability:${s.defId}`);
      }
    }
  }

  // --- Tier 2: restrictions landing on me ---------------------------------
  // Cinder announces itself as a reaction, so a lock that arrives in the same
  // round as a Cinder is already named and must not be named twice as a Pin.
  const cinderFired = events.some((e) => e.t === 'react' && e.defId === 'cinder' && e.owner !== you);
  if (prev) {
    if (next.me.restrictions.noFire && !prev.me.restrictions.noFire && !cinderFired) {
      out.named.push({ text: 'PIN — you can’t fire a card next round.', delay: total });
    }
    if (next.me.restrictions.noCharge && !prev.me.restrictions.noCharge) {
      out.named.push({ text: 'BLACKOUT — no charge for you next round.', delay: total });
    }
  }

  // --- Tier 3: cards fired, from the public graveyards --------------------
  if (prev) {
    for (const g of next.me.graveyard.slice(prev.me.graveyard.length)) out.explain.push(`card:${g.defId}`);
    for (const g of next.foe.graveyard.slice(prev.foe.graveyard.length)) out.explain.push(`card:${g.defId}`);
  }

  // --- Tier 3: the four rules with no card to hang on ---------------------
  for (const e of events) {
    if (e.t === 'strike' && e.who === you) out.explain.push('rule:strike');
    if (e.t === 'draw' && e.to === you) out.explain.push('rule:pile-draw');
    if (e.t === 'end') {
      if (e.outcome.kind === 'draw') out.explain.push('rule:draw');
      else if (e.outcome.reason === 'cells') out.explain.push('rule:tiebreak');
    }
  }

  return out;
}

function reactLine(defId: string, mine: boolean): string {
  const name = SHIPS[defId]?.name.toUpperCase() ?? defId.toUpperCase();
  switch (defId) {
    case 'thorn':
      return mine
        ? `${name} — firing back at every cell they hit.`
        : `${name} — they fire back at every cell you hit.`;
    case 'spite':
      return mine ? `${name} — every charge on their cards is gone.` : `${name} — every charge on your cards is gone.`;
    case 'cinder':
      return mine ? `${name} — they can’t fire a card next round.` : `${name} — you can’t fire a card next round.`;
    case 'dreadnought':
      return mine
        ? `${name} — charges scattered across your hand.`
        : `${name} — charges scattered across their hand.`;
    default:
      return name;
  }
}

/** Push a whole round's feedback into the live store. */
export function announceRound(
  prev: ClientView | null,
  next: ClientView,
  events: ResolveEvent[],
  fast: boolean,
  myAim: CellIndex[] = [],
): void {
  const fb = roundFeedback(prev, next, events, fast, myAim);
  const f = useFeedback.getState();
  for (const x of fb.floaters) if (x.text !== '') f.float(x.anchor, x.text, x.kind, x.delay);
  for (const x of fb.named) f.name(x.text, x.delay);
  // The budget lets one card through; `explain` claims the rest as seen only
  // when it actually shows them, so a mechanic crowded out this round still
  // gets its turn the next time it happens.
  if (fb.explain.length) {
    const total = beatOffsets(events.map((e) => e.t), fast).slice(-1)[0] ?? 0;
    f.explain(fb.explain[0], total + 300);
  }
}
