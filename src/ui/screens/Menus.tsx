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
import { Wordmark } from '../art/registry';
import { chain } from '../../chain/client';
import { CUES, Sound } from '../sfx/SoundManager';
import { VFX_HOOKS } from '../vfx/hooks';

export function MainMenu(): ReactElement {
  const go = useStore((s) => s.go);
  const start = useStore((s) => s.startMatch);
  const profile = useStore((s) => s.profile);
  const season = seasonState(profile);
  const [busy, setBusy] = useState(false);

  async function play(mode: 'casual' | 'ranked' | 'arena'): Promise<void> {
    if (mode === 'arena') {
      go('queue');
      return;
    }
    setBusy(true);
    await start(mode, 0);
    setBusy(false);
  }

  return (
    <div className="screen">
      <div style={{ padding: '18px 0 8px' }}>
        <Wordmark size={46} />
      </div>
      <p>Three ships. Twelve cards. Both plans resolve at once. Under seven minutes.</p>

      <div className="card-surface row" style={{ justifyContent: 'space-between' }}>
        <div className="col" style={{ gap: 2 }}>
          <span style={{ fontSize: 12, color: 'var(--ink-dim)' }}>rating</span>
          <strong className="mono" style={{ fontSize: 22 }}>
            {profile.rating}
          </strong>
        </div>
        <div className="col" style={{ gap: 2, alignItems: 'flex-end' }}>
          <span style={{ fontSize: 12, color: 'var(--ink-dim)' }}>season</span>
          <strong style={{ fontSize: 14 }}>
            #{season.yourRank} of {season.fieldSize}
          </strong>
        </div>
      </div>

      {isProvisional(profile) && (
        <div className="card-surface" style={{ borderColor: 'var(--charge)' }}>
          <strong style={{ fontSize: 13 }}>Provisional</strong>
          <p style={{ fontSize: 12 }}>
            {PROVISIONAL_MATCHES - profile.provisionalMatches} rated matches to go. Wider
            matchmaking, faster rating movement, and arena limited to the 0.05 table.
          </p>
        </div>
      )}

      <div className="col">
        <button className="btn go" disabled={busy} onClick={() => play('casual')}>
          Casual
        </button>
        <button className="btn primary" disabled={busy} onClick={() => play('ranked')}>
          Ranked ladder
        </button>
        <button className="btn primary" disabled={busy} onClick={() => play('arena')}>
          Arena — stake SOL
        </button>
        <div className="grid2">
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
      </div>
      <div className="spacer" />
      <p style={{ fontSize: 11, textAlign: 'center' }}>
        Testnet build. Stakes are devnet SOL and carry no real value.
      </p>
    </div>
  );
}

export function Queue(): ReactElement {
  const go = useStore((s) => s.go);
  const start = useStore((s) => s.startMatch);
  const profile = useStore((s) => s.profile);
  const [stake, setStake] = useState<Stake>(allowedStakes(profile)[0]);
  const [searching, setSearching] = useState(false);
  const payout = arenaPayout(stake);

  async function find(): Promise<void> {
    setSearching(true);
    // A real queue waits on matchmaking; locally the opponent is already here.
    setTimeout(() => {
      void start('arena', stake);
      setSearching(false);
    }, 900);
  }

  return (
    <div className="screen">
      <h2>Arena</h2>
      <p>
        Winner takes the pot minus {(ARENA_RAKE * 100).toFixed(0)}% rake. A draw returns both stakes
        with no rake taken.
      </p>

      <h3>Stake</h3>
      <div className="grid4">
        {([0.05, 0.1, 0.25, 0.5] as Stake[]).map((s) => {
          const locked = !allowedStakes(profile).includes(s);
          return (
            <button
              key={s}
              className="btn"
              disabled={locked}
              onClick={() => setStake(s)}
              style={{ borderColor: stake === s ? 'var(--charge)' : 'var(--panel-edge)' }}
            >
              {s} SOL{locked ? ' · locked' : ''}
            </button>
          );
        })}
      </div>

      <div className="card-surface col" style={{ gap: 6 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: 'var(--ink-dim)' }}>pot</span>
          <strong className="mono">{payout.pot} SOL</strong>
        </div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: 'var(--ink-dim)' }}>rake</span>
          <strong className="mono">{payout.rake.toFixed(4)} SOL</strong>
        </div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: 'var(--ink-dim)' }}>to winner</span>
          <strong className="mono" style={{ color: 'var(--sol)' }}>
            {payout.toWinner.toFixed(4)} SOL
          </strong>
        </div>
      </div>

      {searching ? (
        <div className="card-surface col" style={{ alignItems: 'center', gap: 6 }}>
          <strong>Finding an opponent…</strong>
          <span style={{ fontSize: 12, color: 'var(--ink-dim)' }}>
            band {profile.rating - (isProvisional(profile) ? 300 : 120)} –{' '}
            {profile.rating + (isProvisional(profile) ? 300 : 120)}
          </span>
        </div>
      ) : (
        <button className="btn go" onClick={find}>
          Find match
        </button>
      )}
      <div className="spacer" />
      <button className="btn ghost" onClick={() => go('menu')}>
        back
      </button>
    </div>
  );
}

export function Leaderboard(): ReactElement {
  const go = useStore((s) => s.go);
  const profile = useStore((s) => s.profile);
  const season = seasonState(profile);
  // A plausible field, so the payout curve is legible before a real ladder exists.
  const rows = [
    { rank: 1, name: 'nullbeacon', rating: 2140 },
    { rank: 2, name: 'saltwake', rating: 2098 },
    { rank: 3, name: 'grimoire.sol', rating: 2071 },
    { rank: 4, name: 'tidewalker', rating: 2044 },
    { rank: 5, name: 'nine.of.cups', rating: 2019 },
  ];

  return (
    <div className="screen">
      <h2>Leaderboard</h2>
      <div className="card-surface row" style={{ justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, color: 'var(--ink-dim)' }}>live pot</span>
        <strong className="mono" style={{ color: 'var(--sol)' }}>
          {season.poolSol.toFixed(1)} SOL
        </strong>
      </div>

      <div className="col" style={{ gap: 4 }}>
        {rows.map((r) => (
          <div key={r.rank} className="card-surface row" style={{ padding: 10 }}>
            <span className="mono" style={{ width: 28, color: 'var(--ink-faint)' }}>
              {r.rank}
            </span>
            <span style={{ flex: 1, fontSize: 14 }}>{r.name}</span>
            <span className="mono">{r.rating}</span>
          </div>
        ))}
        <div
          className="card-surface row"
          style={{ padding: 10, borderColor: 'var(--charge)', position: 'sticky', bottom: 0 }}
        >
          <span className="mono" style={{ width: 28, color: 'var(--charge)' }}>
            {season.yourRank}
          </span>
          <span style={{ flex: 1, fontSize: 14 }}>{profile.name}</span>
          <span className="mono">{profile.rating}</span>
        </div>
      </div>

      <h3>Payout curve</h3>
      <div className="col" style={{ gap: 4 }}>
        {PAYOUT_CURVE.map((b) => (
          <div key={b.label} className="row" style={{ gap: 8 }}>
            <span style={{ width: 82, fontSize: 12, color: 'var(--ink-dim)' }}>{b.label}</span>
            <div style={{ flex: 1, height: 8, background: 'var(--hull)', borderRadius: 4 }}>
              <i
                style={{
                  display: 'block',
                  height: '100%',
                  width: `${b.poolShare * 100 * 3}%`,
                  maxWidth: '100%',
                  background: 'var(--sol)',
                  borderRadius: 4,
                }}
              />
            </div>
            <span className="mono" style={{ fontSize: 12, width: 40, textAlign: 'right' }}>
              {(b.poolShare * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 11 }}>
        Top 1% take the largest share; the top tenth at least recover their entry. Not
        winner-takes-all — a ladder nobody below the podium can profit from stops being a ladder.
      </p>
      <div className="spacer" />
      <button className="btn ghost" onClick={() => go('menu')}>
        back
      </button>
    </div>
  );
}

export function Season(): ReactElement {
  const go = useStore((s) => s.go);
  const profile = useStore((s) => s.profile);
  const season = seasonState(profile);

  return (
    <div className="screen">
      <h2>Season</h2>
      <div className="grid2">
        <Stat label="days left" value={String(season.daysRemaining)} />
        <Stat label="pool" value={`${season.poolSol.toFixed(0)} SOL`} />
        <Stat label="your rank" value={`#${season.yourRank}`} />
        <Stat
          label="projected"
          value={season.entered ? `${season.projectedSol.toFixed(3)} SOL` : 'not entered'}
        />
      </div>

      {!season.entered && (
        <div className="card-surface col">
          <strong style={{ fontSize: 14 }}>Enter the season</strong>
          <p style={{ fontSize: 12 }}>
            One entry of {SEASON_ENTRY_SOL} SOL buys unlimited ranked matches for the whole season.
            Entries are pooled and paid out on the curve at season end.
          </p>
          <button
            className="btn go"
            onClick={() => useStore.setState({ profile: { ...profile, seasonEntry: true } })}
          >
            Pay {SEASON_ENTRY_SOL} SOL entry
          </button>
        </div>
      )}

      <h3>Match history</h3>
      <div className="col scroll" style={{ gap: 4 }}>
        {profile.history.length === 0 && <p style={{ fontSize: 12 }}>No matches yet.</p>}
        {profile.history.map((h, i) => (
          <div key={i} className="card-surface row" style={{ padding: 9 }}>
            <span
              style={{
                width: 46,
                fontSize: 12,
                color:
                  h.result === 'win'
                    ? 'var(--friend)'
                    : h.result === 'draw'
                      ? 'var(--ink-dim)'
                      : 'var(--danger)',
              }}
            >
              {h.result}
            </span>
            <span style={{ flex: 1, fontSize: 12, color: 'var(--ink-dim)' }}>
              {h.mode}
              {h.stake ? ` · ${h.stake} SOL` : ''} · {h.rounds} rounds
            </span>
            <span className="mono" style={{ fontSize: 12 }}>
              {h.delta >= 0 ? '+' : ''}
              {h.delta}
            </span>
          </div>
        ))}
      </div>
      <div className="spacer" />
      <button className="btn ghost" onClick={() => go('menu')}>
        back
      </button>
    </div>
  );
}

export function SettingsScreen(): ReactElement {
  const go = useStore((s) => s.go);
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const [wallet, setWallet] = useState(chain.address());
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="screen">
      <h2>Settings</h2>

      <h3>Wallet</h3>
      <div className="card-surface col">
        <span style={{ fontSize: 13 }}>{wallet ?? 'not connected'}</span>
        <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>adapter: {chain.kind}</span>
        <button
          className="btn"
          onClick={async () => {
            try {
              setWallet(await chain.connect());
              setErr(null);
            } catch (e) {
              setErr(String(e instanceof Error ? e.message : e));
            }
          }}
        >
          connect
        </button>
        {err && <span style={{ fontSize: 11, color: 'var(--danger)' }}>{err}</span>}
        <p style={{ fontSize: 11 }}>
          Connecting issues a session key that signs your moves for this session. It cannot move
          funds — the escrow answers to your wallet, never to the session.
        </p>
      </div>

      <h3>Play</h3>
      <Toggle label="Sound" on={settings.sound} onChange={(v) => setSettings({ sound: v })} />
      <Toggle
        label="Skip resolve animation"
        on={settings.fastResolve}
        onChange={(v) => setSettings({ fastResolve: v })}
      />
      <div className="card-surface col" style={{ gap: 6 }}>
        <span style={{ fontSize: 13 }}>Opponent strength</span>
        <div className="grid4">
          {([1, 2, 3, 4] as const).map((l) => (
            <button
              key={l}
              className="btn"
              onClick={() => setSettings({ botLevel: l })}
              style={{
                borderColor: settings.botLevel === l ? 'var(--charge)' : 'var(--panel-edge)',
              }}
            >
              {['Deckhand', 'Mate', 'Officer', 'Admiral'][l - 1]}
            </button>
          ))}
        </div>
      </div>

      <h3>Hooks</h3>
      <div className="card-surface col" style={{ gap: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--ink-dim)' }}>
          {CUES.length} sound cues and {VFX_HOOKS.length} visual hooks are wired. No audio files
          ship with this build; the cues fire regardless, which is what the manifest is generated
          from.
        </span>
        <span className="log">
          last cues:{' '}
          {Sound.history
            .slice(-6)
            .map((h) => h.cue)
            .join(', ') || 'none yet'}
        </span>
      </div>

      <h3>Chain journal</h3>
      <div className="card-surface log scroll" style={{ maxHeight: 120 }}>
        {chain.journal.length === 0
          ? 'nothing yet'
          : chain.journal.slice(-10).map((l, i) => <div key={i}>{l}</div>)}
      </div>

      <div className="spacer" />
      <button className="btn ghost" onClick={() => go('menu')}>
        back
      </button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="card-surface col" style={{ gap: 2 }}>
      <span style={{ fontSize: 11, color: 'var(--ink-dim)' }}>{label}</span>
      <strong style={{ fontSize: 18 }}>{value}</strong>
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
    <button className="card-surface row" onClick={() => onChange(!on)} style={{ width: '100%' }}>
      <span style={{ flex: 1, fontSize: 14, textAlign: 'left' }}>{label}</span>
      <span
        style={{
          width: 40,
          height: 22,
          borderRadius: 999,
          background: on ? 'var(--sol)' : 'var(--hull)',
          border: '1px solid var(--panel-edge)',
          position: 'relative',
        }}
      >
        <i
          style={{
            position: 'absolute',
            top: 2,
            left: on ? 20 : 2,
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: on ? '#04120c' : 'var(--ink-dim)',
            transition: 'left var(--t-fast)',
          }}
        />
      </span>
    </button>
  );
}
