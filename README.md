# Fathom

**Sound the deep. Sink the fleet.**

A 1v1 asynchronous tournament game: naval grid combat crossed with drafting.
Two players draft hulls and action cards, deploy their fleets in secret, and
fire at each other's grids until one fleet is gone.

Fathom is a game of deduction under fog. Your opponent's fleet is never
declared — you learn it from what you saw pass through the draft and from
what sinks.

## Status

Playable end to end, offline, installable. You can start a run, draft hulls
and cards, deploy a fleet, fight a full match against the AI, advance or drop
through a double-elimination bracket, and reach a championship or elimination.

Phase 3 (online play) has not started and needs explicit go-ahead.

## Commands

```sh
npm install
npm run dev                       # dev server
npm test                          # unit tests
npm run sim                       # balance harness (400 matches, seed 42)
npm run sim -- --matches 2000 --seed 42 --voyage 6
npm run build                     # production PWA build
npm run build:standalone          # single self-contained HTML file
```

`npm run sim` writes `sim-report.md` and exits non-zero if any balance band
is out. No balance change lands without it green.

## Architecture

```
src/
  engine/          PURE. No React, no DOM, no Math.random, no Date.now.
    rng.ts         seeded mulberry32; all randomness is explicit state
    types.ts       state, actions, content shapes
    state.ts       createMatch
    reduce.ts      (state, action) => state — the one entry point
    clientView.ts  the ONLY projection a UI or network layer may render
    deduction.ts   belief over possible enemy fleets from draft observations
    resolve/       shot, energy, availability, victory
    draft/         shipDraft (packs of four), cardDraft (open row)
    map/           patch assembly + validation
    fleet/         placement legality, ship abilities
  content/         all game data — ships, cards, patches, modifiers, voyage
  ai/              opponent + probability-density heuristics
  sim/             headless harness, balance bands, report
  art/             tokens, procedural SVG placeholders, single-swap registry
  game/            run/save layer and the UI store
  ui/              screens and components
```

Determinism is the product: same seed and same action log must produce a
byte-identical final state. Online play, replays, spectating and server-side
validation all depend on it, and the harness asserts it.

All content is data. Adding a card means composing an effect in
`src/content/cards.ts` — never touching engine logic.

## Rules in brief

**The match.** Square or rectangular grid assembled from 4×4 terrain patches.
Ships are placed in secret along any of four axes — horizontal, vertical, or
either diagonal. Players alternate turns. You win when every enemy ship is
fully sunk.

**Energy.** Income at the start of your turn, plus **1 energy the moment you
hit a cell** — spendable in that same turn, so a cheap probe that lands two
hits can pay for a card you could not afford when the turn began. Unspent
energy banks with no cap. Turtling is self-punishing: passing means no hits,
which means no income beyond the base.

**The tray.** No hand, no deck, no draw. Every card you draft sits in your
tray permanently. Playing a card makes it unavailable for exactly your next
turn; it is back the turn after. `basic_salvo` is exempt and undraftable, so
you can always act.

**Hidden information.** Your opponent sees only the cards you have already
played. Fleet composition is never declared — a sinking announces the ship's
**length**, never its name, and hull names are revealed at match end.

**The draft.** Hulls are drafted in passing packs of four: you keep one, burn
one face down, and pass two on. Burned hulls leave the match permanently and
are never revealed. Action cards are drafted from a shared, fully visible row
in snake order. Cards public, ships hidden.

**Terrain.** Reef blocks line effects and cannot be built on; fog hides what
was struck; trench cells take two hits; shallows betray their neighbours. One
face-up terrain modifier is drawn per match and twists exactly one of those
rules for both players.

**Voyages.** A campaign runs 3 to 8 rounds, chosen at creation. Fleets and
trays persist and grow; the grid grows from 8×8 to 12×12. Double elimination —
two losses ends a run.
