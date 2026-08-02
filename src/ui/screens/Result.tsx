import { useGame } from '../../game/store';
import { SHIPS } from '../../content/ships';
import { humanSeat } from '../../engine/tournament';
import { Art } from '../../art/Art';

export function ResultScreen() {
  const { outcome, tournament, go, beginNextMatch } = useGame();
  if (!outcome || !tournament) return null;
  const me = humanSeat(tournament);
  const done = tournament.complete || me.eliminated || me.losses >= 2;
  const accuracy = outcome.shots > 0 ? Math.round((outcome.hits / outcome.shots) * 100) : 0;

  return (
    <div className="screen">
      <div className="topbar">
        <h1>{outcome.won ? 'Victory' : 'Defeat'}</h1>
      </div>
      <div className="scroll">
        <div className="panel">
          <h2>{outcome.won ? 'The sea is yours' : `${outcome.opponentName} holds the water`}</h2>
          <div className="statRow" style={{ marginTop: 8 }}>
            <span className="chip">Round {outcome.round}</span>
            <span className="chip">{Math.ceil(outcome.plies / 2)} turns</span>
            <span className="chip">{outcome.hits}/{outcome.shots} shots · {accuracy}%</span>
          </div>
        </div>

        <div className="panel">
          <h2>Their fleet, revealed</h2>
          <p className="small dim">
            Hull names stay hidden until a match ends. This is what you were actually hunting.
          </p>
          <div className="chipRow">
            {outcome.enemyFleet.map((id, i) => (
              <span key={i} className="chip">
                <Art id={`icon.ability.${id}`} size={12} />
                {SHIPS[id].name} · {SHIPS[id].size}
              </span>
            ))}
          </div>
        </div>

        <div className="panel">
          <h2>Standing</h2>
          <p className="small dim">
            {me.losses === 0
              ? 'Still undefeated.'
              : me.losses === 1
                ? 'One loss. The next one ends the run.'
                : 'Two losses. The run is over.'}
          </p>
        </div>

        {done ? (
          <button className="btn primary wide" onClick={() => go('runSummary')}>
            Run summary
          </button>
        ) : (
          <div className="btnRow">
            <button className="btn" onClick={() => go('bracket')}>
              Bracket
            </button>
            <button className="btn primary" onClick={beginNextMatch}>
              Next match
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
