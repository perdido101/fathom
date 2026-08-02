import { useEffect } from 'react';
import { useGame } from '../game/store';
import { migrateSaves } from '../game/save';
import { TitleScreen } from './screens/Title';
import { BracketScreen } from './screens/Bracket';
import { DraftShipsScreen } from './screens/DraftShips';
import { DraftCardsScreen } from './screens/DraftCards';
import { PlacementScreen } from './screens/Placement';
import { MatchScreen } from './screens/Match';
import { ResultScreen } from './screens/Result';
import { RunSummaryScreen } from './screens/RunSummary';
import { CodexScreen } from './screens/Codex';
import { SettingsScreen } from './screens/Settings';

export function App() {
  const { screen, notice, notify, settings } = useGame();

  // One-time save migration, before anything reads a slot.
  useEffect(() => {
    migrateSaves();
  }, []);

  // Notices clear themselves; they are feedback, not state.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => notify(null), 2600);
    return () => clearTimeout(t);
  }, [notice, notify]);

  return (
    <div className="app" data-cb={settings.colourblind ? 'true' : undefined}>
      {screen === 'title' && <TitleScreen />}
      {screen === 'bracket' && <BracketScreen />}
      {screen === 'draftShips' && <DraftShipsScreen />}
      {screen === 'draftCards' && <DraftCardsScreen />}
      {screen === 'placement' && <PlacementScreen />}
      {screen === 'match' && <MatchScreen />}
      {screen === 'result' && <ResultScreen />}
      {screen === 'runSummary' && <RunSummaryScreen />}
      {screen === 'codex' && <CodexScreen />}
      {screen === 'settings' && <SettingsScreen />}
      {notice && <div className="notice" role="status">{notice}</div>}
    </div>
  );
}
