# GEMINI_ASSETS.md — the art generation worklist

Work top to bottom in your image generator. Every asset names its exact file,
drop location, and pixel size, and carries a ready-to-paste prompt: the shared
STYLE BLOCK below plus its SUBJECT line. `ASSETS.md` remains the tracking
ledger; this file supersedes its art sections as the generation worklist.

**The pipeline is already built.** Drop a finished image at the path given —
under `src/ui/art/drop/` — and it appears in the game on the next build. No
code changes. Anything absent keeps its procedural stand-in.

## QA checklist — before dropping any image in

1. **Exact dimensions** as specified (resize/crop before dropping in).
2. **Plain background**, one soft colour — no scenes behind the subject.
3. **Palette fit**: sky blues, water teal, gold accents, navy shadows. If it
   reads grey, murky or neon against the game's bright arcade look, regenerate.
4. **Silhouette legible at thumbnail**: shrink to ~120px; the subject must
   still read instantly.
5. **No text, watermark, logo, frame or border** anywhere in the image.
6. **Information-neutral where flagged**: an enemy-side asset must not hint at
   hidden information (see per-asset constraints).
7. Record the file in `ASSETS_CREDITS.md` if it is anything other than your
   own generated work.

## STYLE BLOCK — paste this verbatim into every prompt

```
Bright stylised 3D game art, sunny saturated colours, soft glossy studio lighting
with a warm top light, clean bold silhouette, single centred subject, slightly
exaggerated toy-like proportions, high detail, crisp edges. Palette anchors:
sky blue #6FC3F7 to #2E7FD9, water teal #23B5E8, warm gold #FFC531 accents,
deep navy #123A5E shadows (never black). Plain simple background in a single
soft colour suitable for compositing. No text, no watermark, no logos, no UI,
no frame, no border.
```

---

## 1 · Menu backdrop (highest impact — do this first)

**File:** `src/ui/art/drop/ui/menu-bg.jpg` · **1920×1080** (16:9)

> STYLE BLOCK + SUBJECT: a wide bright ocean horizon under a towering sunny
> sky with drifting cumulus clouds, calm teal sea with gentle glinting waves,
> seen from high above a fleet's masthead, open composition with the middle
> third kept calm and uncluttered

**Constraints:** the middle of the frame sits behind near-white menu cards —
keep detail and contrast low there. No ships, no landmarks (the menu's own
cards carry the identity). Must stay legible with white display text over the
top sixth.

---

## 2 · Ship heroes — 12 files, 1024×1024

Shown on the draft pick and the end-of-match reveal. Three-quarter view, whole
hull in frame, waterline visible, the ship's character readable at 120px.

**Constraint for all twelve:** these render only on the owner's side, so they
carry no hidden information. Keep every hull length ambiguous in the art —
the rules announce length, the art must not contradict it.

### `src/ui/art/drop/ships/dreadnought/hero.png` — Dreadnought (REACT, length 4)

> STYLE BLOCK + SUBJECT: a massive four-turret stylised battleship, wide armoured hull, brooding and heavy, charcoal-and-gold plating

### `src/ui/art/drop/ships/forge/hero.png` — Forge (ACTIVE, length 4)

> STYLE BLOCK + SUBJECT: an industrial foundry ship with a glowing orange forge amidships, crane arms, sparks rising

### `src/ui/art/drop/ships/blackout/hero.png` — Blackout (NERF, length 4)

> STYLE BLOCK + SUBJECT: a shadowed electronic-warfare ship bristling with antenna masts, dark violet energy haze around its arrays

### `src/ui/art/drop/ships/warhead/hero.png` — Warhead (ACTIVE, length 4)

> STYLE BLOCK + SUBJECT: an aggressive missile battleship, oversized launch tubes angled forward, warning stripes, coiled menace

### `src/ui/art/drop/ships/kiln/hero.png` — Kiln (ACTIVE, length 3)

> STYLE BLOCK + SUBJECT: a squat fire-support ship with a huge central furnace chimney, ember glow through hull grates

### `src/ui/art/drop/ships/leech/hero.png` — Leech (NERF, length 3)

> STYLE BLOCK + SUBJECT: a sleek parasitic corvette with grappling siphon arms trailing green energy tethers

### `src/ui/art/drop/ships/cinder/hero.png` — Cinder (REACT, length 3)

> STYLE BLOCK + SUBJECT: a scorched, half-burned ship that is still dangerous, smouldering deck lines, drifting sparks

### `src/ui/art/drop/ships/beacon/hero.png` — Beacon (ACTIVE, length 3)

> STYLE BLOCK + SUBJECT: a lighthouse ship with a tall lantern tower amidships, sweeping cyan light beam, calm and watchful

### `src/ui/art/drop/ships/spite/hero.png` — Spite (REACT, length 2)

> STYLE BLOCK + SUBJECT: a jagged black ram-ship with a skull-like prow, malicious and spiky, crimson rigging lights

### `src/ui/art/drop/ships/ember/hero.png` — Ember (ACTIVE, length 2)

> STYLE BLOCK + SUBJECT: a small fast attack boat with rocket pods, trailing embers in its wake, eager and darting

### `src/ui/art/drop/ships/pin/hero.png` — Pin (ACTIVE, length 2)

> STYLE BLOCK + SUBJECT: a precise little torpedo boat with one enormous harpoon rail on its bow, needle-sharp

### `src/ui/art/drop/ships/thorn/hero.png` — Thorn (REACT, length 2)

> STYLE BLOCK + SUBJECT: a bristling mine-layer covered in spike launchers on every side, a sea urchin of a boat

---

## 3 · Card art — 12 files, 768×920

The art window only: the top 60% of the 2:3 card. The GameCard component draws
the frame, name banner, rule text and charge gem below — **compose for a
window, keep the subject's focus in the upper two-thirds of the image**, since
the banner overlaps the window's bottom edge.

### `src/ui/art/drop/cards/salvo.png` — Salvo (attack)

> STYLE BLOCK + SUBJECT: a broadside of cannon shells mid-flight over water, muzzle flashes, dynamic diagonal action

### `src/ui/art/drop/cards/lance.png` — Lance (attack)

> STYLE BLOCK + SUBJECT: a single piercing energy lance beam cutting a straight line through sea spray

### `src/ui/art/drop/cards/burst.png` — Burst (attack)

> STYLE BLOCK + SUBJECT: an explosive starburst shell detonating above the water, radial shockwave

### `src/ui/art/drop/cards/rake.png` — Rake (attack)

> STYLE BLOCK + SUBJECT: three parallel claw-like shell trails raking across a stretch of ocean

### `src/ui/art/drop/cards/breaker.png` — Breaker (attack)

> STYLE BLOCK + SUBJECT: a colossal shell shattering a cracked armour plate, fragments flying, decisive impact

### `src/ui/art/drop/cards/ping.png` — Ping (intel)

> STYLE BLOCK + SUBJECT: a glowing sonar pulse ring expanding across dark water, one bright contact dot

### `src/ui/art/drop/cards/echo.png` — Echo (intel)

> STYLE BLOCK + SUBJECT: concentric sound waves bouncing off a hidden hull silhouette beneath the surface

### `src/ui/art/drop/cards/sounding.png` — Sounding (intel)

> STYLE BLOCK + SUBJECT: a depth-sounding chart line sweeping a grid of ocean, one row and column lit up

### `src/ui/art/drop/cards/jam.png` — Jam (control)

> STYLE BLOCK + SUBJECT: sparking, tangled signal arcs being cut by interference static, disrupted energy

### `src/ui/art/drop/cards/siphon.png` — Siphon (control)

> STYLE BLOCK + SUBJECT: a spiral vortex of golden energy being drawn from one glowing core into another

### `src/ui/art/drop/cards/mirror.png` — Mirror (prediction)

> STYLE BLOCK + SUBJECT: a shimmering upright water mirror reflecting an incoming attack back on itself

### `src/ui/art/drop/cards/ambush.png` — Ambush (prediction)

> STYLE BLOCK + SUBJECT: a snapping steel trap bursting from beneath calm water, spray and surprise

---

## 4 · SOL glyph — 1 file, vector preferred

**File:** `src/ui/art/drop/ui/sol-glyph.png` · **256×256**, transparent
background (SVG equivalent welcome — place beside every stake and payout).

> STYLE BLOCK + SUBJECT: a small round coin-like emblem carrying the Solana
> angled-bars motif, warm gold #FFC531 with deep navy #123A5E engraving,
> glossy toy-like finish

**Constraint:** must read at 14px. If the bars blur at that size, simplify.

---

*Generated by `npm run gemini` from the game's own ship and card lists.*
