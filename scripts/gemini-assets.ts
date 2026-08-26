import { writeFileSync } from 'node:fs';
import { SHIP_LIST } from '../src/engine/ships';
import { CARD_LIST } from '../src/engine/cards';

/**
 * GEMINI_ASSETS.md — the art generation handoff.
 *
 * A single standalone file a human works through in an image generator, top
 * to bottom. Generated from the same ship and card lists the game ships, so
 * a new card cannot exist without its prompt appearing here — and the script
 * fails loudly if an id has no subject line, rather than emitting a blank.
 *
 * ASSETS.md stays the tracking ledger; this is the worklist.
 */

const STYLE_BLOCK = `Bright stylised 3D game art, sunny saturated colours, soft glossy studio lighting
with a warm top light, clean bold silhouette, single centred subject, slightly
exaggerated toy-like proportions, high detail, crisp edges. Palette anchors:
sky blue #6FC3F7 to #2E7FD9, water teal #23B5E8, warm gold #FFC531 accents,
deep navy #123A5E shadows (never black). Plain simple background in a single
soft colour suitable for compositing. No text, no watermark, no logos, no UI,
no frame, no border.`;

/** One subject line per ship hero. The style block carries everything else. */
const SHIP_SUBJECTS: Record<string, string> = {
  dreadnought:
    'a massive four-turret stylised battleship, wide armoured hull, brooding and heavy, charcoal-and-gold plating',
  forge:
    'an industrial foundry ship with a glowing orange forge amidships, crane arms, sparks rising',
  blackout:
    'a shadowed electronic-warfare ship bristling with antenna masts, dark violet energy haze around its arrays',
  warhead:
    'an aggressive missile battleship, oversized launch tubes angled forward, warning stripes, coiled menace',
  kiln: 'a squat fire-support ship with a huge central furnace chimney, ember glow through hull grates',
  leech:
    'a sleek parasitic corvette with grappling siphon arms trailing green energy tethers',
  cinder:
    'a scorched, half-burned ship that is still dangerous, smouldering deck lines, drifting sparks',
  beacon:
    'a lighthouse ship with a tall lantern tower amidships, sweeping cyan light beam, calm and watchful',
  spite:
    'a jagged black ram-ship with a skull-like prow, malicious and spiky, crimson rigging lights',
  ember:
    'a small fast attack boat with rocket pods, trailing embers in its wake, eager and darting',
  pin: 'a precise little torpedo boat with one enormous harpoon rail on its bow, needle-sharp',
  thorn:
    'a bristling mine-layer covered in spike launchers on every side, a sea urchin of a boat',
};

/** One subject line per card's art window. */
const CARD_SUBJECTS: Record<string, string> = {
  salvo: 'a broadside of cannon shells mid-flight over water, muzzle flashes, dynamic diagonal action',
  lance: 'a single piercing energy lance beam cutting a straight line through sea spray',
  burst: 'an explosive starburst shell detonating above the water, radial shockwave',
  rake: 'three parallel claw-like shell trails raking across a stretch of ocean',
  breaker:
    'a colossal shell shattering a cracked armour plate, fragments flying, decisive impact',
  ping: 'a glowing sonar pulse ring expanding across dark water, one bright contact dot',
  echo: 'concentric sound waves bouncing off a hidden hull silhouette beneath the surface',
  sounding:
    'a depth-sounding chart line sweeping a grid of ocean, one row and column lit up',
  jam: 'sparking, tangled signal arcs being cut by interference static, disrupted energy',
  siphon: 'a spiral vortex of golden energy being drawn from one glowing core into another',
  mirror: 'a shimmering upright water mirror reflecting an incoming attack back on itself',
  ambush: 'a snapping steel trap bursting from beneath calm water, spray and surprise',
};

for (const s of SHIP_LIST) {
  if (!SHIP_SUBJECTS[s.id]) throw new Error(`no subject line for ship ${s.id}`);
}
for (const c of CARD_LIST) {
  if (!CARD_SUBJECTS[c.id]) throw new Error(`no subject line for card ${c.id}`);
}

const md = `# GEMINI_ASSETS.md — the art generation worklist

Work top to bottom in your image generator. Every asset names its exact file,
drop location, and pixel size, and carries a ready-to-paste prompt: the shared
STYLE BLOCK below plus its SUBJECT line. \`ASSETS.md\` remains the tracking
ledger; this file supersedes its art sections as the generation worklist.

**The pipeline is already built.** Drop a finished image at the path given —
under \`src/ui/art/drop/\` — and it appears in the game on the next build. No
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
7. Record the file in \`ASSETS_CREDITS.md\` if it is anything other than your
   own generated work.

## STYLE BLOCK — paste this verbatim into every prompt

\`\`\`
${STYLE_BLOCK}
\`\`\`

---

## 1 · Menu backdrop (highest impact — do this first)

**File:** \`src/ui/art/drop/ui/menu-bg.jpg\` · **1920×1080** (16:9)

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

${SHIP_LIST.map(
  (s) => `### \`src/ui/art/drop/ships/${s.id}/hero.png\` — ${s.name} (${s.type}, length ${s.length})

> STYLE BLOCK + SUBJECT: ${SHIP_SUBJECTS[s.id]}
`,
).join('\n')}
---

## 3 · Card art — 12 files, 768×920

The art window only: the top 60% of the 2:3 card. The GameCard component draws
the frame, name banner, rule text and charge gem below — **compose for a
window, keep the subject's focus in the upper two-thirds of the image**, since
the banner overlaps the window's bottom edge.

${CARD_LIST.map(
  (c) => `### \`src/ui/art/drop/cards/${c.id}.png\` — ${c.name} (${c.role})

> STYLE BLOCK + SUBJECT: ${CARD_SUBJECTS[c.id]}
`,
).join('\n')}
---

## 4 · SOL glyph — 1 file, vector preferred

**File:** \`src/ui/art/drop/ui/sol-glyph.png\` · **256×256**, transparent
background (SVG equivalent welcome — place beside every stake and payout).

> STYLE BLOCK + SUBJECT: a small round coin-like emblem carrying the Solana
> angled-bars motif, warm gold #FFC531 with deep navy #123A5E engraving,
> glossy toy-like finish

**Constraint:** must read at 14px. If the bars blur at that size, simplify.

---

*Generated by \`npm run gemini\` from the game's own ship and card lists.*
`;

writeFileSync('GEMINI_ASSETS.md', md, 'utf8');
console.log(
  `wrote GEMINI_ASSETS.md — ${SHIP_LIST.length} ship heroes, ${CARD_LIST.length} card windows, backdrop, glyph`,
);
