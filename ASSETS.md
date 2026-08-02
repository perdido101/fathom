# Fathom — asset manifest

Every asset resolves through `src/art/registry.ts`. Replacing a placeholder
with final art is a one-line change there; the replacement takes the same
props (`{ id, size, state, accent }`), so nothing else in the app moves.

All placeholders are generated procedurally as SVG components — nothing is
hand-drawn, nothing is vendored, and nothing renders as an empty rectangle or
an emoji. `src/art/art.test.ts` asserts every id below resolves.

**Status legend:** `placeholder` — generated, shippable, awaiting final art.
`final` — production art in place.


## Ships — 10

Horizontal silhouette, bow right. Aspect ratio matches hull size (1:1 through 5:1), transparent background, 256px tall.

| ID | Asset | Dimensions | Status |
|---|---|---|---|
| `ship.skiff` | Skiff | 1:1 @256h | placeholder |
| `ship.cutter` | Cutter | 2:1 @256h | placeholder |
| `ship.reefrunner` | Reefrunner | 2:1 @256h | placeholder |
| `ship.tender` | Tender | 3:1 @256h | placeholder |
| `ship.frigate` | Frigate | 3:1 @256h | placeholder |
| `ship.minelayer` | Minelayer | 3:1 @256h | placeholder |
| `ship.sonarship` | Array Ship | 4:1 @256h | placeholder |
| `ship.carrier` | Carrier | 4:1 @256h | placeholder |
| `ship.dreadnought` | Dreadnought | 5:1 @256h | placeholder |
| `ship.leviathan` | Leviathan | 5:1 @256h | placeholder |

## Ship ability icons — 10

Single colour, one idea each, legible at 24px.

| ID | Asset | Dimensions | Status |
|---|---|---|---|
| `icon.ability.skiff` | Silent Running | 64×64 | placeholder |
| `icon.ability.cutter` | Swift | 64×64 | placeholder |
| `icon.ability.reefrunner` | Camouflage | 64×64 | placeholder |
| `icon.ability.tender` | Supply | 64×64 | placeholder |
| `icon.ability.frigate` | Retaliate | 64×64 | placeholder |
| `icon.ability.minelayer` | Deploy | 64×64 | placeholder |
| `icon.ability.sonarship` | Array | 64×64 | placeholder |
| `icon.ability.carrier` | Launch | 64×64 | placeholder |
| `icon.ability.dreadnought` | Armored | 64×64 | placeholder |
| `icon.ability.leviathan` | Wake | 64×64 | placeholder |

## Cards — 19

Portrait art panel only. Frame, cost and name are drawn by the UI, never baked into the art.

| ID | Asset | Dimensions | Status |
|---|---|---|---|
| `card.basic_salvo` | Basic Salvo | 512×683 (3:4) | placeholder |
| `card.twin_shot` | Twin Shot | 512×683 (3:4) | placeholder |
| `card.line_probe` | Line Probe | 512×683 (3:4) | placeholder |
| `card.depth_charge` | Depth Charge | 512×683 (3:4) | placeholder |
| `card.scatter` | Scatter | 512×683 (3:4) | placeholder |
| `card.buoy` | Buoy | 512×683 (3:4) | placeholder |
| `card.ballast` | Ballast | 512×683 (3:4) | placeholder |
| `card.cross_salvo` | Cross Salvo | 512×683 (3:4) | placeholder |
| `card.sonar_sweep` | Sonar Sweep | 512×683 (3:4) | placeholder |
| `card.torpedo` | Torpedo | 512×683 (3:4) | placeholder |
| `card.barrage` | Barrage | 512×683 (3:4) | placeholder |
| `card.decoy` | Decoy | 512×683 (3:4) | placeholder |
| `card.repair` | Repair | 512×683 (3:4) | placeholder |
| `card.satellite` | Satellite | 512×683 (3:4) | placeholder |
| `card.saturation` | Saturation Fire | 512×683 (3:4) | placeholder |
| `card.wolfpack` | Wolfpack | 512×683 (3:4) | placeholder |
| `card.emp` | EMP Burst | 512×683 (3:4) | placeholder |
| `card.dredge` | Dredge | 512×683 (3:4) | placeholder |
| `card.blockade` | Blockade | 512×683 (3:4) | placeholder |

## Terrain tiles — 5

Seamlessly tileable, identifiable in greyscale at 28px.

| ID | Asset | Dimensions | Status |
|---|---|---|---|
| `tile.open` | OPEN | 128×128 | placeholder |
| `tile.reef` | REEF | 128×128 | placeholder |
| `tile.fog` | FOG | 128×128 | placeholder |
| `tile.trench` | TRENCH | 128×128 | placeholder |
| `tile.shallows` | SHALLOWS | 128×128 | placeholder |

## Grid markers — 6

Read hundreds of times a match. Shape-first, so each is distinguishable in greyscale before colour is applied.

| ID | Asset | Dimensions | Status |
|---|---|---|---|
| `marker.hit` | hit | 128×128 | placeholder |
| `marker.miss` | miss | 128×128 | placeholder |
| `marker.sunk` | sunk | 128×128 | placeholder |
| `marker.probe` | probe | 128×128 | placeholder |
| `marker.mine` | mine | 128×128 | placeholder |
| `marker.decoy` | decoy | 128×128 | placeholder |

## UI marks — 3

Small inline marks.

| ID | Asset | Dimensions | Status |
|---|---|---|---|
| `ui.energy` | energy | 64×64 | placeholder |
| `ui.seed_badge` | seed badge | 64×64 | placeholder |
| `ui.bot` | bot | 64×64 | placeholder |

---

**Total: 53 assets**, all placeholder.

Drawn as real components rather than registry assets, because they carry the brand and are structural rather than swappable:

- **Card frames** (`CardFrame`) — tier expressed through border weight and corner treatment, never decoration volume.
- **Wordmark** (`Wordmark`) — all-caps geometric letterforms with a scanline break through the middle third.
- **Screen backdrop** — hairline grid and faint bathymetric contours, held under 15% contrast so it never competes with a marker.
