/**
 * Bundle the built app into a single self-contained HTML file.
 *
 * Used for the hosted preview page, which runs under a strict CSP that blocks
 * every external request — so the JS, CSS and favicon are inlined and the
 * service-worker registration is dropped (there is nothing to install from a
 * single file, and the request would be blocked anyway).
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
const assets = join(dist, 'assets');

const files = readdirSync(assets);
const jsFile = files.find((f) => f.endsWith('.js'));
const cssFile = files.find((f) => f.endsWith('.css'));
if (!jsFile || !cssFile) throw new Error('Build output not found — run vite build first');

const js = readFileSync(join(assets, jsFile), 'utf8');
const css = readFileSync(join(assets, cssFile), 'utf8');

// Guard: the page must not reach for anything over the network.
for (const [name, src] of [['js', js], ['css', css]]) {
  if (/https?:\/\/(?!www\.w3\.org)/.test(src)) {
    console.warn(`warning: ${name} bundle references an absolute URL`);
  }
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#060A09">
<meta name="description" content="Fathom — a duel of depth and deduction.">
<title>Fathom</title>
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script type="module">${js}</script>
</body>
</html>
`;

mkdirSync('dist-standalone', { recursive: true });
writeFileSync('dist-standalone/fathom.html', html);
const kb = (html.length / 1024).toFixed(0);
console.log(`dist-standalone/fathom.html  ${kb} kB (self-contained)`);
