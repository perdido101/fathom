# Deployment topology — the network server

One Node process owns every live match. Everything else is a static file.

```
 browser A ──ws──┐
 browser B ──ws──┤   NetServer (node, one process)          Solana devnet
 browser … ──ws──┼──   MatchServer  (rules authority)   ──   escrow program
                 │     matchmaking queue                      (referee key
 /healthz ──http─┘     server-side clocks                      signs settles)
                       JSONL logs → stdout
```

## The process

```
npm install
PORT=8787 npm run serve          # tsx scripts/serve.ts
```

- **`PORT`** (default 8787) — one port serves both WebSocket and `/healthz`.
- **`SA_CASUAL_BOT_MS`** (default 6000) — casual queue's bot fallback. Staked
  queues never fall back to a bot; they time out loudly.
- **`SA_QUEUE_TIMEOUT_MS`** (default 120000) — staked queue give-up.

The browser build points at it with **`VITE_WS=wss://host` at build time, or
`?ws=wss://host` in the address bar** (the query form is what makes one
static build usable against local and staging servers alike).

## State, and what a restart does

State is **in memory, deliberately**. There is no database in this topology.
A server restart means:

- Live matches are gone. Clients get `no-match` on rejoin, surface "the match
  could not be rejoined", and return to the menu.
- **No funds can strand.** Money never lives in the server: stakes sit in the
  on-chain escrow, and both escrow forms have permissionless recovery — a 1v1
  match reclaims per-player after the 30-minute settle window; a bracket
  refunds per-seat after its windows. A restart mid-match therefore costs the
  players the match, never the stakes.
- The queue empties; clients re-queue on their next click.

When matches need to survive restarts, the upgrade path is snapshotting each
room's `MatchState` + seat tokens to disk on every mutation (the state is a
plain JSON-serialisable object) — deliberately not built until the product
needs it.

## Health, logs, disputes

- **`GET /healthz`** → `{ok, v, connections, queued, rooms, tournaments}`.
- **Logs**: one JSON object per line on stdout: hellos, match creation,
  commits (hash only), reveals, lapses, rejoins, forfeits, results,
  chain-hook errors — each with `matchId`, seat, and timestamp. Together with
  the in-room `MatchLog` (which never stores a live plan) this reconstructs
  any dispute: what arrived, what was refused and why, in what order.
- **Rate limits**: connects (30/min), queue joins (20/min/identity), match
  creation (6/min/identity) — the last two ride the tested `RateLimiter`.

## Money wiring

The server takes `ChainHooks` (`openMatch`, `settle`, `settleBracket`).
`scripts/e2e-net.ts` shows the full wiring against a validator: escrow opened
with both wallets' signatures while the players draft, deployment commitments
written per player, referee settlement from the server's own transcript after
a `verify()` replay. Staging can run with hooks off (casual only) or pointed
at devnet once the program is deployed there (see docs/SOLANA.md — still
blocked on faucet funding).

## Standing up staging (what Aris needs)

This development container cannot accept inbound connections, so staging
needs any small always-on host (Fly.io, Railway, a $5 VPS):

1. `git clone <repo> && npm ci`
2. `PORT=8787 npm run serve` under a process manager (systemd, fly, pm2).
3. TLS: terminate `wss://` at any reverse proxy (Caddy: two lines) — browsers
   on https pages require `wss://`.
4. Host the static build anywhere (`npm run build`, serve `dist/`), and open
   `https://game-host/?ws=wss://server-host`.
5. Check `https://server-host/healthz` from both machines.

The acceptance evidence that this shape works end to end — two strangers,
eight-strangers bracket, real escrow — is `npm run chain:local`, which runs
the full network acceptance against the same server class this file deploys.
