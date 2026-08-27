# What the game shows you

Every visual effect in ARMADA, what fires it, how long it lasts, and how it
degrades for a player who has asked for less motion.

This file is **generated** by `npm run vfx` from `src/ui/vfx/derive.ts`.
The durations below are the numbers the layer actually runs on, and the script
fails if an effect is added to the layer without an entry here — the same
check `docs/AUDIO.md` and `docs/FEEDBACK.md` apply to their own lists.

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

**An effect runs on the compositor.** Every rule animates `transform`,
`opacity` and `filter` and nothing else. The heaviest realistic moment — a
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
| **Shot in the air** | Every `shot` event, scheduled to *arrive* on its beat rather than leave on it | 260ms | 9 (a four-charge Burst) |
| **Impact flare** | A `shot` with `hit: true` | 520ms | 9 |
| **Shockwave** | Alongside every impact | 620ms | 9 |
| **Debris** | Four per impact, 12ms apart | 640ms | 36 |
| **Splash** | A `shot` with `hit: false` | 560ms | 9 |
| **Ripple rings** | Three per splash, 90ms apart | 900ms | 27 |
| **Shot eaten** | A Mirror prediction landing on *your* declaration — the cells you aimed at | 520ms | 9 |
| **Cells going dark** | A `sink`, one cell at a time, 110ms apart, bow to stern | 460ms | 4 |
| **What it leaves** | 200ms behind each douse | 1600ms | 4 |
| **Charges crossing** | A charge beat where exactly one card lost and exactly one card on the other side of the division gained at least as much | 460ms | 4 |
| **Gem taking weight** | Placing a charge during planning, and every card whose count changed at resolve | 420ms | 6 |
| **Ability firing** | A ship whose `abilityUsed` went true this round, either side | 560ms | 2 |
| **A dead ship answering** | Every `react` event | 320ms | 2 |
| **A read landing** | A `prediction` event with `triggered: true` | 1000ms | 2 |

---

## Each one, and why

### Shot in the air — `tracer`, 260ms

**Fires on:** Every `shot` event, scheduled to *arrive* on its beat rather than leave on it

**Looks like:** A gold mote leaves the shooter’s own water and crosses to the target cell

**Why:** A shot that simply appears on the target has no author. The tracer is the only thing on screen that says which side fired — and because it starts at a board rather than at a card, it says so without revealing which card did it.

**Reduced motion:** Removed. Travel is the thing reduced motion is asking not to have.

### Impact flare — `impact`, 520ms

**Fires on:** A `shot` with `hit: true`

**Looks like:** A white-hot centre blooming to the hit red, sized to the cell it landed on

**Why:** The cell already turns red permanently. This is the moment it happened, as opposed to the record that it did.

**Reduced motion:** A still flash in the same place and colour, 220ms.

### Shockwave — `shock`, 620ms

**Fires on:** Alongside every impact

**Looks like:** A white ring expanding to 2.6× the cell and fading

**Why:** Impacts on adjacent cells would otherwise merge into one red smear. The rings arrive at different sizes and separate them.

**Reduced motion:** Still ring, no expansion.

### Debris — `debris`, 640ms

**Fires on:** Four per impact, 12ms apart

**Looks like:** Four small hull fragments thrown out along a golden-angle fan

**Why:** Four, not eight. Enough to read as something breaking; more becomes soup at nine simultaneous cells. The golden angle keeps four motes from leaving along the same two axes every time.

**Reduced motion:** Removed.

### Splash — `splash`, 560ms

**Fires on:** A `shot` with `hit: false`

**Looks like:** White water thrown up and falling back, sized to the cell

**Why:** A miss is an event too. Without this, half of every round is a cell quietly changing colour.

**Reduced motion:** Still flash, 220ms.

### Ripple rings — `ripple`, 900ms

**Fires on:** Three per splash, 90ms apart

**Looks like:** Three rings expanding and settling on the water

**Why:** The settling is what makes a miss feel like water rather than like a failed hit.

**Reduced motion:** Removed.

### Shot eaten — `blocked`, 520ms

**Fires on:** A Mirror prediction landing on *your* declaration — the cells you aimed at

**Looks like:** A violet ring snapping inward on each cell that was about to be struck

**Why:** A cancelled attack fires no shots, so it leaves no trace at all in the event stream. This is the one effect built from the aim the local player themselves declared, and from nothing else — which is also why it can only ever be drawn for your own cancelled round.

**Reduced motion:** Still ring, 220ms.

### Cells going dark — `douse`, 460ms

**Fires on:** A `sink`, one cell at a time, 110ms apart, bow to stern

**Looks like:** Each cell of the ship darkening in sequence

**Why:** A sink was a pulse and a floater — over in 260ms for the biggest thing that happens in a round. The sequence gives a four-length ship four times the weight of a two, without a single extra rule.

**Reduced motion:** Still darken, no sequence stagger beyond the existing delay.

### What it leaves — `slick`, 1600ms

**Fires on:** 200ms behind each douse

**Looks like:** A pale slick spreading and thinning on the water

**Why:** Something final. The cell stays dark for the rest of the match; this is the second and a half where the sea notices.

**Reduced motion:** Removed.

### Charges crossing — `carry`, 460ms

**Fires on:** A charge beat where exactly one card lost and exactly one card on the other side of the division gained at least as much

**Looks like:** Up to four gold motes travelling from the losing card to the gaining one, 70ms apart

**Why:** Siphon and Jam move charges between cards, and the numbers changing in two places is not the same as seeing them move. The pairing is deliberately narrow — exactly one card lost, exactly one card on the *other* side gained at least that much — because guessing which loss paid for which gain would be inventing information the player was never given. It is narrow for a second reason too: the first version required exactly one gain anywhere, which every round breaks, because every round places a mandatory charge. The effect could not fire in any real match. Three clip runs came back without it before that was believed; `derive.test.ts` now checks it in milliseconds instead.

**Reduced motion:** Removed; the gems still pop.

### Gem taking weight — `gempop`, 420ms

**Fires on:** Placing a charge during planning, and every card whose count changed at resolve

**Looks like:** A gold ring landing on the gem, its size and glow scaled by the count the card now holds

**Why:** The number on the gem is the same size at 1 and at 8. The ring is not: a fifth charge lands visibly heavier than a first, which is what a player planning a Lance actually needs to feel.

**Reduced motion:** Still ring at fixed size, 220ms.

### Ability firing — `flip`, 560ms

**Fires on:** A ship whose `abilityUsed` went true this round, either side

**Looks like:** The ship card turning over inside a burst in its type colour — green ACTIVE, violet NERF, orange REACT

**Why:** A once-per-match ability is a decision a player made and will not get to make again. It had a named line and nothing else.

**Reduced motion:** Still burst, no turn.

### A dead ship answering — `react`, 320ms

**Fires on:** Every `react` event

**Looks like:** An orange frame snapping inward on the ship card, at half the duration of an ability

**Why:** A REACT is not a decision, it is an answer. Half the duration, no turn-over, and it snaps in rather than settling — the same information as an ability firing, in an unmistakably different register.

**Reduced motion:** Still frame, 220ms.

### A read landing — `foretold`, 1000ms

**Fires on:** A `prediction` event with `triggered: true`

**Looks like:** A ring the size of the board it happened on, blooming out of nothing and blurring away

**Why:** The loudest visual in the game, deliberately. A prediction landing is the rarest and best thing ARMADA produces and it had one line of text. It fills a board rather than a cell because it did not happen to a cell.

**Reduced motion:** Still ring, no blur, 220ms.


---

## Reduced motion

`prefers-reduced-motion: reduce` does **not** mean no effects. A player who
has asked for less motion still needs to know a shot landed, so every effect
degrades to a still flash in the same place, in the same colour, at 220ms.

What goes is the three things that move a player's eye without being asked:
**travel** (tracers, carried charges), **scatter** (debris, ripples, slicks),
and **shake**. What stays is every effect that says *this happened, here*.

The same switch is honoured by the fast-resolve setting, which compresses the
whole beat sequence to about a second — the effects follow the resolve clock
in `src/ui/feedback/timing.ts`, so they compress with it rather than running
long over a sequence that has already finished.

---

## Inherited, and unchanged

Effects that predate this layer and were left alone. They are listed because
"every visual effect" should mean every one, not every new one.

| Effect | Fires on | What it is |
| --- | --- | --- |
| **Screen shake** | One per round on the first hit, plus one per sink | A transform on the app root, amplitude scaled by how many cells landed — a single deck-gun hit is a nudge, nine cells is a jolt. One per round, not one per cell: nine jolts 190ms apart would still be moving when the next beat arrived. Removed entirely under reduced motion. |
| **Card burning away** | A card fired at resolve | The card lifts, brightens and leaves upward. Build 4; unchanged. |
| **Round wipe and stamp** | The round number changing | A wash across the screen with the round number stamped in it. Build 6; unchanged. |
| **Draft deal-in** | A pack arriving | Four cards arc in from off-screen, staggered 80ms. Build 6; unchanged. |
| **Draft pick lift** | Your pick | The chosen card lifts and holds while the other three recede. Build 6; unchanged. |
| **Draft collision slam** | Both players picking the same card | Their face-down card flips over onto yours. Build 6; unchanged. |
| **Commitment seals** | Both deployments committed | Two hashes sealing shut, the one that is yours in green. Build 6/7; unchanged. |
| **The verdict slam** | A match ending | VICTORY / DEFEAT / DRAW at display scale with the settled number beneath. Build 7; unchanged. |
| **Champion sequence** | Winning a bracket final | The trophy and the banner, the loudest screen in the game. Build 4; unchanged. |
