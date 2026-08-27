/**
 * Every sound the game makes.
 *
 * The cue list is the contract. `scripts/fetch-audio.mjs` sources one CC0 file
 * per cue and records where it came from; `scripts/audio-doc.ts` generates
 * `docs/AUDIO.md` from this list and fails if a cue has no file or a file has
 * no cue. The asset manifest reads the same list. Nothing here can drift.
 *
 * Build 9 audited every interaction in the product and took the list from 15
 * cues to 50. Two rules did the filtering, and both are worth stating because
 * they are what stops a cue list becoming a wall of noise:
 *
 *   **A cue maps to a discrete event the player caused or needs to notice.**
 *   No ambience, no loops, nothing that plays because a screen is open. If you
 *   cannot name the instant it fires, it is not a cue.
 *
 *   **Two events share a cue only when they are genuinely the same event.**
 *   Pressing a button and cancelling out of a panel are not the same event and
 *   do not share a sound. Nine cells of one volley arriving *are* one event and
 *   do share one — see `volley` below, which is the only place this rule was
 *   load-bearing.
 */

export type Cue =
  // --- interface -----------------------------------------------------------
  | 'ui-press'
  | 'ui-cancel'
  | 'ui-hover'
  | 'ui-select'
  | 'ui-screen'
  | 'ui-modal-open'
  | 'ui-modal-close'
  | 'ui-slider'
  | 'ui-toggle'
  | 'ui-refused'
  | 'wallet-connected'
  | 'error-shown'
  // --- draft ---------------------------------------------------------------
  | 'draft-deal'
  | 'draft-pick'
  | 'draft-theirs'
  | 'draft-collision'
  | 'draft-resolve'
  | 'draft-pack'
  // --- deployment ----------------------------------------------------------
  | 'ship-pickup'
  | 'ship-rotate'
  | 'ship-placed'
  | 'place-refused'
  | 'deploy-auto'
  | 'deploy-commit'
  // --- combat --------------------------------------------------------------
  | 'charge-placed'
  | 'card-fired'
  | 'basic-attack'
  | 'volley'
  | 'hit'
  | 'miss'
  | 'ship-sunk'
  | 'ability-activated'
  | 'react-triggered'
  | 'charges-stolen'
  | 'prediction-triggered'
  | 'shot-blocked'
  // --- the shape of a round ------------------------------------------------
  | 'match-found'
  | 'phase-card'
  | 'round-start'
  | 'resolve-step'
  | 'timer-warning'
  | 'timer-expired'
  | 'plan-committed'
  // --- money ---------------------------------------------------------------
  | 'stake-confirmed'
  | 'escrow-forming'
  | 'escrow-complete'
  | 'settlement'
  | 'payout'
  // --- outcomes ------------------------------------------------------------
  | 'victory'
  | 'defeat'
  | 'draw'
  | 'round-won'
  | 'champion';

export type CueGroup =
  | 'interface'
  | 'draft'
  | 'deployment'
  | 'combat'
  | 'round'
  | 'money'
  | 'outcome';

export interface CueSpec {
  id: Cue;
  group: CueGroup;
  /** What fires it, in the game's own terms. */
  trigger: string;
  /** What it sounds like. */
  description: string;
  length: string;
}

export const CUES: CueSpec[] = [
  // --- interface -----------------------------------------------------------
  { id: 'ui-press', group: 'interface', trigger: 'Any button that commits to something', description: 'Short dry click, no tail', length: '0.1s' },
  { id: 'ui-cancel', group: 'interface', trigger: 'Back, Cancel, or leaving a screen without acting', description: 'The press, pitched down — leaving is not arriving', length: '0.15s' },
  { id: 'ui-hover', group: 'interface', trigger: 'The pointer entering a card in hand or in a draft pack', description: 'Barely there. A soft rollover, well under the press', length: '0.08s' },
  { id: 'ui-select', group: 'interface', trigger: 'Choosing among options — a tier, a bot level, a stake', description: 'Bright select tick', length: '0.2s' },
  { id: 'ui-screen', group: 'interface', trigger: 'Moving between screens', description: 'Low sweep, once per transition', length: '0.4s' },
  { id: 'ui-modal-open', group: 'interface', trigger: 'A modal or panel opening', description: 'Surface rising', length: '0.35s' },
  { id: 'ui-modal-close', group: 'interface', trigger: 'A modal or panel closing', description: 'The same surface settling', length: '0.3s' },
  { id: 'ui-slider', group: 'interface', trigger: 'Releasing a slider, not dragging it', description: 'Single detent. Dragging is not an event; letting go is', length: '0.12s' },
  { id: 'ui-toggle', group: 'interface', trigger: 'A switch changing state', description: 'Two-position switch, mechanical', length: '0.18s' },
  { id: 'ui-refused', group: 'interface', trigger: 'A control that will not do the thing you asked', description: 'Flat, blunt, unmistakably a no', length: '0.25s' },
  { id: 'wallet-connected', group: 'interface', trigger: 'A wallet attaching', description: 'Rising confirmation, warmer than a press', length: '0.6s' },
  { id: 'error-shown', group: 'interface', trigger: 'An error surfacing', description: 'Low error tone. Once, never repeated while it is on screen', length: '0.5s' },

  // --- draft ---------------------------------------------------------------
  { id: 'draft-deal', group: 'draft', trigger: 'A pack arriving, once for the pack rather than per card', description: 'Cards fanning out onto a table', length: '0.7s' },
  { id: 'draft-pick', group: 'draft', trigger: 'Your pick, on the click', description: 'One card taken off the stack', length: '0.35s' },
  { id: 'draft-theirs', group: 'draft', trigger: 'Their face-down card sliding in beside yours', description: 'A card sliding across felt', length: '0.4s' },
  { id: 'draft-collision', group: 'draft', trigger: 'Both players picking the same thing', description: 'Two cards landing together, hard', length: '0.55s' },
  { id: 'draft-resolve', group: 'draft', trigger: 'Picks differing — the quiet outcome', description: 'A card shoved away. Deliberately duller than the collision', length: '0.35s' },
  { id: 'draft-pack', group: 'draft', trigger: 'The pack counter advancing', description: 'A pack being opened', length: '0.45s' },

  // --- deployment ----------------------------------------------------------
  { id: 'ship-pickup', group: 'deployment', trigger: 'Selecting a ship to place', description: 'Something metal lifted', length: '0.25s' },
  { id: 'ship-rotate', group: 'deployment', trigger: 'The orientation toggle', description: 'A quarter turn, mechanical', length: '0.2s' },
  { id: 'ship-placed', group: 'deployment', trigger: 'A legal placement landing', description: 'Hull settling into water', length: '0.4s' },
  { id: 'place-refused', group: 'deployment', trigger: 'A placement that cannot be made', description: 'A dull knock. The board says no without a message', length: '0.25s' },
  { id: 'deploy-auto', group: 'deployment', trigger: 'Auto-placing the fleet', description: 'Three placements in quick succession', length: '0.6s' },
  { id: 'deploy-commit', group: 'deployment', trigger: 'Committing the layout — the hash going out', description: 'A latch closing. This is the irreversible one', length: '0.7s' },

  // --- combat --------------------------------------------------------------
  { id: 'charge-placed', group: 'combat', trigger: 'A charge seating on a card', description: 'Dry mechanical click; pitch rises with the count the card now holds', length: '0.2s' },
  { id: 'card-fired', group: 'combat', trigger: 'A card being declared', description: 'Card burns away, rising whoosh into a crack', length: '0.8s' },
  { id: 'basic-attack', group: 'combat', trigger: 'The free deck gun being aimed', description: 'Light deck gun, thinner than a card shot', length: '0.4s' },
  { id: 'volley', group: 'combat', trigger: 'Shots in the air — once per round, never once per cell', description: 'Incoming whistle', length: '0.5s' },
  { id: 'hit', group: 'combat', trigger: 'A shot finding hull', description: 'Wet metallic impact with a low thump', length: '0.6s' },
  { id: 'miss', group: 'combat', trigger: 'A shot finding water', description: 'Water splash, no metal in it', length: '0.5s' },
  { id: 'ship-sunk', group: 'combat', trigger: 'A ship going down; pitched down for longer hulls', description: 'Groaning hull, sustained, then silence', length: '1.8s' },
  { id: 'ability-activated', group: 'combat', trigger: 'A once-per-match ability firing', description: 'Ship card flips face up, brass and air', length: '0.7s' },
  { id: 'react-triggered', group: 'combat', trigger: 'A dead ship answering', description: 'Sharp inhale then a snap', length: '1.0s' },
  { id: 'charges-stolen', group: 'combat', trigger: 'Charges crossing between cards', description: 'Chips sliding across a table', length: '0.6s' },
  { id: 'prediction-triggered', group: 'combat', trigger: 'A Mirror or Ambush read landing', description: 'A single bell, unmistakable', length: '0.9s' },
  { id: 'shot-blocked', group: 'combat', trigger: 'A shot arriving into a Mirror and dying', description: 'A force field taking it. Arrival with no impact', length: '0.5s' },

  // --- the shape of a round ------------------------------------------------
  { id: 'match-found', group: 'round', trigger: 'An opponent seated', description: 'Two rising tones', length: '0.7s' },
  { id: 'phase-card', group: 'round', trigger: 'A phase card raising', description: 'Soft swell under the card', length: '0.5s' },
  { id: 'round-start', group: 'round', trigger: 'The plan window opening', description: 'Two-tone signal, calm', length: '0.5s' },
  { id: 'resolve-step', group: 'round', trigger: 'The resolve overlay advancing one beat', description: 'Quiet tick. Under everything else by design', length: '0.1s' },
  { id: 'timer-warning', group: 'round', trigger: 'Five seconds left', description: 'Ticking that speeds up as the clock runs out', length: '1.0s' },
  { id: 'timer-expired', group: 'round', trigger: 'The plan window lapsing', description: 'A buzzer. A fallback plan just went in for you', length: '0.6s' },
  { id: 'plan-committed', group: 'round', trigger: 'Your plan sealed', description: 'A stamp. Both are held until both arrive', length: '0.4s' },

  // --- money ---------------------------------------------------------------
  { id: 'stake-confirmed', group: 'money', trigger: 'A stake accepted', description: 'A chip laid down', length: '0.35s' },
  { id: 'escrow-forming', group: 'money', trigger: 'Each seat staking while a table fills', description: 'Chips stacking', length: '0.5s' },
  { id: 'escrow-complete', group: 'money', trigger: 'The last seat filling', description: 'Chips colliding into one pot', length: '0.6s' },
  { id: 'settlement', group: 'money', trigger: 'The chain settling a match', description: 'A ledger closing', length: '0.7s' },
  { id: 'payout', group: 'money', trigger: 'Money landing in your wallet', description: 'Chips handled and swept in. The best sound in the product', length: '0.9s' },

  // --- outcomes ------------------------------------------------------------
  { id: 'victory', group: 'outcome', trigger: 'Winning a match', description: 'Short brass sting, resolved', length: '2.5s' },
  { id: 'defeat', group: 'outcome', trigger: 'Losing a match', description: 'Same motif, unresolved, lower', length: '2.5s' },
  { id: 'draw', group: 'outcome', trigger: 'A draw', description: 'Two notes ending level with each other', length: '2.0s' },
  { id: 'round-won', group: 'outcome', trigger: 'Taking a bracket round', description: 'A rising three-tone. Not the victory sting — this is a floor secured, not a match won', length: '1.2s' },
  { id: 'champion', group: 'outcome', trigger: 'Winning a bracket final', description: 'The loudest thing in the game', length: '3.0s' },
];

/**
 * Volume, in two channels.
 *
 * Music and effects are separate sliders because they are separate problems:
 * a player who wants the battle track down usually still wants to hear a
 * shot land. Both persist; see `Settings` in the store.
 */
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
  /**
   * The last time each cue fired. A cue that would retrigger inside its own
   * guard window is dropped — nine cells arriving 190ms apart must not play
   * nine overlapping impacts, and a hover that skims three cards must not
   * play three rollovers.
   */
  private lastAt = new Map<Cue, number>();

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
   * Fire a cue.
   *
   * `rate` shifts pitch and speed together — the charge click rises with the
   * count, a longer hull sinks lower. `gain` scales one call against the
   * channel volume, for the cues that are deliberately underneath everything
   * else. `guard` drops a repeat inside N milliseconds.
   */
  play(cue: Cue, opts?: { rate?: number; gain?: number; guard?: number }): void {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (opts?.guard) {
      const last = this.lastAt.get(cue);
      if (last !== undefined && now - last < opts.guard) return;
    }
    this.lastAt.set(cue, now);
    this.history.push({ cue, at: this.history.length });
    if (this.history.length > 200) this.history.shift();
    if (!this.enabled || !this.unlocked) return;
    const file = this.files.get(cue);
    if (!file) return; // no audio yet; the hook still fired
    const node = file.cloneNode(true) as HTMLAudioElement;
    node.volume = Math.max(0, Math.min(1, this.volume * (opts?.gain ?? 1)));
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
