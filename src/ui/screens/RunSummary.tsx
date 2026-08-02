import { useState } from 'react';
import { useGame } from '../../game/store';
import { humanSeat } from '../../engine/tournament';
import { SHIPS } from '../../content/ships';
import { CARDS } from '../../content/cards';
import { Wordmark } from '../../art/placeholders/Icons';
import { seedName } from '../../engine/rng';

export function RunSummaryScreen() {
  const { tournament, abandonRun } = useGame();
  const [copied, setCopied] = useState(false);
  if (!tournament) return null;
  const me = humanSeat(tournament);
  const champion = tournament.championSeat === me.index;
  const share = seedName(tournament.seed);

  const copy = () => {
    try {
      void navigator.clipboard?.writeText(share);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="screen">
      <div className="topbar">
        <h1>{champion ? 'Champion' : 'Run over'}</h1>
      </div>
      <div className="scroll">
        <div className="panel center">
          <Wordmark size={200} />
          <p className="tagline" style={{ marginTop: 10 }}>
            {champion ? 'You sounded the deep and sank them all' : 'The deep keeps what it takes'}
          </p>
        </div>

        <div className="panel">
          <h2>Run</h2>
          <div className="statRow">
            <span className="chip">{me.matchesPlayed} matches</span>
            <span className="chip">{me.losses} loss{me.losses === 1 ? '' : 'es'}</span>
            <span className="chip">{tournament.voyageLength}-round voyage</span>
            <span className="chip">{tournament.bracketSize} seats</span>
          </div>
        </div>

        <div className="panel">
          <h2>Final fleet</h2>
          <div className="chipRow">
            {me.fleet.map((id, i) => (
              <span key={i} className="chip">
                {SHIPS[id].name} · {SHIPS[id].size}
              </span>
            ))}
          </div>
          <hr className="rule" />
          <h2>Final tray</h2>
          <div className="chipRow">
            {me.tray.map((id, i) => (
              <span key={i} className="chip">
                {CARDS[id].name}
              </span>
            ))}
          </div>
        </div>

        <div className="panel">
          <h2>Seed</h2>
          <p className="mono" style={{ letterSpacing: '0.12em' }}>{share}</p>
          <button className="btn small" onClick={copy}>
            {copied ? 'Copied' : 'Copy seed'}
          </button>
        </div>

        <button className="btn primary wide" onClick={abandonRun}>
          Back to title
        </button>
      </div>
    </div>
  );
}
