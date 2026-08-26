/**
 * Every sound the game will make, declared before a single audio file exists.
 *
 * This is a stub on purpose. It holds the complete cue list, the call sites
 * are already wired through the resolve sequence, and swapping in real audio
 * means filling `files` and deleting the console branch — no screen changes.
 * The asset manifest is generated from the same list, so the two cannot drift.
 */

export type Cue =
  | 'charge-placed'
  | 'card-fired'
  | 'basic-attack'
  | 'hit'
  | 'miss'
  | 'ship-sunk'
  | 'ability-activated'
  | 'react-triggered'
  | 'charges-stolen'
  | 'prediction-triggered'
  | 'round-start'
  | 'timer-warning'
  | 'victory'
  | 'defeat'
  | 'draw';

export const CUES: { id: Cue; description: string; length: string }[] = [
  {
    id: 'charge-placed',
    description: 'Dry mechanical click as a charge seats onto a card',
    length: '0.2s',
  },
  { id: 'card-fired', description: 'Card burns away, rising whoosh into a crack', length: '0.8s' },
  { id: 'basic-attack', description: 'Light deck gun, thinner than a card shot', length: '0.4s' },
  { id: 'hit', description: 'Wet metallic impact with a low thump', length: '0.6s' },
  { id: 'miss', description: 'Water splash, no metal in it', length: '0.5s' },
  { id: 'ship-sunk', description: 'Groaning hull, sustained, then silence', length: '1.8s' },
  {
    id: 'ability-activated',
    description: 'Ship card flips face up, brass and air',
    length: '0.7s',
  },
  {
    id: 'react-triggered',
    description: 'Sharp inhale then a snap, the dead ship answering',
    length: '1.0s',
  },
  { id: 'charges-stolen', description: 'Charges sliding across the table, glassy', length: '0.6s' },
  {
    id: 'prediction-triggered',
    description: 'A single bell, unmistakable, for a read landing',
    length: '0.9s',
  },
  {
    id: 'round-start',
    description: 'Two-tone signal, calm, marks the plan window opening',
    length: '0.5s',
  },
  {
    id: 'timer-warning',
    description: 'Ticking that speeds up over the last five seconds',
    length: '1.0s',
  },
  { id: 'victory', description: 'Short brass sting, resolved', length: '2.5s' },
  { id: 'defeat', description: 'Same motif, unresolved, lower', length: '2.5s' },
  { id: 'draw', description: 'Two notes ending level with each other', length: '2.0s' },
];

class SoundManagerImpl {
  private enabled = true;
  private volume = 0.8;
  /** Populated when real audio lands: cue id -> preloaded element. */
  private files = new Map<Cue, HTMLAudioElement>();
  /**
   * Browsers refuse audio before the first user gesture. Playback stays
   * gated on this so the console never fills with autoplay rejections; every
   * cue in the game already follows a click anyway.
   */
  private unlocked = false;
  /** Cues fired this session, so the UI can prove the hooks are live. */
  readonly history: { cue: Cue; at: number }[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      const unlock = (): void => {
        this.unlocked = true;
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
      };
      window.addEventListener('pointerdown', unlock, { once: true });
      window.addEventListener('keydown', unlock, { once: true });
    }
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
  }

  /**
   * Fire a cue. `rate` shifts pitch and speed together — the charge click
   * rises with the count, the timer tick quickens as the clock runs out.
   */
  play(cue: Cue, opts?: { rate?: number }): void {
    this.history.push({ cue, at: this.history.length });
    if (this.history.length > 200) this.history.shift();
    if (!this.enabled || !this.unlocked) return;
    const file = this.files.get(cue);
    if (!file) return; // no audio yet; the hook still fired
    const node = file.cloneNode(true) as HTMLAudioElement;
    node.volume = this.volume;
    if (opts?.rate) node.playbackRate = Math.max(0.5, Math.min(3, opts.rate));
    void node.play().catch(() => undefined);
  }

  /** Called once per cue at startup by src/ui/sfx/register.ts. */
  register(cue: Cue, url: string): void {
    const el = new Audio(url);
    el.preload = 'auto';
    this.files.set(cue, el);
  }
}

export const Sound = new SoundManagerImpl();
