# REMOVED — the Build 6 restraint pass

Every element deleted, per screen, with the reason.

The test each one had to pass: **what does a player do differently because
this is on screen?** If the honest answer was "nothing", it went. The rule
that governs what *replaced* some of them: restraint removes persistent
chrome; feedback is transient. A duplicated hull readout sat on screen for
twenty rounds doing nothing. A `+1` that floats for 600ms and vanishes
occupies no permanent space at all.

Two things were **cut rather than shrunk**, deliberately. A smaller duplicate
is still a duplicate.

**24 removals across 10 screens.** The screen guide's callout count fell from
**116 to 105** even though it grew from 33 plates to 47 — 3.5 callouts per
plate down to 2.2. The battle plate alone went from **18 pins to 12**.

---

## Battle

| Removed | Why |
| --- | --- |
| **The hull readout under your own board** — "Your waters · hull 9/9" | The nine pips in the top bar are the same number, larger, and never leave the screen. |
| **The timer bar above the commit button** | A second countdown eighteen inches from the first. The central clock owns time; the pressure the bar carried moved *into* the commit button, which now drains as the window runs out. One element, two jobs. |
| **"3 cards · bank 0" in the opponent strip** | Both are sums of things already on that row. You can count their cards, and every gem is already printing its own number. |
| **The prompt panel's surface** | One of the heaviest objects on screen for one sentence of text. The sentence stayed; the panel went. Aiming still gets a panel, because aiming holds controls. |
| **Four of the six hand buttons** | Three cards carried a permanent Charge and a permanent Fire each. The card *is* the charge control now, and the Fire affordance appears only on the hovered card and only when it is legal. One control visible at a time instead of six competing. |
| **"Length 4 / Length 3 / Length 2" on their unrevealed ships** | Beside four pips, the words are the same fact twice, and the pips are the half that scans without reading. |
| **Coordinate labels on the compact board** | You never name a cell on your own water. You cannot click it, and you never refer to it by letter. |
| **The `COMMIT · 14s` suffix** | The clock is now 64px at the top of the screen and the button itself drains. Three statements of the same number. |

---

## Ship draft and card draft

| Removed | Why |
| --- | --- |
| **The "PICKS DIFFER" screen, entirely** | It announced the *absence* of information, which is the default state of every pack and therefore not news. A player who sees no collision already knows the picks differed. Silence carries it. The collision keeps its gold slam — it is the only thing a draft ever tells you, so it should be the only thing that interrupts. |
| **The "Ship draft" / "Card draft" page header** | Replaced by a phase card on the way in: the game names a phase once, loudly, instead of forever, quietly. |

---

## Deployment

| Removed | Why |
| --- | --- |
| **The "Deploy" page header** | As above — the phase card carries it, and this frees real vertical space on a screen that wants the board large. |
| **The "Your fleet" heading** | It labelled three of your own ship cards, in a tray, on the deployment screen. |
| **The commitment-hash paragraph under the button** | Moved to the "both committed" beat, where the two hashes are actually shown sealing. A claim about honesty is better made with the artefact than with a sentence about it. |

---

## Main menu

| Removed | Why |
| --- | --- |
| **The "Season rank #N" pill** | A rank is a rating read against the pool — the same fact, one click away on the Season screen, which exists for exactly this. |

---

## Arena and Tournament tier pickers

| Removed | Why |
| --- | --- |
| **The "Rating 1080–1320" band, printed on all four tiers** | It was the *same range* on every tier, because it is a property of your rating and not of the table. Stated once, under the row. |
| **"To winner ◎ 0.0950" from the summary row** | Pot minus rake, both of which are on that same row — and the figure itself is already on the tier card you are choosing between. |
| **The `title=` tooltip on a locked tier** | Replaced by a real hover reason that says what unlocks it, rather than a browser tooltip that says it is locked. |

---

## Leaderboard

| Removed | Why |
| --- | --- |
| **The payout-curve panel** | The identical chart is the Season screen's whole reason to exist. The ladder lives here; what it pays lives there. The remaining column now has room to breathe. |

---

## Result

| Removed | Why |
| --- | --- |
| **One of "REMATCH" / "NEXT OPPONENT"** | Two buttons calling the *same function*. The queue finds whoever is available, so there was never a rematch to offer. Now one button, "PLAY AGAIN", doing the one thing it always did. |

---

## Settings

| Removed | Why |
| --- | --- |
| **"Last cues: hit, miss, charge-placed…"** | A debug readout. A player does nothing differently for it. |
| **"N sound cues and M visual hooks are wired"** | Numbers about the build, not about the game, on a player-facing screen. The licensing sentence that mattered stayed. |

---

## Bracket

| Removed | Why |
| --- | --- |
| **The per-seat stake, "◎ 0.05 staked ✓" ×8** | Every seat stakes the same figure, and it is already in the screen title and the pot row. The tick stayed; the amount went. |
| **"decided" under a finished match** | The row is already struck through and ticked. The label now appears only where it says something the box does not. |

---

## Credits, Error states

| Removed | Why |
| --- | --- |
| **Monospace on the licence URL and on error messages** | Not addresses, hashes, signatures or coordinates — see `docs/TYPOGRAPHY.md`. They read better in the body face. |

---

## What replaced nothing

Worth stating plainly: **most of these were not replaced by anything at all.**
The hull readout, the card count, the bank total, the rating band printed four
times, the "to winner" line, the duplicated payout chart, both debug readouts,
the "decided" label, the per-seat stake, the length words, the coordinate
labels on your own water, the season-rank pill and the PICKS DIFFER screen are
simply gone. The screens are quieter and say exactly as much as they did.

The three things that *were* replaced — the page headers by phase cards, the
timer bar by a draining button, the commitment paragraph by a sealing beat —
each moved a fact from permanent to momentary, which is the whole trade this
build was about.

---

## Two things deliberately kept

Recorded here because they look like duplicates and are not:

- **The per-tier payout pill** on the arena cards, alongside the pot/rake row.
  The pill is what you compare *across* tiers without selecting each one; the
  row explains where the money goes on the one you have picked.
- **Both hull pip rows** in the battle top bar, yours and theirs. It reads as
  one element repeated, but it is two different players' hull, and the pair is
  the only place either number appears.
