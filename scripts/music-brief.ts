import { writeFileSync } from 'node:fs';
import { TRACKS, type TrackId } from '../src/ui/music/MusicManager';

/**
 * `npm run music:brief` — MUSIC_BRIEF.md, generated.
 *
 * The filenames, drop paths, lengths and size ceilings come from
 * `MusicManager.ts`, which is the list the game actually loads. The prompts
 * and the direction are authored here. A track added to the manager with no
 * entry below fails this script, so the brief cannot silently fall behind the
 * pipeline.
 */

interface Direction {
  id: TrackId;
  title: string;
  /** Where it sits in the session, in one line. */
  role: string;
  /** The Suno prompt, ready to paste. */
  prompt: string;
  /** What it must not fight with. */
  against: string;
  /** What to reject in the generated output. */
  avoid: string[];
}

const DIRECTION: Direction[] = [
  {
    id: 'battle',
    title: 'Battle — the long one',
    role:
      'Runs for the whole match: twenty rounds of twenty seconds, up to about seven minutes. The player is doing arithmetic under a clock for every second of it.',
    prompt:
      '[instrumental] Restrained naval adventure underscore. Low sustained strings and a soft marimba ostinato over a slow tide of low brass. 96 BPM, 4/4, D minor. No drum kit, no percussion hits, no build-ups, no drops. Dynamics stay within a narrow band from start to finish — nothing swells, nothing resolves. Warm, spacious, patient, slightly tense. Loopable bed for a strategy game.',
    against:
      'The 20-second decision clock, the ticking under five seconds, and up to nine impacts landing in one round. This track is the floor those sit on and must never be the loudest thing in the mix.',
    avoid: [
      'Anything that builds. The game already has tension on a 20-second cycle, and a track building on its own schedule will disagree with the clock every single round — sometimes swelling as a player commits, sometimes falling silent as a match is decided.',
      'Percussion with a strong downbeat. It fights the tick and makes the clock harder to hear.',
      'A resolving cadence. Seven minutes in, a track that keeps arriving somewhere is exhausting; this one should sound like it could have started anywhere.',
      'Vocals of any kind, including wordless "ahs" — they read as a voice trying to say something during a phase where the game is already talking.',
    ],
  },
  {
    id: 'menu',
    title: 'Menu — the front door',
    role:
      'Main menu, leaderboard, season page, settings, credits. The first thing anyone hears, and the thing they hear while deciding whether to stake money.',
    prompt:
      '[instrumental] Bright optimistic naval arcade theme. Plucked strings and glockenspiel over warm brass swells and a gentle shuffle. 112 BPM, 4/4, G major. Confident and inviting, sunny rather than grand. Light, clean production. Loopable.',
    against:
      'Nothing much — this is the one screen with no clock. It can be the loudest track in the set.',
    avoid: [
      'Fanfare. The menu is not an achievement; the champion screen is.',
      'Anything so catchy that it grates on the twentieth session.',
      'Vocals.',
    ],
  },
  {
    id: 'draft',
    title: 'Draft — choosing in the dark',
    role:
      'Both drafts. Blind simultaneous picking with a short timer per pack; the player is guessing what the opponent wants.',
    prompt:
      '[instrumental] Curious, conspiratorial underscore. Pizzicato strings, muted vibraphone and a light hand-percussion pulse. 104 BPM, 4/4, A minor. Playful with an undercurrent of doubt. Sparse arrangement, lots of air between notes. Loopable.',
    against:
      'The five-beat pick sequence — cards dealing in, your pick lifting, their card back sliding in, the collision. Those are the drama; this is the room they happen in.',
    avoid: [
      'Big statements. Every 20 seconds something lands on top of this track and it must leave room.',
      'A pulse fast enough to feel like a countdown. The draft timer is generous and the music should not make it feel otherwise.',
      'Vocals.',
    ],
  },
  {
    id: 'deploy',
    title: 'Deploy — the last private decision',
    role:
      'One screen, one decision, sixty seconds. The layout is hashed on commit and cannot be changed for the rest of the match.',
    prompt:
      '[instrumental] Quiet, deliberate, slightly ceremonial. Solo cello and sustained low strings with a distant brass pad. 76 BPM, 4/4, D minor. Still and weighty. Almost no melody — this is atmosphere for a decision. Loopable.',
    against: 'Nothing. This is the quietest screen in the game and the track should keep it that way.',
    avoid: [
      'Momentum of any kind. Nothing here should feel like it is running out.',
      'Melody strong enough to remember. It plays for a minute and returns every match.',
      'Vocals.',
    ],
  },
  {
    id: 'bracket',
    title: 'Bracket — eight seats, one pot',
    role:
      'The tournament bracket and the forming screen. The player is waiting, watching seats fill, and looking at a payout curve.',
    prompt:
      '[instrumental] Anticipatory tournament underscore. Steady low strings, a repeating brass motif, and a slow snare pulse well back in the mix. 100 BPM, 4/4, C minor. Formal, expectant, a competition about to start. Loopable.',
    against:
      'Chips stacking as seats fill, and the round-win sting between matches. It should thin out rather than compete.',
    avoid: [
      'Triumph. Nothing has been won yet, and three of the eight listening to this will finish with nothing.',
      'A long silence at the loop point — this screen can be open for minutes at a time.',
      'Vocals.',
    ],
  },
  {
    id: 'victory',
    title: 'Victory — under the slam',
    role:
      'Starts under the VICTORY banner and carries into the result screen. Not looped: it plays once and ends.',
    prompt:
      '[instrumental] Short triumphant naval sting resolving into a warm settled outro. Full brass hit, timpani roll, then strings settling on a major chord and holding. 24 seconds. D major. Resolved, earned, generous rather than boastful.',
    against:
      'The victory sound cue, which lands in the same instant. The cue is the punctuation; this is the sentence after it, so the first second should be nearly empty.',
    avoid: [
      'A long build before the payoff — the banner is already on screen when this starts.',
      'Ending abruptly. It should settle, because the player is reading a settlement receipt over the top of it.',
      'Vocals.',
    ],
  },
  {
    id: 'defeat',
    title: 'Defeat — built as carefully as the win',
    role:
      'Starts under the DEFEAT banner and carries into the result screen. Not looped.',
    prompt:
      '[instrumental] Short unresolved naval sting settling into a quiet, dignified outro. The same motif as a victory theme but a fourth lower and left hanging — low brass, strings falling rather than rising, no cadence. 24 seconds. D minor. Sober, not miserable.',
    against: 'The defeat cue, in the same instant. Same rule: leave the first second nearly empty.',
    avoid: [
      'Comedy. A player has just lost money and a sad-trombone reading of that is contemptuous.',
      'Anything shorter or thinner than the victory track. Most players lose about half their matches, and a defeat that is audibly skimped reads as the product being embarrassed by it.',
      'Vocals.',
    ],
  },
  {
    id: 'champion',
    title: 'Champion — the loudest thing in the game',
    role: 'The champion screen, after winning a bracket final. Eight entered; this plays for one of them. Not looped.',
    prompt:
      '[instrumental] Full triumphant orchestral fanfare. Brass fanfare, timpani, cymbal swell, soaring strings, a final sustained major chord with a long tail. 32 seconds. D major, grand and cinematic. The biggest moment in the game.',
    against: 'Nothing. This is the one track allowed to be the loudest thing on screen.',
    avoid: [
      'Restraint. Every other track in this brief is asked to stay out of the way; this one is not.',
      'A short tail. The screen holds while the player reads what they won.',
      'Vocals.',
    ],
  },
];

const missing = TRACKS.filter((t) => !DIRECTION.some((d) => d.id === t.id));
if (missing.length) {
  console.error(`tracks with no direction written: ${missing.map((t) => t.id).join(', ')}`);
  process.exit(1);
}
const stale = DIRECTION.filter((d) => !TRACKS.some((t) => t.id === d.id));
if (stale.length) {
  console.error(`direction for tracks the manager does not have: ${stale.map((d) => d.id).join(', ')}`);
  process.exit(1);
}

const specOf = new Map(TRACKS.map((t) => [t.id, t]));
const totalKb = TRACKS.reduce((n, t) => n + t.maxKb, 0);

/** Ordered by impact: the two a player hears most, then the rest. */
const ORDER: TrackId[] = ['battle', 'menu', 'draft', 'deploy', 'bracket', 'victory', 'defeat', 'champion'];

const doc = `# ARMADA — music brief

Eight tracks, in the order worth generating them. Each one has a filename, a
drop path, a target length, a ready-to-paste Suno prompt, and a note on what
it must not fight with.

This file is **generated** by \`npm run music:brief\` from
\`src/ui/music/MusicManager.ts\` — the same list the game loads — so the
filenames and lengths here are the ones the pipeline actually expects.

---

## How to drop a track in

1. Generate it in Suno from the prompt below.
2. Export as MP3.
3. Save it as \`src/ui/music/files/<id>.mp3\`, named exactly for its id.
4. That is all. No registration, no code change, no build flag.

**A file that is there plays. A file that is not there is silence.** Never a
crash, and never a missing-asset warning — the same contract \`src/art/\` has
for illustration, for the same reason: the person making the assets should not
have to touch the game to add one.

You can drop them in one at a time. Seven silent screens and one scored one is
a valid state of the build.

---

## Two constraints worth knowing before you start

### Suno does not produce seamless loops

It generates songs, and a song has a beginning and an end. Played on repeat, a
track will audibly restart. Two ways this brief works around it, and the
prompts are written for both:

**Length.** The looping tracks are specified long enough that a player rarely
reaches the loop point — three minutes for battle, which covers most matches
outright. The game cross-fades at the seam (700ms) rather than cutting, which
disguises a lot.

**Structure.** Every looping prompt asks for a *bed* rather than a song: no
build, no drop, no resolving cadence, dynamics inside a narrow band. A track
that never arrives anywhere can restart almost anywhere. If a generation comes
back with a clear intro or a big ending, regenerate rather than trimming —
"nothing swells, nothing resolves" is the load-bearing phrase in those prompts.

**If you want to trim by hand:** cut on a bar line at least 8 bars after the
opening and at least 8 bars before the end, and pick two points with the same
instrumentation. Note where you cut in a comment in
\`src/ui/music/files/README.md\` so the next person can redo it.

### File size

Suno exports MP3 at song length, which is generous for a web bundle. Every
track ships in the build, so the ceilings below are real:

| Track | File | Target length | Ceiling |
| --- | --- | --- | --- |
${ORDER.map((id) => {
  const t = specOf.get(id)!;
  return `| ${DIRECTION.find((d) => d.id === id)!.title.split(' — ')[0]} | \`${id}.mp3\` | ${t.seconds}s${t.loops ? ', loops' : ', one-shot'} | ${(t.maxKb / 1000).toFixed(1)} MB |`;
}).join('\n')}

**Total budget: ${(totalKb / 1000).toFixed(1)} MB** for the full set. At 128 kbps
mono every track lands well inside its ceiling; at 320 kbps stereo the battle
track alone would blow it. **128 kbps mono is the right export setting** — this
is a browser game whose loudest sounds are 200ms impacts, and nobody is
listening to the underscore on headphones for its stereo field.

---

## The tracks

${ORDER.map((id) => {
  const d = DIRECTION.find((x) => x.id === id)!;
  const t = specOf.get(id)!;
  return `### ${d.title}

| | |
| --- | --- |
| **File** | \`src/ui/music/files/${id}.mp3\` |
| **Plays on** | ${t.where} |
| **Length** | ${t.seconds}s |
| **Loops?** | ${t.loops ? 'Yes — see the loop note above' : 'No. Plays once and ends.'} |
| **Ceiling** | ${(t.maxKb / 1000).toFixed(1)} MB |

${d.role}

**Suno prompt** — paste as-is:

\`\`\`
${d.prompt}
\`\`\`

**Must not fight with:** ${d.against}

**Reject a generation that has:**

${d.avoid.map((a) => `- ${a}`).join('\n')}
`;
}).join('\n---\n\n')}

---

## Why \`[instrumental]\` is on every prompt

Vocals are wrong everywhere in this product, and not as a matter of taste. The
game talks to the player constantly — a named line when a REACT fires, a
resolve overlay narrating each beat, a first-time card explaining a mechanic.
A voice in the music competes with the voice in the interface for the same
attention, and the interface's one is load-bearing.

Suno will add vocals unless told not to, so the tag stays even where the genre
would not normally imply them.

---

## What is not in this brief

**Sound effects.** ${'`docs/AUDIO.md`'} covers those — 53 cues, all sourced
from CC0 packs. Suno is the wrong tool for a 200ms impact, and effects and
music are separate problems with separate volume sliders in Settings.

**Ambience.** There is no sea-wash loop, no gull, no rigging creak. A sound in
this product maps to a discrete event the player caused or needs to notice,
and ambience is the one thing that reliably breaks that rule. The music is the
atmosphere; nothing else is.
`;

writeFileSync('MUSIC_BRIEF.md', doc, 'utf8');
console.log(`wrote MUSIC_BRIEF.md — ${TRACKS.length} tracks, ${(totalKb / 1000).toFixed(1)} MB budget`);
