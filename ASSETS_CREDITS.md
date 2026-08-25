# Asset credits

Every third-party asset in Shadow Armada, with its source, author, licence and
the date it was retrieved. **Nothing is used whose licence could not be read
off the source.** No Epic Games asset, model, texture, font or sound is used or
referenced; "stylised 3D" in the brief is a visual target, not a source.

## Icons — game-icons.net

**37 icons**, all CC BY 3.0 (<https://creativecommons.org/licenses/by/3.0/>), retrieved 2026-08-25.
Commercial use permitted; **attribution required**, which the in-app Credits
screen provides and this file records.

Authors used: delapouite, lorc.

Icons are stored as path data in `src/ui/art/icons.ts` and recoloured to the
game palette. Recolouring and cropping are permitted under CC BY; the
attribution is unaffected.

| Slot | Icon | Author | Source |
| --- | --- | --- | --- |
| `card.salvo` | cannon-shot | lorc | <https://game-icons.net/1x1/lorc/cannon-shot.html> |
| `card.lance` | spear-hook | lorc | <https://game-icons.net/1x1/lorc/spear-hook.html> |
| `card.burst` | explosion-rays | lorc | <https://game-icons.net/1x1/lorc/explosion-rays.html> |
| `card.rake` | triple-scratches | lorc | <https://game-icons.net/1x1/lorc/triple-scratches.html> |
| `card.breaker` | cracked-shield | lorc | <https://game-icons.net/1x1/lorc/cracked-shield.html> |
| `card.ping` | radar-sweep | lorc | <https://game-icons.net/1x1/lorc/radar-sweep.html> |
| `card.echo` | sonic-screech | lorc | <https://game-icons.net/1x1/lorc/sonic-screech.html> |
| `card.sounding` | sonic-boom | lorc | <https://game-icons.net/1x1/lorc/sonic-boom.html> |
| `card.jam` | interdiction | lorc | <https://game-icons.net/1x1/lorc/interdiction.html> |
| `card.siphon` | vortex | lorc | <https://game-icons.net/1x1/lorc/vortex.html> |
| `card.mirror` | mirror-mirror | lorc | <https://game-icons.net/1x1/lorc/mirror-mirror.html> |
| `card.ambush` | wolf-trap | lorc | <https://game-icons.net/1x1/lorc/wolf-trap.html> |
| `ship.dreadnought` | boat-horizon | delapouite | <https://game-icons.net/1x1/delapouite/boat-horizon.html> |
| `ship.forge` | anvil-impact | lorc | <https://game-icons.net/1x1/lorc/anvil-impact.html> |
| `ship.blackout` | eclipse | lorc | <https://game-icons.net/1x1/lorc/eclipse.html> |
| `ship.warhead` | mushroom-cloud | lorc | <https://game-icons.net/1x1/lorc/mushroom-cloud.html> |
| `ship.kiln` | burning-embers | lorc | <https://game-icons.net/1x1/lorc/burning-embers.html> |
| `ship.leech` | energy-arrow | lorc | <https://game-icons.net/1x1/lorc/energy-arrow.html> |
| `ship.cinder` | small-fire | lorc | <https://game-icons.net/1x1/lorc/small-fire.html> |
| `ship.beacon` | lighthouse | delapouite | <https://game-icons.net/1x1/delapouite/lighthouse.html> |
| `ship.spite` | skull-crack | lorc | <https://game-icons.net/1x1/lorc/skull-crack.html> |
| `ship.ember` | bombing-run | lorc | <https://game-icons.net/1x1/lorc/bombing-run.html> |
| `ship.pin` | pin | delapouite | <https://game-icons.net/1x1/delapouite/pin.html> |
| `ship.thorn` | thorn-helix | lorc | <https://game-icons.net/1x1/lorc/thorn-helix.html> |
| `ui.hit` | bright-explosion | lorc | <https://game-icons.net/1x1/lorc/bright-explosion.html> |
| `ui.miss` | water-splash | lorc | <https://game-icons.net/1x1/lorc/water-splash.html> |
| `ui.water` | waves | lorc | <https://game-icons.net/1x1/lorc/waves.html> |
| `ui.contact` | crosshair | delapouite | <https://game-icons.net/1x1/delapouite/crosshair.html> |
| `ui.charge` | lightning-arc | lorc | <https://game-icons.net/1x1/lorc/lightning-arc.html> |
| `ui.timer` | hourglass | lorc | <https://game-icons.net/1x1/lorc/hourglass.html> |
| `ui.rank` | laurels | lorc | <https://game-icons.net/1x1/lorc/laurels.html> |
| `ui.trophy` | trophy | lorc | <https://game-icons.net/1x1/lorc/trophy.html> |
| `ui.anchor` | anchor | lorc | <https://game-icons.net/1x1/lorc/anchor.html> |
| `ui.sunk` | sinking-ship | delapouite | <https://game-icons.net/1x1/delapouite/sinking-ship.html> |
| `ui.locked` | padlock | lorc | <https://game-icons.net/1x1/lorc/padlock.html> |
| `ui.target` | targeting | lorc | <https://game-icons.net/1x1/lorc/targeting.html> |
| `ui.hidden` | hidden | lorc | <https://game-icons.net/1x1/lorc/hidden.html> |

## Everything else

| Asset | Origin | Licence |
| --- | --- | --- |
| Ship hulls, board tiles, card frames, wordmark, all VFX | Drawn procedurally in this repository | Original work, no third-party content |
| Palette | Defined in `src/ui/theme.css` | Original work |
| Fonts | System font stack only — no font files are bundled or served | n/a |
| Audio | **None shipped.** The cue list exists and fires; no files are bundled | n/a |

## Verification

`npm run icons` re-fetches every icon from the URL recorded above and
regenerates both `src/ui/art/icons.ts` and this file, so the credits cannot
drift from what is actually in the build.
