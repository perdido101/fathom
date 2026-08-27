# What the game tells you

Three tiers of feedback, ordered from wordless to explanatory. This file is
**generated** by `npm run feedback` from `src/ui/feedback/content.ts`, which
in turn reads the card and ship definitions — so the rule text here cannot
drift from the rules the engine runs.

The design constraint that shapes all of it: the resolve event stream carries
**no plan payload** (Build 5's outbound-frame test made sure of it), so the
feedback layer works from the events plus the difference between the client
view before a round and after it. A charge that vanished off an opponent's
card is visible in that diff; the Jam that took it is not, and does not need
to be.

---

## The budget

**At most one Tier 2 line and one Tier 3 card on screen at once.** If a round
would produce several, the most consequential is shown and the resolve overlay
carries the rest — it narrates every step in order and remains the
authoritative account.

Tier 1 has no budget. Floaters are wordless, they overlap harmlessly, and six
cells resolving should read as six things happening.

A mechanic crowded out by the budget stays **unmarked** — it is still
first-time, so it gets its explanation the next time it happens rather than
losing it silently.

---

## Tier 1 — board floaters

Always on. No reading required, no interaction, no dismissal. Each rises from
the exact cell or object it belongs to and is gone in **600ms**. They never
queue: six cells resolving stagger at 55ms with the projectiles rather than
waiting in line.

| Reads | Rises from | Class |
| --- | --- | --- |
| **HIT** | the cell that was fired at | `.floater-hit` |
| **MISS** | the cell that was fired at | `.floater-miss` |
| **SUNK · N** | the cells of the ship going down | `.floater-sunk` |
| **+N** | the card that gained charges | `.floater-gain` |
| **−N** | the card that lost charges | `.floater-loss` |
| **BLOCKED** | the cell a Mirror cancellation ate | `.floater-blocked` |

Anchoring is by `[data-anchor]` and a measured screen rectangle, so the layer
draws above the resolve overlay without knowing anything about the layout
underneath it. That is what lets a HIT rise off a cell while the overlay is
narrating the same beat over the top of it.

**BLOCKED** is the one floater that cannot come from the event stream: a
cancelled attack fires no shots and so leaves no trace at all. It uses the aim
the local player themselves declared, and nothing else.

---

## Tier 2 — named events

Always on, one line, a fixed position under the opponent strip. Not a modal,
not blocking, never more than two deep. Each holds for 2.2 seconds.

Only for things that have a name and would otherwise be mysterious — where the
board changes for a reason that is not on screen.

| Fires when | Says |
| --- | --- |
| Thorn is sunk | THORN — firing back at every cell they hit. |
| Spite is sunk | SPITE — every charge on their cards is gone. |
| Cinder is sunk | CINDER — they can’t fire a card next round. |
| Dreadnought is sunk | DREADNOUGHT — charges scattered across the hand. |
| your Mirror reads them correctly | MIRROR — their whole round missed. |
| their Mirror reads you correctly | MIRROR — your whole round missed. |
| your Ambush reads them correctly | AMBUSH — you fire back where they came from. |
| their Ambush reads you correctly | AMBUSH — they fire back where you came from. |
| Pin lands on you | PIN — you can’t fire a card next round. |
| Blackout is used on you | BLACKOUT — no charge for you next round. |
| either side activates a ship ability | They used NAME. / You used NAME. |

The wording rule, held to across all of them: say what happened to the board,
in the same plain register the resolve overlay uses. *"Firing back at every
cell they hit"*, never *"THORN triggers REACT"*.

---

## Tier 3 — first-time explainers

Once ever, per mechanic, per player. A fuller card with a **Got it**
dismissal, persisted in `localStorage` under
`shadow-armada:seen-mechanics`, and resettable from Settings — which also
shows how many of the 28 have been seen.

This is the mechanism that lets Tier 2 stay to one line: the teaching load
decays to zero instead of becoming permanent noise.

### The twelve cards

| Mechanic | When it fires | The rule (from the content list) | Why it matters |
| --- | --- | --- | --- |
| **Salvo** | Salvo is fired by either player | Fire 1 cell per charge, anywhere on the board. | Charges become cells one for one, so a long-charged Salvo is the simplest big round in the game. |
| **Lance** | Lance is fired by either player | Fire a straight orthogonal line of length C. | A line beats scattered cells the moment you know which way a hull is lying. |
| **Burst** | Burst is fired by either player | At C2: fire a 2x2 block. At C4: fire a 3x3 block. Cannot be fired below 2. | Two charges buys four cells, four buys nine. Charging past four adds nothing at all. |
| **Rake** | Rake is fired by either player | Fire 3 cells in a row. Each charge above 1 adds 1 more cell to that row. | It only ever searches one row, so it pays off after a Sounding or a Beacon has named the row. |
| **Breaker** | Breaker is fired by either player | At C3: fire a 2x2 block. Any damaged ship hit is sunk outright. Cannot be fired below 3. | Anything you have already wounded dies outright if this touches it. It is a finisher, not a search. |
| **Ping** | Ping is fired by either player | Fire 1 cell per charge. For each miss, learn whether a ship sits orthogonally adjacent. | Missing is the point: every miss reports whether a hull sits next door. |
| **Echo** | Echo is fired by either player | Fire 1 cell per charge. For each hit, they reveal one further cell of that same ship. | Hitting is the point: every hit forces another cell of that same ship into the open. |
| **Sounding** | Sounding is fired by either player | Fire 1 cell. At C2: also learn that column’s ship-cell count. At C3: row and column. | A count is not a location, but it cuts a thirty-six cell board down fast. |
| **Jam** | Jam is fired by either player | Remove C charges from their cards. You choose which. | Those charges are destroyed, not moved. It is the answer to a card that has been growing all match. |
| **Siphon** | Siphon is fired by either player | Steal C charges from their cards onto one of yours. You choose source and destination. | Their loss and your gain in one beat, so the swing is twice the number stolen. |
| **Mirror** | Mirror is fired by either player | Needs 2 charges. Name a cell. If their attack includes it, their entire attack misses and you gain C x 2 charges. | A correct read cancels their entire round — every shot they fired, not just the cell you named. |
| **Ambush** | Ambush is fired by either player | Name a cell. If their attack includes it: C0 fire back at it; C2 add its two horizontal neighbours; C3 fire its entire row. | A correct read fires back for free, and at zero charges it costs nothing to leave standing. |

### The eight ACTIVE and NERF abilities

| Mechanic | When it fires | The rule (from the content list) | Why it matters |
| --- | --- | --- | --- |
| **Forge** | Forge's ability is activated by either player | Fire a free 3-cell line. | Damage that costs neither a card nor a charge. Using it flips the ship face up for good. |
| **Blackout** | Blackout's ability is activated by either player | They cannot charge next round, and immediately lose 2 charges at random. | Two charges now and no charge at all next round — two rounds of their economy, in one activation. |
| **Warhead** | Warhead's ability is activated by either player | Fire a 2x2 block. Any damaged ship hit is sunk outright. | Four cells, and anything already damaged inside them is gone. This is the sink button. |
| **Kiln** | Kiln's ability is activated by either player | Immediately fire a card in your hand as though it held 3 more charges. It is consumed. | The chosen card fires at three charges more than it holds, and is consumed doing it. |
| **Leech** | Leech's ability is activated by either player | Steal 3 charges from their cards onto yours. You choose. | Three charges cross the table. Their bank falls and yours rises in the same instant. |
| **Beacon** | Beacon's ability is activated by either player | Name a row or a column; learn how many ship cells occupy it. Then fire 2 cells anywhere. | An exact count for one row or one column, and two free cells to act on what it says. |
| **Ember** | Ember's ability is activated by either player | Fire 2 cells anywhere. Gain 2 charges for each one that hits. | Every cell that lands pays two charges back, so a good Ember funds the card after it. |
| **Pin** | Pin's ability is activated by either player | Fire 1 cell. If it hits, they cannot fire a card next round. | One cell. If it lands, not one of their cards may fire next round. |

### The four REACTs

| Mechanic | When it fires | The rule (from the content list) | Why it matters |
| --- | --- | --- | --- |
| **Dreadnought** | Dreadnought is sunk and its reaction fires | When sunk: add 4 charges split randomly across your cards. | It pays out on the way down: four charges scattered over the cards still in hand. |
| **Cinder** | Cinder is sunk and its reaction fires | When sunk: gain 2 charges at random; they cannot fire a card next round. | Sinking it costs them next round’s card fire and hands them two charges. |
| **Spite** | Spite is sunk and its reaction fires | When sunk: they lose all charges on all cards. | Every charge on every one of their cards, gone. A card charged all match dies with it. |
| **Thorn** | Thorn is sunk and its reaction fires | When sunk: immediately fire back at every cell they fired at this round. | It answers with the whole round: every cell they fired at gets fired back at. |

### The four rules with no card to hang on

| Mechanic | When it fires | The rule (from the content list) | Why it matters |
| --- | --- | --- | --- |
| **Decided on hull** | the match ends at the round cap with a hull difference | At the round cap with both fleets afloat, the player holding more hull cells wins. | Round twenty arrived with both fleets still afloat, so the match is decided on hull cells remaining. |
| **A draw** | the match ends in a draw | Level on hull at the cap, or both fleets destroyed in the same round from level hull, is a draw. | Dead level at the cap. In arena that returns both stakes in full and takes no rake at all. |
| **Timer strike** | a plan window lapses for either player | A lapsed plan window plays a fallback plan and records a strike. Three strikes forfeit the match. | A lapsed timer plays a fallback plan and adds a strike against you. Three strikes lose the match outright. |
| **The shared pile** | either player draws from the pile for the first time | Undrafted cards form one shared, face-down pile. A player at or below one card in hand draws from it. | Every card neither of you drafted went into a shared face-down pile. Drop to one card in hand and you draw from it. |

---

## The "why can't I?" affordance

A disabled control that says nothing was the single most confusing gap in the
build. Hovering one now states the reason, and costs nothing when the pointer
is elsewhere. The reason named is always the **first** rule that stops the
action — a card that is both pinned and under-charged says "pinned", because
lifting the pin is what the player would have to do first.

| Control | Reasons it can give |
| --- | --- |
| **Fire**, on a hovered hand card | *Your cards are locked this round — a Pin or a Cinder landed.* / *You have already declared a card this round.* / *NAME needs N charges. It holds M.* |
| **Commit** | *Finish aiming first — lock the declaration in or cancel it.* / *One charge is mandatory every round. Click a card to place it.* |
| **Commit fleet**, on deployment | *N ships still to place.* |
| A locked arena tier | *Provisional accounts play the lowest table. N more rated matches unlocks this one.* |

Implemented as `WhyNot`, which wraps a control and takes the pointer events
itself — a disabled button never fires them.

---

## Coverage

| Group | Written | Required |
| --- | --- | --- |
| Cards | 12 | 12 |
| ACTIVE / NERF abilities | 8 | 8 |
| REACTs | 4 | 4 |
| Rules | 4 | 4 |
| **Total** | **28** | **28** |

> Complete. `npm run feedback` fails the build if a mechanic ever ships without copy.
