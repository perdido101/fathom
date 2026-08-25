import type { ReactElement } from 'react';
import { useStore } from '../../state/store';
import { finalReveal } from '../../engine/view';
import { SHIPS } from '../../engine/ships';
import { CARDS } from '../../engine/cards';
import { Board } from '../components/Board';
import { arenaPayout } from '../../state/profile';
import { transcriptOf, verify } from '../../engine/verify';
import { chain } from '../../chain/client';

/**
 * The result screen.
 *
 * Both fleets are revealed here and nowhere earlier, which is what makes the
 * whole match worth replaying in your head: you finally learn whether the
 * thing you were chasing in row 4 was the Warhead or the Dreadnought.
 *
 * Rematch and next opponent are both one tap and both the same size. A player
 * who just lost a stake and wants back in should not have to hunt for the
 * button, and a player who wants a different opponent should not have to leave
 * to the menu to find one.
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

  if (!ms || !view) return null;
  const reveal = finalReveal(ms);
  const outcome = ms.outcome;
  const won = outcome?.kind === 'win' && outcome.winner === 0;
  const drew = outcome?.kind === 'draw';
  const delta = profile.history[0]?.delta ?? 0;
  const payout = arenaPayout(stake);

  // The same check any third party can run, against this match's own
  // transcript. If it ever comes back false the result on screen is not the
  // result the rules produce, and the player should know before the operator.
  // Locally both plans are signed by this client's own session key, so the
  // same key verifies both sides. On a server the two would differ.
  const key = chain.sessionKey().publicKeyHex;
  const audit = verify(transcriptOf(ms, 'local', [key, key]));

  return (
    <div className="screen">
      <h1 style={{ color: drew ? 'var(--ink-dim)' : won ? 'var(--friend)' : 'var(--danger)' }}>
        {drew ? 'DRAW' : won ? 'VICTORY' : 'DEFEAT'}
      </h1>
      <p>
        {outcome?.kind === 'draw' && outcome.reason === 'mutual'
          ? 'Both fleets went down in the same round. Stakes are returned in full and no rake is taken.'
          : outcome?.kind === 'draw'
            ? 'Round twenty, level on hull cells.'
            : outcome?.reason === 'timeout-strikes'
              ? 'Three missed timers.'
              : outcome?.reason === 'cells'
                ? 'Round twenty — decided on hull cells remaining.'
                : outcome?.reason === 'disconnect'
                  ? 'Opponent disconnected.'
                  : 'Fleet destroyed.'}
      </p>

      <div className="grid2">
        <div className="card-surface col" style={{ gap: 2 }}>
          <span style={{ fontSize: 11, color: 'var(--ink-dim)' }}>rating</span>
          <strong style={{ fontSize: 20 }}>
            {profile.rating}{' '}
            <span style={{ fontSize: 13, color: delta >= 0 ? 'var(--friend)' : 'var(--danger)' }}>
              {delta >= 0 ? '+' : ''}
              {delta}
            </span>
          </strong>
        </div>
        <div className="card-surface col" style={{ gap: 2 }}>
          <span style={{ fontSize: 11, color: 'var(--ink-dim)' }}>settled</span>
          <strong style={{ fontSize: 15 }}>
            {mode !== 'arena'
              ? 'no stake'
              : drew
                ? `${stake} SOL returned`
                : won
                  ? `+${payout.toWinner.toFixed(4)} SOL`
                  : `-${stake} SOL`}
          </strong>
        </div>
      </div>

      <h3>Fleets revealed</h3>
      <div className="grid2">
        {([0, 1] as const).map((p) => (
          <div key={p} className="card-surface col" style={{ gap: 6 }}>
            <strong style={{ fontSize: 13 }}>{p === 0 ? 'You' : view.foe.name}</strong>
            <Board
              marks={{}}
              hulls={(reveal?.placements[p] ?? []).map((cells, i) => ({
                cells,
                hits: ms.players[p].ships[i]?.hits ?? cells.map(() => false),
                sunk: ms.players[p].ships[i]?.sunk ?? false,
              }))}
              compact
            />
            <span style={{ fontSize: 11, color: 'var(--ink-dim)' }}>
              {(reveal?.ships[p] ?? []).map((id) => SHIPS[id].name).join(' · ')}
            </span>
            <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
              {(reveal?.cards[p] ?? []).map((id) => CARDS[id].name).join(' · ')}
            </span>
          </div>
        ))}
      </div>

      <div className="card-surface row" style={{ gap: 8 }}>
        <span style={{ fontSize: 11, color: audit.ok ? 'var(--friend)' : 'var(--danger)' }}>
          {audit.ok ? 'replay verified' : 'REPLAY MISMATCH'}
        </span>
        <span className="log" style={{ flex: 1 }}>
          {audit.roundsReplayed} rounds re-run from the seed and the signed transcript
        </span>
      </div>

      <div className="spacer" />
      <div className="row">
        <button className="btn go" style={{ flex: 1 }} onClick={() => void rematch()}>
          REMATCH
        </button>
        <button className="btn primary" style={{ flex: 1 }} onClick={() => void rematch()}>
          NEXT OPPONENT
        </button>
      </div>
      <button
        className="btn ghost"
        onClick={() => {
          leave();
          go('menu');
        }}
      >
        menu
      </button>
    </div>
  );
}
