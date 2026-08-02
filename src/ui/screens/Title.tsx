import { useState } from 'react';
import { useGame } from '../../game/store';
import { Wordmark } from '../../art/placeholders/Icons';
import { VOYAGE_LENGTHS, DEFAULT_VOYAGE_LENGTH, type VoyageLength } from '../../content/voyage';
import { loadRun } from '../../game/save';

export function TitleScreen() {
  const { newRun, continueRun, go } = useGame();
  const [name, setName] = useState('');
  const [voyage, setVoyage] = useState<VoyageLength>(DEFAULT_VOYAGE_LENGTH);
  const [bracket, setBracket] = useState(16);
  const [setup, setSetup] = useState(false);
  const hasRun = loadRun() !== null;

  if (setup) {
    return (
      <div className="screen">
        <div className="topbar">
          <button className="btn small ghost" onClick={() => setSetup(false)}>
            Back
          </button>
          <h1>New run</h1>
        </div>
        <div className="scroll">
          <div className="panel">
            <h2>Captain</h2>
            <input
              className="btn wide"
              style={{ textTransform: 'none', textAlign: 'left' }}
              value={name}
              maxLength={18}
              placeholder="Your name"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="panel">
            <h2>Voyage length</h2>
            <p className="small dim">
              How many rounds you sail if you keep winning. Fleets and trays grow each round;
              two losses ends the run.
            </p>
            <div className="btnRow">
              {VOYAGE_LENGTHS.map((v) => (
                <button
                  key={v}
                  className={`btn small ${voyage === v ? 'primary' : ''}`}
                  onClick={() => setVoyage(v)}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div className="panel">
            <h2>Bracket</h2>
            <p className="small dim">Empty seats are filled by rival captains.</p>
            <div className="btnRow">
              {[8, 16, 32].map((b) => (
                <button
                  key={b}
                  className={`btn small ${bracket === b ? 'primary' : ''}`}
                  onClick={() => setBracket(b)}
                >
                  {b} seats
                </button>
              ))}
            </div>
          </div>
          <button className="btn primary wide" onClick={() => newRun(name, voyage, bracket)}>
            Cast off
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="title">
        <Backdrop />
        <Wordmark size={280} />
        <p className="tagline">Sound the deep. Sink the fleet.</p>
        <div className="menu">
          <button className="btn primary wide" onClick={() => setSetup(true)}>
            New run
          </button>
          <button className="btn wide" disabled={!hasRun} onClick={() => continueRun()}>
            Continue run
          </button>
          <button className="btn wide ghost" onClick={() => go('codex')}>
            Codex
          </button>
          <button className="btn wide ghost" onClick={() => go('settings')}>
            Settings
          </button>
        </div>
        <p className="tiny faint">A duel of depth and deduction</p>
      </div>
    </div>
  );
}

/** Hairline grid and a few bathymetric contours, well under the interface. */
function Backdrop() {
  return (
    <svg className="backdrop" viewBox="0 0 400 700" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <g stroke="var(--line)" fill="none" strokeWidth="0.5">
        {Array.from({ length: 20 }, (_, i) => (
          <line key={`v${i}`} x1={i * 20} y1={0} x2={i * 20} y2={700} />
        ))}
        {Array.from({ length: 35 }, (_, i) => (
          <line key={`h${i}`} x1={0} y1={i * 20} x2={400} y2={i * 20} />
        ))}
      </g>
      <g stroke="var(--line)" fill="none" strokeWidth="1">
        <path d="M-20 180 Q 120 120 240 190 T 460 160" />
        <path d="M-20 230 Q 130 175 250 240 T 460 215" />
        <path d="M-20 520 Q 110 470 250 540 T 460 500" />
      </g>
    </svg>
  );
}
