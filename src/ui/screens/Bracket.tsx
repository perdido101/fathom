import { useGame } from '../../game/store';
import {
  humanSeat,
  humanNextMatch,
  gameRoundFor,
  nextPendingMatch,
} from '../../engine/tournament';
import { voyageRound } from '../../content/voyage';
import { Art } from '../../art/Art';
import { SHIPS } from '../../content/ships';
import { CARDS } from '../../content/cards';

export function BracketScreen() {
  const { tournament, beginNextMatch, go, abandonRun } = useGame();
  if (!tournament) return null;
  const me = humanSeat(tournament);
  const next = humanNextMatch(tournament) ?? nextPendingMatch(tournament);
  const round = next ? gameRoundFor(tournament, next) : tournament.voyageLength;
  const cfg = voyageRound(tournament.voyageLength, round);
  const foeIndex = next ? (next.seats[0] === me.index ? next.seats[1] : next.seats[0]) : null;
  const foe = foeIndex !== null && foeIndex !== undefined ? tournament.seats[foeIndex] : null;
  const eliminated = me.eliminated || me.losses >= 2;

  return (
    <div className="screen">
      <div className="topbar">
        <h1>Round {round} of {tournament.voyageLength}</h1>
        <span className="chip" data-on={me.losses === 0 ? 'true' : undefined}>
          {me.losses === 0 ? 'Undefeated' : `${me.losses} loss${me.losses === 1 ? '' : 'es'}`}
        </span>
      </div>

      <div className="scroll">
        {eliminated ? (
          <div className="panel">
            <h2>Eliminated</h2>
            <p className="small dim">Two losses ends a run. The sea keeps what it takes.</p>
            <button className="btn wide" onClick={() => go('runSummary')}>
              Run summary
            </button>
          </div>
        ) : tournament.complete ? (
          <div className="panel">
            <h2>Champion</h2>
            <button className="btn primary wide" onClick={() => go('runSummary')}>
              Run summary
            </button>
          </div>
        ) : (
          <div className="panel">
            <h2>Next engagement</h2>
            {foe && (
              <div className="seat" data-you="false">
                {!foe.isHuman && <Art id="ui.bot" size={16} />}
                <span>{foe.name}</span>
                <span className="losses">{foe.losses} / 2</span>
              </div>
            )}
            <p className="small dim">
              {cfg.gridW}×{cfg.gridH} waters · {cfg.keeps} new hull{cfg.keeps === 1 ? '' : 's'} and{' '}
              {cfg.keeps} new card{cfg.keeps === 1 ? '' : 's'} to draft · {cfg.baseIncome} energy a turn
            </p>
            <button className="btn primary wide" onClick={beginNextMatch}>
              Begin draft
            </button>
          </div>
        )}

        <div className="panel">
          <h2>Your fleet</h2>
          {me.fleet.length === 0 ? (
            <p className="small faint">Nothing drafted yet.</p>
          ) : (
            <div className="chipRow">
              {me.fleet.map((id, i) => (
                <span key={i} className="chip">
                  <Art id={`icon.ability.${id}`} size={12} />
                  {SHIPS[id].name} · {SHIPS[id].size}
                </span>
              ))}
            </div>
          )}
          <hr className="rule" />
          <h2>Your tray</h2>
          {me.tray.length === 0 ? (
            <p className="small faint">Nothing drafted yet.</p>
          ) : (
            <div className="chipRow">
              {me.tray.map((id, i) => (
                <span key={i} className="chip">
                  {CARDS[id].name}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="panel">
          <h2>The field</h2>
          {tournament.seats.map((s) => (
            <div key={s.index} className="seat" data-you={s.isHuman ? 'true' : undefined} data-out={s.eliminated ? 'true' : undefined}>
              {!s.isHuman && <Art id="ui.bot" size={14} />}
              <span>{s.name}</span>
              <span className="losses">{s.eliminated ? 'out' : `${s.losses} / 2`}</span>
            </div>
          ))}
        </div>

        <button className="btn ghost danger wide" onClick={abandonRun}>
          Abandon run
        </button>
      </div>
    </div>
  );
}
