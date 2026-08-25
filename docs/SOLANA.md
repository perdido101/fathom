# Solana integration — testnet

## What is on-chain, and why so little

The chain holds two commitments, an escrow, and a result. It never sees a move.

This is not a shortcut. Solana state is public, and both boards are secret, so
any move written on-chain would have to be a hash — and a chain that stores
hashes it cannot interpret is a notary, not a referee. It could not reject an
illegal shot, because it cannot see the board the shot was fired at. Writing
every turn would therefore cost twenty transactions a match and buy nothing
that the commitment scheme does not already provide.

So the split is:

**On-chain** (`chain/program/src/lib.rs`)
1. `open_match` — escrow both stakes, record the seed commitment.
2. `commit_setup` — record each player's deployment commitment, once, immutably.
3. `settle` — record the result, the seed reveal, and a hash of the signed transcript; pay out.
4. `reclaim` — either player can take their own stake back if nobody settles inside 30 minutes.

**Off-chain**
- Every round's plan, committed as `hash(plan + nonce)` before the reveal and
  signed by that player's session key.
- The full signed transcript, retained by the server and downloadable by both
  clients.

## The verifiability claim, stated precisely

Any third party can take the on-chain commitments, the revealed placements and
nonces, the revealed seed, and the signed move transcript, and re-run the whole
match with `verify()` in `src/engine/verify.ts`. It checks, in order:

- the revealed seed hashes to the commitment published before the match;
- each deployment hashes to the commitment written on-chain;
- every round plan hashes to its own commitment;
- every round plan carries a valid ed25519 signature from that player's
  published session key;
- the draft, the deployment and every round are legal under the rules;
- the reported outcome is the outcome the rules produce.

`verify()` performs no I/O, uses no clock and generates no randomness of its
own, so anyone can run it anywhere and get the same answer. It is also run
client-side on the result screen after every match, and the screen says whether
it passed.

**What this proves:** that the reported result follows from moves both players
actually signed, against placements neither could change after the fact.

**What it does not prove:** that the server showed each player the correct
information *during* the match. A malicious server could, in principle, feed a
player a false intel readout mid-match; the transcript would still replay
cleanly because the readout is derived, not signed. Closing that requires the
server to sign each round's per-player report as well, which is a small
addition and the obvious next hardening step.

**Also worth stating:** settlement authority is a known referee key. A referee
cannot forge a match — the transcript would not replay — but it can refuse to
settle one. `reclaim` is the answer, and it is deliberately blunt: after the
window, both players take their own stake back. That is the piece to harden
before mainnet.

## Session keys

A wallet popup between rounds is unplayable at a 20-second timer, so the wallet
signs exactly once, at connect, to authorise a throwaway ed25519 keypair for
the session (12 hours). Every round commitment is then signed locally and
instantly by that key.

The security claim is deliberately modest: **a session key can sign game moves
and nothing else.** Funds are escrowed by the program against the wallet, never
against the session. The worst a stolen session key can do is play your match
badly. Implementation is in `src/chain/sessionKey.ts`, and the signatures it
produces are the ones `verify()` checks — this part is real, not stubbed.

## Randomness — recommendation, not a decision

The build prompt reserves this choice, so nothing here is implemented beyond
the commit-reveal scheme it explicitly asks for.

**What actually needs randomness:** pack composition, draw pile order, the
random effects (Dreadnought's scatter, Blackout's strip, Cinder's scatter) and
timer-expiry targeting. All of it is *inside one match between two adversaries
plus the server*. None of it pays out to a pool.

**What is implemented today** (`src/chain/seed.ts`): three-party commit-reveal.

    seed = H(serverSeed | clientSeedA | clientSeedB)

Each party commits before any reveals. No single party can steer the outcome,
because either of the other two can change it and nobody sees a contribution
until all three are locked. A single server-held seed — the literal reading of
§9 — does *not* achieve this, because a server can grind seeds offline and
publish whichever commitment suits it. The three-party version costs nothing
extra and closes that hole, which is why I built it that way and am flagging it
rather than asking first.

Its one real weakness is **last-revealer abort**: whoever reveals last sees the
outcome first and can disconnect to avoid a bad seed. The mitigation is already
structural — a disconnect past the grace period is a forfeit (§8), so aborting
costs strictly more than the worst seed.

### The VRF options, and where each fits

Verify current availability, pricing and program IDs before committing to any
of these — this space moves, and none of it should be taken on trust from a
document.

| Option | Shape | Latency | Cost per draw | Fits here? |
|---|---|---|---|---|
| **ORAO VRF** | Solana-native, request via CPI, fulfilled by their network | ~1–2 slots | small fixed SOL fee per request | Simplest external option. Reasonable if you want randomness the players do not participate in at all. |
| **Switchboard On-Demand** | Oracle-attested randomness, commit slot then reveal | one slot minimum, plus oracle round trip | per-request, plus account rent | Stronger attestation story. Heavier integration; the commit/reveal slot discipline has to be designed into the match flow. |
| **`SlotHashes` sysvar** | Read recent slot hashes on-chain | none | free | **No.** Influenceable by the block leader. Fine for cosmetics, never for staked outcomes. |
| **drand / a public beacon** | External timed beacon, relayed on-chain | seconds | relayer cost | Good properties, but adds an operational dependency for something two adversaries can already settle between themselves. |
| **Three-party commit-reveal** (current) | No external dependency | none | free | Sound for match randomness, given at least one honest participant and the forfeit-on-abort rule. |

### My recommendation

**Keep commit-reveal for match randomness. Do not add a VRF for it.** Ruled on
and accepted; this section is kept as the record of why.

**Where a VRF does become relevant, for the avoidance of doubt:** season payout
tiebreaks, and any pooled draw. Never match state. If the ladder ever has to
break a tie for a prize band, that is the moment to revisit this table.

The reasoning is that a VRF solves a problem this game does not have. A VRF
exists so that a party with no adversary *inside the draw* cannot cheat. Here,
every draw happens between two staked adversaries who are both contributing
entropy — the adversary is already in the room. What a VRF would add is an
extra slot or an oracle round trip on the critical path of a game whose entire
pitch is a 20-second round, plus a per-match fee on a 5% rake at stakes as low
as 0.05 SOL.

**Where a VRF would earn its place, and where I would use one:**
- season prize tiebreaks, or any pool payout where no player is adversarially paired;
- matchmaking seeds, if you ever want those auditable;
- anything with a drop table — cosmetics, if that ever happens.

If you want one now anyway, **ORAO** is the lower-friction choice for a game
this size; Switchboard On-Demand is the better answer if attestation matters
more than latency. Say which and I will wire it.

## Modes and money

| | Entry | Payout | Rake |
|---|---|---|---|
| Casual | free | none | none |
| Ranked ladder | 0.1 SOL once per season | season-end curve by leaderboard position | none per match |
| Arena | 0.05 / 0.1 / 0.25 / 0.5 SOL per match | pot minus rake to the winner | 5% |

A **draw returns both stakes in full and takes no rake.** Charging on a draw
would bleed both players for a match nobody won, which is the one outcome that
has to stay costless — and given the sim currently reports 8–10% draws, it is
not a rare edge case. See `RULINGS.md` for the open question about whether that
draw rate should be reduced by a tiebreak.

One rating covers ranked and arena. New accounts are provisional for ten rated
matches: wider matchmaking bands, faster rating movement, and arena access
limited to the lowest tier — the cheapest available guard against a strong
player farming beginners from a fresh wallet.

## What has actually been proven, and what has not — Build 2

The program is written, built for SBPF v3, **deployed, and exercised against a
real Solana runtime**. `npm run chain:local` does the whole thing from nothing:
builds both variants, starts a validator, deploys, runs the end-to-end test,
tears down. It is the repeatable proof.

**31 on-chain checks pass**, moving real lamports:

| Scenario | What it proves |
|---|---|
| Arena win | Escrow opens with both stakes, both deployment commitments are written, the winner receives the pot minus exactly 5%, the treasury receives exactly the rake, and the transcript hash is pinned on-chain |
| Draw | Both stakes return in full and **no rake is taken** — verified against a match that genuinely ended in a mutual elimination |
| Authorisation | A stranger cannot settle; a stranger cannot reclaim; a player cannot reclaim before the window; a deployment commitment cannot be overwritten |
| Reclaim | An abandoned match returns each player their own stake whoever calls it, closes as a draw, and cannot be reclaimed twice |
| Session keys | A session key is turned into a Solana signer and rejected from settle, reclaim and setup, while still signing round plans verifiably — and the escrow is untouched afterwards |
| Replay | The published transcript replays to the reported result with every round signature checked |

**What has not happened: deployment to public devnet.** The program builds and
deploys fine; the blocker is funding. Devnet's faucet refuses airdrops from
this environment's egress IP (`airdrop request failed… rate limit`), and a
deployment needs roughly 1–2 SOL. Nothing in the code stands in the way — the
same test runs unchanged against devnet:

    solana program deploy chain/program/target/deploy/shadow_armada.so \
      --url devnet --program-id <keypair>
    SA_RPC=https://api.devnet.solana.com SA_PROGRAM_ID=<id> npm run e2e:chain

The local validator runs the same Agave 4.2.1 software as devnet, so this is a
funding gap rather than a behavioural one. **It should not be treated as
equivalent to a devnet run** — it is one airdrop away, and worth doing from a
funded wallet before anyone stakes anything.

### One real gap in the client

Opening a staked escrow needs **both players' signatures in one transaction**,
which a single browser cannot produce. That is a matchmaking-server job. The
devnet adapter therefore throws on `openMatch` for staked modes with the reason
spelled out, rather than pretending. Casual mode is unaffected. The server that
co-signs is the next piece of work on this path, and `src/server/matchServer.ts`
is where it goes — it already owns the match and holds both plans.

## Running against devnet

The app ships with a mock adapter and needs no wallet. To point it at devnet:

    VITE_CLUSTER=devnet VITE_RPC=https://api.devnet.solana.com npm run dev

Casual mode works immediately. Anything that stakes requires the escrow program
to be deployed and `VITE_PROGRAM_ID` set; until then those calls throw with the
reason rather than silently doing nothing, because a no-op on a staking path is
the worst possible failure mode.

    cd chain/program && anchor build && anchor deploy --provider.cluster devnet

Mainnet is explicitly out of scope for this phase.
