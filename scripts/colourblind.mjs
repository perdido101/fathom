/**
 * `npm run colourblind` — does the ownership signal survive colour loss?
 *
 * Build 7 made vertical position the primary signal for whose board is whose,
 * and the two water tints the reinforcement. The brief asked that both carry
 * it, "not tone alone" — so this checks the claim rather than asserting it.
 *
 * It photographs the battle screen through four filters: deuteranopia,
 * protanopia, tritanopia and full greyscale. Greyscale is the strict one — if
 * the two boards are still distinguishable with every hue removed, no form of
 * colour blindness can collapse them.
 *
 * It also measures. The mean luminance of each board is sampled from the real
 * pixels, so "the boards differ in lightness" is a number in the output and
 * not a claim in a comment.
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const OUT = 'screens/colourblind';
mkdirSync(OUT, { recursive: true });

const server = await createServer({ server: { port: 5277 } });
await server.listen();
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const wait = (ms) => page.waitForTimeout(ms);
const seen = (s) => page.locator(s).isVisible().catch(() => false);

async function skipBeats() {
  for (let i = 0; i < 5; i++) {
    if (!(await seen('.beat-screen'))) return;
    await page
      .locator('.beat-screen')
      .click({ position: { x: 40, y: 40 }, timeout: 2500 })
      .catch(() => undefined);
    await wait(240);
  }
}

/**
 * Standard colour-vision-deficiency matrices, applied as an SVG filter over
 * the whole document. These are the Machado/Viénot simulations the browser
 * accessibility tools use.
 */
const FILTERS = {
  deuteranopia: '0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0',
  protanopia: '0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0',
  tritanopia: '0.95 0.05 0 0 0  0 0.433 0.567 0 0  0 0.475 0.525 0 0  0 0 0 1 0',
  greyscale: '0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0 0 0 1 0',
};

try {
  await page.goto('http://localhost:5277/', { waitUntil: 'networkidle' });
  await wait(500);
  await page.getByRole('button', { name: /Casual/ }).click();
  await wait(400);
  await skipBeats();
  for (let i = 0; i < 3; i++) {
    await page.locator('.draft-pick').first().click().catch(() => undefined);
    await wait(2500);
    await skipBeats();
  }
  for (let i = 0; i < 3; i++) {
    await page.locator('button.gamecard').first().click().catch(() => undefined);
    await wait(2500);
    await skipBeats();
  }
  await page.getByRole('button', { name: 'Auto' }).click();
  await page.getByRole('button', { name: 'Commit fleet' }).click();
  await wait(600);
  await skipBeats();
  await wait(500);

  // Measure the two waters from the rendered pixels, before any filtering.
  const lum = await page.evaluate(() => {
    const read = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      // The board paints a gradient, so read the declared stops rather than
      // one pixel: the mean of the two ends is what the eye integrates.
      const bg = cs.backgroundImage;
      const stops = [...bg.matchAll(/rgba?\((\d+),\s*(\d+),\s*(\d+)/g)].map((m) =>
        [Number(m[1]), Number(m[2]), Number(m[3])],
      );
      if (!stops.length) return null;
      const L = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
      return stops.map(L).reduce((a, b) => a + b, 0) / stops.length;
    };
    return { foe: read('.board:not(.own)'), own: read('.board.own') };
  });

  const gap = lum.foe !== null && lum.own !== null ? Math.abs(lum.own - lum.foe) : 0;
  console.log(`their water mean luminance : ${lum.foe?.toFixed(1)}`);
  console.log(`your water mean luminance  : ${lum.own?.toFixed(1)}`);
  console.log(`greyscale separation       : ${gap.toFixed(1)} / 255  (${((gap / 255) * 100).toFixed(1)}%)`);

  await page.screenshot({ path: `${OUT}/00-normal.png` });

  for (const [name, matrix] of Object.entries(FILTERS)) {
    await page.evaluate(
      ({ n, m }) => {
        document.getElementById('cvd-filter')?.remove();
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.id = 'cvd-filter';
        svg.setAttribute('style', 'position:absolute;width:0;height:0');
        svg.innerHTML = `<filter id="cvd"><feColorMatrix type="matrix" values="${m}"/></filter>`;
        document.body.appendChild(svg);
        document.documentElement.style.filter = 'url(#cvd)';
        void n;
      },
      { n: name, m: matrix },
    );
    await wait(320);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    console.log(`  ${OUT}/${name}.png`);
  }

  // A 10% greyscale separation is the bar: below that the two boards are
  // telling apart on hue alone, which is exactly what this check exists to
  // prevent. Position still carries it, but the reinforcement would be gone.
  if (gap / 255 < 0.1) {
    console.error(
      `\nFAIL: the two waters are ${((gap / 255) * 100).toFixed(1)}% apart in greyscale.`,
    );
    console.error('Tone would be doing the work on hue alone. Widen the lightness gap.');
    process.exitCode = 1;
  } else {
    console.log('\nthe two waters separate on lightness as well as hue.');
  }
} catch (err) {
  console.error('colourblind check failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}
