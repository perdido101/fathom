import { useGame } from '../../game/store';
import { Art } from '../../art/Art';

export function SettingsScreen() {
  const { settings, setSettings, go, tournament } = useGame();
  return (
    <div className="screen">
      <div className="topbar">
        <button className="btn small ghost" onClick={() => go(tournament ? 'bracket' : 'title')}>
          Back
        </button>
        <h1>Settings</h1>
      </div>
      <div className="scroll">
        <div className="panel">
          <h2>Display</h2>
          <button
            className="btn wide"
            onClick={() => setSettings({ colourblind: !settings.colourblind })}
          >
            Colourblind mode · {settings.colourblind ? 'on' : 'off'}
          </button>
          <p className="small faint" style={{ marginTop: 6 }}>
            Markers are shape-first already — a hollow ring for a miss, a filled disc for a hit, a
            crossed square for a sunk hull — so colour is confirmation, never the only signal.
            This turns the saturation down further.
          </p>
        </div>

        <div className="panel">
          <h2>Markers</h2>
          <div className="statRow">
            {(['miss', 'hit', 'sunk', 'probe', 'mine', 'decoy'] as const).map((m) => (
              <span key={m} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <Art id={`marker.${m}`} size={26} />
                <span className="tiny dim">{m}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="panel">
          <h2>Credits</h2>
          <p className="small dim">Fathom — 2026.</p>
          <p className="small faint">
            A duel of depth and deduction. Placeholder art is generated procedurally; every asset
            resolves through a single registry so final art is a one-line swap.
          </p>
        </div>
      </div>
    </div>
  );
}
