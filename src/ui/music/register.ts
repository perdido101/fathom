import { TRACKS, Music } from './MusicManager';

/**
 * Attach whatever music actually shipped.
 *
 * Same shape as `sfx/register.ts` and the same reason for living in its own
 * module: `import.meta.glob` is a Vite construct, and the manifest and doc
 * scripts import the track list under plain Node.
 *
 * The difference from the sound cues is the missing-file branch. A cue with no
 * file is a bug and warns; a *track* with no file is the expected state until
 * Aris has generated it, so this says nothing at all. File present → it plays.
 * File absent → silence. Never a crash.
 */
const urls = import.meta.glob('./files/*.{mp3,ogg}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

for (const { id } of TRACKS) {
  const url = urls[`./files/${id}.mp3`] ?? urls[`./files/${id}.ogg`];
  if (url) Music.register(id, url);
}
