import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { CUES, type Cue, type CueGroup } from '../src/ui/sfx/SoundManager';

/**
 * `npm run audio:doc` — docs/AUDIO.md, generated.
 *
 * Three sources, joined: the cue list in `SoundManager.ts`, the credits
 * `fetch-audio.mjs` wrote when it downloaded the files, and a grep of the
 * source for where each cue is actually fired. Nothing here is typed by hand,
 * which is the point — a document that claims a mechanic has a sound should
 * be reading the same list the game reads.
 *
 * It fails, rather than warning, on any of:
 *   - a cue with no audio file
 *   - an audio file with no cue
 *   - a cue with no credit entry
 *   - a cue that nothing in `src/` ever fires
 *
 * That last one is the check the brief asked for: a mechanic cannot ship
 * without a cue, in exactly the way `feedback-doc.ts` stops one shipping
 * without an explainer.
 */

const FILES = 'src/ui/sfx/files';

interface Credit {
  cue: string;
  file: string;
  original: string;
  pack: string;
  author: string;
  source: string;
  licence: string;
  licenceUrl: string;
}

const credits = (
  JSON.parse(readFileSync('src/ui/sfx/audio-credits.json', 'utf8')) as {
    retrieved: string;
    credits: Credit[];
  }
).credits;
const creditOf = new Map(credits.map((c) => [c.cue, c]));

const onDisk = new Set(
  readdirSync(FILES)
    .filter((f) => f.endsWith('.ogg'))
    .map((f) => f.replace(/\.ogg$/, '')),
);

/**
 * Where each cue is fired.
 *
 * Two ways a cue reaches the game: named as a literal at a call site, or
 * returned from `ui-sounds.ts`, which picks a cue from the *kind of control*
 * rather than from the screen. Both count as wired; only the first has a file
 * and line worth printing.
 */
function callSites(): Map<Cue, string[]> {
  const out = new Map<Cue, string[]>();
  /*
   * A grep for the quoted id, not for `Sound.play('...')`.
   *
   * The narrower pattern was tried first and under-reported by ten: it missed
   * every ternary — `Sound.play(e.hit ? 'hit' : 'miss')` — and every
   * multi-line call. Ten cues were reported unwired that were wired, which is
   * a check that would have been quietly edited away rather than believed.
   *
   * `SoundManager.ts` is excluded because it is where the ids are declared;
   * counting the declaration as a use would make the check unfailable.
   */
  const hits = execFileSync(
    'grep',
    ['-rn', '-oE', "'[a-z][a-z-]+'", 'src', '--include=*.ts', '--include=*.tsx',
     '--exclude=SoundManager.ts'],
    { encoding: 'utf8' },
  );
  const ids = new Set<string>(CUES.map((c) => c.id));
  for (const line of hits.split('\n')) {
    const m = line.match(/^([^:]+):(\d+):'([a-z][a-z-]+)'$/);
    if (!m || !ids.has(m[3])) continue;
    const cue = m[3] as Cue;
    const list = out.get(cue) ?? [];
    const site = `${m[1].replace(/^src\//, '')}:${m[2]}`;
    if (!list.includes(site)) list.push(site);
    out.set(cue, list);
  }
  return out;
}

const sites = callSites();

const problems: string[] = [];
for (const c of CUES) {
  if (!onDisk.has(c.id)) problems.push(`cue "${c.id}" has no audio file — run npm run audio`);
  if (!creditOf.has(c.id)) problems.push(`cue "${c.id}" has no credit entry`);
  if (!sites.has(c.id)) problems.push(`cue "${c.id}" is never fired anywhere in src/`);
}
for (const f of onDisk) {
  if (!CUES.some((c) => c.id === f)) problems.push(`file "${f}.ogg" belongs to no cue`);
}
if (problems.length) {
  console.error('audio list is inconsistent:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

const GROUPS: [CueGroup, string, string][] = [
  [
    'interface',
    'The interface',
    'Attached once, by control type, in `src/ui/sfx/ui-sounds.ts` rather than screen by screen — a press, a cancel and a toggle are properties of the kind of control, not of the screen it sits on. A control that fires its own more specific cue opts out with `data-sfx="none"`.',
  ],
  ['draft', 'The draft', 'Cards and packs. The collision is a hard landing; the non-collision is deliberately duller, because a shared pick is the news and a differing one is not.'],
  ['deployment', 'Deployment', 'The one phase where the board answers you directly: a legal placement settles, an illegal one knocks.'],
  ['combat', 'Combat', 'The round resolving. Each of these rides a beat in `feedback/timing.ts`, the same clock the resolve overlay and the visual effects run on.'],
  ['round', 'The shape of a round', 'The frame around the fighting — a match seating, a window opening, a clock running out.'],
  ['money', 'Money', 'Every point at which SOL moves or is committed. These are the cues a player should be able to recognise with their eyes shut.'],
  ['outcome', 'Outcomes', 'Five endings, five sounds. A defeat is built as carefully as a victory.'],
];

const total = CUES.length;
const packs = [...new Set(credits.map((c) => c.pack))].sort();

const doc = `# What the game sounds like

Every sound cue in ARMADA: what fires it, what it is, and where it came from.

This file is **generated** by \`npm run audio:doc\` from three sources that
have to agree — the cue list in \`src/ui/sfx/SoundManager.ts\`, the credits
\`npm run audio\` wrote when it downloaded the files, and a grep of \`src/\`
for where each cue is actually fired. The script exits non-zero if a cue has
no file, a file has no cue, a cue has no credit, or a cue is declared and
never played. A mechanic cannot ship without a sound, in the same way
\`docs/FEEDBACK.md\` stops one shipping without an explanation.

**${total} cues**, all sourced from ${packs.length} CC0 packs by Kenney. CC0
requires no attribution; it is recorded anyway, by the script that does the
downloading, so the credits cannot drift from what shipped.

---

## The two rules

**A cue maps to a discrete event the player caused or needs to notice.** No
ambience, no loops, nothing that plays because a screen is open. Music is a
separate channel with a separate slider and a separate brief
(\`MUSIC_BRIEF.md\`); it is not in this file and never will be.

**Two events share a cue only when they are genuinely the same event.** This
is the rule that took the list from 15 to ${total} — pressing a button and
cancelling out of a panel are not the same event and no longer share a sound.
It cuts the other way too, once: nine cells of one volley arriving are *one*
event, and \`volley\` fires once per round rather than once per cell. Nine
overlapping whistles is the exact noise the rule exists to prevent.

Two mechanisms enforce the second rule at runtime. \`guard\` drops a cue that
would retrigger inside a window — a pointer skimming three cards plays one
rollover, not three. \`gain\` scales a single call against the channel volume,
for the cues that are deliberately underneath everything else.

---

## Pitch as information

Four cues carry a number in their pitch rather than in a second sound:

| Cue | Pitched by | Why |
| --- | --- | --- |
| \`charge-placed\` | The count the card will hold | A fifth charge sounds different from a first, which is what a player planning a Lance needs |
| \`ship-sunk\` | Hull length | A four goes down lower than a two |
| \`timer-warning\` | Seconds remaining | The tick quickens as the window closes |
| \`ui-cancel\` | Fixed, below \`ui-press\` | Leaving is not arriving |

---

${GROUPS.map(([g, title, blurb]) => {
  const rows = CUES.filter((c) => c.group === g);
  return `## ${title}

${blurb}

| Cue | Fires on | Sound | Length | Fired from |
| --- | --- | --- | --- | --- |
${rows
  .map((c) => {
    const at = sites.get(c.id) ?? [];
    const where = at.length ? at.slice(0, 2).map((s) => `\`${s}\``).join(', ') : '`ui-sounds.ts`';
    return `| \`${c.id}\` | ${c.trigger} | ${c.description} | ${c.length} | ${where} |`;
  })
  .join('\n')}
`;
}).join('\n')}
---

## Where every file came from

All ${packs.length} packs are CC0 1.0 (public domain) by Kenney — ${packs.join(', ')}.

| Cue | File | Original | Pack |
| --- | --- | --- | --- |
${CUES.map((c) => {
  const cr = creditOf.get(c.id)!;
  return `| \`${c.id}\` | \`${cr.file}\` | \`${cr.original}\` | [${cr.pack}](${cr.source}) |`;
}).join('\n')}

---

## Volume

Two channels, two sliders, both persisted:

- **Effects** — everything in this document.
- **Music** — the tracks in \`MUSIC_BRIEF.md\`, dropped into \`src/ui/music/files/\`.

They are separate because they are separate problems. A player who wants the
battle track down usually still wants to hear a shot land, and one slider
forces them to choose. Muting is a third control and mutes both.
`;

writeFileSync('docs/AUDIO.md', doc, 'utf8');
console.log(`wrote docs/AUDIO.md — ${total} cues across ${GROUPS.length} groups, ${packs.length} packs`);
