import type { ReactElement } from 'react';
import { useStore } from '../../state/store';
import { finalReveal } from '../../engine/view';
import { SHIPS } from '../../engine/ships';
import { Board } from '../components/Board';
import { GameCard, ShipCard } from '../components/GameCard';
import { arenaPayout } from '../../state/profile';
import { settlement } from '../../state/settlement';
import { transcriptOf, verify } from '../../engine/verify';
import { chain } from '../../chain/client';

/**
 * The result, as a celebration and a receipt.
 *
 * Both fleets are revealed here and nowhere earlier — you finally learn
 * whether the thing you were chasing in row four was the Warhead or the
 * Dreadnought. Next to the reveal sits the settlement panel: pot, rake, net,
 * the transaction signature, and the replay-verified badge, because a game
 * that holds money owes the player the receipt without being asked.
 */
export function Result(): ReactElement | null {
  const ms = useStore((s) => s.match);
  const view = useStore((s) => s.view());
  const rematch = useStore((s) => s.rematch);
  const leave = useStore((s) => s.leaveMatch);
  const go = useStore((s) => s.go);
  const stake = useStore((s) => s.stake);
  const mode = useStore((s) => s.mode);
  const profile = useStore((s) => s.profile);
  const lastTx = useStore((s) => s.lastTx);

  if (!ms || !view) return null;
  const reveal = finalReveal(ms);
  const outcome = ms.outcome;
  const won = outcome?.kind === 'win' && outcome.winner === 0;
  const drew = outcome?.kind === 'draw';
  const delta = profile.history[0]?.delta ?? 0;
  const payout = arenaPayout(stake);
  const net = settlement(mode, stake, won ? 'win' : drew ? 'draw' : 'loss');

  const key = chain.sessionKey().publicKeyHex;
  const audit = verify(transcriptOf(ms, 'local', [key, key]));

  return (
    <div className="screen" style={{ alignItems: 'center', gap: 16, position: 'relative' }}>
      {won && <div className="prediction-wash" />}
      <h1
        className="banner"
        style={{
          fontSize: 'var(--fs-hero)',
          color: '#ffffff',
          textShadow: `0 5px 0 ${drew ? 'rgba(18,58,94,0.35)' : won ? 'var(--confirm-deep)' : 'var(--danger)'}, 0 10px 30px rgba(18,58,94,0.4)`,
        }}
      >
        {drew ? 'DRAW' : won ? 'VICTORY' : 'DEFEAT'}
      </h1>
      <p style={{ color: 'rgba(255,255,255,0.95)', fontWeight: 800, fontSize: 'var(--fs-body)' }}>
        {outcome?.kind === 'draw' && outcome.reason === 'mutual'
          ? 'Both fleets went down together, level going in. Stakes returned in full, no rake.'
          : outcome?.kind === 'win' && outcome.reason === 'mutual'
            ? 'Both fleets went down together — you entered the round with more hull.'
            : outcome?.kind === 'draw'
              ? 'Round twenty, level on hull.'
              : outcome?.reason === 'timeout-strikes'
                ? 'Three missed timers.'
                : outcome?.reason === 'cells'
                  ? 'Round twenty — decided on hull cells remaining.'
                  : outcome?.reason === 'disconnect'
                    ? 'Opponent disconnected.'
                    : 'Fleet destroyed.'}
      </p>

      <div className="row" style={{ gap: 20, alignItems: 'stretch', width: 'min(1240px, 100%)' }}>
        {/* Fleets revealed. */}
        {([0, 1] as const).map((p) => (
          <div key={p} className="panel" style={{ flex: 1.1, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h3>{p === 0 ? 'Your fleet' : `${view.foe.name}'s fleet`}</h3>
            <div style={{ width: 'min(100%, 240px)', alignSelf: 'center' }}>
              {/* The heading says whose fleet this is; the water agrees with
                  it. Two identical blue boards told apart by a caption is the
                  arrangement Build 7 took off the battle screen. */}
              <Board
                side={p === 0 ? 'mine' : 'foe'}
                marks={{}}
                hulls={(reveal?.placements[p] ?? []).map((cells, i) => ({
                  cells,
                  hits: ms.players[p].ships[i]?.hits ?? cells.map(() => false),
                  sunk: ms.players[p].ships[i]?.sunk ?? false,
                }))}
                compact
              />
            </div>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {(reveal?.ships[p] ?? []).map((id) => (
                <ShipCard
                  key={id}
                  defId={id}
                  length={SHIPS[id].length}
                  size="sm"
                  sunk={ms.players[p].ships.find((s) => s.defId === id)?.sunk ?? false}
                />
              ))}
            </div>
            <div className="row" style={{ gap: 6 }}>
              {(reveal?.cards[p] ?? []).map((id) => (
                <GameCard key={id} defId={id} charges={0} size="sm" />
              ))}
            </div>
          </div>
        ))}

        {/* The receipt. */}
        <div className="panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3>Settlement</h3>
          <div className="col" style={{ gap: 8 }}>
            <ReceiptRow label="Rating" value={`${profile.rating} (${delta >= 0 ? '+' : ''}${delta})`} />
            {mode === 'arena' ? (
              drew ? (
                <>
                  <ReceiptRow label="Pot" value={`◎ ${payout.pot.toFixed(2)}`} />
                  <ReceiptRow label="Rake" value="none on a draw" />
                  <ReceiptRow label="Returned to you" value={`◎ ${stake.toFixed(2)}`} gold />
                </>
              ) : (
                <>
                  <ReceiptRow label="Pot" value={`◎ ${payout.pot.toFixed(2)}`} />
                  <ReceiptRow label="Rake (5%)" value={`◎ ${payout.rake.toFixed(4)}`} />
                  {/* The same call the end-of-match banner made. A receipt
                      that disagrees with the celebration is the worst bug a
                      wagered game can ship, so there is one place to compute
                      it and `settlement.test.ts` holds the two together. */}
                  <ReceiptRow
                    label={won ? 'To you' : 'To them'}
                    value={`◎ ${Math.abs(net.figure ?? payout.toWinner).toFixed(4)}`}
                    gold
                  />
                </>
              )
            ) : (
              <ReceiptRow label="Stake" value="none — no chain settlement" />
            )}
          </div>

          {lastTx && (
            <div className="col" style={{ gap: 4 }}>
              <span style={{ fontSize: 'var(--fs-fine)', fontWeight: 800, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Transaction
              </span>
              {chain.kind === 'devnet' ? (
                <a
                  className="mono"
                  style={{ fontSize: 'var(--fs-fine)', wordBreak: 'break-all' }}
                  href={`https://explorer.solana.com/tx/${lastTx}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {lastTx.slice(0, 28)}… ↗ devnet explorer
                </a>
              ) : (
                <span className="mono" style={{ fontSize: 'var(--fs-fine)', wordBreak: 'break-all', color: 'var(--ink-dim)' }}>
                  {lastTx.slice(0, 28)}… (simulated — local settlement)
                </span>
              )}
            </div>
          )}

          <div
            className="row"
            style={{
              padding: '8px 12px',
              borderRadius: 12,
              background: audit.ok ? 'rgba(46,213,115,0.16)' : 'rgba(255,77,94,0.16)',
              border: `2px solid ${audit.ok ? 'var(--confirm)' : 'var(--danger)'}`,
            }}
          >
            <span style={{ fontWeight: 800, color: audit.ok ? 'var(--confirm-deep)' : 'var(--danger)' }}>
              {audit.ok ? '✓ Replay verified' : '✕ REPLAY MISMATCH'}
            </span>
            <span style={{ fontSize: 'var(--fs-fine)', color: 'var(--ink-dim)', fontWeight: 700 }}>
              {audit.roundsReplayed} rounds re-run from the seed and the signed transcript
            </span>
          </div>
          <button
            className="btn small ghost"
            onClick={() => {
              const t = transcriptOf(ms, 'export', [key, key]);
              const blob = new Blob([JSON.stringify(t, null, 2)], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = 'armada-match.json';
              a.click();
            }}
          >
            Export match proof (JSON)
          </button>

          <div className="spacer" />
          {/* REMATCH and NEXT OPPONENT stood side by side here and called the
              same function: the queue finds whoever is available, so there
              was never a rematch to offer. One control, one behaviour. */}
          <button className="btn go" style={{ fontSize: 'var(--fs-lead)' }} onClick={() => void rematch()}>
            PLAY AGAIN
          </button>
          <button
            className="btn ghost small"
            onClick={() => {
              leave();
              go('menu');
            }}
          >
            Menu
          </button>
        </div>
      </div>
    </div>
  );
}

function ReceiptRow({ label, value, gold }: { label: string; value: string; gold?: boolean }): ReactElement {
  return (
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <span style={{ fontWeight: 700, color: 'var(--ink-dim)', fontSize: 'var(--fs-fine)' }}>{label}</span>
      <span
        className={gold ? 'display' : 'num'}
        style={{
          fontWeight: 800,
          fontSize: gold ? 'var(--fs-lead)' : 'var(--fs-body)',
          color: gold ? 'var(--gold-deep)' : 'var(--ink)',
        }}
      >
        {value}
      </span>
    </div>
  );
}
