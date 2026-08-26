# Rulings

Every rule that the original build prompt left open, who decided it, and what
the code does. Working protocol is *raise, don't guess*: nothing below was
invented to fill a gap without being written down here first.

**Provenance key**

- **RESOLVED — Aris** — you ruled on it. Not to be reopened.
- **RESOLVED — Claude Code** — I made the call; you accepted it in Build 2.

---

## Rulings from Aris (Build 2)

### Q1 · The hit bonus is per round — RESOLVED — Aris

Landing one or more hits in a round grants exactly **one** bonus charge,
however many cells connected. It lands at end of round and cannot be spent in
the round it was earned. The player nominates where it goes as part of their
plan (`Plan.bonusTo`); a timed-out plan places it at random.

The `hitBonusMode` config flag is gone — there is one behaviour and no dead
branch. Tested by *"grants exactly one bonus charge however many cells
connect"*.

### Q2 · Mutual elimination breaks on hull cells — RESOLVED — Aris

Supersedes §8 of the original spec. Win conditions are now:

| Situation | Result |
|---|---|
| All 3 enemy ships sunk, yours alive | win (`fleet`) |
| Both fleets eliminated in the same round | the player with more hull cells **at the start of that round** wins (`mutual`) |
| Both eliminated, equal hull at the start of the round | draw |
| Round 20 reached | more hull cells wins; equal is a draw (`cells`) |
| 3 missed timer strikes | forfeit |
| Disconnect past grace | forfeit |

The measurement has to happen before any damage is applied, because by the end
of the round both numbers are zero. `resolveRound` snapshots it on entry and
hands it to `checkOutcome`.

**Confirmed by the sim: draws fell from 8.7–9.2% to 6.0–6.9%**, inside the
5.5–7.3% you predicted. Every remaining draw is a genuine level-pegging mutual
elimination — there are still zero round-20 stalemates.

### Q3 · No VRF — RESOLVED — Aris

Match randomness stays three-party commit-reveal. The research stays in
`docs/SOLANA.md`, now noting explicitly that a VRF becomes relevant for season
payout tiebreaks or any pooled draw, and never for match state.

### Q4 · Three-party seed — RESOLVED — Aris

`seed = H(server | playerA | playerB)`, each contribution committed before any
is revealed. This is the spec, not an embellishment of it.

### Q5 · The pile is 6–9 cards — RESOLVED — Aris

The draw pile is every card neither player drafted.

**Consequence, as asked.** Both players saw all twelve cards during the draft,
so the pile's *contents* are largely deducible — only its *order* is secret.
The sim says this is not currently deciding matches: round-20 finishes are
**0.0%** across every pairing, so no match is reaching the point where a lucky
draw decides it, and the comeback rate (24.4% in the unbiased pairing) is
driven by the charge economy rather than by draws. **No case for enlarging the
pool on present evidence.** Worth re-checking if match length ever rises.

### Q6 · Mirror stays wide, and now needs 2 charges — RESOLVED — Aris

Implemented: `CARDS.mirror.minCharges = 2`. A triggered Mirror still cancels
the opponent's entire round — basic attack, card and ship ability — and still
pays `C × 2` charges.

**But the tuning you asked for produced the opposite of the expected result,
and it changes the conclusion. See "Mirror is not oppressive" below.**

---

## My rulings, accepted in Build 2

All fifteen stand. Listed here for provenance; the reasoning is unchanged.

| # | Ruling | Status |
|---|---|---|
| 1 | The draft reveal shows **collision only**, never the opponent's pick — the only reading under which §2's "both reveal" and its 64-fleet deduction property can both be true | RESOLVED — Claude Code |
| 2 | Charges "gained" land on the card the player nominates (`bonusTo`), falling back to the fullest card. Only Dreadnought and Cinder scatter at random, because only they say so | RESOLVED — Claude Code |
| 3 | Every fired card's charge count is **locked at the reveal**. Theft takes banked charges; it cannot shrink a card already in the air | RESOLVED — Claude Code |
| 4 | A card may be charged and fired in the same round | RESOLVED — Claude Code |
| 5 | Predictions evaluate against what the opponent **declared**, before any nullification, so two predictions can never depend on each other's outcome | RESOLVED — Claude Code |
| 6 | Beacon declares its four cells up front; the readout is reported during resolve and is usable from the next round. Simultaneity leaves no moment to read-then-aim | RESOLVED — Claude Code |
| 7 | Echo reveals the lowest-indexed unhit, not-yet-known cell of the ship | RESOLVED — Claude Code |
| 8 | Kiln's card is a **second** card fired, on top of the one-card limit — ACTIVE is defined as an extra action | RESOLVED — Claude Code |
| 9 | Siphon cannot be its own destination; it is destroyed when it fires | RESOLVED — Claude Code |
| 10 | REACT chains are capped at four waves as a hang guard | RESOLVED — Claude Code |
| 11 | Simultaneous charge claims are scored against the pre-step snapshot and scaled down proportionally; nobody receives a charge that did not exist | RESOLVED — Claude Code |
| 12 | Both players' REACTs resolve in seat order, player 0 first | RESOLVED — Claude Code |
| 13 | An unaimed basic attack does not fire; a *timed-out* one fires at a random unfired cell | RESOLVED — Claude Code |
| 14 | "Already has damage" for Breaker and Warhead means damage taken **before this round** | RESOLVED — Claude Code |
| 15 | The hand refills whenever it is at one card or fewer at end of round, one card per round, while the pile lasts | RESOLVED — Claude Code |

### Interactions with the three new rulings

Checked all fifteen against Q1, Q2 and Q6. **One needs restating and one is
worth flagging:**

- **#2 (where gained charges land) is now more important, not less.** Under the
  old per-hit bonus a big Salvo showered charges everywhere and the placement
  hardly mattered. At one charge per round, the single bonus is the *only*
  charge a player places besides their mandatory one, so `bonusTo` is now a
  real decision every round rather than a rounding error. The UI must surface
  it — it does, as part of the next plan.
- **#12 (REACT seat order) still bites in exactly one case**, and Q2 does not
  fix it: if both players' last ship dies in the same round and both fielded
  Spite, the charge wipes resolve player 0 first. Since the match is over at
  that point the ordering is cosmetic, so this stays a known, harmless
  asymmetry rather than something to spend a rule on.

Nothing else interacts.

---

## The two double-checks you asked for

### Kiln + Ambush at zero charges → yes, a whole-row answer

Kiln fires a card as though it held three more charges. Ambush at 0 becomes
Ambush at 3, which is its whole-row band.

**Decision: allow it.** It reads as a combo rather than a loophole, and it is
expensive in a way the charge count hides: it spends Kiln (once per match),
spends Ambush, and pays out *only* if the read lands — the opponent has to
actually fire at the named cell. A player who calls it wrong has burned their
length-3 ship's ability and a card for nothing. That is a real gamble, which is
what Ambush is for.

Implemented (it fell out of the existing charge plumbing) and now tested by
*"lets Kiln turn a zero-charge Ambush into a whole-row answer"*.

### Two Thorns in one round → confirmed, and it was wrong before

You were right to ask. The code **did** recurse: the cascade loop was passing
the previous wave's attacks into the next `collectReacts`, so a Thorn sunk by
another Thorn's return fire would have mirrored *that* fire rather than the
round's declared salvo.

Fixed. The declared attacks are captured once, before any REACT resolves, and
every Thorn mirrors that same list no matter what killed it. The four-wave
cascade cap remains as a hang guard but is now unreachable in normal play,
since each ship can only sink once. Tested by *"does not let two Thorns answer
each other"*, which asserts exactly two mirrored shots and no third wave.

---

# Balance findings — Build 2

Full numbers in `sim-report.md`. 2,000 seeded matches per pairing, six
pairings. **Nothing in `src/engine/balance.ts` or `cards.ts` was changed to
make a band pass.**

## A methodology fix that changed two conclusions

Two of the numbers I reported in Build 1 were measuring the **bot's opinions,
not the game**, and both had to be fixed before anything could be concluded:

1. **Four of the twelve ships were never drafted at all.** The bot's value
   table always preferred something else in their pack, so Dreadnought, Cinder,
   Pin and Thorn had no win rate and the per-ship band passed over them in
   silence. Same for two cards: Mirror and Sounding were never drafted and only
   reached play from the pile.
2. **Per-ship win rate counted contested drafts.** When both players field the
   same ship it scores once for the winner and once for the loser, dragging
   every number to 50% — and in a pairing where both bots draft identically it
   pinned all twelve at exactly 50%, hiding everything.

Both fixed: there is now a sixth pairing, **L4 vs L4 (random drafts)**, which
plays at full strength but chooses pieces blind, and win rates count only
uncontested drafts. The cross-seat bands (first blood, comeback) are scored
only in mirror pairings, because in a mismatch they measure the skill gap by
definition.

## Mirror is not oppressive — the Build 1 signal was a drafting artifact

You asked me to raise the threshold to 3 if 2 left it dominant. **Raising it
makes the number worse, and the number was misleading anyway.**

Measured on identical seeds, win rate of the seat that fired Mirror:

| Mirror threshold | Win rate when fired | Times fired |
|---|---|---|
| 2 (shipped) | 64.4% | 620 |
| 3 | 66.5% | 428 |
| 4 | 68.2% | 285 |
| 5 | 65.7% | 178 |

A higher price does not weaken the card; it just fires less often, at more
charges, for a bigger payoff. The threshold is not the lever.

But the whole 64% figure was an artifact. The bot rates Mirror the *worst* card
in the pool, so it never drafted it — every one of those firings came from a
pile draw, and a player drawing from the pile is a player who has already spent
two cards, which correlates with having a good match. **When every card is
drafted at an equal rate, Mirror comes in at 57.6%, one point clear of Burst at
56.5%, and the prediction band passes.**

| Card | Win rate when fired (unbiased pairing) |
|---|---|
| Mirror | 57.6% |
| Burst | 56.5% |
| Breaker | 56.0% |
| Rake | 55.9% |
| Ping | 55.2% |
| Ambush | 54.9% |
| Salvo | 52.8% |
| Echo | 50.8% |
| Lance | 50.7% |
| Siphon | 46.4% |
| Jam | 45.5% |
| Sounding | 42.5% |

**Recommendation: keep the 2-charge threshold, change nothing else about
Mirror.** The threshold is still worth having — it stops cheap fishing, which
was the design intent — but the card does not need weakening. The real
outliers at the bottom are Sounding (42.5%) and Jam (45.5%).

## The one band still failing: per-ship win rate

Band is 42–58%. Measured in the unbiased pairing, uncontested drafts only:

| Ship | Pack | Type | Win rate | n |
|---|---|---|---|---|
| **Beacon** | B | ACTIVE | **67.4%** | 743 |
| **Ember** | C | ACTIVE | **60.9%** | 749 |
| **Forge** | A | ACTIVE | **60.0%** | 724 |
| Warhead | A | ACTIVE | 52.0% | 747 |
| Kiln | B | ACTIVE | 51.0% | 787 |
| Thorn | C | REACT | 50.5% | 721 |
| Spite | C | REACT | 45.9% | 736 |
| Dreadnought | A | REACT | 45.0% | 777 |
| Blackout | A | NERF | 43.4% | 744 |
| Pin | C | ACTIVE | 42.8% | 772 |
| Leech | B | NERF | 42.5% | 751 |
| **Cinder** | B | REACT | **39.3%** | 751 |

**Diagnosis: free shots beat everything else, and it is not close.** The top
three are the only three abilities that hand you extra attacks for no charge —
Beacon fires four cells *and* reads a row and a column, Ember fires four cells
*and* pays charges for hits, Forge fires three *and* pays two. Everything at
the bottom spends its once-per-match on denial (Blackout, Leech, Pin) or on a
death rattle (Cinder, Dreadnought, Spite). In a game that ends in eleven
rounds, four free shots is roughly a fifth of your whole offensive output; two
charges of denial is not.

Beacon is the worst offender because it is strictly Ember plus intel.

### Proposed fix — four values — **APPROVED by Aris in Build 4 and applied**

Applied exactly as tabled below, nothing else touched. Applying the Cinder
change surfaced a latent engine bug: REACT death-rattles wrote restrictions
directly onto the player state, which the end-of-round restrictions swap then
discarded — so the old exactly-2 lock had never actually bound in play. The
new fire-lock is routed through `nextRestrictions` like Pin's, and a unit test
now pins the behaviour (`locks every enemy card for a round when Cinder dies`).

| Ship | Now | Proposed | Why |
|---|---|---|---|
| **Beacon** | read a row and a column, then fire 4 | read a row and a column, then fire **2** | Keeps its identity as the intel ship. It should not also be the best attacker in the game. |
| **Ember** | fire 4, gain 2 charges per hit | fire **3**, gain 2 charges per hit | Still the aggressive length-2, one shot less explosive. |
| **Forge** | fire a 3-line, gain 2 charges | fire a 3-line, gain **0** charges | Three free shots is already the payoff; the charges were doubling up. |
| **Cinder** | gain 2 at random; they cannot fire a card holding exactly 2 next round | gain 2 at random; they **cannot fire a card next round** | The exactly-2 clause almost never binds — it is a lockout that usually locks nothing. This makes a dying Cinder actually cost them a turn. |

Expected effect: pulls Beacon and Ember toward the high 50s, lifts Cinder off
the floor. Blackout, Leech and Pin were left alone in the same pass on
purpose — with the top three brought down, the whole distribution shifts, and
changing seven ships at once means learning nothing from the result.

Post-patch measurements (L4 vs L4 random drafts, n=2000, the measuring
pairing):

| Ship | Before | After | Band 42–58% |
|---|---|---|---|
| Forge | 60.0% | in band | ✓ |
| Cinder | 39.3% | in band | ✓ |
| Ember | 60.9% | in band | ✓ |
| **Beacon** | 67.4% | **62.9%** | **still high — the nerf undershot** |

Nothing previously healthy fell out of band; the three bands that were
already failing before the patch (L3 vs L3 median 9 rounds, L2 bots never
firing Ambush, denial abilities unused in the L4-vs-L1 stomp pairing) fail
identically after it — they are bot-behaviour artifacts of lopsided or
low-skill pairings, not balance regressions. L3 vs L3 first-blood actually
improved from 66.2% (FAIL) to 64.7% (PASS).

**Beacon undershoot, reported and not self-corrected:** 2 cells still rides
on the row+column read. If a further step is wanted, the smallest next
candidates are 1 cell, or keeping 2 cells but dropping one of the two
readouts. Awaiting a call.

### Build 5 ruling — Beacon reads one axis, applied

Aris ruled: keep 2 cells, cut a readout. Beacon now names a row **or** a
column (player's choice) and learns that one count. Post-patch, measuring
pairing (L4 vs L4 random drafts, n=743): **Beacon 56.9% — in band.**

New marginal: **Ember 59.4%** (n=749), just over the 58 line it sat inside
last run — the meta shifted when Beacon stopped absorbing wins, and 59.4 on
n=749 is within noise of the boundary. Reported, not self-corrected. The
three remaining band failures are the same pre-existing bot artifacts
(L3-vs-L3 median 9, L2 bots never firing Ambush, denial ships unused in the
L4-vs-L1 stomp), unchanged.

### Build 4 ruling — the card draft is blind-pick, canon

The Build 3 brief's line that the opponent's hand renders face up "(draft was
open)" was ruled wrong by Aris in Build 4: the implementation is canon. Both
drafts are blind-pick from a public pack; the only identity a draft leaks is a
collision, and the opponent's hand renders as card backs with public charge
gems, flipping face-up only what a collision made public.

## Everything else passes

In the two symmetric full-strength pairings (L4 vs L4, and L4 vs L4 random
drafts):

| Band | Result |
|---|---|
| Median match length 10–16 | **10 and 11** |
| Round-20 timeouts < 5% | **0.0%** |
| Draws < 8% | **6.9% / 6.0%** |
| All 12 cards fired in ≥5% of matches drafted | pass |
| All 8 ACTIVE/NERF used in ≥20% | pass |
| First-blood win rate < 65% | **63.4% / 61.0%** |
| Prediction cards not dominant | pass in the unbiased pairing |
| Comeback rate ≥ 15% | **25.0% / 24.4%** |

Charges when fired, unbiased pairing: median 3, with 1:10% 2:33% 3:27% 4:16%
5:7% and a thin tail past 6. The charge system is doing its job — a third of
cards fire at two, but nearly a quarter wait for four or more.

### Three marginal notes, not proposals

- **L3 vs L3 sits at median 9 rounds and 66.2% first blood**, both a hair
  outside. The Officer bot fires slightly earlier than the Admiral. Both
  full-strength pairings are inside the bands, so I read this as bot behaviour
  rather than game balance.
- **Ambush is fired 0% of the time by the Mate (L2)** — that bot does not model
  the opponent at all, so it can never value a prediction. A card invisible to
  a player who is not yet reading their opponent is worth knowing about, but it
  is not a card problem.
- **Blackout, Leech and Pin are barely used against the Deckhand (L1)** —
  their triggers require the opponent to have banked charges or to be worth
  denying, and a random bot never gets there.
