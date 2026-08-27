import { useEffect, useState, type ReactElement } from 'react';
import { chain } from '../../chain/client';

/**
 * The wallet, always in the corner.
 *
 * Address short-form, live devnet balance, connect when there is nothing
 * connected, and a faucet link the moment the balance is too low for the
 * cheapest table — because "get more devnet SOL" is a question every new
 * player hits and the answer should be one click from wherever they are.
 */
export function WalletChip(): ReactElement {
  const [address, setAddress] = useState(chain.address());
  const [balance, setBalance] = useState(chain.balanceSol());
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setBalance(chain.balanceSol()), 2000);
    return () => clearInterval(id);
  }, []);

  async function connect(): Promise<void> {
    try {
      setAddress(await chain.connect());
      setBalance(chain.balanceSol());
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  const low = balance !== null && balance < 0.05;

  return (
    <div
      className="wallet-chip"
      style={{
        position: 'absolute',
        top: 14,
        right: 16,
        zIndex: 30,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      {address ? (
        <>
          <button
            className="pill dark"
            title={`${address} — click to disconnect`}
            style={{ border: 'none', cursor: 'pointer', font: 'inherit' }}
            onClick={() => {
              chain.disconnect();
              setAddress(chain.address());
              setBalance(chain.balanceSol());
            }}
          >
            {address.slice(0, 4)}…{address.slice(-4)}
          </button>
          <span className="pill gold" title="devnet balance">
            ◎ {balance === null ? '—' : balance.toFixed(3)}
          </span>
          {low && (
            <a
              className="pill"
              href="https://faucet.solana.com"
              target="_blank"
              rel="noreferrer"
              style={{ textDecoration: 'none' }}
            >
              faucet ↗
            </a>
          )}
        </>
      ) : (
        <button className="btn small" onClick={() => void connect()}>
          Connect wallet
        </button>
      )}
      <span className="pill" style={{ fontSize: 'var(--fs-fine)', opacity: 0.85 }}>
        devnet
      </span>
      {err && (
        <span className="pill" style={{ color: 'var(--danger)', maxWidth: 260 }}>
          {err}
        </span>
      )}
    </div>
  );
}

/**
 * The logo lockup, restyled for the sky.
 *
 * The one place in the game where a size is not read off the type scale is
 * the mark itself: a logotype is a drawing, and its circle has to track the
 * cap height of the word beside it or the lockup comes apart. So the type
 * takes its two sizes from the scale and the *drawing* is derived from them,
 * which is the dependency the right way round. Noted in docs/TYPOGRAPHY.md.
 */
export function Wordmark({ hero = false }: { hero?: boolean }): ReactElement {
  const glyph = hero ? 104 : 44;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <svg viewBox="0 0 100 100" width={glyph} height={glyph} aria-hidden>
        <circle cx="50" cy="50" r="48" fill="rgba(255,255,255,0.25)" />
        <path d="M12 60 L50 24 L88 60 L73 60 L50 40 L27 60 Z" fill="#ffffff" opacity="0.9" />
        <path d="M12 78 L50 42 L88 78 L73 78 L50 58 L27 78 Z" fill="var(--gold)" />
      </svg>
      <div style={{ lineHeight: 0.95 }}>
        <div
          className="display"
          style={{
            fontSize: hero ? 'var(--fs-display)' : 'var(--fs-head)',
            fontWeight: 800,
            color: '#ffffff',
            textShadow: '0 3px 0 rgba(18,58,94,0.35)',
            letterSpacing: '0.01em',
          }}
        >
          SHADOW
        </div>
        <div
          className="display"
          style={{
            fontSize: hero ? 'var(--fs-head)' : 'var(--fs-fine)',
            fontWeight: 700,
            letterSpacing: '0.32em',
            color: 'var(--gold)',
            textShadow: '0 2px 0 rgba(18,58,94,0.35)',
          }}
        >
          ARMADA
        </div>
      </div>
    </div>
  );
}
