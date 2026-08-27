# ARMADA

A fast, offensive, hidden-information PvP game for the web, wagered on Solana.
Two players, a 6×6 sea, three ships each, twelve cards, twenty-second rounds,
both plans resolving at once. Matches run four to twelve minutes.

Ground-up build. Nothing from any earlier project survives in this repository.

```
npm install
npm run dev          # play it — no wallet, no signup, straight into a match
npm test             # 68 engine and server tests
npm run sim          # 12,000 bot matches and the balance bands
npm run smoke        # a real browser plays a real match end to end
npm run chain:local  # build, deploy and prove the escrow on a real validator
npm run manifest     # regenerate ASSETS.md from the game's own content
npm run icons        # re-fetch the icon set and regenerate the credits
```

## The game in one paragraph

Both players draft three ships from three packs of four — one length-4, one
length-3, one length-2 — picking in secret and revealing together. If you both
reach for the same ship you both get it, and that collision is the only thing
either of you learns. The same mechanism drafts three action cards from a pool
of twelve; everything neither player took becomes a shared face-down draw pile.
Fleets deploy in secret onto a 6×6 grid and the layout is hashed and committed
before a shot is fired. Then rounds: place exactly one charge on one card, fire
your free deck gun at one cell, optionally fire one card and trigger one ship
ability, and commit — both plans resolve simultaneously against the same board,
so a ship that dies this round still lands every shot it fired. Firing a card
spends every charge on it and destroys it permanently. Charges are public on
both sides. A sink announces a length and never a name.

## Layout

```
src/engine/     the rules. Pure, deterministic, headless, no React and no DOM.
src/server/     the authority. Owns every match; the client never asserts state.
src/bots/       four opponents, all reading the same client view a human gets.
src/sim/        the balance harness and its report.
src/ui/         twelve screens, licensed icon set, sound and VFX hooks.
src/chain/      session keys, seed commit-reveal, program client, adapters.
src/state/      the client store, rating, modes and season maths.
chain/program/  the native Solana escrow program (Rust, no Anchor).
```

### The client is never trusted

`src/server/matchServer.ts` owns the match. It hands out `ClientView`s and
accepts commands; there is no method that returns state. Both players' plans
are held until both arrive, so a plan cannot be informed by the opponent's.
Reconnecting inside the grace period returns a view and the last round's beats,
never the state. All of that is tested rather than asserted.

### The engine is the product

`src/engine/**` never touches `Math.random`, the wall clock, the DOM or React.
Every random decision — pack order, pile order, Dreadnought's scatter, a
timed-out player's shot — is drawn from a seeded generator whose state is
carried explicitly through the state and advanced by returning a new one. Same
seed and same inputs give the same match, every time, which is what makes a
match replayable by a third party and what makes twenty thousand simulated
matches mean anything.

### Hidden information is enforced, not hoped for

Hiding something in the UI is not hiding it — anyone can open the network tab.
So the projection happens in the engine: `clientView(match, player)` is the only
shape a client is ever handed, and a test asserts that an opponent's view
contains no ship placements, no pile contents, no unrevealed card identities
and no seed. The bots plan from that same view, which means a bot cannot cheat
by construction; if the view were insufficient to play well, the bots would be
the first thing to break.

## Balance

`npm run sim` plays 2,000 seeded matches for each of five bot pairings, twice
over — once under each reading of the one genuinely ambiguous rule — and
reports against the bands from the brief. It writes `sim-report.md`.

**Nothing in `src/engine/balance.ts` has been tuned to make a band pass.** Two
bands currently fail, both are reported with numbers, and both have a proposed
change waiting on a decision. See `RULINGS.md`.

## Where the open questions live

`RULINGS.md` is the important document. It lists every place the specification
is ambiguous or self-contradictory, what the code currently does, and which
ones change how the game plays rather than just how it is written. Four are
marked **decision needed**.

`docs/SOLANA.md` covers the chain architecture, exactly what the verifiability
claim does and does not prove, and a VRF recommendation with reasoning — the
recommendation is deliberately *not* implemented, because that choice was
reserved.

`ASSETS.md` is the generated manifest: 91 assets with exact dimensions, aspect
ratios, call sites and descriptions. It is regenerated from the game's content
lists so it cannot drift.

## Status

Playable end to end against four difficulties of bot. The escrow program is
written, deployed and exercised against a real Solana runtime — `npm run
chain:local` proves it from nothing in one command, with 31 on-chain checks
moving real lamports. Public devnet deployment is blocked only on faucet
funding from this environment; see `docs/SOLANA.md`.

Art: 30 assets sourced under a verified licence, 29 drawn procedurally, 41
still to generate. `ASSETS.md` says which is which; `ASSETS_CREDITS.md` records
author, source, licence and date for every third-party file.

Not built, per the brief: 2v2, chat, friends, lobbies, cosmetics, NFTs,
mainnet, native apps, tournaments.
