import { useEffect, type ReactElement } from 'react';
import { useStore } from './state/store';
import { MainMenu, Queue, Leaderboard, Season, SettingsScreen } from './ui/screens/Menus';
import { HowToPlay } from './ui/screens/HowToPlay';
import { Draft } from './ui/screens/Draft';
import { Deployment } from './ui/screens/Deployment';
import { Battle } from './ui/screens/Battle';
import { Result } from './ui/screens/Result';
import { ResolveOverlay } from './ui/screens/ResolveOverlay';

/**
 * The whole app is one portrait column and one clock.
 *
 * The clock lives here rather than inside a screen because it has to keep
 * running across the resolve overlay and the phase changes — a timer that
 * pauses whenever a component unmounts is a timer players will learn to abuse.
 */
export function App(): ReactElement {
  const screen = useStore((s) => s.screen);
  const tick = useStore((s) => s.tick);

  useEffect(() => {
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [tick]);

  return (
    <div className="app">
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
      <ResolveOverlay />
    </div>
  );
}
