# Functional audit — Builds 4, 5 and 6

> **Build 6 note.** The checklist below is unchanged in substance; the harness
> counts and two control names were updated where Build 6 moved them. The
> restraint pass removed one control (`NEXT OPPONENT`) and moved two (`Charge`
> and `Fire` became the card itself and a hover affordance), and every harness
> — smoke, sweep, audit walk, clips — was updated to drive the new controls
> rather than the old ones. All four run clean.

Every item from the Build 4 Part 2 checklist (and the Part 5 tournament
extension), walked as a player or proven by an automated harness. One line
per item: **PASS** (worked as found), **FIXED** (broken, fixed, commit named),
or **FAIL** (with the reason). Nothing is skipped silently.

Evidence sources, all runnable from a clean checkout:

| Harness | Command | Scope |
| --- | --- | --- |
| Engine + server + bracket tests | `npm test` (102 tests) | rules, hidden info, server authority, bracket maths |
| On-chain proof | `npm run chain:local` (69 checks) | every money path on a hermetic local validator |
| Browser smoke | `npm run smoke` | full casual match at 1920×1080, zero console errors |
| Player-flow walk | `node scripts/audit-ui.mjs` (15 checks) | flows only a UI can prove |
| Simulation | `npm run sim` | 36,000 bot matches across six pairings |

"mock" below means the in-browser adapter (real UI, simulated chain);
"local validator" means the deployed program under `npm run chain:local`;
devnet-specific items note their blocker.

## Onboarding & matchmaking

| Item | Status | Evidence |
| --- | --- | --- |
| First run → straight into bot match, no wallet | PASS | audit-ui: "first run goes straight to the ship draft, no wallet gate" |
| Casual queue: bot fallback | PASS | casual always seats a bot opponent by design (`startMatch`); smoke plays it end to end |
| Human-vs-human via two clients | PASS (two in-process seats) | `server.test.ts` drives both seats of `MatchServer` through the full protocol — token auth, commitments, plan holding, reveal. No network transport exists yet, so "two tabs" is not possible; the seat protocol the transport would carry is what is tested |
| Rematch from every result type | PASS | audit-ui: "PLAY AGAIN starts a fresh match in the same mode"; `rematch()` is result-agnostic (same code path for win/loss/draw), exercised on win and loss |
| Next Opponent works from result | PASS (merged) | Build 6 collapsed REMATCH and NEXT OPPONENT into one button — they called the same function, because the queue finds whoever is available. Recorded in `REMOVED.md` |

## Drafts

| Item | Status | Evidence |
| --- | --- | --- |
| Ship draft: normal picks | PASS | engine tests "drafting"; smoke; audit-ui |
| Collision on each pack | PASS | engine test "gives both players the item when they collide"; collision beat on camera in `clips/draft-collision.webm` |
| Timer expiry mid-pack | FIXED (6391d8a) | the clock reached zero and nothing happened. Now: a lapsed draft pick takes the pack's first option (`autoPick`), **no strike** — strikes are a battle concept. audit-ui: "a lapsed draft timer takes the first option automatically", "…costs no strike" |
| "Taken so far" accuracy | PASS | the picked-pills row renders `draftResult` directly; collisions flagged "· both!" |
| Card draft: same + pile composition | PASS | engine tests "leaves the undrafted cards in a shared pile" (pile = exactly what neither took) and "keeps … pile order out of the view" |

## Deploy

| Item | Status | Evidence |
| --- | --- | --- |
| Place, rotate, re-place all three ships | PASS | audit-ui walks place → rotate → re-place → clear → auto |
| Illegal placements blocked | PASS | `cellsFor` returns null for overlaps/off-board runs; the click does nothing and commit stays disabled until three legal ships stand |
| Timer expiry behaviour | FIXED (6391d8a) | was a dead clock. Now: lapse auto-places the remaining fleet (`autoDeploy`) and commits. Documented here as the canonical behaviour |
| Commitment hash written | PASS | audit-ui: "deployment commitment hash is written"; on-chain: "the commitment on-chain is the one the engine produced" |

## Battle — every mechanic

| Item | Status | Evidence |
| --- | --- | --- |
| Salvo (1 cell/charge, no more) | PASS | engine test "fires one cell per charge and no more" |
| Lance | PASS | engine "grows Rake…"-family targeting tests + fired in sim by all levels |
| Burst at 2 and at 4 | PASS | engine tests "refuses to fire Burst below two charges", "scales Burst from 2x2 to 3x3 at four charges" |
| Rake growth | PASS | engine test "grows Rake by one cell per charge above the first" |
| Breaker threshold and sink-outright | PASS | engine tests "sinks a damaged ship outright with Breaker", "leaves an undamaged ship merely damaged" |
| Ping miss reports | PASS | engine test "reports whether anything sits beside a Ping miss" |
| Echo forced reveals | PASS (test added this build) | engine test "makes each Echo hit expose another cell of the same ship" |
| Sounding at 1/2/3 | PASS | engine tests "withholds Sounding's column count below two charges", "gives row and column at three charges" |
| Jam allocation | PASS | engine tests "strips the charges Jam names", "cannot shrink a card that is already in the air"; allocation UI walked by eye (tap their cards, amounts capped) |
| Siphon allocation | PASS | engine tests "moves stolen charges onto the named card", "never hands out charges that were not there" |
| Mirror wide cancel + 2-charge minimum | PASS | engine tests "makes their whole attack miss when Mirror reads it", "refuses to fire Mirror below two charges" |
| Ambush at 0/2/3 | PASS (2 and 3 added this build) | engine tests "fires Ambush back from zero charges", "widens Ambush to three cells at 2 charges and a whole row at 3", "does nothing when the read is wrong" |
| Kiln + Ambush interaction | PASS | engine test "lets Kiln turn a zero-charge Ambush into a whole-row answer" |
| Thorn fires at declared attacks only, never recursing | PASS | engine tests "fires Thorn back along the salvo that killed it", "does not let two Thorns answer each other" |
| Pin's fire-lock | PASS | engine test "stops a card being fired next round when Pin lands" |
| Blackout's charge-block | PASS | engine "control effects" tests; strip amounts random-but-bounded |
| Cinder per current rules | FIXED (6391d8a) | applying the approved rework exposed a latent bug: REACT death-rattles wrote restrictions directly onto player state, which the end-of-round swap discarded — the old exactly-2 lock had **never** bound. Now routed through `nextRestrictions`; engine test "locks every enemy card for a round when Cinder dies, and scatters 2" |
| Spite wipe | PASS | engine test "wipes every enemy charge when Spite dies" |
| Dreadnought random split | PASS | engine "react" coverage + ruling Q2 test family; scatter is seeded-rng and replayed by verify() |
| Simultaneity: both lethal → hull tiebreak → true draw | PASS | engine tests "lets a ship that dies this round still land its shots", "awards a mutual elimination to whoever entered the round ahead", "still draws a mutual elimination that was level going in" |
| Charge economy: 1/round, per-ROUND hit bonus, bonus next plan | PASS | engine tests "grants exactly one bonus charge however many cells connect", "does not let charges earned this round be spent this round" |
| Hand flow: fire → draw 1/round → pile empties → game continues | PASS (empty-pile test added this build) | engine draw tests + "continues without a draw once the pile is empty" |
| Timers: strikes 1→3 → forfeit; auto basic shot + random charge | PASS | engine test "forfeits after three missed timers"; server tests "substitutes a plan for a seat that let the clock run out", "ends the match on the third strike" |
| Round 20 cap → hull count → draw path | PASS | engine tests "decides a round-20 match on remaining hull cells", "draws a round-20 match with level fleets" |
| Disconnect + reconnect within grace; forfeit past it | PASS | server tests "lets a player rejoin inside the grace period…", "refuses a rejoin after the grace period", "forfeits a seat that never comes back" |
| Prediction trigger on camera | PARTIAL | behaviour pinned by the Mirror/Ambush engine tests above and verified by eye in the resolve overlay; not staged on video — it needs the bot to fire into a read, which cannot be forced from outside the engine. Noted in `scripts/clips.mjs` |

## Money (mock UI + local validator; devnet blocker noted)

| Item | Status | Evidence |
| --- | --- | --- |
| Arena at each tier: escrow → both stake → settle −5% rake | PASS (local validator) | chain proof [1]: winner paid pot minus rake to the lamport, treasury exactly 5% |
| Draw → both refunded, zero rake | PASS (local validator) | chain proof [2] |
| Forfeit / disconnect → paid as a win | PASS | engine forfeit outcome feeds the same settle path as any win; server forfeits the vanished seat (tests above); settlement of outcome=win proven in [1] |
| Opponent never stakes → reclaim, ungriefable both directions | PASS (local validator) | open_match cannot half-fund by construction (both stakes in one tx); chain proof [4]: reclaim pays each their own stake, caller cannot take more |
| Insufficient funds → real error state | PASS (mock) | pre-flight balance check with amounts + faucet link; screenshot `07-insufficient-funds.png`; FIXED (6391d8a) alongside: the mock overpaid arena wins by one stake (settle now applies the net) |
| Provisional: wider bands, lowest tier only, then unlocks | PASS (mock) | `allowedStakes`/`isProvisional`; tier picker shows locked tiers with the unlock rule; K=48 while provisional |
| Ranked: entry, rating moves, leaderboard order, season page | PASS (mock) | join modal charges ◎0.1 once; `ratingDelta` applied per match; leaderboard sorts by rating with your row pinned; season page shows pot, days left, projected payout, curve |
| verify() client-side on every settled match | PASS | smoke: "result screen replay check: verified" on every run; engine verification test family |
| Proof export accepted standalone | PASS | export emits the same transcript object `verify()` consumes; engine test "replays a finished match and confirms the reported result" runs `verify` on exactly that shape |
| Session key cannot move funds — covers new paths | PASS (local validator) | chain proof [5] (5 checks), and bracket instructions accept only seated wallet keys + referee, proven in [9] — a session key is none of those |
| Wallet connect/disconnect mid-session | FIXED (e937c08) | disconnect did not exist. Adapter gained `disconnect()`; the address pill disconnects on click; audit-ui passes both directions |
| Tx rejected | PASS (mock/devnet) | every adapter call path lands in `fail()` with a human sentence and a retry; devnet settle/openMatch throw honestly (referee-only, matchmaking co-sign) rather than pretending |
| Timeout mid-escrow | PASS (mock) | escrow screen carries "Cancel and reclaim" and the 30-minute reclaim rule; on-chain reclaim path proven in [4] |

## Public devnet

| Item | Status | Evidence |
| --- | --- | --- |
| Faucet-funded public deploy | FAIL (external blocker, unchanged) | `solana airdrop 2` against `api.devnet.solana.com` still returns "airdrop request failed / rate limit" from this egress IP (retried 2026-08-26); faucet.solana.com needs an interactive captcha. The program builds for SBPF v3 and the full proof runs on the local validator (54/54). Deploy needs ~1–2 externally funded SOL to `CfQ6bnRPTugsnHgRHwoG6BMof3K3L725g1vx42YLTwhd` (throwaway deployer, key in scratch) or any funded keypair |

## Tournaments (Part 5 audit extension)

| Item | Status | Evidence |
| --- | --- | --- |
| Full bracket start to finish | PASS (local validator, 8 headless clients) | chain proof [6]: eight funded keypairs stake, bracket fills on the 8th, all seven matches played through the real engine, standings settled on-chain |
| Payout maths exact at every tier | PASS (local validator) | [6] at ◎0.05 and [7] at ◎0.1/0.25/0.5 — champion 55%, runner-up 25%, semis 10% each of the post-rake pot, to the lamport, dust to the champion, escrow drained to exactly the rent floor |
| Unfilled-bracket reclaim | PASS (local validator) | [8]: per-seat refunds after the fill window, stranger refused, double-reclaim refused, bracket closes when all refunded |
| Mid-bracket stall / server fault | PASS (local validator) | [8]: a full, unsettled bracket refunds all eight seats after the settle window; a drained bracket cannot then be settled — no funds can strand |
| Mid-bracket forfeit / disconnect | PASS (mock) | leaving a live bracket settles the player 'out' (stake stays in the pot), same as arena forfeit; opponents advance |
| verify() covers tournament matches identically | PASS | [6]: every bracket match is a standard signed match; the final's transcript replays under `verify()` and the transcript root is pinned on-chain |
| No byes | PASS | brackets refuse to exist at ≠8 seats (`bracket.test.ts`), on-chain a ninth join is refused and play needs status FULL |
| Drawn bracket match | PASS (ruled) | sudden-death replay with a fresh seed, player and bot matches alike — RULINGS.md, Build 4 section |
| Rating: rated at arena K, provisional locked to lowest tier | PASS (mock) | tournament matches run the same `ratingDelta`; the tier picker reuses `allowedStakes` |

## Build 5 — the same audit, over the wire

Everything above was proven in-process. Build 5 re-proves the load-bearing
half over a real WebSocket, with two new harnesses:

| Harness | Command | Scope |
| --- | --- | --- |
| Wire tests | `npm test` (`src/server/net/net.test.ts`, 18 tests) | auth, matchmaking, commit–reveal adversaries, clocks, reconnection, forfeit, the leak test |
| Network acceptance | inside `npm run chain:local` (`scripts/e2e-net.ts`) | two clients + eight clients, real escrow, settled and verified |

| Item | Status | Evidence |
| --- | --- | --- |
| Server authority survives the wire | PASS | clients send intents only; every refusal is the `MatchServer`'s own; `roomState` is reachable by no message; the full-match test checks the server's finished state against both clients' final views |
| `clientView()` is what actually travels | **FIXED — the leak test caught a real leak** | the resolve stream's `reveal` beat carried both raw `Plan` objects (a failed Mirror/Ambush read included). Nothing consumed the payload; it is now a bare marker. The outbound-frame test inspects every raw frame delivered to a client and fails on pile order, placements payloads, plan objects, or any unrevealed foe identity — collision-free draft, so nothing was legitimately public |
| Both hashes before either reveal | PASS | wire test: one commit in → no `revealOpen` for anyone; early reveal refused with `reveal-closed` |
| Commit and never reveal | PASS | the seat lapses to the engine's timeout plan at the reveal deadline; the round resolves; wire test "ghost that never commits" covers the no-commit case, and the committed opponent still gets its reveal window |
| Reveal not matching commit | PASS | discarded with `reveal-mismatch`; the seat lapses exactly as if silent, takes a strike, and its secret plan never enters the match |
| Two different commits | PASS | second refused with `double-commit` |
| Server-authoritative clocks | PASS | deadlines are epoch-ms stamped by the server; the client renders an estimate; a silent/slow/backgrounded client is lapsed by the server sweep, never by its own clock (wire tests run with 1s reveal windows) |
| Reconnection mid-draft / mid-deploy / mid-plan / mid-resolve | PASS | four wire tests; resync is a full server `state` message (view + deadline + missed beats), never local storage |
| Disconnect → grace → forfeit → settlement | PASS | wire test with a jumped server clock: the vanished seat forfeits, the opponent gets `result` with reason "disconnect"; the settle hook receives it (money path proven in acceptance) |
| Matchmaking | PASS | wire tests: same-tier pairing, strict tier segregation, rating bands that widen with wait, provisional lockout above the lowest table, casual-only bot fallback (announced as `vsBot`), staked queue times out loudly and never seats a bot |
| Two clients, two wallets, full escrowed match | PASS (local validator) | acceptance [N1]: paired over the wire, escrow opened while drafting (both wallets sign), per-player deployment commitments on-chain, played to a result, `verify()` replay green with every round signature checking out, settled on-chain with exact amounts |
| Eight clients, full bracket | PASS (local validator) | acceptance [N2]: eight stakes escrowed before the bracket starts, seven matches over the wire, standings reported by the server, 55/25/10/10 settled to the lamport |
| What the acceptance clients are | stated | headless Node processes speaking the production protocol through the production `NetClient` — the identical class the browser store uses; wallet keypairs live in the harness and co-sign escrow transactions the way a matchmaking flow assembles them. What this does not prove: DOM rendering over the wire (covered separately by the browser smoke) and a real network between machines (that is what staging is for — docs/DEPLOY.md) |
| Server restart mid-match | documented | in-memory by design; matches die, stakes never strand (on-chain reclaim paths); docs/DEPLOY.md |

## Console cleanliness

`npm run smoke`, `npm run screens`, and `scripts/audit-ui.mjs` all finish with
**zero console errors** at 1920×1080.
