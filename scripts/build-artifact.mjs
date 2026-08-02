/**
 * Build the hosted preview page.
 *
 * The host wraps the file in its own document skeleton, so this emits page
 * content only — a title, the inlined stylesheet, the mount point and the
 * inlined bundle. Everything is embedded because the page runs under a strict
 * CSP that blocks external requests; the service worker is dropped for the
 * same reason.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const assets = join('dist', 'assets');
const files = readdirSync(assets);
const jsFile = files.find((f) => f.endsWith('.js'));
const cssFile = files.find((f) => f.endsWith('.css'));
if (!jsFile || !cssFile) throw new Error('Build output not found — run vite build first');

const js = readFileSync(join(assets, jsFile), 'utf8');
const css = readFileSync(join(assets, cssFile), 'utf8');

// The host's wrapper supplies its own body; the app expects a full-height
// mount, so the shell is re-established here rather than assumed.
const shell = `
html, body { height: 100%; margin: 0; background: #060A09; }
#root { height: 100dvh; }
`;

const page = `<title>Fathom</title>
<style>${shell}${css}</style>
<div id="root"></div>
<script type="module">${js}</script>
`;

mkdirSync('dist-standalone', { recursive: true });
writeFileSync('dist-standalone/fathom-artifact.html', page);
console.log(`dist-standalone/fathom-artifact.html  ${(page.length / 1024).toFixed(0)} kB`);
