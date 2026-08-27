import { Sound } from './SoundManager';

/**
 * The interface's own sounds, attached once rather than screen by screen.
 *
 * A press, a cancel, a toggle and a card hover are properties of the *kind of
 * control*, not of the screen it happens to sit on. Wiring them at each call
 * site would mean sixty edits, sixty chances to forget one, and a new button
 * anywhere in the product shipping silent — which is precisely the failure
 * this build was asked to fix.
 *
 * So two delegated listeners on the document, and one rule for opting out:
 * a control that fires its own, more specific cue carries `data-sfx="none"`
 * and this leaves it alone. Ship rotate, Auto and the deploy commit all do,
 * because "rotate a ship" is a better sound than "press a button" and the two
 * must not stack.
 *
 * Pointerdown rather than click, because a press should sound when the finger
 * goes down and not when it comes up — and because a click that never
 * completes (a drag off the button) still felt like a press.
 */

/** Buttons whose accessible name means "leave" rather than "do". */
const LEAVING = /^(back|cancel|close|done|menu|leave|dismiss|got it)$/i;

function cueFor(el: HTMLElement): Parameters<typeof Sound.play>[0] | null {
  if (el.closest('[data-sfx="none"]')) return null;

  // A card in hand or in a draft pack is not a button press. Charging a card
  // and picking one both fire their own cue from the screen that owns them.
  if (el.closest('.gamecard, .draft-pick, .hand-slot, .cell')) return null;

  const control = el.closest('button, [role="button"], input, select') as HTMLElement | null;
  if (!control) return null;
  if ((control as HTMLButtonElement).disabled) {
    // A disabled control still answers. Build 6 gave it a sentence; this
    // gives it a sound, so the answer arrives before the reading does.
    return 'ui-refused';
  }

  if (control.tagName === 'INPUT') {
    const t = (control as HTMLInputElement).type;
    if (t === 'range') return null; // the slider sounds on release, not on grab
    if (t === 'checkbox' || t === 'radio') return 'ui-toggle';
    return null;
  }
  if (control.getAttribute('role') === 'switch' || control.classList.contains('toggle')) {
    return 'ui-toggle';
  }

  const name = (control.textContent ?? '').trim();
  if (LEAVING.test(name) || control.classList.contains('ghost')) return 'ui-cancel';
  // A pill is a choice among options; a button is a commitment to one.
  if (control.classList.contains('pill')) return 'ui-select';
  return 'ui-press';
}

let attached = false;

export function attachUiSounds(): void {
  if (attached || typeof document === 'undefined') return;
  attached = true;

  document.addEventListener(
    'pointerdown',
    (ev) => {
      const el = ev.target as HTMLElement | null;
      if (!el) return;
      const cue = cueFor(el);
      if (cue) Sound.play(cue, { guard: 40 });
    },
    { capture: true, passive: true },
  );

  /*
   * Hover, on cards only, and quiet.
   *
   * Every hoverable thing in the product would be a rollover every time a
   * pointer crossed the screen. Cards are the exception because hovering one
   * *does* something — it lifts the card and floats its full rule — so it is
   * an event rather than a transit. The guard stops a pointer skimming three
   * cards from playing three.
   */
  document.addEventListener(
    'pointerover',
    (ev) => {
      const el = ev.target as HTMLElement | null;
      if (!el?.closest) return;
      const card = el.closest('.gamecard, .draft-pick');
      if (!card) return;
      // Moving within the same card is not a new hover.
      const from = (ev as PointerEvent).relatedTarget as HTMLElement | null;
      if (from?.closest && from.closest('.gamecard, .draft-pick') === card) return;
      Sound.play('ui-hover', { gain: 0.45, guard: 90 });
    },
    { capture: true, passive: true },
  );
}
