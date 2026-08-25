# Rulings — where the build prompt is open, and what I did about it

The working protocol is *raise, don't guess*. Everything below is a place the
prompt is genuinely ambiguous or self-contradictory. Each one is implemented so
the game is playable today, but **the reading is provisional** and every one of
them is a question. Where a ruling changes how the game plays rather than just
how it is coded, it is marked **decision needed**.

Nothing in `src/engine/balance.ts` was changed to make a test or a band pass.

---

## Q1 · The draw pile cannot always be nine cards — **decision needed**

§2 says: *"three packs of 4 drawn from the 12-card pool… The 9 undrafted cards
form a single shared face-down draw pile."*

Three packs of four consume the whole twelve-card pool. Each player takes one
card per pack, so between them they take three to six **distinct** cards. Nine
cards are left over only if all three packs collided; if none collide, six are
left.

**Implemented:** the pile is every card neither player drafted — six to nine
cards, exactly nine when all three picks collide. It stays shared, face down,
and depletes. No card ever exists in more than the copies drafted.

**Alternatives** if you meant something else: (a) the pile always holds nine
because each player's own three are removed from a *separate* twelve-card
stack — that means two piles, which contradicts "single shared"; (b) the pile
is topped back up to nine with duplicates.

## Q2 · "Both reveal at the same time" cannot mean the pick is shown

§2 says both players reveal simultaneously, and then says the deduction
property to preserve is that *"an opponent's pick is one of 4 possibilities per
pack unless they collided with yours."* Those are only compatible if the reveal
shows **whether you collided**, not what they took.

**Implemented:** the draft reveal announces COLLISION or PICKS DIFFER and
nothing else. This also matches §10's instruction to "emphasise the collision
moment", and it is what keeps 64 enemy fleets on the table.

## Q3 · The hit bonus: per hit, or per round? — **decision needed, with data**

§3 says *"Landing a hit grants 1 bonus charge."* A five-charge Salvo that lands
four hits either grants four charges or one.

**Implemented:** per hit (the literal reading) as the default, with the other
reading available as `config.hitBonusMode: 'per-round'`. Both are measured on
every sim run because the difference is large:

| | median match length | draws |
|---|---|---|
| per-hit (default) | **9 rounds** — below the 10–16 band | 8.7–9.2% |
| per-round | **10 rounds** — inside the band | 8.4–10.7% |

Per-round fixes the match-length band on its own. It does not fix draws (see
the balance report). My recommendation is per-round, but it is your call.

## Q4 · Where charges "gained" actually land

Several effects say *gain N charges* without saying which card receives them:
the hit bonus, Mirror's payoff, Ember, Forge. Since charges live on cards and
never in a pool, they need a home.

**Implemented:** the player nominates a card in their plan (`bonusTo`). If that
card is gone or was never named, the charges go to whichever card is already
fullest — deliberately not random, so the outcome is predictable. Dreadnought
and Cinder say "at random" explicitly and are the only ones that scatter.

## Q5 · Charge theft cannot shrink a card that is already firing

Jam and Siphon resolve in step 2; attacks resolve in step 4. If theft applied
to a card being fired this round, a Jam could halve an incoming Salvo, and two
opposing Jams would form a loop with no defined answer.

**Implemented:** every fired card's charge count is locked at the reveal. Theft
takes from banked charges only. This is tested (`cannot shrink a card that is
already in the air`).

## Q6 · You may charge and fire the same card in the same round

The charge is compulsory and lands before firing, so a card can be topped up
and spent immediately. Nothing forbids it and forbidding it would make the
mandatory charge feel like a tax.

## Q7 · Mirror's "their entire attack" — **decision needed**

§4 says a triggered Mirror makes *"their entire attack"* miss.

**Implemented:** every cell that player would have fired at this round — free
basic attack, fired card, and ship ability alike. That is a very large payoff
for one correct guess, which is presumably the intent, but the narrower reading
("only the card that included the named cell") is defensible and much weaker.

## Q8 · Predictions read declarations, not survivors

If both players play predictions, they must not depend on each other's
outcomes. **Implemented:** Mirror and Ambush both evaluate against what the
opponent *declared*, before any nullification. A Mirror that fires does not
hide its owner's cells from the opposing Ambush.

## Q9 · Beacon cannot read and then aim in a simultaneous round

Beacon says *"learn how many ship cells occupy each. Then fire 4 cells
anywhere."* Both plans are committed before either is revealed, so there is no
moment in the round at which the player could see the readout and then choose.

**Implemented:** all four cells are declared up front; the readout is reported
during resolve and is usable from the next round. The alternative is to make
Beacon interrupt the round for its owner, which breaks simultaneity.

## Q10 · Echo: who picks the cell that gets revealed

*"the opponent must reveal one further occupied cell of that same ship"* — the
opponent would choose, but there is nobody to ask inside a resolved round.

**Implemented:** the lowest-indexed unhit, not-yet-revealed cell of that ship.
Deterministic, and it cannot be gamed by either side.

## Q11 · Kiln lets two cards leave your hand in one round

§5 defines ACTIVE as *"an extra action taken in addition to the player's card
that round"*, so Kiln's card is a second card fired, on top of the one-card
limit. **Implemented that way**, and tested.

## Q12 · Siphon's destination

Siphon is destroyed when it fires, so it cannot receive its own steal.
**Implemented:** the destination must be another card in hand.

## Q13 · REACT chains need a stop

Thorn fires back at every cell the opponent fired at. That can sink a ship
whose REACT fires back again. Two facing Thorns would loop forever.

**Implemented:** a cascade cap of four (`BALANCE.reactCascadeLimit`). No sim
match has ever reached it, but the engine cannot be allowed to hang.

## Q14 · Two effects reaching for the same charges

Both players can steal from the same card in the same step.
**Implemented:** all claims are scored against the pre-step snapshot and scaled
down proportionally when they exceed what is there, with a deterministic
remainder. Nobody ever receives a charge that did not exist. Tested.

## Q15 · REACT ordering when both players lose ships

§7.3 step 6 says only *"resolve both"*. **Implemented:** player 0's, then
player 1's. Any fixed order is arbitrary; this one is at least deterministic
and replayable. If seating order matters competitively, this should become
"the player who was attacked first" or similar.

## Q16 · An unaimed basic attack

The basic attack is free and every round, but a player might commit without
aiming it. **Implemented:** an unaimed basic attack simply does not fire. A
*timed-out* plan is different — §7.1 says it fires at a random unfired cell,
and it does.

## Q17 · "Already has damage" for Breaker and Warhead

**Implemented:** damage taken **before this round**. A ship that takes its
first hit from the same 2×2 that would execute it is not executed. Otherwise
Breaker would be a flat "sink any ship in this 2×2", which is a different card.

## Q18 · Refilling the hand

§3: *"When a player's hand drops to 1 card, they draw 1 … at the start of each
round until back to 3."* **Implemented:** whenever the hand is at one card or
fewer at the end of a round, draw one, if the pile has any left. That is the
same thing as drawing at the start of the next round, one round earlier in
wall-clock terms.

## Q19 · Round-20 draws count in two bands

A round-20 finish that is level on hull cells is both a "round-20 timeout" and
a "draw". The report counts it in both, and breaks the draw figure down by
cause so the two are never confused.

---

# Open design questions from the sim

Both of these are reported with numbers in `sim-report.md` and **nothing has
been changed in response to either**.

### The draw rate is structural, not a tuning problem

Draws come in at **8.4–10.7%** against a target of under 8%, and in the
mirror-matchup runs **100% of them are mutual elimination** — zero round-20
stalemates. Two symmetric nine-cell fleets, both hunting with the same
information, tend to die in the same round. Making the game less lethal makes
this *worse*, not better: the per-round hit bonus lengthens matches and pushes
draws up.

Measured counterfactual: **22–45% of mutual eliminations entered the final
round with unequal hull cells.** Breaking that tie on hull count going into the
last round would put the draw rate at **5.5–7.3%**, inside the band, without
touching a single card.

That contradicts §8, which says both fleets eliminated in the same round is a
DRAW with stakes returned. So it is your decision. The commercial note in §12
cuts in favour of the tiebreak: at 9% draws in Arena, players bleed to nothing
— though note that a draw takes **no** rake, so the bleed is time, not SOL.

### Ambush never fires below level 3

The Mate bot fires every card except Ambush (0.0%). Ambush is the only card
whose value depends entirely on predicting the opponent, and the Mate does not
model the opponent at all. At Officer and Admiral it fires normally. I read
this as a bot limitation rather than a dead card, but it is worth knowing that
Ambush is invisible to a player who is not yet reading their opponent — which
is most new players.
