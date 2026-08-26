/**
 * Inline the built app into one self-contained HTML file.
 *
 * The game has no server, no API and no external assets — all the art is drawn
 * in code — so the whole thing fits in a single file that runs from anywhere,
 * including hosts that block every outbound request. That makes it trivial to
 * hand someone a playable link.
 *
 * The output carries no <html>, <head> or <body> wrapper, because the host
 * that renders it supplies those.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
const assets = readdirSync(join(dist, 'assets'));
const js = assets.find((f) => f.endsWith('.js'));
const css = assets.find((f) => f.endsWith('.css'));
if (!js || !css) throw new Error('run `npm run build` first');

let script = readFileSync(join(dist, 'assets', js), 'utf8');
let style = readFileSync(join(dist, 'assets', css), 'utf8');

// Inline the assets the page actually reaches for: every sound cue, and the
// latin font subsets that cover the UI's text. The remaining font subsets
// (cyrillic, devanagari, …) keep their hashed URLs and fall back to the
// system stack on a host that cannot serve them — which a single-file host
// cannot, and that is fine: unicode-range means they are never requested for
// the text the game draws.
const MIME = {
  ogg: 'audio/ogg',
  woff2: 'font/woff2',
  woff: 'font/woff',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
};
let inlined = 0;
for (const f of assets) {
  const ext = f.split('.').pop();
  if (!MIME[ext] || f.endsWith('.map')) continue;
  const isAudio = ext === 'ogg';
  const isLatinFont = /-latin(-ext)?-\d+-normal-.*\.woff2$/.test(f);
  const isArt = ['svg', 'png', 'jpg', 'webp'].includes(ext);
  if (!isAudio && !isLatinFont && !isArt) continue;
  const data = readFileSync(join(dist, 'assets', f));
  const uri = `data:${MIME[ext]};base64,${data.toString('base64')}`;
  // The build uses relative asset URLs: url(./x.woff2) in CSS, "x.ogg"
  // strings in JS. Quote-delimited in JS so a hash can never partial-match.
  if (script.includes(`"${f}"`)) {
    script = script.split(`"${f}"`).join(`"${uri}"`);
    inlined += 1;
  }
  if (style.includes(`./${f}`)) {
    style = style.split(`./${f}`).join(uri);
    inlined += 1;
  }
}
console.log(`inlined ${inlined} assets (audio, latin fonts, dropped-in art)`);

mkdirSync('dist-single', { recursive: true });

const out = `<title>Shadow Armada</title>
<style>
${style}
/* The host page supplies the frame, so the app claims the whole viewport. */
html, body { height: 100%; margin: 0; background: #05080f; }
#root { height: 100dvh; }
</style>
<div id="root"></div>
<script type="module">
${script}
</script>
`;

writeFileSync('dist-single/shadow-armada.html', out, 'utf8');
console.log(`wrote dist-single/shadow-armada.html — ${(out.length / 1024).toFixed(0)} KB`);
