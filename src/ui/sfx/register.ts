import { CUES, Sound } from './SoundManager';

/**
 * Attach the real audio files to the cue list.
 *
 * This lives in its own module — imported only from main.tsx — because
 * `import.meta.glob` is a Vite construct: the manifest and inventory scripts
 * import the cue list under plain Node and must never touch it. The glob is
 * eager and `?url`, so every cue ships in the bundle and registration is a
 * lookup, not a fetch.
 */
const urls = import.meta.glob('./files/*.ogg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

for (const { id } of CUES) {
  const url = urls[`./files/${id}.ogg`];
  if (url) Sound.register(id, url);
  else console.warn(`[sfx] no audio file for cue "${id}" — run npm run audio`);
}
