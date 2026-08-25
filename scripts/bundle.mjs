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

const script = readFileSync(join(dist, 'assets', js), 'utf8');
const style = readFileSync(join(dist, 'assets', css), 'utf8');

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
