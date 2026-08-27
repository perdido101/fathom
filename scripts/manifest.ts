import { writeFileSync, readFileSync } from 'node:fs';
import { SHIP_LIST } from '../src/engine/ships';
import { CARD_LIST } from '../src/engine/cards';
import { CUES } from '../src/ui/sfx/SoundManager';
import { VFX_HOOKS } from '../src/ui/vfx/hooks';
import { ICON_CREDITS, ICON_LICENCE } from '../src/ui/art/icons';

/**
 * ASSETS.md is generated, not written.
 *
 * The manifest is the list a human generates art against, so the one thing it
 * must never be is out of date. Deriving it from the same twelve ships, twelve
 * cards and fifteen cues the game actually ships means a new card cannot be
 * added without its art appearing here on the next `npm run manifest`.
 */

/**
 * Status is the whole point of this document now.
 *
 *  SOURCED      — a real, licence-verified asset is in the build.
 *  PROCEDURAL   — drawn in code, deliberately, and good enough to ship on.
 *  STILL NEEDED — nothing is in the build; this is the list to generate against.
 */
type Status = 'SOURCED' | 'PROCEDURAL' | 'STILL NEEDED';

interface Asset {
  file: string;
  px: string;
  ratio: string;
  where: string;
  note: string;
  status: Status;
  /** Credit line, for a sourced asset. */
  credit?: string;
}

const creditFor = (slot: string): string | undefined => {
  const c = ICON_CREDITS.find((x) => x.slot === slot);
  return c ? `${c.name} by ${c.author}, game-icons.net, ${ICON_LICENCE}` : undefined;
};

const ship: Asset[] = SHIP_LIST.flatMap((s) => [
  {
    file: `ships/${s.id}/hero.png`,
    px: '1024x1024',
    ratio: '1:1',
    where: 'ship draft card, result screen reveal',
    note: `${s.name} at three-quarter view, whole hull in frame, ${s.type} silhouette readable at 120px. Drop at src/ui/art/drop/ships/${s.id}/hero.png — prompt in GEMINI_ASSETS.md.`,
    status: 'STILL NEEDED' as Status,
  },
  {
    file: `ships/${s.id}/token.png`,
    px: `${s.length * 128}x128`,
    ratio: `${s.length}:1`,
    where: 'your own board, laid across the cells it occupies',
    note: `Top-down ${s.name}, bow at the left edge, transparent background, no shadow baked in. Currently steel-tinted cells on the owner's board.`,
    status: 'PROCEDURAL' as Status,
  },
  {
    file: `ships/${s.id}/icon.png`,
    px: '128x128',
    ratio: '1:1',
    where: 'battle screen ship strip, both fleets',
    note: `${s.name} mark. Must read at 16px and must not hint at length.`,
    status: 'SOURCED' as Status,
    credit: creditFor(`ship.${s.id}`),
  },
]);

const unknownHull: Asset[] = [4, 3, 2].map((len) => ({
  file: `ships/unknown-${len}.png`,
  px: '128x128',
  ratio: '1:1',
  where: 'enemy ship strip before that ship reveals itself',
  note: `Anonymous ${len}-length marker. Identical treatment for all four ships of that length — any distinguishing detail is an information leak.`,
}));

const card: Asset[] = CARD_LIST.flatMap((c) => [
  {
    file: `cards/${c.id}-icon.svg`,
    px: '512x512',
    ratio: '1:1',
    where: 'card face, resolve overlay',
    note: `${c.name} mark, tinted to the ${c.role} colour.`,
    status: 'SOURCED' as Status,
    credit: creditFor(`card.${c.id}`),
  },
  {
    file: `cards/${c.id}.png`,
    px: '768x920',
    ratio: '~5:6',
    where: 'card draft, battle hand — the art window of the 2:3 card',
    note: `${c.name} — ${c.role}. Illustration for the art window only (the top 60% of the card); the GameCard component draws the frame, name banner, rule text and charge gem below it. Drop at src/ui/art/drop/cards/${c.id}.png — prompt in GEMINI_ASSETS.md.`,
    status: 'STILL NEEDED' as Status,
  },
]);

const cardChrome: Asset[] = [
  {
    file: 'cards/back.png',
    px: '768x1152',
    ratio: '2:3',
    where: "opponent's hand, draw pile",
    note: 'Card back. Must be identical for every card and legible down to 44x62 in the opponent strip. Currently a sky-radial with the twin-chevron mark, drawn by CardBack.',
    status: 'PROCEDURAL' as Status,
  },
  {
    file: 'cards/frame-attack.png',
    px: '768x1152',
    ratio: '2:3',
    where: 'behind every attack card',
    note: 'Role frame, transparent centre. One per role. Currently a role-coloured border and banner drawn by GameCard.',
    status: 'PROCEDURAL' as Status,
  },
  {
    file: 'cards/frame-intel.png',
    px: '768x1152',
    ratio: '2:3',
    where: 'behind every intel card',
    note: 'As above, intel palette.',
    status: 'PROCEDURAL' as Status,
  },
  {
    file: 'cards/frame-control.png',
    px: '768x1152',
    ratio: '2:3',
    where: 'behind every control card',
    note: 'As above, control palette.',
    status: 'PROCEDURAL' as Status,
  },
  {
    file: 'cards/frame-prediction.png',
    px: '768x1152',
    ratio: '2:3',
    where: 'behind Mirror and Ambush',
    note: 'As above, prediction palette.',
    status: 'PROCEDURAL' as Status,
  },
];

const ui: Asset[] = [
  {
    file: 'ui/wordmark.svg',
    px: '512x160',
    ratio: '16:5',
    where: 'main menu, splash',
    note: 'ARMADA lockup. Vector, must survive being drawn at 120px wide.',
  },
  {
    file: 'ui/appicon.png',
    px: '1024x1024',
    ratio: '1:1',
    where: 'PWA install, browser tab',
    note: 'App mark alone, no wordmark, safe area 10%.',
  },
  {
    file: 'ui/menu-bg.jpg',
    px: '1920x1080',
    ratio: '16:9',
    where: 'main menu backdrop, full-bleed at desktop',
    note: 'Bright sky-to-sea horizon in the arcade palette. Must stay legible under the near-white mode cards; the CSS sky gradient and drifting clouds carry it until this exists. Drop at src/ui/art/drop/ui/menu-bg.jpg — prompt in GEMINI_ASSETS.md.',
  },
  {
    file: 'ui/cell-water.png',
    px: '256x256',
    ratio: '1:1',
    where: 'every board cell, both boards',
    note: 'Water tile. Tiles seamlessly on a 6x6 grid; the grid gap is drawn by CSS, not baked in.',
  },
  {
    file: 'ui/cell-hit.png',
    px: '256x256',
    ratio: '1:1',
    where: 'a cell where a shot connected',
    note: 'Burning hull plate. Reads as damage at 48px.',
  },
  {
    file: 'ui/cell-miss.png',
    px: '256x256',
    ratio: '1:1',
    where: 'a cell where a shot found water',
    note: 'Spent splash. Must be clearly *not* a hit at a glance and in monochrome.',
  },
  {
    file: 'ui/cell-known.png',
    px: '256x256',
    ratio: '1:1',
    where: 'a cell Echo exposed as occupied but unhit',
    note: 'Contact marker. Distinct from both hit and miss — this is knowledge, not damage.',
  },
  {
    file: 'ui/charge-chip.png',
    px: '128x128',
    ratio: '1:1',
    where: 'behind every charge number on both hands',
    note: 'The charge glyph. This is the most-looked-at object in the game; it has to read at 14px and at 40px.',
  },
  {
    file: 'ui/timer-ring.png',
    px: '256x256',
    ratio: '1:1',
    where: 'round timer',
    note: 'Ring that empties over 20 seconds. Needs a distinct last-5-seconds state.',
  },
  {
    file: 'ui/sol-glyph.svg',
    px: '64x64',
    ratio: '1:1',
    where: 'every stake, pot and payout figure',
    note: 'SOL mark. Vector.',
  },
  {
    file: 'ui/stake-tier.png',
    px: '256x128',
    ratio: '2:1',
    where: 'arena stake selector, four tiers',
    note: 'Tier plate. One asset, tinted per tier in CSS — not four files.',
  },
  {
    file: 'ui/rank-badge.png',
    px: '256x256',
    ratio: '1:1',
    where: 'leaderboard rows, season screen',
    note: 'Rank frame. Tinted per payout band; the badge itself is one asset.',
  },
  {
    file: 'ui/collision-burst.png',
    px: '512x512',
    ratio: '1:1',
    where: 'draft screen, when both players took the same item',
    note: 'The collision moment. This is the only information the draft leaks, so it should feel like an event.',
  },
];

const UI_STATUS: Record<string, [Status, string | null]> = {
  'ui/wordmark.svg': ['PROCEDURAL', null],
  'ui/appicon.png': ['PROCEDURAL', null],
  'ui/menu-bg.jpg': ['STILL NEEDED', null],
  'ui/cell-water.png': ['PROCEDURAL', null],
  'ui/cell-hit.png': ['SOURCED', 'ui.hit'],
  'ui/cell-miss.png': ['SOURCED', 'ui.miss'],
  'ui/cell-known.png': ['SOURCED', 'ui.contact'],
  'ui/charge-chip.png': ['SOURCED', 'ui.charge'],
  'ui/timer-ring.png': ['SOURCED', 'ui.timer'],
  'ui/sol-glyph.svg': ['STILL NEEDED', null],
  'ui/stake-tier.png': ['PROCEDURAL', null],
  'ui/rank-badge.png': ['SOURCED', 'ui.rank'],
  'ui/collision-burst.png': ['PROCEDURAL', null],
};

for (const a of ui) {
  const entry = UI_STATUS[a.file];
  a.status = entry ? entry[0] : 'STILL NEEDED';
  if (entry && entry[1]) a.credit = creditFor(entry[1]);
}

function vfxAssets(): Asset[] {
  return VFX_HOOKS.map((h) => ({
    file: `vfx/${h.id}.webm`,
    px: h.id === 'sink-sequence' ? '512x512' : '256x256',
    ratio: '1:1',
    where: h.trigger,
    note: `${h.reads}. Budget ${h.durationMs}ms. Alpha channel required. A CSS animation stands in today.`,
    status: 'PROCEDURAL' as Status,
  }));
}

function sfxAssets(): Asset[] {
  // Audio landed in Build 4: every cue has a real CC0 file, fetched and
  // credited by scripts/fetch-audio.mjs.
  let audio: { credits: { cue: string; pack: string; original: string }[] } | null = null;
  try {
    audio = JSON.parse(readFileSync('src/ui/sfx/audio-credits.json', 'utf8'));
  } catch {
    audio = null;
  }
  return CUES.map((c) => {
    const hit = audio?.credits.find((a) => a.cue === c.id);
    return {
      file: `src/ui/sfx/files/${c.id}.ogg`,
      px: `${c.length} mono`,
      ratio: 'n/a',
      where: `fires on the ${c.id.replace(/-/g, ' ')} cue`,
      note: hit
        ? `${c.description}. ${hit.original} from Kenney's ${hit.pack} pack.`
        : c.description,
      status: (hit ? 'SOURCED' : 'STILL NEEDED') as Status,
      credit: hit ? `Kenney (kenney.nl), ${hit.pack}, CC0 1.0` : undefined,
    };
  });
}

function table(assets: Asset[]): string {
  const lines = [
    '| File | Size | Ratio | Where it appears | Description |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const a of assets) {
    lines.push(`| \`${a.file}\` | ${a.px} | ${a.ratio} | ${a.where} | ${a.note} |`);
  }
  return lines.join('\n');
}

const groups: [string, Asset[], string][] = [
  [
    'Ship art',
    [...ship, ...unknownHull],
    'Three assets per ship: a hero render for the draft, a top-down token for your own board, and a mark for the battle strip. The anonymous hull markers matter as much as the named ones — an enemy ship must give nothing away until it acts.',
  ],
  [
    'Card art',
    [...card, ...cardChrome],
    'One illustration per card plus one frame per role and a single shared back. The bottom 40% of every card face is reserved for text and the charge number, which is the largest element on the card.',
  ],
  ['UI', ui, 'Board tiles, the charge chip, and the chrome around stakes and ranks.'],
  [
    'VFX',
    vfxAssets(),
    'One per hook already wired into the resolve sequence. Each fires at a known beat in `src/ui/vfx/hooks.ts`; the placeholder animations are CSS and can be replaced one at a time.',
  ],
  [
    'SFX',
    sfxAssets(),
    'The complete cue list. Every one of these already fires from `SoundManager` with no audio attached, so dropping files in is the whole integration.',
  ],
];

const total = groups.reduce((n, g) => n + g[1].length, 0);
const all = groups.flatMap(([, assets]) => assets);
const tally = (st: Status): number => all.filter((a) => a.status === st).length;
const stillNeeded = all.filter((a) => a.status === 'STILL NEEDED');

const doc = `# ARMADA — asset manifest

**${total} assets.** Generated by \`npm run manifest\` from the game's own content
lists, so it cannot fall out of step with the twelve ships, twelve cards,
${VFX_HOOKS.length} visual hooks and ${CUES.length} sound cues the build actually ships.

| Status | Count | Meaning |
| --- | --- | --- |
| SOURCED | ${tally('SOURCED')} | A licence-verified asset is in the build. Credit is on the row and in \`ASSETS_CREDITS.md\`. |
| PROCEDURAL | ${tally('PROCEDURAL')} | Drawn in code, deliberately, and good enough to ship on. |
| STILL NEEDED | ${tally('STILL NEEDED')} | Nothing in the build. **This is the list to generate against.** |

The game is fully playable today: nothing marked STILL NEEDED blocks anything,
and nothing anywhere is a grey box.

## What is still needed

${stillNeeded.map((a) => `- \`${a.file}\` — ${a.px}, ${a.note}`).join('\n')}

**Intended style, for sizing and framing only:** stylised 3D, bold readable
silhouettes, saturated but not neon, slightly exaggerated proportions. Clean
stylisation, naval subject. Not photoreal, not pixel art.

**Two rules that are not stylistic.** Every asset that can appear on the enemy
side must be information-neutral: an unrevealed hull marker cannot hint at
which of the four ships of that length it is. And every board asset must read
correctly at 48px, because that is its size on the compact own-waters board
even at desktop resolution.

${groups
  .map(
    ([name, assets, blurb]) =>
      `## ${name} — ${assets.length} files\n\n${blurb}\n\n${table(assets)}`,
  )
  .join('\n\n')}

## Not needed

No music beds, no voice, no UI sound for ordinary taps, and no per-tier or
per-rank art variants — those are tints of one asset. Nothing here is a
placeholder for a decision that has not been made yet; if it is on the list, it
has a call site in the code today.
`;

writeFileSync('ASSETS.md', doc, 'utf8');
console.log(`wrote ASSETS.md — ${total} assets across ${groups.length} groups`);
