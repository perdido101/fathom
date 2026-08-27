/**
 * Music, on its own channel, with the same drop-in contract as the art.
 *
 * **File present → it plays. File absent → silence. Never a crash.** That is
 * the whole pipeline, and it is deliberately identical to `src/art/`: Aris
 * generates the tracks himself in Suno, drops them into
 * `src/ui/music/files/`, and the game picks them up on the next build with no
 * code change. Until then every screen runs silent and nothing anywhere has
 * to know whether a track exists.
 *
 * Music is **not** a sound cue and does not live in `SoundManager`. A cue
 * maps to a discrete event; a track is a state. They have different volume
 * sliders, different lifetimes, and different failure modes — conflating them
 * is how a game ends up with a battle theme restarting on every hit.
 */

export type TrackId =
  | 'menu'
  | 'draft'
  | 'deploy'
  | 'battle'
  | 'bracket'
  | 'victory'
  | 'defeat'
  | 'champion';

export interface TrackSpec {
  id: TrackId;
  /** Where it plays. */
  where: string;
  /** Does it need to survive being looped? */
  loops: boolean;
  /** Target length as generated, in seconds. */
  seconds: number;
  /** Rough ceiling on the file, so the bundle budget holds. */
  maxKb: number;
}

/**
 * The eight tracks, and their contracts. `MUSIC_BRIEF.md` is generated from
 * this list, so a track added here appears in the brief with nowhere to hide.
 */
export const TRACKS: TrackSpec[] = [
  { id: 'battle', where: 'The battle screen, for as long as a match lasts', loops: true, seconds: 180, maxKb: 2600 },
  { id: 'menu', where: 'Main menu, leaderboard, season, settings, credits', loops: true, seconds: 120, maxKb: 1800 },
  { id: 'draft', where: 'Both drafts', loops: true, seconds: 90, maxKb: 1400 },
  { id: 'deploy', where: 'The deployment screen', loops: true, seconds: 75, maxKb: 1200 },
  { id: 'bracket', where: 'The tournament bracket and the forming screen', loops: true, seconds: 110, maxKb: 1700 },
  { id: 'victory', where: 'Under the victory slam and the result screen after a win', loops: false, seconds: 25, maxKb: 500 },
  { id: 'defeat', where: 'Under the defeat slam and the result screen after a loss', loops: false, seconds: 25, maxKb: 500 },
  { id: 'champion', where: 'The champion screen', loops: false, seconds: 35, maxKb: 700 },
];

const FADE_MS = 700;

class MusicManagerImpl {
  private files = new Map<TrackId, string>();
  private el: HTMLAudioElement | null = null;
  private current: TrackId | null = null;
  private volume = 0.45;
  private enabled = true;
  private unlocked = false;
  private fade: ReturnType<typeof setInterval> | null = null;
  /** What was asked for while the browser still refused to play anything. */
  private pending: TrackId | null = null;

  constructor() {
    if (typeof window === 'undefined') return;
    const unlock = (): void => {
      this.unlocked = true;
      if (this.pending) {
        const t = this.pending;
        this.pending = null;
        this.play(t);
      }
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  /** Called once per track at startup by `register.ts`. */
  register(id: TrackId, url: string): void {
    this.files.set(id, url);
  }

  /** Which tracks actually shipped. The settings screen says so. */
  available(): TrackId[] {
    return TRACKS.map((t) => t.id).filter((id) => this.files.has(id));
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.stop();
    else if (this.current) this.play(this.current);
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.el) this.el.volume = this.volume;
  }

  /**
   * Start a track, or do nothing if it is already the one playing.
   *
   * The idempotence is the important half: `play('battle')` is called from a
   * screen effect that runs on every render, and a track that restarted each
   * time would be unusable.
   */
  play(id: TrackId): void {
    if (this.current === id && this.el && !this.el.paused) return;
    const url = this.files.get(id);
    this.current = id;
    if (!url) {
      // No file for this track. Silence is the correct behaviour, not an error.
      this.stop();
      return;
    }
    if (!this.enabled) return;
    if (!this.unlocked) {
      this.pending = id;
      return;
    }
    this.crossfadeTo(url, id);
  }

  stop(): void {
    this.clearFade();
    const el = this.el;
    if (!el) return;
    this.el = null;
    this.rampOut(el);
  }

  private crossfadeTo(url: string, id: TrackId): void {
    const old = this.el;
    const next = new Audio(url);
    next.loop = TRACKS.find((t) => t.id === id)?.loops ?? true;
    next.volume = 0;
    this.el = next;
    void next.play().catch(() => undefined);
    if (old) this.rampOut(old);

    this.clearFade();
    const step = 50;
    let t = 0;
    this.fade = setInterval(() => {
      t += step;
      const k = Math.min(1, t / FADE_MS);
      if (this.el === next) next.volume = this.volume * k;
      if (k >= 1) this.clearFade();
    }, step);
  }

  private rampOut(el: HTMLAudioElement): void {
    const from = el.volume;
    const step = 50;
    let t = 0;
    const id = setInterval(() => {
      t += step;
      const k = Math.max(0, 1 - t / FADE_MS);
      el.volume = from * k;
      if (k <= 0) {
        clearInterval(id);
        el.pause();
      }
    }, step);
  }

  private clearFade(): void {
    if (this.fade) clearInterval(this.fade);
    this.fade = null;
  }
}

export const Music = new MusicManagerImpl();
