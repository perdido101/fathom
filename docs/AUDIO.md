# What the game sounds like

Every sound cue in ARMADA: what fires it, what it is, and where it came from.

This file is **generated** by `npm run audio:doc` from three sources that
have to agree — the cue list in `src/ui/sfx/SoundManager.ts`, the credits
`npm run audio` wrote when it downloaded the files, and a grep of `src/`
for where each cue is actually fired. The script exits non-zero if a cue has
no file, a file has no cue, a cue has no credit, or a cue is declared and
never played. A mechanic cannot ship without a sound, in the same way
`docs/FEEDBACK.md` stops one shipping without an explanation.

**53 cues**, all sourced from 6 CC0 packs by Kenney. CC0
requires no attribution; it is recorded anyway, by the script that does the
downloading, so the credits cannot drift from what shipped.

---

## The two rules

**A cue maps to a discrete event the player caused or needs to notice.** No
ambience, no loops, nothing that plays because a screen is open. Music is a
separate channel with a separate slider and a separate brief
(`MUSIC_BRIEF.md`); it is not in this file and never will be.

**Two events share a cue only when they are genuinely the same event.** This
is the rule that took the list from 15 to 53 — pressing a button and
cancelling out of a panel are not the same event and no longer share a sound.
It cuts the other way too, once: nine cells of one volley arriving are *one*
event, and `volley` fires once per round rather than once per cell. Nine
overlapping whistles is the exact noise the rule exists to prevent.

Two mechanisms enforce the second rule at runtime. `guard` drops a cue that
would retrigger inside a window — a pointer skimming three cards plays one
rollover, not three. `gain` scales a single call against the channel volume,
for the cues that are deliberately underneath everything else.

---

## Pitch as information

Four cues carry a number in their pitch rather than in a second sound:

| Cue | Pitched by | Why |
| --- | --- | --- |
| `charge-placed` | The count the card will hold | A fifth charge sounds different from a first, which is what a player planning a Lance needs |
| `ship-sunk` | Hull length | A four goes down lower than a two |
| `timer-warning` | Seconds remaining | The tick quickens as the window closes |
| `ui-cancel` | Fixed, below `ui-press` | Leaving is not arriving |

---

## The interface

Attached once, by control type, in `src/ui/sfx/ui-sounds.ts` rather than screen by screen — a press, a cancel and a toggle are properties of the kind of control, not of the screen it sits on. A control that fires its own more specific cue opts out with `data-sfx="none"`.

| Cue | Fires on | Sound | Length | Fired from |
| --- | --- | --- | --- | --- |
| `ui-press` | Any button that commits to something | Short dry click, no tail | 0.1s | `ui/sfx/ui-sounds.ts:55` |
| `ui-cancel` | Back, Cancel, or leaving a screen without acting | The press, pitched down — leaving is not arriving | 0.15s | `ui/sfx/ui-sounds.ts:52` |
| `ui-hover` | The pointer entering a card in hand or in a draft pack | Barely there. A soft rollover, well under the press | 0.08s | `ui/sfx/ui-sounds.ts:94` |
| `ui-select` | Choosing among options — a tier, a bot level, a stake | Bright select tick | 0.2s | `ui/sfx/ui-sounds.ts:54` |
| `ui-screen` | Moving between screens | Low sweep, once per transition | 0.4s | `state/store.ts:308` |
| `ui-modal-open` | A modal or panel opening | Surface rising | 0.35s | `ui/screens/Menus.tsx:256` |
| `ui-modal-close` | A modal or panel closing | The same surface settling | 0.3s | `ui/screens/Menus.tsx:257` |
| `ui-slider` | Releasing a slider, not dragging it | Single detent. Dragging is not an event; letting go is | 0.12s | `ui/screens/Menus.tsx:992` |
| `ui-toggle` | A switch changing state | Two-position switch, mechanical | 0.18s | `ui/sfx/ui-sounds.ts:44`, `ui/sfx/ui-sounds.ts:48` |
| `ui-refused` | A control that will not do the thing you asked | Flat, blunt, unmistakably a no | 0.25s | `ui/sfx/ui-sounds.ts:38` |
| `wallet-connected` | A wallet attaching | Rising confirmation, warmer than a press | 0.6s | `ui/components/WalletChip.tsx:28` |
| `error-shown` | An error surfacing | Low error tone. Once, never repeated while it is on screen | 0.5s | `state/store.ts:344` |

## The draft

Cards and packs. The collision is a hard landing; the non-collision is deliberately duller, because a shared pick is the news and a differing one is not.

| Cue | Fires on | Sound | Length | Fired from |
| --- | --- | --- | --- | --- |
| `draft-deal` | A pack arriving, once for the pack rather than per card | Cards fanning out onto a table | 0.7s | `ui/screens/Draft.tsx:87` |
| `draft-pick` | Your pick, on the click | One card taken off the stack | 0.35s | `ui/screens/Draft.tsx:118` |
| `draft-theirs` | Their face-down card sliding in beside yours | A card sliding across felt | 0.4s | `ui/screens/Draft.tsx:126` |
| `draft-collision` | Both players picking the same thing | Two cards landing together, hard | 0.55s | `ui/screens/Draft.tsx:134` |
| `draft-resolve` | Picks differing — the quiet outcome | A card shoved away. Deliberately duller than the collision | 0.35s | `ui/screens/Draft.tsx:134` |
| `draft-pack` | The pack counter advancing | A pack being opened | 0.45s | `ui/screens/Draft.tsx:87` |

## Deployment

The one phase where the board answers you directly: a legal placement settles, an illegal one knocks.

| Cue | Fires on | Sound | Length | Fired from |
| --- | --- | --- | --- | --- |
| `ship-pickup` | Selecting a ship to place | Something metal lifted | 0.25s | `ui/screens/Deployment.tsx:140` |
| `ship-rotate` | The orientation toggle | A quarter turn, mechanical | 0.2s | `ui/screens/Deployment.tsx:152` |
| `ship-placed` | A legal placement landing | Hull settling into water | 0.4s | `ui/screens/Deployment.tsx:65` |
| `place-refused` | A placement that cannot be made | A dull knock. The board says no without a message | 0.25s | `ui/screens/Deployment.tsx:61` |
| `deploy-auto` | Auto-placing the fleet | Three placements in quick succession | 0.6s | `ui/screens/Deployment.tsx:86` |
| `deploy-commit` | Committing the layout — the hash going out | A latch closing. This is the irreversible one | 0.7s | `ui/screens/Deployment.tsx:81` |

## Combat

The round resolving. Each of these rides a beat in `feedback/timing.ts`, the same clock the resolve overlay and the visual effects run on.

| Cue | Fires on | Sound | Length | Fired from |
| --- | --- | --- | --- | --- |
| `charge-placed` | A charge seating on a card | Dry mechanical click; pitch rises with the count the card now holds | 0.2s | `ui/screens/Battle.tsx:269`, `state/store.ts:951` |
| `card-fired` | A card being declared | Card burns away, rising whoosh into a crack | 0.8s | `ui/screens/Battle.tsx:212` |
| `basic-attack` | The free deck gun being aimed | Light deck gun, thinner than a card shot | 0.4s | `ui/screens/Battle.tsx:166` |
| `volley` | Shots in the air — once per round, never once per cell | Incoming whistle | 0.5s | `state/store.ts:957` |
| `hit` | A shot finding hull | Wet metallic impact with a low thump | 0.6s | `bots/bot.ts:295`, `bots/belief.ts:35` |
| `miss` | A shot finding water | Water splash, no metal in it | 0.5s | `bots/belief.ts:35`, `bots/belief.ts:48` |
| `ship-sunk` | A ship going down; pitched down for longer hulls | Groaning hull, sustained, then silence | 1.8s | `state/store.ts:937` |
| `ability-activated` | A once-per-match ability firing | Ship card flips face up, brass and air | 0.7s | `ui/screens/Battle.tsx:201`, `ui/screens/Battle.tsx:218` |
| `react-triggered` | A dead ship answering | Sharp inhale then a snap | 1.0s | `state/store.ts:940` |
| `charges-stolen` | Charges crossing between cards | Chips sliding across a table | 0.6s | `ui/screens/Battle.tsx:286`, `state/store.ts:943` |
| `prediction-triggered` | A Mirror or Ambush read landing | A single bell, unmistakable | 0.9s | `state/store.ts:946` |
| `shot-blocked` | A shot arriving into a Mirror and dying | A force field taking it. Arrival with no impact | 0.5s | `state/store.ts:948` |

## The shape of a round

The frame around the fighting — a match seating, a window opening, a clock running out.

| Cue | Fires on | Sound | Length | Fired from |
| --- | --- | --- | --- | --- |
| `match-found` | An opponent seated | Two rising tones | 0.7s | `state/store.ts:445`, `state/store.ts:451` |
| `phase-card` | A phase card raising | Soft swell under the card | 0.5s | `ui/screens/Beats.tsx:69` |
| `round-start` | The plan window opening | Two-tone signal, calm | 0.5s | `state/net.ts:173` |
| `resolve-step` | The resolve overlay advancing one beat | Quiet tick. Under everything else by design | 0.1s | `state/store.ts:664` |
| `timer-warning` | Five seconds left | Ticking that speeds up as the clock runs out | 1.0s | `state/store.ts:737`, `state/store.ts:746` |
| `timer-expired` | The plan window lapsing | A buzzer. A fallback plan just went in for you | 0.6s | `state/store.ts:960` |
| `plan-committed` | Your plan sealed | A stamp. Both are held until both arrive | 0.4s | `state/store.ts:618` |

## Money

Every point at which SOL moves or is committed. These are the cues a player should be able to recognise with their eyes shut.

| Cue | Fires on | Sound | Length | Fired from |
| --- | --- | --- | --- | --- |
| `stake-confirmed` | A stake accepted | A chip laid down | 0.35s | `state/store.ts:434` |
| `escrow-forming` | Each seat staking while a table fills | Chips stacking | 0.5s | `state/store.ts:508` |
| `escrow-complete` | The last seat filling | Chips colliding into one pot | 0.6s | `state/store.ts:439`, `state/store.ts:508` |
| `settlement` | The chain settling a match | A ledger closing | 0.7s | `state/settlement.test.ts:18`, `state/store.ts:691` |
| `payout` | Money landing in your wallet | Chips handled and swept in. The best sound in the product | 0.9s | `state/store.ts:692` |

## Outcomes

Five endings, five sounds. A defeat is built as carefully as a victory.

| Cue | Fires on | Sound | Length | Fired from |
| --- | --- | --- | --- | --- |
| `victory` | Winning a match | Short brass sting, resolved | 2.5s | `ui/music/MusicManager.ts:23`, `ui/music/MusicManager.ts:49` |
| `defeat` | Losing a match | Same motif, unresolved, lower | 2.5s | `ui/music/MusicManager.ts:24`, `ui/music/MusicManager.ts:50` |
| `draw` | A draw | Two notes ending level with each other | 2.0s | `ui/feedback/announce.ts:194`, `ui/feedback/announce.ts:196` |
| `round-won` | Taking a bracket round | A rising three-tone. Not the victory sting — this is a floor secured, not a match won | 1.2s | `state/store.ts:894` |
| `champion` | Winning a bracket final | The loudest thing in the game | 3.0s | `server/net/netServer.ts:1186`, `server/net/netServer.ts:1190` |

---

## Where every file came from

All 6 packs are CC0 1.0 (public domain) by Kenney — Casino Audio, Digital Audio, Impact Sounds, Interface Sounds, Sci-Fi Sounds, UI Audio.

| Cue | File | Original | Pack |
| --- | --- | --- | --- |
| `ui-press` | `ui-press.ogg` | `click_002.ogg` | [Interface Sounds](https://kenney.nl/assets/interface-sounds) |
| `ui-cancel` | `ui-cancel.ogg` | `back_001.ogg` | [Interface Sounds](https://kenney.nl/assets/interface-sounds) |
| `ui-hover` | `ui-hover.ogg` | `rollover1.ogg` | [UI Audio](https://kenney.nl/assets/ui-audio) |
| `ui-select` | `ui-select.ogg` | `select_003.ogg` | [Interface Sounds](https://kenney.nl/assets/interface-sounds) |
| `ui-screen` | `ui-screen.ogg` | `scroll_003.ogg` | [Interface Sounds](https://kenney.nl/assets/interface-sounds) |
| `ui-modal-open` | `ui-modal-open.ogg` | `open_001.ogg` | [Interface Sounds](https://kenney.nl/assets/interface-sounds) |
| `ui-modal-close` | `ui-modal-close.ogg` | `close_001.ogg` | [Interface Sounds](https://kenney.nl/assets/interface-sounds) |
| `ui-slider` | `ui-slider.ogg` | `tick_002.ogg` | [Interface Sounds](https://kenney.nl/assets/interface-sounds) |
| `ui-toggle` | `ui-toggle.ogg` | `switch_002.ogg` | [Interface Sounds](https://kenney.nl/assets/interface-sounds) |
| `ui-refused` | `ui-refused.ogg` | `error_004.ogg` | [Interface Sounds](https://kenney.nl/assets/interface-sounds) |
| `wallet-connected` | `wallet-connected.ogg` | `confirmation_002.ogg` | [Interface Sounds](https://kenney.nl/assets/interface-sounds) |
| `error-shown` | `error-shown.ogg` | `error_006.ogg` | [Interface Sounds](https://kenney.nl/assets/interface-sounds) |
| `draft-deal` | `draft-deal.ogg` | `card-fan-1.ogg` | [Casino Audio](https://kenney.nl/assets/casino-audio) |
| `draft-pick` | `draft-pick.ogg` | `card-place-2.ogg` | [Casino Audio](https://kenney.nl/assets/casino-audio) |
| `draft-theirs` | `draft-theirs.ogg` | `card-slide-3.ogg` | [Casino Audio](https://kenney.nl/assets/casino-audio) |
| `draft-collision` | `draft-collision.ogg` | `card-shove-2.ogg` | [Casino Audio](https://kenney.nl/assets/casino-audio) |
| `draft-resolve` | `draft-resolve.ogg` | `card-slide-7.ogg` | [Casino Audio](https://kenney.nl/assets/casino-audio) |
| `draft-pack` | `draft-pack.ogg` | `cards-pack-open-1.ogg` | [Casino Audio](https://kenney.nl/assets/casino-audio) |
| `ship-pickup` | `ship-pickup.ogg` | `impactMetal_light_001.ogg` | [Impact Sounds](https://kenney.nl/assets/impact-sounds) |
| `ship-rotate` | `ship-rotate.ogg` | `switch_005.ogg` | [Interface Sounds](https://kenney.nl/assets/interface-sounds) |
| `ship-placed` | `ship-placed.ogg` | `impactPlate_medium_000.ogg` | [Impact Sounds](https://kenney.nl/assets/impact-sounds) |
| `place-refused` | `place-refused.ogg` | `impactWood_medium_003.ogg` | [Impact Sounds](https://kenney.nl/assets/impact-sounds) |
| `deploy-auto` | `deploy-auto.ogg` | `scratch_002.ogg` | [Interface Sounds](https://kenney.nl/assets/interface-sounds) |
| `deploy-commit` | `deploy-commit.ogg` | `doorClose_001.ogg` | [Sci-Fi Sounds](https://kenney.nl/assets/sci-fi-sounds) |
| `charge-placed` | `charge-placed.ogg` | `click_002.ogg` | [Interface Sounds](https://kenney.nl/assets/interface-sounds) |
| `card-fired` | `card-fired.ogg` | `laserLarge_001.ogg` | [Sci-Fi Sounds](https://kenney.nl/assets/sci-fi-sounds) |
| `basic-attack` | `basic-attack.ogg` | `laserRetro_001.ogg` | [Sci-Fi Sounds](https://kenney.nl/assets/sci-fi-sounds) |
| `volley` | `volley.ogg` | `thrusterFire_002.ogg` | [Sci-Fi Sounds](https://kenney.nl/assets/sci-fi-sounds) |
| `hit` | `hit.ogg` | `impactMetal_002.ogg` | [Sci-Fi Sounds](https://kenney.nl/assets/sci-fi-sounds) |
| `miss` | `miss.ogg` | `impactSoft_heavy_001.ogg` | [Impact Sounds](https://kenney.nl/assets/impact-sounds) |
| `ship-sunk` | `ship-sunk.ogg` | `explosionCrunch_002.ogg` | [Sci-Fi Sounds](https://kenney.nl/assets/sci-fi-sounds) |
| `ability-activated` | `ability-activated.ogg` | `phaseJump1.ogg` | [Digital Audio](https://kenney.nl/assets/digital-audio) |
| `react-triggered` | `react-triggered.ogg` | `zap1.ogg` | [Digital Audio](https://kenney.nl/assets/digital-audio) |
| `charges-stolen` | `charges-stolen.ogg` | `chips-handle-2.ogg` | [Casino Audio](https://kenney.nl/assets/casino-audio) |
| `prediction-triggered` | `prediction-triggered.ogg` | `impactBell_heavy_002.ogg` | [Impact Sounds](https://kenney.nl/assets/impact-sounds) |
| `shot-blocked` | `shot-blocked.ogg` | `forceField_001.ogg` | [Sci-Fi Sounds](https://kenney.nl/assets/sci-fi-sounds) |
| `match-found` | `match-found.ogg` | `twoTone1.ogg` | [Digital Audio](https://kenney.nl/assets/digital-audio) |
| `phase-card` | `phase-card.ogg` | `maximize_003.ogg` | [Interface Sounds](https://kenney.nl/assets/interface-sounds) |
| `round-start` | `round-start.ogg` | `threeTone1.ogg` | [Digital Audio](https://kenney.nl/assets/digital-audio) |
| `resolve-step` | `resolve-step.ogg` | `tick_001.ogg` | [Interface Sounds](https://kenney.nl/assets/interface-sounds) |
| `timer-warning` | `timer-warning.ogg` | `click_005.ogg` | [Interface Sounds](https://kenney.nl/assets/interface-sounds) |
| `timer-expired` | `timer-expired.ogg` | `error_008.ogg` | [Interface Sounds](https://kenney.nl/assets/interface-sounds) |
| `plan-committed` | `plan-committed.ogg` | `drop_002.ogg` | [Interface Sounds](https://kenney.nl/assets/interface-sounds) |
| `stake-confirmed` | `stake-confirmed.ogg` | `chip-lay-1.ogg` | [Casino Audio](https://kenney.nl/assets/casino-audio) |
| `escrow-forming` | `escrow-forming.ogg` | `chips-stack-3.ogg` | [Casino Audio](https://kenney.nl/assets/casino-audio) |
| `escrow-complete` | `escrow-complete.ogg` | `chips-collide-2.ogg` | [Casino Audio](https://kenney.nl/assets/casino-audio) |
| `settlement` | `settlement.ogg` | `bong_001.ogg` | [Interface Sounds](https://kenney.nl/assets/interface-sounds) |
| `payout` | `payout.ogg` | `chips-handle-5.ogg` | [Casino Audio](https://kenney.nl/assets/casino-audio) |
| `victory` | `victory.ogg` | `powerUp1.ogg` | [Digital Audio](https://kenney.nl/assets/digital-audio) |
| `defeat` | `defeat.ogg` | `lowDown.ogg` | [Digital Audio](https://kenney.nl/assets/digital-audio) |
| `draw` | `draw.ogg` | `twoTone2.ogg` | [Digital Audio](https://kenney.nl/assets/digital-audio) |
| `round-won` | `round-won.ogg` | `zapThreeToneUp.ogg` | [Digital Audio](https://kenney.nl/assets/digital-audio) |
| `champion` | `champion.ogg` | `powerUp11.ogg` | [Digital Audio](https://kenney.nl/assets/digital-audio) |

---

## Volume

Two channels, two sliders, both persisted:

- **Effects** — everything in this document.
- **Music** — the tracks in `MUSIC_BRIEF.md`, dropped into `src/ui/music/files/`.

They are separate because they are separate problems. A player who wants the
battle track down usually still wants to hear a shot land, and one slider
forces them to choose. Muting is a third control and mutes both.
