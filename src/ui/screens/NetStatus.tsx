import type { ReactElement } from 'react';
import { useStore } from '../../state/store';
import { Icon } from '../art/Icon';

/**
 * The connection told honestly, on top of whatever screen is showing.
 *
 * Five states the wire owes the player: reconnecting (we are trying), lost
 * (we stopped trying — here is a button), opponent disconnected (their
 * problem, your grace period), server error (a sentence, not a code), and
 * queue timeout (which arrives through the standard error panel with a
 * retry). The first two block input — acting on a stale view would only
 * queue intents the server will refuse.
 */
export function NetBanners(): ReactElement | null {
  const net = useStore((s) => s.net);
  const screen = useStore((s) => s.screen);
  const inMatch =
    screen === 'shipDraft' || screen === 'cardDraft' || screen === 'deploy' || screen === 'battle';

  if (net.status === 'reconnecting') {
    return (
      <div className="overlay" style={{ background: 'rgba(18,58,94,0.55)', zIndex: 40 }}>
        <div className="panel" style={{ textAlign: 'center', minWidth: 420 }}>
          <p className="display" style={{ fontSize: 24, fontWeight: 800 }}>
            Reconnecting…
          </p>
          <p style={{ marginTop: 8, fontWeight: 700, color: 'var(--ink-dim)' }}>
            The server holds your seat for the grace period. Your plans are safe — nothing is
            decided by your clock.
          </p>
          <div className="row" style={{ justifyContent: 'center', marginTop: 12, gap: 6 }}>
            <span className="think" />
            <span className="think" style={{ animationDelay: '150ms' }} />
            <span className="think" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    );
  }

  if (net.status === 'lost') {
    return (
      <div className="overlay" style={{ background: 'rgba(18,58,94,0.55)', zIndex: 40 }}>
        <div className="panel" style={{ textAlign: 'center', minWidth: 440, borderColor: 'var(--danger)' }}>
          <p className="display" style={{ fontSize: 24, fontWeight: 800, color: 'var(--danger)' }}>
            Connection lost
          </p>
          <p style={{ marginTop: 8, fontWeight: 700, color: 'var(--ink-dim)' }}>
            The server is unreachable. If a match was running, your seat forfeits when the grace
            period lapses — reconnect before it does.
          </p>
          <button
            className="btn go"
            style={{ marginTop: 14 }}
            onClick={() => location.reload()}
          >
            Reconnect
          </button>
        </div>
      </div>
    );
  }

  if (inMatch && net.remote && !net.oppConnected) {
    return (
      <div
        className="panel tight"
        style={{
          position: 'absolute',
          top: 70,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 35,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          border: '3px solid var(--predict)',
        }}
      >
        <Icon name="ui.hidden" size={18} style={{ color: 'var(--predict)' }} />
        <span style={{ fontWeight: 800, fontSize: 14 }}>
          Opponent disconnected — they forfeit if they stay away past the grace period.
        </span>
      </div>
    );
  }

  if (net.lastServerError && net.status === 'online' && !inMatch) {
    return (
      <div
        className="panel tight"
        style={{
          position: 'absolute',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 35,
          border: '3px solid var(--danger)',
          maxWidth: 560,
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--danger)' }}>
          Server: {net.lastServerError}
        </span>
      </div>
    );
  }

  return null;
}

/**
 * The result of a match played over the wire. Lighter than the local result
 * screen on purpose: the full reveal and the settlement live with the
 * server and the chain record; the client renders what the authority sent
 * and claims nothing more.
 */
export function NetResult(): ReactElement | null {
  const view = useStore((s) => s.remoteView);
  const leave = useStore((s) => s.leaveMatch);
  const go = useStore((s) => s.go);
  const mode = useStore((s) => s.mode);
  const stake = useStore((s) => s.stake);
  if (!view) return null;
  const outcome = view.outcome;
  const won = outcome?.kind === 'win' && outcome.winner === view.you;
  const drew = outcome?.kind === 'draw';

  return (
    <div className="screen centered" style={{ gap: 22 }}>
      <p
        className="banner big-num"
        style={{
          fontSize: 72,
          color: won ? 'var(--gold)' : drew ? 'var(--intel)' : 'var(--danger)',
        }}
      >
        {won ? 'VICTORY' : drew ? 'DRAW' : 'DEFEAT'}
      </p>
      <p style={{ color: '#ffffff', fontWeight: 800, fontSize: 17, textShadow: '0 2px 0 rgba(18,58,94,0.3)' }}>
        Played over the wire against {view.foe.name}.
      </p>
      <div className="panel" style={{ minWidth: 460, textAlign: 'center' }}>
        {mode === 'arena' ? (
          <p style={{ fontWeight: 700 }}>
            {drew
              ? 'A draw returns both stakes in full — no rake taken.'
              : won
                ? `The pot (◎ ${(stake * 2).toFixed(2)} minus 5% rake) settles to your wallet — the referee submits it and the chain record is public.`
                : 'Your stake goes to the winner. The settlement and its transcript hash are on the chain record.'}
          </p>
        ) : (
          <p style={{ fontWeight: 700 }}>
            Casual match — nothing staked. The server verified the transcript before reporting
            this result.
          </p>
        )}
        <div className="row" style={{ marginTop: 14 }}>
          <button
            className="btn go"
            style={{ flex: 1 }}
            onClick={() => {
              leave();
              go('menu');
            }}
          >
            Back to menu
          </button>
        </div>
      </div>
    </div>
  );
}
