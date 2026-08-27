import { type CSSProperties, useEffect, type ReactElement } from 'react';
import { useStore } from './state/store';
import { MainMenu, Queue, Escrow, Leaderboard, Season, SettingsScreen } from './ui/screens/Menus';
import { HowToPlay } from './ui/screens/HowToPlay';
import { Draft } from './ui/screens/Draft';
import { Deployment } from './ui/screens/Deployment';
import { Battle } from './ui/screens/Battle';
import { Result } from './ui/screens/Result';
import { BracketScreen } from './ui/screens/Bracket';
import { NetBanners, NetResult } from './ui/screens/NetStatus';
import { ResolveOverlay } from './ui/screens/ResolveOverlay';
import { PhaseBeats } from './ui/screens/Beats';
import { Slam } from './ui/screens/Slam';
import { Credits } from './ui/screens/Credits';
import { ErrorBoundary, Failed, Loading } from './ui/components/ErrorBoundary';
import { WalletChip, Wordmark } from './ui/components/WalletChip';
import { FeedbackLayer } from './ui/feedback/Feedback';
import { VfxLayer } from './ui/vfx/VfxLayer';
import { useVfx } from './ui/vfx/store';
import { Music, type TrackId } from './ui/music/MusicManager';

/**
 * The 16:9 shell.
 *
 * The game is desktop only: below 1280×720 a polished gate replaces it
 * entirely, in CSS, so there is no resize listener to get out of sync. The
 * wallet chip rides the top-right of every screen, because a player staking
 * SOL should never have to wonder what they are connected as.
 *
 * The clock lives here rather than inside a screen because it has to keep
 * running across the resolve overlay and the phase changes — a timer that
 * pauses whenever a component unmounts is a timer players learn to abuse.
 */
export function App(): ReactElement {
  const screen = useStore((s) => s.screen);
  const tick = useStore((s) => s.tick);
  const busy = useStore((s) => s.busy);
  const error = useStore((s) => s.error);
  const clearError = useStore((s) => s.clearError);
  const go = useStore((s) => s.go);

  useEffect(() => {
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [tick]);

  useEffect(() => {
    const onHide = (): void => {
      if (document.visibilityState === 'hidden') useStore.getState().noteAway();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  /*
   * The jolt. One transform on the root element, driven by a store value that
   * decays on its own — nothing inside re-renders, and two hits landing 55ms
   * apart do not cancel each other.
   */
  const shake = useVfx((s) => s.shake);

  /*
   * One track per screen, decided in one place.
   *
   * Music is a *state*, not an event, which is why it does not live in the
   * cue list and why `Music.play` is idempotent — this effect runs on every
   * screen change and a track that restarted each time would be unusable.
   * A screen whose track has no file simply runs silent.
   */
  useEffect(() => {
    Music.play(trackFor(screen));
  }, [screen]);

  return (
    <div
      className={`app ${shake > 0 ? 'quaking' : ''}`}
      style={shake > 0 ? ({ ['--q' as string]: shake } as CSSProperties) : undefined}
    >
      {/* The desktop gate. Logo, one line, nothing else. */}
      <div className="desktop-gate">
        <Wordmark hero />
        <p
          style={{
            color: '#ffffff',
            fontFamily: 'var(--display)',
            fontWeight: 700,
            fontSize: 'var(--fs-lead)',
            textShadow: '0 2px 0 rgba(18,58,94,0.3)',
          }}
        >
          ARMADA is played on desktop — 1280×720 or larger.
        </p>
      </div>

      <div className="app-main">
        <WalletChip />
        <ErrorBoundary where={screen} onReset={() => go('menu')}>
          {error ? (
            <Failed
              what={error.what}
              detail={error.detail}
              onRetry={error.retry ?? undefined}
              onBack={() => {
                clearError();
                go('menu');
              }}
            />
          ) : busy ? (
            <Loading what={busy} />
          ) : (
            <>
              {screen === 'menu' && <MainMenu />}
              {screen === 'howto' && <HowToPlay />}
              {screen === 'queue' && <Queue />}
              {screen === 'tqueue' && <Queue tournament />}
              {screen === 'escrow' && <Escrow />}
              {screen === 'bracket' && <BracketScreen />}
              {screen === 'shipDraft' && <Draft kind="ship" />}
              {screen === 'cardDraft' && <Draft kind="card" />}
              {screen === 'deploy' && <Deployment />}
              {screen === 'battle' && <Battle />}
              {screen === 'result' && <Result />}
              {screen === 'netResult' && <NetResult />}
              {screen === 'leaderboard' && <Leaderboard />}
              {screen === 'season' && <Season />}
              {screen === 'settings' && <SettingsScreen />}
              {screen === 'credits' && <Credits />}
            </>
          )}
        </ErrorBoundary>
        <ResolveOverlay />
        <PhaseBeats />
        <Slam />
        <NetBanners />
      </div>

      {/* Above everything, including the resolve overlay: a floater has to be
          able to rise off the cell the overlay is narrating. */}
      <VfxLayer />
      <FeedbackLayer />
    </div>
  );
}

/**
 * Which track belongs to which screen.
 *
 * Grouped rather than one-per-screen on purpose: the leaderboard, the season
 * page and the settings screen are all "out of a match", and cross-fading
 * between three near-identical menu tracks as a player clicks around would be
 * worse than one that simply keeps playing.
 */
function trackFor(screen: string): TrackId {
  switch (screen) {
    case 'shipDraft':
    case 'cardDraft':
      return 'draft';
    case 'deploy':
      return 'deploy';
    case 'battle':
      return 'battle';
    case 'bracket':
    case 'tournamentTiers':
      return 'bracket';
    default:
      return 'menu';
  }
}
