import { useEffect, type ReactElement } from 'react';
import { useStore } from './state/store';
import { MainMenu, Queue, Leaderboard, Season, SettingsScreen } from './ui/screens/Menus';
import { HowToPlay } from './ui/screens/HowToPlay';
import { Draft } from './ui/screens/Draft';
import { Deployment } from './ui/screens/Deployment';
import { Battle } from './ui/screens/Battle';
import { Result } from './ui/screens/Result';
import { ResolveOverlay } from './ui/screens/ResolveOverlay';
import { Credits } from './ui/screens/Credits';
import { ErrorBoundary, Failed, Loading } from './ui/components/ErrorBoundary';

/**
 * The whole app is one portrait column and one clock.
 *
 * The clock lives here rather than inside a screen because it has to keep
 * running across the resolve overlay and the phase changes — a timer that
 * pauses whenever a component unmounts is a timer players will learn to abuse.
 *
 * Every screen is wrapped individually rather than the app as a whole, so a
 * crash in the result screen cannot take the battle screen with it, and the
 * boundary can say which screen failed.
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

  // A player who closes the tab mid-match has dropped, not quit. The server
  // holds the seat for the grace period either way; this just tells it sooner.
  useEffect(() => {
    const onHide = (): void => {
      if (document.visibilityState === 'hidden') useStore.getState().noteAway();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  return (
    <div className="app">
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
  );
}
