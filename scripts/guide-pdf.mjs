/**
 * Print SCREEN_GUIDE.html to PDF, and grab two proof shots so the callout
 * pins can be checked against the screens they annotate.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
page.on('pageerror', (e) => console.error('PAGE ERROR', String(e)));
await page.goto(pathToFileURL('/home/user/fathom/SCREEN_GUIDE.html').href, {
  waitUntil: 'load',
});
await page.evaluate(async () => {
  // Force every lazy image in before printing.
  for (const img of Array.from(document.images)) img.loading = 'eager';
  await Promise.all(
    Array.from(document.images).map((i) =>
      i.complete ? Promise.resolve() : new Promise((r) => i.addEventListener('load', r, { once: true })),
    ),
  );
  await document.fonts.ready;
});
await page.waitForTimeout(1200);

// Proof shots, so a regeneration can be eyeballed without opening 66 pages.
await page.screenshot({ path: 'sim-out/guide-top.png' });
for (const [sel, name] of [
  ['#plate-24', 'guide-battle'],
  ['#plate-01', 'guide-menu'],
  ['#plate-spread', 'guide-spread'],
  ['#plate-31', 'guide-explainer'],
  ['#tells', 'guide-chapter'],
]) {
  const el = await page.$(sel);
  if (el) await el.screenshot({ path: `sim-out/${name}.png` });
}
// Every pinned plate's figure, so a regeneration can be checked for pins
// that landed on top of the thing they name — the failure mode this guide
// has produced twice now.
mkdirSync('sim-out/pins', { recursive: true });
for (const fig of await page.$$('.plate.has-pins figure.shot')) {
  const id = await fig.evaluate((el) => el.closest('.plate').id);
  await fig.screenshot({ path: `sim-out/pins/${id}.png` });
}

await page.emulateMedia({ media: 'print' });
await page.pdf({
  path: 'Shadow-Armada-Screen-Guide.pdf',
  format: 'A4',
  landscape: true,
  printBackground: true,
  margin: { top: '13mm', bottom: '13mm', left: '13mm', right: '13mm' },
});
console.log('pdf written');
await browser.close();
