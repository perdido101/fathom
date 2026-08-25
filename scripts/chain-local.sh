#!/usr/bin/env bash
#
# The whole on-chain proof, from nothing, in one command.
#
# Builds the escrow program, starts a local Solana validator, deploys both the
# real program and a test-only build whose reclaim window is zero, runs the
# end-to-end test against them, and tears the validator down again.
#
# The same test runs against devnet unchanged — see docs/SOLANA.md — but a
# public faucet is not something a build script should depend on, so the
# repeatable proof lives here.
set -euo pipefail

export PATH="${HOME}/.local/share/solana/install/active_release/bin:$PATH"
command -v solana-test-validator >/dev/null || {
  echo "Solana toolchain not found. Install it with:"
  echo '  sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"'
  exit 1
}

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${TMPDIR:-/tmp}/shadow-armada-chain"
RPC="http://127.0.0.1:8899"
rm -rf "$WORK" && mkdir -p "$WORK"

echo "==> building the escrow program"
cd "$ROOT/chain/program"
# SBPF v3: current validators no longer enable the v0 the toolchain defaults to.
cargo-build-sbf --arch v3 >/dev/null
cp target/deploy/shadow_armada.so "$WORK/main.so"
cargo-build-sbf --arch v3 --features fast-reclaim >/dev/null
cp target/deploy/shadow_armada.so "$WORK/fast.so"
cd "$ROOT"

echo "==> starting a local validator"
solana-test-validator --ledger "$WORK/ledger" --reset --quiet &
VALIDATOR=$!
trap 'kill "$VALIDATOR" 2>/dev/null || true' EXIT

for _ in $(seq 1 30); do
  if solana cluster-version --url "$RPC" >/dev/null 2>&1; then break; fi
  sleep 2
done
solana cluster-version --url "$RPC" >/dev/null || { echo "validator did not come up"; exit 1; }

echo "==> funding and deploying"
solana-keygen new --no-bip39-passphrase -s -o "$WORK/payer.json" >/dev/null
solana-keygen new --no-bip39-passphrase -s -o "$WORK/main.json" >/dev/null
solana-keygen new --no-bip39-passphrase -s -o "$WORK/fast.json" >/dev/null
solana airdrop 10 -k "$WORK/payer.json" --url "$RPC" >/dev/null
solana program deploy "$WORK/main.so" -k "$WORK/payer.json" \
  --program-id "$WORK/main.json" --url "$RPC" >/dev/null
solana program deploy "$WORK/fast.so" -k "$WORK/payer.json" \
  --program-id "$WORK/fast.json" --url "$RPC" >/dev/null

MAIN=$(solana-keygen pubkey "$WORK/main.json")
FAST=$(solana-keygen pubkey "$WORK/fast.json")
echo "    program $MAIN"

echo "==> end-to-end"
SA_RPC="$RPC" SA_PROGRAM_ID="$MAIN" SA_FAST_PROGRAM_ID="$FAST" SA_PAYER="$WORK/payer.json" \
  npx tsx scripts/e2e-chain.ts
