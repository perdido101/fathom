import { useEffect, type ReactElement } from 'react';
import { useStore } from './state/store';
import { MainMenu, Queue, Escrow, Leaderboard, Season, SettingsScreen } from './ui/screens/Menus';
import { HowToPlay } from './ui/screens/HowToPlay';
import { Draft } from './ui/screens/Draft';
import { Deployment } from './ui/screens/Deployment';
import { Battle } from './ui/screens/Battle';
import { Result } from './ui/screens/Result';
import { BracketScreen } from './ui/screens/Bracket';
import { ResolveOverlay } from './ui/screens/ResolveOverlay';
import { Credits } from './ui/screens/Credits';
import { ErrorBoundary, Failed, Loading } from './ui/components/ErrorBoundary';
import { WalletChip, Wordmark } from './ui/components/WalletChip';

/**
 * The 16:9 shell.
 *
 * The game is desktop only: below 1280×720 a polished gate replaces it
 * entirely, in CSS, so there is no resize listener to get out of sync. The
 * wallet chip rides the top-right of every screen, because a player staking
 * SOL should never have to wonder what they are connected as.
 *
 * The clock lives here rather than inside a screen because it has to keep
 * running across the resolve overlay and the phase changes — a timer that
 * pauses whenever a component unmounts is a timer players learn to abuse.
 */
export function App(): ReactElement {
  const screen = useStore((s) => s.screen);
  const tick = useStore((s) => s.tick);
  const busy = useStore((s) => s.busy);
  const error = useStore((s) => s.error);
  const clearError = useStore((s) => s.clearError);
  const go = useStore((s) => s.go);

  useEffect(() => {
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [tick]);

  useEffect(() => {
    const onHide = (): void => {
      if (document.visibilityState === 'hidden') useStore.getState().noteAway();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  return (
    <div className="app">
      {/* The desktop gate. Logo, one line, nothing else. */}
      <div className="desktop-gate">
        <Wordmark size={72} />
        <p
          style={{
            color: '#ffffff',
            fontFamily: 'var(--display)',
            fontWeight: 700,
            fontSize: 18,
            textShadow: '0 2px 0 rgba(18,58,94,0.3)',
          }}
        >
          Shadow Armada is played on desktop — 1280×720 or larger.
        </p>
      </div>

      <div className="app-main">
        <WalletChip />
        <ErrorBoundary where={screen} onReset={() => go('menu')}>
          {error ? (
            <Failed
              what={error.what}
              detail={error.detail}
              onRetry={error.retry ?? undefined}
              onBack={() => {
                clearError();
                go('menu');
              }}
            />
          ) : busy ? (
            <Loading what={busy} />
          ) : (
            <>
              {screen === 'menu' && <MainMenu />}
              {screen === 'howto' && <HowToPlay />}
              {screen === 'queue' && <Queue />}
              {screen === 'tqueue' && <Queue tournament />}
              {screen === 'escrow' && <Escrow />}
              {screen === 'bracket' && <BracketScreen />}
              {screen === 'shipDraft' && <Draft kind="ship" />}
              {screen === 'cardDraft' && <Draft kind="card" />}
              {screen === 'deploy' && <Deployment />}
              {screen === 'battle' && <Battle />}
              {screen === 'result' && <Result />}
              {screen === 'leaderboard' && <Leaderboard />}
              {screen === 'season' && <Season />}
              {screen === 'settings' && <SettingsScreen />}
              {screen === 'credits' && <Credits />}
            </>
          )}
        </ErrorBoundary>
        <ResolveOverlay />
      </div>
    </div>
  );
}
