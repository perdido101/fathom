/**
 * The drop-in art pipeline.
 *
 * A generated image dropped into `src/ui/art/drop/` under its manifest path —
 * `cards/salvo.png`, `ships/warhead/hero.png`, `ui/menu-bg.jpg` — is picked
 * up on the next build with no code change: every component that has real
 * art asks here first and falls back to its procedural treatment when the
 * answer is null. GEMINI_ASSETS.md is the worklist of exact filenames,
 * dimensions and prompts to generate against.
 *
 * Vite-only module: `import.meta.glob` does not exist under plain Node, so
 * the manifest and inventory scripts must never import this file.
 */
const files = import.meta.glob('./drop/**/*.{png,jpg,jpeg,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const byKey = new Map<string, string>();
for (const [path, url] of Object.entries(files)) {
  // './drop/cards/salvo.png' -> 'cards/salvo'
  const key = path
    .replace('./drop/', '')
    .replace(/\.(png|jpe?g|webp)$/i, '');
  byKey.set(key, url);
}

/** The URL of a dropped-in asset, or null when the procedural stand-in runs. */
export function artUrl(key: string): string | null {
  return byKey.get(key) ?? null;
}

/** How many real art files are in the build — the inventory reports it. */
export const DROPPED_IN = byKey.size;
