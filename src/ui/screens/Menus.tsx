import { useState, type ReactElement } from 'react';
import { useStore } from '../../state/store';
import {
  ARENA_RAKE,
  PAYOUT_CURVE,
  PROVISIONAL_MATCHES,
  SEASON_ENTRY_SOL,
  allowedStakes,
  arenaPayout,
  isProvisional,
  seasonState,
  type Stake,
} from '../../state/profile';
import { Wordmark } from '../components/WalletChip';
import { chain } from '../../chain/client';
import { CUES, Sound } from '../sfx/SoundManager';
import { VFX_HOOKS } from '../vfx/hooks';
import { Icon } from '../art/Icon';

/**
 * Menus, spread to 16:9.
 *
 * The main menu is three big mode cards on the open sky, each wearing its
 * money story on its face — Free, 0.1 SOL a season, tiered stakes — because
 * what a mode costs is the first thing a player deciding between them wants
 * to know. Clouds drift behind everything; the cards bob gently; the game
 * looks alive before anyone touches it.
 */

function Clouds(): ReactElement {
  return (
    <>
      <span className="cloud" style={{ width: 340, height: 90, top: '12%', animationDuration: '70s' }} />
      <span className="cloud" style={{ width: 240, height: 66, top: '30%', animationDuration: '95s', animationDelay: '-30s' }} />
      <span className="cloud" style={{ width: 420, height: 110, top: '64%', animationDuration: '110s', animationDelay: '-60s', opacity: 0.6 }} />
    </>
  );
}

export function MainMenu(): ReactElement {
  const go = useStore((s) => s.go);
  const start = useStore((s) => s.startMatch);
  const profile = useStore((s) => s.profile);
  const season = seasonState(profile);
  const [rankedModal, setRankedModal] = useState(false);

  function onRanked(): void {
    if (!profile.seasonEntry) setRankedModal(true);
    else void start('ranked', 0);
  }

  return (
    <div className="screen centered" style={{ position: 'relative', overflow: 'hidden', gap: 30 }}>
      <Clouds />
      <Wordmark size={84} />
      <p
        style={{
          color: '#ffffff',
          fontFamily: 'var(--display)',
          fontWeight: 700,
          fontSize: 19,
          textShadow: '0 2px 0 rgba(18,58,94,0.3)',
        }}
      >
        Three ships · twelve cards · both plans resolve at once
      </p>

      <div className="row" style={{ gap: 26, alignItems: 'stretch' }}>
        <ModeCard
          bob=""
          icon="ui.anchor"
          title="Casual"
          stakeLine="Free"
          blurb="Straight into a match. No wallet, no stakes, full game."
          colour="var(--intel)"
          onClick={() => void start('casual', 0)}
          cta="Play"
        />
        <ModeCard
          bob="b2"
          icon="ui.rank"
          title="Ranked"
          stakeLine={`◎ ${SEASON_ENTRY_SOL} / season`}
          blurb={`One entry, unlimited matches, season-end payouts on a curve. Pool ◎ ${season.poolSol.toFixed(0)} and rising.`}
          colour="var(--control)"
          onClick={onRanked}
          cta={profile.seasonEntry ? 'Play ranked' : 'Enter season'}
        />
        <ModeCard
          bob="b3"
          icon="ui.trophy"
          title="Arena"
          stakeLine="◎ 0.05 – 0.5"
          blurb="Winner takes the pot minus 5%. Draws return both stakes, no rake."
          colour="var(--predict)"
          onClick={() => go('queue')}
          cta="Pick a table"
        />
      </div>

      <div className="row" style={{ gap: 12 }}>
        <button className="btn" onClick={() => go('howto')}>
          How to play
        </button>
        <button className="btn" onClick={() => go('leaderboard')}>
          Leaderboard
        </button>
        <button className="btn" onClick={() => go('season')}>
          Season
        </button>
        <button className="btn" onClick={() => go('settings')}>
          Settings
        </button>
      </div>

      <div className="row" style={{ gap: 10 }}>
        <span className="pill">
          Rating <strong className="mono">{profile.rating}</strong>
        </span>
        <span className="pill">
          Season rank <strong className="mono">#{season.yourRank}</strong>
        </span>
        {isProvisional(profile) && (
          <span className="pill" title="Wider matchmaking, lowest arena table only">
            Provisional · {PROVISIONAL_MATCHES - profile.provisionalMatches} to go
          </span>
        )}
      </div>

      {rankedModal && (
        <RankedJoinModal
          poolSol={season.poolSol}
          onClose={() => setRankedModal(false)}
          onConfirm={() => {
            useStore.setState({ profile: { ...profile, seasonEntry: true } });
            setRankedModal(false);
            void start('ranked', 0);
          }}
        />
      )}
    </div>
  );
}

function ModeCard({
  icon,
  title,
  stakeLine,
  blurb,
  colour,
  onClick,
  cta,
  bob,
}: {
  icon: string;
  title: string;
  stakeLine: string;
  blurb: string;
  colour: string;
  onClick: () => void;
  cta: string;
  bob?: string;
}): ReactElement {
  return (
    <div style={{ display: 'flex' }}>
      <button
        onClick={onClick}
        className="panel mode-card"
        style={{
          width: 280,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          alignItems: 'flex-start',
          textAlign: 'left',
          borderTop: `6px solid ${colour}`,
          transition: 'transform var(--t-fast), box-shadow var(--t-fast)',
        }}
      >
        <span
          className={`bob ${bob ?? ''}`}
          style={{
            display: 'grid',
            placeItems: 'center',
            width: 54,
            height: 54,
            borderRadius: 16,
            background: colour,
            color: '#ffffff',
            boxShadow: 'var(--shadow-soft)',
          }}
        >
          <Icon name={icon} size={30} />
        </span>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span className="display" style={{ fontSize: 26, fontWeight: 800 }}>
            {title}
          </span>
          <span className="pill gold" style={{ fontSize: 13 }}>
            {stakeLine}
          </span>
        </span>
        <p style={{ fontSize: 14, minHeight: 62 }}>{blurb}</p>
        <span className="btn go small" style={{ alignSelf: 'stretch', textAlign: 'center' }}>
          {cta}
        </span>
      </button>
    </div>
  );
}

/**
 * The season entry, priced before it is paid. One number, what it buys, the
 * pool so far, one confirm.
 */
function RankedJoinModal({
  poolSol,
  onClose,
  onConfirm,
}: {
  poolSol: number;
  onClose: () => void;
  onConfirm: () => void;
}): ReactElement {
  const balance = chain.balanceSol();
  const short = balance !== null && balance < SEASON_ENTRY_SOL;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="col" style={{ gap: 14 }}>
          <h2>Enter the season</h2>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, color: 'var(--ink-dim)' }}>One-time entry</span>
            <span className="pill gold" style={{ fontSize: 18 }}>
              ◎ {SEASON_ENTRY_SOL}
            </span>
          </div>
          <p>
            Unlimited ranked matches for the whole season. Entries are pooled and paid out at
            season end on a curve — the top 1% take the largest share, and the top tenth at least
            recover their entry. Not winner-takes-all.
          </p>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, color: 'var(--ink-dim)' }}>Pool so far</span>
            <span className="display" style={{ fontSize: 22, fontWeight: 800 }}>
              ◎ {poolSol.toFixed(0)}
            </span>
          </div>
          {short && (
            <p style={{ color: 'var(--danger)', fontWeight: 700 }}>
              Your wallet holds ◎ {balance?.toFixed(3)} — not enough for the ◎ {SEASON_ENTRY_SOL}{' '}
              entry. Top up at faucet.solana.com first.
            </p>
          )}
          <div className="row">
            <button className="btn ghost" style={{ flex: 1 }} onClick={onClose}>
              Not now
            </button>
            <button className="btn gold" style={{ flex: 2 }} disabled={short} onClick={onConfirm}>
              Pay ◎ {SEASON_ENTRY_SOL} and play
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Arena: the tier picker
// ---------------------------------------------------------------------------

export function Queue(): ReactElement {
  const go = useStore((s) => s.go);
  const start = useStore((s) => s.startMatch);
  const profile = useStore((s) => s.profile);
  const [stake, setStake] = useState<Stake>(allowedStakes(profile)[0]);
  const payout = arenaPayout(stake);
  const balance = chain.balanceSol();
  const short = balance !== null && balance < stake;
  const band = isProvisional(profile) ? 300 : 120;

  return (
    <div className="screen centered" style={{ gap: 24, position: 'relative', overflow: 'hidden' }}>
      <Clouds />
      <h1 style={{ color: '#ffffff', textShadow: '0 3px 0 rgba(18,58,94,0.3)' }}>Arena</h1>
      <p style={{ color: 'rgba(255,255,255,0.92)', fontWeight: 700 }}>
        Winner takes the pot minus {(ARENA_RAKE * 100).toFixed(0)}% rake. A draw returns both
        stakes in full — no rake taken.
      </p>

      <div className="row" style={{ gap: 18, alignItems: 'stretch' }}>
        {([0.05, 0.1, 0.25, 0.5] as Stake[]).map((s) => {
          const locked = !allowedStakes(profile).includes(s);
          const active = stake === s;
          return (
            <button
              key={s}
              className="panel"
              disabled={locked}
              onClick={() => setStake(s)}
              style={{
                width: 190,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                alignItems: 'center',
                border: `4px solid ${active ? 'var(--gold)' : 'var(--panel-trim)'}`,
                boxShadow: active
                  ? '0 0 0 4px rgba(255,197,49,0.4), var(--shadow-soft)'
                  : 'var(--shadow-soft)',
                opacity: locked ? 0.6 : 1,
                position: 'relative',
              }}
            >
              <span className="gem big" style={{ fontSize: 20 }}>
                ◎
              </span>
              <span className="display" style={{ fontSize: 30, fontWeight: 800 }}>
                {s}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-dim)' }}>
                Rating {profile.rating - band}–{profile.rating + band}
              </span>
              {locked ? (
                <span className="pill" title="Provisional accounts play the lowest table">
                  <Icon name="ui.locked" size={13} /> after {PROVISIONAL_MATCHES} rated
                </span>
              ) : (
                <span className="pill gold" style={{ fontSize: 12 }}>
                  win ◎ {arenaPayout(s).toWinner.toFixed(3)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="panel tight row" style={{ gap: 22, minWidth: 560, justifyContent: 'center' }}>
        <span style={{ fontWeight: 800 }}>Pot ◎ {payout.pot.toFixed(2)}</span>
        <span style={{ color: 'var(--ink-dim)', fontWeight: 700 }}>
          Rake ◎ {payout.rake.toFixed(4)}
        </span>
        <span style={{ color: 'var(--confirm-deep)', fontWeight: 800 }}>
          To winner ◎ {payout.toWinner.toFixed(4)}
        </span>
      </div>

      {short && (
        <div className="panel tight" style={{ borderColor: 'var(--danger)', maxWidth: 560 }}>
          <p style={{ color: 'var(--danger)', fontWeight: 800, marginBottom: 4 }}>
            Not enough devnet SOL for this table.
          </p>
          <p style={{ fontSize: 14 }}>
            The ◎ {stake} table needs ◎ {stake} staked and your wallet holds ◎{' '}
            {balance?.toFixed(3)}. Get free devnet SOL at{' '}
            <a href="https://faucet.solana.com" target="_blank" rel="noreferrer">
              faucet.solana.com
            </a>{' '}
            or pick a lower table.
          </p>
        </div>
      )}

      <div className="row" style={{ gap: 12 }}>
        <button className="btn ghost" onClick={() => go('menu')}>
          Back
        </button>
        <button className="btn go huge" disabled={short} onClick={() => void start('arena', stake)}>
          Find match · ◎ {stake}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The escrow forming — two stacks of gold merging into a pot
// ---------------------------------------------------------------------------

export function Escrow(): ReactElement | null {
  const escrow = useStore((s) => s.escrow);
  const go = useStore((s) => s.go);
  if (!escrow) return null;
  const both = escrow.you && escrow.opponent;

  return (
    <div className="screen centered" style={{ gap: 26, position: 'relative', overflow: 'hidden' }}>
      <Clouds />
      <h1 style={{ color: '#ffffff', textShadow: '0 3px 0 rgba(18,58,94,0.3)' }}>
        Opening the escrow
      </h1>

      <div className="row" style={{ gap: 40, alignItems: 'center' }}>
        <StakeStack label="You" done={escrow.you} stake={escrow.stake} />
        <div
          className="gem big"
          style={{
            width: 110,
            height: 110,
            fontSize: 26,
            transform: both ? 'scale(1.12)' : 'scale(1)',
            transition: 'transform var(--t-med)',
          }}
        >
          ◎ {(escrow.stake * (Number(escrow.you) + Number(escrow.opponent))).toFixed(2)}
        </div>
        <StakeStack label="Opponent" done={escrow.opponent} stake={escrow.stake} />
      </div>

      <div className="panel tight" style={{ minWidth: 420, textAlign: 'center' }}>
        <p style={{ fontWeight: 800, fontSize: 16, color: both ? 'var(--confirm-deep)' : 'var(--ink)' }}>
          {both
            ? 'Both stakes escrowed — the match is live.'
            : escrow.you
              ? 'You staked ✓ · Opponent staking…'
              : 'Sending your stake…'}
        </p>
        <p style={{ fontSize: 13, marginTop: 4 }}>
          Both stakes land in one on-chain account. If the match is never played, either player can
          reclaim their own stake after 30 minutes — nobody can take the other's.
        </p>
      </div>

      {!both && (
        <button className="btn ghost" onClick={() => go('queue')}>
          Cancel and reclaim
        </button>
      )}
    </div>
  );
}

function StakeStack({
  label,
  done,
  stake,
}: {
  label: string;
  done: boolean;
  stake: number;
}): ReactElement {
  return (
    <div className="col" style={{ alignItems: 'center', gap: 10 }}>
      <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 4, minHeight: 90 }}>
        {Array.from({ length: 4 }, (_, i) => (
          <span
            key={i}
            style={{
              width: 74,
              height: 16,
              borderRadius: 8,
              background: done
                ? 'linear-gradient(180deg, #ffd968, var(--gold-deep))'
                : 'rgba(255,255,255,0.35)',
              border: '2px solid rgba(255,255,255,0.7)',
              transition: `background 300ms ease ${i * 90}ms`,
            }}
          />
        ))}
      </div>
      <span
        className="pill"
        style={{ background: done ? 'var(--confirm)' : undefined, color: done ? '#fff' : undefined }}
      >
        {label} {done ? `◎ ${stake} ✓` : '…'}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Leaderboard — payout curve drawn, live pot in gold
// ---------------------------------------------------------------------------

export function Leaderboard(): ReactElement {
  const go = useStore((s) => s.go);
  const profile = useStore((s) => s.profile);
  const season = seasonState(profile);
  const rows = [
    { rank: 1, name: 'nullbeacon', rating: 2140 },
    { rank: 2, name: 'saltwake', rating: 2098 },
    { rank: 3, name: 'grimoire.sol', rating: 2071 },
    { rank: 4, name: 'tidewalker', rating: 2044 },
    { rank: 5, name: 'nine.of.cups', rating: 2019 },
    { rank: 6, name: 'bilge&bone', rating: 1988 },
    { rank: 7, name: 'ferrous', rating: 1954 },
  ];

  return (
    <div className="screen" style={{ alignItems: 'center', gap: 18 }}>
      <div className="row" style={{ width: 'min(1100px, 100%)', justifyContent: 'space-between' }}>
        <h1 style={{ color: '#ffffff', textShadow: '0 3px 0 rgba(18,58,94,0.3)' }}>Leaderboard</h1>
        <span className="pill gold" style={{ fontSize: 20, padding: '10px 22px' }}>
          Live pool ◎ {season.poolSol.toFixed(1)}
        </span>
      </div>

      <div className="row" style={{ width: 'min(1100px, 100%)', gap: 20, alignItems: 'flex-start' }}>
        <div className="panel" style={{ flex: 1.2 }}>
          <div className="col" style={{ gap: 6 }}>
            {rows.map((r) => (
              <div
                key={r.rank}
                className="row"
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  background: r.rank <= 3 ? 'rgba(255,197,49,0.14)' : 'var(--panel-dim)',
                }}
              >
                <span
                  className="display"
                  style={{ width: 40, fontWeight: 800, fontSize: 18, color: 'var(--ink-dim)' }}
                >
                  {r.rank}
                </span>
                <span style={{ flex: 1, fontWeight: 800 }}>{r.name}</span>
                <span className="mono" style={{ fontWeight: 700 }}>
                  {r.rating}
                </span>
              </div>
            ))}
            <div
              className="row"
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                border: '3px solid var(--gold)',
                background: 'rgba(255,197,49,0.12)',
              }}
            >
              <span className="display" style={{ width: 40, fontWeight: 800, fontSize: 18 }}>
                {season.yourRank}
              </span>
              <span style={{ flex: 1, fontWeight: 800 }}>{profile.name}</span>
              <span className="mono" style={{ fontWeight: 700 }}>
                {profile.rating}
              </span>
            </div>
          </div>
        </div>

        <div className="panel" style={{ flex: 1 }}>
          <h3 style={{ marginBottom: 12 }}>Payout curve</h3>
          <PayoutChart poolSol={season.poolSol} />
          <p style={{ fontSize: 13, marginTop: 10 }}>
            The top 1% take the largest share; the top tenth at least recover their entry. A ladder
            nobody below the podium can profit from stops being a ladder.
          </p>
        </div>
      </div>

      <button className="btn ghost" onClick={() => go('menu')}>
        Back
      </button>
    </div>
  );
}

/** The curve as bars: band share of the pool, gold on light. */
export function PayoutChart({ poolSol }: { poolSol: number }): ReactElement {
  const max = Math.max(...PAYOUT_CURVE.map((b) => b.poolShare));
  return (
    <div className="col" style={{ gap: 8 }}>
      {PAYOUT_CURVE.map((b) => (
        <div key={b.label} className="row" style={{ gap: 10 }}>
          <span style={{ width: 92, fontSize: 13, fontWeight: 800, color: 'var(--ink-dim)' }}>
            {b.label}
          </span>
          <div style={{ flex: 1, height: 22, borderRadius: 11, background: 'var(--panel-dim)' }}>
            <div
              style={{
                width: `${(b.poolShare / max) * 100}%`,
                height: '100%',
                borderRadius: 11,
                background: 'linear-gradient(180deg, #ffd968, var(--gold-deep))',
                border: '2px solid rgba(255,255,255,0.7)',
              }}
            />
          </div>
          <span className="mono" style={{ width: 88, fontSize: 12, fontWeight: 700, textAlign: 'right' }}>
            {(b.poolShare * 100).toFixed(0)}% · ◎{(poolSol * b.poolShare).toFixed(0)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Season
// ---------------------------------------------------------------------------

export function Season(): ReactElement {
  const go = useStore((s) => s.go);
  const profile = useStore((s) => s.profile);
  const season = seasonState(profile);
  const [joinModal, setJoinModal] = useState(false);

  return (
    <div className="screen" style={{ alignItems: 'center', gap: 18 }}>
      <h1 style={{ color: '#ffffff', textShadow: '0 3px 0 rgba(18,58,94,0.3)' }}>Season</h1>

      <div className="row" style={{ gap: 16 }}>
        <Stat label="Days left" value={String(season.daysRemaining)} />
        <Stat label="Live pool" value={`◎ ${season.poolSol.toFixed(0)}`} gold />
        <Stat label="Your rank" value={`#${season.yourRank}`} />
        <Stat
          label="Projected payout"
          value={season.entered ? `◎ ${season.projectedSol.toFixed(3)}` : '—'}
          gold={season.entered}
        />
      </div>

      <div className="row" style={{ width: 'min(1100px, 100%)', gap: 20, alignItems: 'flex-start' }}>
        <div className="panel" style={{ flex: 1 }}>
          <h3 style={{ marginBottom: 12 }}>Payout curve</h3>
          <PayoutChart poolSol={season.poolSol} />
          {!season.entered && (
            <button
              className="btn gold"
              style={{ marginTop: 14, width: '100%' }}
              onClick={() => setJoinModal(true)}
            >
              Enter the season · ◎ {SEASON_ENTRY_SOL}
            </button>
          )}
        </div>

        <div className="panel" style={{ flex: 1, maxHeight: 420, display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ marginBottom: 12 }}>Match history</h3>
          <div className="col scroll" style={{ gap: 6 }}>
            {profile.history.length === 0 && <p>No matches yet.</p>}
            {profile.history.map((h, i) => (
              <div key={i} className="row" style={{ padding: '8px 12px', borderRadius: 10, background: 'var(--panel-dim)' }}>
                <span
                  style={{
                    width: 52,
                    fontWeight: 800,
                    fontFamily: 'var(--display)',
                    color:
                      h.result === 'win'
                        ? 'var(--confirm-deep)'
                        : h.result === 'draw'
                          ? 'var(--ink-dim)'
                          : 'var(--danger)',
                  }}
                >
                  {h.result}
                </span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--ink-dim)' }}>
                  {h.mode}
                  {h.stake ? ` · ◎ ${h.stake}` : ''} · {h.rounds} rounds
                </span>
                <span className="mono" style={{ fontWeight: 700 }}>
                  {h.delta >= 0 ? '+' : ''}
                  {h.delta}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <button className="btn ghost" onClick={() => go('menu')}>
        Back
      </button>

      {joinModal && (
        <RankedJoinModal
          poolSol={season.poolSol}
          onClose={() => setJoinModal(false)}
          onConfirm={() => {
            useStore.setState({ profile: { ...profile, seasonEntry: true } });
            setJoinModal(false);
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, gold }: { label: string; value: string; gold?: boolean }): ReactElement {
  return (
    <div className="panel tight" style={{ minWidth: 170, textAlign: 'center' }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {label}
      </div>
      <div className="display" style={{ fontSize: 28, fontWeight: 800, color: gold ? 'var(--gold-deep)' : 'var(--ink)' }}>
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export function SettingsScreen(): ReactElement {
  const go = useStore((s) => s.go);
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const [err, setErr] = useState<string | null>(null);
  const [addr, setAddr] = useState(chain.address());

  return (
    <div className="screen" style={{ alignItems: 'center', gap: 16 }}>
      <h1 style={{ color: '#ffffff', textShadow: '0 3px 0 rgba(18,58,94,0.3)' }}>Settings</h1>

      <div className="row" style={{ width: 'min(1050px, 100%)', gap: 18, alignItems: 'flex-start' }}>
        <div className="col" style={{ flex: 1 }}>
          <div className="panel">
            <h3 style={{ marginBottom: 10 }}>Wallet</h3>
            <p style={{ fontSize: 14, wordBreak: 'break-all' }}>{addr ?? 'Not connected.'}</p>
            <p style={{ fontSize: 13, marginTop: 6 }}>
              Adapter: <strong>{chain.kind}</strong>. Connecting issues a session key that signs
              your moves for this session. It cannot move funds — the escrow answers to your
              wallet, never to the session.
            </p>
            <button
              className="btn small"
              style={{ marginTop: 10 }}
              onClick={async () => {
                try {
                  setAddr(await chain.connect());
                  setErr(null);
                } catch (e) {
                  setErr(e instanceof Error ? e.message : String(e));
                }
              }}
            >
              Connect
            </button>
            {err && <p style={{ color: 'var(--danger)', marginTop: 8, fontSize: 13 }}>{err}</p>}
          </div>

          <div className="panel">
            <h3 style={{ marginBottom: 10 }}>Play</h3>
            <Toggle label="Sound" on={settings.sound} onChange={(v) => setSettings({ sound: v })} />
            <Toggle
              label="Fast resolve (~1s)"
              on={settings.fastResolve}
              onChange={(v) => setSettings({ fastResolve: v })}
            />
            <div className="col" style={{ gap: 8, marginTop: 10 }}>
              <span style={{ fontWeight: 800, fontSize: 14 }}>Opponent strength</span>
              <div className="grid4">
                {([1, 2, 3, 4] as const).map((l) => (
                  <button
                    key={l}
                    className="btn small"
                    onClick={() => setSettings({ botLevel: l })}
                    style={{
                      borderColor: settings.botLevel === l ? 'var(--gold)' : undefined,
                      boxShadow:
                        settings.botLevel === l
                          ? '0 0 0 3px rgba(255,197,49,0.4)'
                          : undefined,
                    }}
                  >
                    {['Deckhand', 'Mate', 'Officer', 'Admiral'][l - 1]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="col" style={{ flex: 1 }}>
          <div className="panel">
            <h3 style={{ marginBottom: 8 }}>Credits</h3>
            <p style={{ fontSize: 13, marginBottom: 8 }}>
              {CUES.length} sound cues and {VFX_HOOKS.length} visual hooks are wired; the icon set
              is CC BY and its attribution lives on the credits screen.
            </p>
            <button className="btn small" onClick={() => go('credits')}>
              Art credits and licences
            </button>
          </div>
          <div className="panel" style={{ maxHeight: 260, display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ marginBottom: 8 }}>Chain journal</h3>
            <div
              className="scroll mono"
              style={{ fontSize: 12, color: 'var(--ink-dim)', lineHeight: 1.6 }}
            >
              {chain.journal.length === 0
                ? 'Nothing yet.'
                : chain.journal.slice(-12).map((l, i) => <div key={i}>{l}</div>)}
            </div>
          </div>
          <div className="panel tight">
            <span className="mono" style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
              Last cues: {Sound.history.slice(-6).map((h) => h.cue).join(', ') || 'none yet'}
            </span>
          </div>
        </div>
      </div>

      <button className="btn ghost" onClick={() => go('menu')}>
        Back
      </button>
    </div>
  );
}

function Toggle({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
}): ReactElement {
  return (
    <button
      className="row"
      onClick={() => onChange(!on)}
      style={{ width: '100%', padding: '8px 0', justifyContent: 'space-between' }}
    >
      <span style={{ fontWeight: 800, fontSize: 14 }}>{label}</span>
      <span
        style={{
          width: 52,
          height: 28,
          borderRadius: 999,
          background: on ? 'var(--confirm)' : 'var(--panel-dim)',
          border: '2px solid rgba(255,255,255,0.8)',
          position: 'relative',
          boxShadow: 'inset 0 2px 4px rgba(18,58,94,0.2)',
          flex: 'none',
        }}
      >
        <i
          style={{
            position: 'absolute',
            top: 2,
            left: on ? 26 : 2,
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: '#ffffff',
            boxShadow: '0 2px 4px rgba(18,58,94,0.3)',
            transition: 'left var(--t-fast)',
          }}
        />
      </span>
    </button>
  );
}
