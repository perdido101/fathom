import { Component, type ErrorInfo, type ReactElement, type ReactNode } from 'react';

/**
 * A crash must not cost someone a staked match.
 *
 * The important part is not the apology screen — it is that the match lives on
 * the server, so a client that throws has lost a render, not a game. This
 * boundary says so plainly and offers the one action that actually recovers:
 * reload and rejoin, which the server honours for the whole grace period.
 *
 * It also keeps the error itself on screen. A player filing a complaint about
 * money needs something to quote, and "something went wrong" is not it.
 */
interface Props {
  children: ReactNode;
  /** Which screen this wraps, so a report says where it broke. */
  where: string;
  onReset?: () => void;
}

interface State {
  error: Error | null;
  info: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Structured rather than a formatted string, so whatever collects logs
    // later can query it.
    console.error('[shadow-armada] screen crashed', {
      where: this.props.where,
      message: error.message,
      stack: error.stack,
      component: info.componentStack,
    });
    this.setState({ info: info.componentStack ?? null });
  }

  private reset = (): void => {
    this.setState({ error: null, info: null });
    this.props.onReset?.();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="screen">
        <h2 style={{ color: 'var(--danger)' }}>This screen stopped</h2>
        <p>
          The match itself is held on the server, not here, so nothing has been lost. Reload and you
          will rejoin where you were — the grace period covers it.
        </p>
        <div className="panel col" style={{ gap: 6 }}>
          <span style={{ fontSize: 'var(--fs-fine)', color: 'var(--ink-dim)' }}>where</span>
          <strong style={{ fontSize: 'var(--fs-fine)' }}>{this.props.where}</strong>
          <span style={{ fontSize: 'var(--fs-fine)', color: 'var(--ink-dim)' }}>error</span>
          <span style={{ color: 'var(--danger)', fontWeight: 700, wordBreak: 'break-word' }}>
            {error.message}
          </span>
        </div>
        <div className="spacer" />
        <button className="btn go" onClick={() => window.location.reload()}>
          Reload and rejoin
        </button>
        <button className="btn ghost" onClick={this.reset}>
          Try this screen again
        </button>
      </div>
    );
  }
}

/** A screen waiting on something. Never a blank panel. */
export function Loading({ what }: { what: string }): ReactElement {
  return (
    <div className="screen" style={{ justifyContent: 'center', alignItems: 'center', gap: 12 }}>
      <span className="thinking" style={{ fontSize: 'var(--fs-lead)' }}>
        <i />
        <i />
        <i />
      </span>
      <p style={{ textAlign: 'center' }}>{what}</p>
    </div>
  );
}

/** A screen that failed at something recoverable, with the reason shown. */
export function Failed({
  what,
  detail,
  onRetry,
  onBack,
}: {
  what: string;
  detail?: string | null;
  onRetry?: () => void;
  onBack?: () => void;
}): ReactElement {
  return (
    <div className="screen">
      <h2 style={{ color: 'var(--danger)' }}>{what}</h2>
      {detail && (
        <div className="panel">
          <span style={{ color: 'var(--danger)', fontWeight: 700, wordBreak: 'break-word' }}>
            {detail}
          </span>
        </div>
      )}
      <div className="spacer" />
      {onRetry && (
        <button className="btn go" onClick={onRetry}>
          Try again
        </button>
      )}
      {onBack && (
        <button className="btn ghost" onClick={onBack}>
          Back
        </button>
      )}
    </div>
  );
}
