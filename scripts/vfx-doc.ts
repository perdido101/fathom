import { writeFileSync } from 'node:fs';
import { VFX_LIFE } from '../src/ui/vfx/derive';

/**
 * `npm run vfx` — docs/VFX.md, generated.
 *
 * The durations come from `VFX_LIFE`, which is the same table the layer runs
 * on, so a document that says an impact lasts 520ms is reading the number the
 * impact actually lasts. The prose beside each one is authored here because
 * no data file knows why an effect exists.
 *
 * The generated half also acts as a check: an effect kind added to the layer
 * with no entry below fails this script, exactly as a mechanic with no
 * explainer fails `feedback-doc.ts`.
 */

interface Effect {
  kind: string;
  name: string;
  /** What causes it, in the game's own terms. */
  trigger: string;
  /** What it looks like. */
  what: string;
  /** Why it exists — the half no data file can derive. */
  why: string;
  /** What a player who asked for less motion gets instead. */
  reduced: string;
  /** How many can be alive at once in the worst realistic case. */
  worst: string;
}

const EFFECTS: Effect[] = [
  {
    kind: 'tracer',
    name: 'Shot in the air',
    trigger: 'Every `shot` event, scheduled to *arrive* on its beat rather than leave on it',
    what: 'A gold mote leaves the shooter’s own water and crosses to the target cell',
    why:
      'A shot that simply appears on the target has no author. The tracer is the only thing on screen that says which side fired — and because it starts at a board rather than at a card, it says so without revealing which card did it.',
    reduced: 'Removed. Travel is the thing reduced motion is asking not to have.',
    worst: '9 (a four-charge Burst)',
  },
  {
    kind: 'impact',
    name: 'Impact flare',
    trigger: 'A `shot` with `hit: true`',
    what: 'A white-hot centre blooming to the hit red, sized to the cell it landed on',
    why: 'The cell already turns red permanently. This is the moment it happened, as opposed to the record that it did.',
    reduced: 'A still flash in the same place and colour, 220ms.',
    worst: '9',
  },
  {
    kind: 'shock',
    name: 'Shockwave',
    trigger: 'Alongside every impact',
    what: 'A white ring expanding to 2.6× the cell and fading',
    why: 'Impacts on adjacent cells would otherwise merge into one red smear. The rings arrive at different sizes and separate them.',
    reduced: 'Still ring, no expansion.',
    worst: '9',
  },
  {
    kind: 'debris',
    name: 'Debris',
    trigger: 'Four per impact, 12ms apart',
    what: 'Four small hull fragments thrown out along a golden-angle fan',
    why:
      'Four, not eight. Enough to read as something breaking; more becomes soup at nine simultaneous cells. The golden angle keeps four motes from leaving along the same two axes every time.',
    reduced: 'Removed.',
    worst: '36',
  },
  {
    kind: 'splash',
    name: 'Splash',
    trigger: 'A `shot` with `hit: false`',
    what: 'White water thrown up and falling back, sized to the cell',
    why: 'A miss is an event too. Without this, half of every round is a cell quietly changing colour.',
    reduced: 'Still flash, 220ms.',
    worst: '9',
  },
  {
    kind: 'ripple',
    name: 'Ripple rings',
    trigger: 'Three per splash, 90ms apart',
    what: 'Three rings expanding and settling on the water',
    why: 'The settling is what makes a miss feel like water rather than like a failed hit.',
    reduced: 'Removed.',
    worst: '27',
  },
  {
    kind: 'blocked',
    name: 'Shot eaten',
    trigger: 'A Mirror prediction landing on *your* declaration — the cells you aimed at',
    what: 'A violet ring snapping inward on each cell that was about to be struck',
    why:
      'A cancelled attack fires no shots, so it leaves no trace at all in the event stream. This is the one effect built from the aim the local player themselves declared, and from nothing else — which is also why it can only ever be drawn for your own cancelled round.',
    reduced: 'Still ring, 220ms.',
    worst: '9',
  },
  {
    kind: 'douse',
    name: 'Cells going dark',
    trigger: 'A `sink`, one cell at a time, 110ms apart, bow to stern',
    what: 'Each cell of the ship darkening in sequence',
    why:
      'A sink was a pulse and a floater — over in 260ms for the biggest thing that happens in a round. The sequence gives a four-length ship four times the weight of a two, without a single extra rule.',
    reduced: 'Still darken, no sequence stagger beyond the existing delay.',
    worst: '4',
  },
  {
    kind: 'slick',
    name: 'What it leaves',
    trigger: '200ms behind each douse',
    what: 'A pale slick spreading and thinning on the water',
    why: 'Something final. The cell stays dark for the rest of the match; this is the second and a half where the sea notices.',
    reduced: 'Removed.',
    worst: '4',
  },
  {
    kind: 'carry',
    name: 'Charges crossing',
    trigger:
      'A charge beat where exactly one card lost and exactly one card on the other side of the division gained at least as much',
    what: 'Up to four gold motes travelling from the losing card to the gaining one, 70ms apart',
    why:
      'Siphon and Jam move charges between cards, and the numbers changing in two places is not the same as seeing them move. The pairing is deliberately narrow — exactly one card lost, exactly one card on the *other* side gained at least that much — because guessing which loss paid for which gain would be inventing information the player was never given. It is narrow for a second reason too: the first version required exactly one gain anywhere, which every round breaks, because every round places a mandatory charge. The effect could not fire in any real match. Three clip runs came back without it before that was believed; `derive.test.ts` now checks it in milliseconds instead.',
    reduced: 'Removed; the gems still pop.',
    worst: '4',
  },
  {
    kind: 'gempop',
    name: 'Gem taking weight',
    trigger: 'Placing a charge during planning, and every card whose count changed at resolve',
    what: 'A gold ring landing on the gem, its size and glow scaled by the count the card now holds',
    why:
      'The number on the gem is the same size at 1 and at 8. The ring is not: a fifth charge lands visibly heavier than a first, which is what a player planning a Lance actually needs to feel.',
    reduced: 'Still ring at fixed size, 220ms.',
    worst: '6',
  },
  {
    kind: 'flip',
    name: 'Ability firing',
    trigger: 'A ship whose `abilityUsed` went true this round, either side',
    what: 'The ship card turning over inside a burst in its type colour — green ACTIVE, violet NERF, orange REACT',
    why:
      'A once-per-match ability is a decision a player made and will not get to make again. It had a named line and nothing else.',
    reduced: 'Still burst, no turn.',
    worst: '2',
  },
  {
    kind: 'react',
    name: 'A dead ship answering',
    trigger: 'Every `react` event',
    what: 'An orange frame snapping inward on the ship card, at half the duration of an ability',
    why:
      'A REACT is not a decision, it is an answer. Half the duration, no turn-over, and it snaps in rather than settling — the same information as an ability firing, in an unmistakably different register.',
    reduced: 'Still frame, 220ms.',
    worst: '2',
  },
  {
    kind: 'foretold',
    name: 'A read landing',
    trigger: 'A `prediction` event with `triggered: true`',
    what: 'A ring the size of the board it happened on, blooming out of nothing and blurring away',
    why:
      'The loudest visual in the game, deliberately. A prediction landing is the rarest and best thing ARMADA produces and it had one line of text. It fills a board rather than a cell because it did not happen to a cell.',
    reduced: 'Still ring, no blur, 220ms.',
    worst: '2',
  },
];

/** Effects that are not in the layer because they already existed elsewhere. */
const INHERITED: [string, string, string][] = [
  ['Screen shake', 'One per round on the first hit, plus one per sink', 'A transform on the app root, amplitude scaled by how many cells landed — a single deck-gun hit is a nudge, nine cells is a jolt. One per round, not one per cell: nine jolts 190ms apart would still be moving when the next beat arrived. Removed entirely under reduced motion.'],
  ['Card burning away', 'A card fired at resolve', 'The card lifts, brightens and leaves upward. Build 4; unchanged.'],
  ['Round wipe and stamp', 'The round number changing', 'A wash across the screen with the round number stamped in it. Build 6; unchanged.'],
  ['Draft deal-in', 'A pack arriving', 'Four cards arc in from off-screen, staggered 80ms. Build 6; unchanged.'],
  ['Draft pick lift', 'Your pick', 'The chosen card lifts and holds while the other three recede. Build 6; unchanged.'],
  ['Draft collision slam', 'Both players picking the same card', 'Their face-down card flips over onto yours. Build 6; unchanged.'],
  ['Commitment seals', 'Both deployments committed', 'Two hashes sealing shut, the one that is yours in green. Build 6/7; unchanged.'],
  ['The verdict slam', 'A match ending', 'VICTORY / DEFEAT / DRAW at display scale with the settled number beneath. Build 7; unchanged.'],
  ['Champion sequence', 'Winning a bracket final', 'The trophy and the banner, the loudest screen in the game. Build 4; unchanged.'],
];

const missing = Object.keys(VFX_LIFE).filter((k) => !EFFECTS.some((e) => e.kind === k));
if (missing.length) {
  console.error(`VFX_LIFE has kinds with no entry in vfx-doc.ts: ${missing.join(', ')}`);
  process.exit(1);
}
const stale = EFFECTS.filter((e) => !(e.kind in VFX_LIFE));
if (stale.length) {
  console.error(`vfx-doc.ts documents kinds the layer no longer has: ${stale.map((e) => e.kind).join(', ')}`);
  process.exit(1);
}

const doc = `# What the game shows you

Every visual effect in ARMADA, what fires it, how long it lasts, and how it
degrades for a player who has asked for less motion.

This file is **generated** by \`npm run vfx\` from \`src/ui/vfx/derive.ts\`.
The durations below are the numbers the layer actually runs on, and the script
fails if an effect is added to the layer without an entry here — the same
check \`docs/AUDIO.md\` and \`docs/FEEDBACK.md\` apply to their own lists.

---

## The three rules

**An effect maps to a discrete event.** Not to a state, not to a mood. Nothing
here loops, nothing here idles, and nothing here is ambience wearing feedback's
clothes. If a player did not cause it or does not need to notice it, it does
not get an effect.

**An effect can only show what the player is entitled to know.** The layer is
derived from the same two inputs as the feedback layer — the event stream,
which carries no plan payload, and the difference between the view before the
round and the view after it. Two consequences you can see in the table: a sink
on *their* water rides the cells you actually hit rather than their ship's real
position, and charges are only drawn crossing between two cards when exactly
one card lost and one gained.

**An effect runs on the compositor.** Every rule animates \`transform\`,
\`opacity\` and \`filter\` and nothing else. The heaviest realistic moment — a
four-charge Burst finding nine cells — puts about 55 elements on screen for
under a second, none of which touches layout.

### Why there is no canvas

The Build 4 restriction on new dependencies was about premature ones, and this
build was explicitly allowed to take a particle layer if it needed one. It does
not. At the counts above, DOM elements running one compositor-only animation
each are inside the frame budget with room to spare, and a canvas would buy
nothing while costing a second rendering model, its own resize and
device-pixel-ratio handling, and a reduced-motion path that would have to be
written twice. The moment a single effect needs thousands of particles rather
than tens, that trade changes.

---

## The effects

| Effect | Fires on | Duration | Worst case on screen |
| --- | --- | --- | --- |
${EFFECTS.map((e) => `| **${e.name}** | ${e.trigger} | ${VFX_LIFE[e.kind]}ms | ${e.worst} |`).join('\n')}

---

## Each one, and why

${EFFECTS.map(
  (e) => `### ${e.name} — \`${e.kind}\`, ${VFX_LIFE[e.kind]}ms

**Fires on:** ${e.trigger}

**Looks like:** ${e.what}

**Why:** ${e.why}

**Reduced motion:** ${e.reduced}
`,
).join('\n')}

---

## Reduced motion

\`prefers-reduced-motion: reduce\` does **not** mean no effects. A player who
has asked for less motion still needs to know a shot landed, so every effect
degrades to a still flash in the same place, in the same colour, at 220ms.

What goes is the three things that move a player's eye without being asked:
**travel** (tracers, carried charges), **scatter** (debris, ripples, slicks),
and **shake**. What stays is every effect that says *this happened, here*.

The same switch is honoured by the fast-resolve setting, which compresses the
whole beat sequence to about a second — the effects follow the resolve clock
in \`src/ui/feedback/timing.ts\`, so they compress with it rather than running
long over a sequence that has already finished.

---

## Inherited, and unchanged

Effects that predate this layer and were left alone. They are listed because
"every visual effect" should mean every one, not every new one.

| Effect | Fires on | What it is |
| --- | --- | --- |
${INHERITED.map(([n, t, w]) => `| **${n}** | ${t} | ${w} |`).join('\n')}
`;

writeFileSync('docs/VFX.md', doc, 'utf8');
console.log(`wrote docs/VFX.md — ${EFFECTS.length} effects, ${INHERITED.length} inherited`);
