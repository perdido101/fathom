import { writeFileSync } from 'node:fs';
import { SHIP_LIST } from '../src/engine/ships';
import { CARD_LIST } from '../src/engine/cards';
import { CUES } from '../src/ui/sfx/SoundManager';
import { VFX_HOOKS } from '../src/ui/vfx/hooks';

/**
 * ASSETS.md is generated, not written.
 *
 * The manifest is the list a human generates art against, so the one thing it
 * must never be is out of date. Deriving it from the same twelve ships, twelve
 * cards and fifteen cues the game actually ships means a new card cannot be
 * added without its art appearing here on the next `npm run manifest`.
 */

interface Asset {
  file: string;
  px: string;
  ratio: string;
  where: string;
  note: string;
}

const ship: Asset[] = SHIP_LIST.flatMap((s) => [
  {
    file: `ships/${s.id}/hero.png`,
    px: '1024x1024',
    ratio: '1:1',
    where: 'ship draft card, result screen reveal',
    note: `${s.name} at three-quarter view, whole hull in frame, ${s.type} silhouette readable at 120px.`,
  },
  {
    file: `ships/${s.id}/token.png`,
    px: `${s.length * 128}x128`,
    ratio: `${s.length}:1`,
    where: 'your own board, laid across the cells it occupies',
    note: `Top-down ${s.name}, bow at the left edge, transparent background, no shadow baked in.`,
  },
  {
    file: `ships/${s.id}/icon.png`,
    px: '128x128',
    ratio: '1:1',
    where: 'battle screen ship strip, both fleets',
    note: `${s.name} mark only — must read at 16px and must not hint at length.`,
  },
]);

const unknownHull: Asset[] = [4, 3, 2].map((len) => ({
  file: `ships/unknown-${len}.png`,
    px: '128x128',
  ratio: '1:1',
  where: 'enemy ship strip before that ship reveals itself',
  note: `Anonymous ${len}-length marker. Identical treatment for all four ships of that length — any distinguishing detail is an information leak.`,
}));

const card: Asset[] = CARD_LIST.map((c) => ({
  file: `cards/${c.id}.png`,
  px: '768x1152',
  ratio: '2:3',
  where: 'card draft, battle hand, resolve overlay',
  note: `${c.name} — ${c.role}. Art fills the top 60%; the bottom 40% is left clear for name, text and the charge number.`,
}));

const cardChrome: Asset[] = [
  {
    file: 'cards/back.png',
    px: '768x1152',
    ratio: '2:3',
    where: "opponent's hand, draw pile",
    note: 'Card back. Must be identical for every card and must tile without a visible seam at 30x40.',
  },
  {
    file: 'cards/frame-attack.png',
    px: '768x1152',
    ratio: '2:3',
    where: 'behind every attack card',
    note: 'Role frame, transparent centre. One per role: attack, intel, control, prediction.',
  },
  {
    file: 'cards/frame-intel.png',
    px: '768x1152',
    ratio: '2:3',
    where: 'behind every intel card',
    note: 'As above, intel palette.',
  },
  {
    file: 'cards/frame-control.png',
    px: '768x1152',
    ratio: '2:3',
    where: 'behind every control card',
    note: 'As above, control palette.',
  },
  {
    file: 'cards/frame-prediction.png',
    px: '768x1152',
    ratio: '2:3',
    where: 'behind Mirror and Ambush',
    note: 'As above, prediction palette.',
  },
];

const ui: Asset[] = [
  {
    file: 'ui/wordmark.svg',
    px: '512x160',
    ratio: '16:5',
    where: 'main menu, splash',
    note: 'SHADOW ARMADA lockup. Vector, must survive being drawn at 120px wide.',
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
    px: '1170x2532',
    ratio: '9:19.5',
    where: 'main menu backdrop',
    note: 'Dark sea horizon. Must stay legible under text at 60% opacity overlay.',
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

function vfxAssets(): Asset[] {
  return VFX_HOOKS.map((h) => ({
    file: `vfx/${h.id}.webm`,
    px: h.id === 'sink-sequence' ? '512x512' : '256x256',
    ratio: '1:1',
    where: h.trigger,
    note: `${h.reads}. Budget ${h.durationMs}ms. Alpha channel required.`,
  }));
}

function sfxAssets(): Asset[] {
  return CUES.map((c) => ({
    file: `sfx/${c.id}.ogg`,
    px: `${c.length} mono 48kHz`,
    ratio: 'n/a',
    where: `fires on the ${c.id.replace(/-/g, ' ')} cue`,
    note: c.description,
  }));
}

function table(assets: Asset[]): string {
  const lines = ['| File | Size | Ratio | Where it appears | Description |', '| --- | --- | --- | --- | --- |'];
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

const doc = `# Shadow Armada — asset manifest

**${total} assets.** Generated by \`npm run manifest\` from the game's own content
lists, so it cannot fall out of step with the twelve ships, twelve cards,
${VFX_HOOKS.length} visual hooks and ${CUES.length} sound cues the build actually ships.

Everything in the game currently runs on procedural placeholders — coloured
shapes with legible labels at the right sizes and positions. The game is fully
playable on them, which is the point: nothing below blocks development.

**Intended style, for sizing and framing only:** stylised 3D, bold readable
silhouettes, saturated but not neon, slightly exaggerated proportions. Clean
stylisation, naval subject. Not photoreal, not pixel art.

**Two rules that are not stylistic.** Every asset that can appear on the enemy
side must be information-neutral: an unrevealed hull marker cannot hint at
which of the four ships of that length it is. And every board asset must read
correctly at 48px on a phone, because that is the size it will actually be
seen at.

${groups
  .map(([name, assets, blurb]) => `## ${name} — ${assets.length} files\n\n${blurb}\n\n${table(assets)}`)
  .join('\n\n')}

## Not needed

No music beds, no voice, no UI sound for ordinary taps, and no per-tier or
per-rank art variants — those are tints of one asset. Nothing here is a
placeholder for a decision that has not been made yet; if it is on the list, it
has a call site in the code today.
`;

writeFileSync('ASSETS.md', doc, 'utf8');
console.log(`wrote ASSETS.md — ${total} assets across ${groups.length} groups`);
