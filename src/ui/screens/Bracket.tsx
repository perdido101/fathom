import type { ReactElement } from 'react';
import { useStore } from '../../state/store';
import {
  FINAL,
  bracketPayoutSol,
  nextPlayable,
  pathOf,
  roundOf,
  standings,
  type Bracket as BracketState,
} from '../../tournament/bracket';
import { chain } from '../../chain/client';
import { Icon } from '../art/Icon';

/**
 * The bracket screen: eight seats, three rounds, one pot.
 *
 * It is the tournament's waiting room and its scoreboard at once — seats
 * filling while the bracket forms, live match states between rounds, the
 * player's own path picked out in gold, and the pot with its payout split
 * always in view, because the split is the reason to be here at all.
 */

export function BracketScreen(): ReactElement | null {
  const t = useStore((s) => s.tournament);
  const playRound = useStore((s) => s.playTournamentRound);
  const leave = useStore((s) => s.leaveMatch);
  const lastTx = useStore((s) => s.lastTx);
  if (!t) return null;

  const pay = bracketPayoutSol(t.stake);
  const forming = t.filled < 8;
  const next = forming ? null : nextPlayable(t.bracket);
  const yourTurn =
    next !== null && t.yourPlace === null && t.bracket.matches[next].seats.includes(0);
  const final = standings(t.bracket);
  const champion = t.yourPlace === 'champion';

  const share =
    t.yourPlace === 'champion'
      ? pay.champion
      : t.yourPlace === 'runnerUp'
        ? pay.runnerUp
        : t.yourPlace === 'semiLoser'
          ? pay.semiLoser
          : 0;

  return (
    <div className="screen centered" style={{ gap: 18, position: 'relative', overflow: 'hidden' }}>
      <h1 style={{ color: '#ffffff', textShadow: '0 3px 0 rgba(18,58,94,0.3)' }}>
        Tournament · ◎ {t.stake} seats
      </h1>

      {/* The money, always visible. */}
      <div className="panel tight row" style={{ gap: 20, justifyContent: 'center' }}>
        <span className="pill gold" style={{ fontSize: 'var(--fs-body)' }}>
          Pot ◎ {pay.pot.toFixed(2)}
        </span>
        <span style={{ fontWeight: 700, color: 'var(--ink-dim)', fontSize: 'var(--fs-fine)' }}>
          rake ◎ {pay.rake.toFixed(4)}
        </span>
        <span style={{ fontWeight: 800, fontSize: 'var(--fs-fine)' }}>champion ◎ {pay.champion.toFixed(4)}</span>
        <span style={{ fontWeight: 700, color: 'var(--ink-dim)', fontSize: 'var(--fs-fine)' }}>
          2nd ◎ {pay.runnerUp.toFixed(4)} · semis ◎ {pay.semiLoser.toFixed(4)} · QF exit ◎ 0
        </span>
      </div>

      {forming ? (
        <Forming filled={t.filled} entrants={t.bracket.entrants} />
      ) : (
        <BracketGrid bracket={t.bracket} />
      )}

      {/* The contextual footer: play, wait, or collect. */}
      {t.suddenDeath && (
        <div className="panel tight" style={{ borderColor: 'var(--gold)', textAlign: 'center' }}>
          <p style={{ fontWeight: 800 }}>
            Drawn — sudden death. A bracket needs a winner, so the match replays in full.
          </p>
        </div>
      )}

      {yourTurn && next !== null && (
        <button className="btn go huge" onClick={playRound}>
          Play {roundOf(next)}
        </button>
      )}

      {t.yourPlace !== null && (
        <div
          className="panel"
          style={{
            minWidth: 480,
            textAlign: 'center',
            border: champion ? '4px solid var(--gold)' : undefined,
          }}
        >
          <p className="display" style={{ fontSize: 'var(--fs-sub)', fontWeight: 800, marginBottom: 6 }}>
            {t.yourPlace === 'champion'
              ? 'Champion'
              : t.yourPlace === 'runnerUp'
                ? 'Runner-up'
                : t.yourPlace === 'semiLoser'
                  ? 'Out in the semi-finals'
                  : 'Out in the quarter-finals'}
          </p>
          <p style={{ fontWeight: 700, color: 'var(--ink-dim)' }}>
            Your share of the pot:{' '}
            <span className="pill gold" style={{ fontSize: 'var(--fs-body)' }}>
              ◎ {share.toFixed(4)}
            </span>{' '}
            {share === 0 && '— the curve pays the top four seats only'}
          </p>
          {lastTx && (
            <p className="mono" style={{ fontSize: 'var(--fs-fine)', marginTop: 8, color: 'var(--ink-faint)' }}>
              {chain.kind === 'devnet' ? (
                <a
                  href={`https://explorer.solana.com/tx/${lastTx}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {lastTx.slice(0, 28)}…
                </a>
              ) : (
                <>{lastTx.slice(0, 28)}… (simulated — local settlement)</>
              )}
            </p>
          )}
          <button className="btn primary" style={{ marginTop: 12 }} onClick={leave}>
            Back to menu
          </button>
        </div>
      )}

      {/* The champion moment — the loudest screen in the game. */}
      {champion && final && (
        <div className="overlay" style={{ background: 'rgba(18,58,94,0.55)' }} onClick={leave}>
          <div
            className="panel banner"
            style={{ textAlign: 'center', padding: '46px 84px', border: '5px solid var(--gold)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <span
              style={{
                display: 'grid',
                placeItems: 'center',
                width: 92,
                height: 92,
                margin: '0 auto 12px',
                borderRadius: 26,
                background: 'var(--gold)',
                color: '#5c3d00',
                boxShadow: 'var(--shadow-deep)',
              }}
            >
              <Icon name="ui.trophy" size={56} />
            </span>
            <p
              className="big-num"
              style={{ fontSize: 'var(--fs-display)', color: 'var(--gold)', lineHeight: 1 }}
            >
              CHAMPION
            </p>
            <p style={{ fontWeight: 800, fontSize: 'var(--fs-lead)', marginTop: 10 }}>
              Eight entered. You take ◎ {pay.champion.toFixed(4)} of the ◎ {pay.pot.toFixed(2)}{' '}
              pot.
            </p>
            <button className="btn gold huge" style={{ marginTop: 18 }} onClick={leave}>
              Collect and return
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Seats filling while the bracket forms. It only ever starts full. */
function Forming({ filled, entrants }: { filled: number; entrants: string[] }): ReactElement {
  return (
    <div className="col" style={{ gap: 14, alignItems: 'center' }}>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        {entrants.map((name, seat) => {
          const staked = seat < filled;
          // Seat 0 is you. Every other tournament surface says so — the star
          // and the heavier weight in a match box, the gold path through the
          // bracket — and this one left your seat as one of eight identical
          // panels, told apart by remembering which end you were. Build 7's
          // ownership audit found exactly one screen doing that.
          const mine = seat === 0;
          return (
            <div
              key={seat}
              className="panel tight"
              style={{
                width: 150,
                textAlign: 'center',
                opacity: staked ? 1 : 0.45,
                border: mine
                  ? '4px solid var(--gold)'
                  : staked
                    ? '3px solid var(--confirm)'
                    : '3px dashed var(--panel-trim)',
                transition: 'opacity var(--t-med), border-color var(--t-med)',
              }}
            >
              <p style={{ fontWeight: mine ? 900 : 800, fontSize: 'var(--fs-fine)' }}>
                {mine && staked ? '★ ' : ''}
                {staked ? name : '—'}
              </p>
              {/* Each seat printed the stake amount. Every seat stakes the
                  same figure, and it is in the title and the pot row. */}
              <p style={{ fontSize: 'var(--fs-fine)', fontWeight: 700, color: staked ? 'var(--confirm-deep)' : 'var(--ink-faint)' }}>
                {staked ? 'staked ✓' : 'seat open'}
              </p>
            </div>
          );
        })}
      </div>
      <p style={{ color: 'rgba(255,255,255,0.95)', fontWeight: 800 }}>
        {filled}/8 staked — a bracket only starts full. If it never fills, every stake reclaims
        after 10 minutes, no rake.
      </p>
    </div>
  );
}

/** The bracket proper: quarters, semis, final — your path in gold. */
function BracketGrid({ bracket }: { bracket: BracketState }): ReactElement {
  const yourPath = new Set(pathOf(0));
  const columns: { title: string; matches: number[] }[] = [
    { title: 'Quarter-finals', matches: [0, 1, 2, 3] },
    { title: 'Semi-finals', matches: [4, 5] },
    { title: 'Final', matches: [FINAL] },
  ];
  const final = standings(bracket);

  return (
    <div className="row" style={{ gap: 30, alignItems: 'center' }}>
      {columns.map((col) => (
        <div key={col.title} className="col" style={{ gap: 14, justifyContent: 'center' }}>
          <p
            style={{
              textAlign: 'center',
              color: 'rgba(255,255,255,0.9)',
              fontFamily: 'var(--display)',
              fontWeight: 800,
              fontSize: 'var(--fs-fine)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}
          >
            {col.title}
          </p>
          {col.matches.map((i) => (
            <MatchBox key={i} bracket={bracket} index={i} highlight={yourPath.has(i)} />
          ))}
        </div>
      ))}
      <div className="col" style={{ gap: 8, alignItems: 'center' }}>
        <p
          style={{
            color: 'rgba(255,255,255,0.9)',
            fontFamily: 'var(--display)',
            fontWeight: 800,
            fontSize: 'var(--fs-fine)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}
        >
          Champion
        </p>
        <div
          className="panel tight"
          style={{
            width: 170,
            textAlign: 'center',
            border: '4px solid var(--gold)',
            minHeight: 56,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          {final ? (
            <p style={{ fontWeight: 800, fontSize: 'var(--fs-body)' }}>
              <Icon name="ui.trophy" size={16} style={{ color: 'var(--gold-deep)' }} />{' '}
              {bracket.entrants[final.champion]}
            </p>
          ) : (
            <p style={{ color: 'var(--ink-faint)', fontWeight: 700, fontSize: 'var(--fs-fine)' }}>undecided</p>
          )}
        </div>
      </div>
    </div>
  );
}

function MatchBox({
  bracket,
  index,
  highlight,
}: {
  bracket: BracketState;
  index: number;
  highlight: boolean;
}): ReactElement {
  const m = bracket.matches[index];
  const playable = m.winner === null && m.seats[0] !== null && m.seats[1] !== null;
  return (
    <div
      className="panel tight"
      style={{
        width: 190,
        border: highlight ? '4px solid var(--gold)' : '3px solid var(--panel-trim)',
        opacity: m.seats[0] === null && m.seats[1] === null ? 0.6 : 1,
      }}
    >
      {m.seats.map((seat, row) => {
        const name = seat === null ? '…' : bracket.entrants[seat];
        const won = m.winner !== null && seat === m.winner;
        const lost = m.winner !== null && seat !== m.winner;
        return (
          <p
            key={row}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontWeight: seat === 0 ? 900 : 700,
              fontSize: 'var(--fs-fine)',
              color: lost ? 'var(--ink-faint)' : 'var(--ink)',
              textDecoration: lost ? 'line-through' : 'none',
              padding: '2px 0',
            }}
          >
            <span>
              {seat === 0 ? '★ ' : ''}
              {name}
            </span>
            {won && <span style={{ color: 'var(--confirm-deep)' }}>✓</span>}
          </p>
        );
      })}
      {/* A decided match said "decided" under a row that is already struck
          through and ticked. The label now only appears where it adds
          something the box does not already show. */}
      {m.winner === null && (
        <p style={{ fontSize: 'var(--fs-fine)', fontWeight: 700, color: 'var(--ink-faint)', marginTop: 2 }}>
          {playable ? 'up next' : 'waiting on earlier rounds'}
        </p>
      )}
    </div>
  );
}
