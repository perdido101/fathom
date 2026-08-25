/**
 * A real browser plays a real match.
 *
 * Unit tests prove the rules; this proves the app. It clicks through every
 * screen in order — menu, both drafts, deployment, several battle rounds — and
 * fails on any console error along the way, which is the cheapest way to catch
 * the class of bug that only appears once React, the store and the engine are
 * all in the same process.
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ server: { port: 5199 } });
await server.listen();

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 414, height: 896 } });

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));

const shots = [];
async function shot(name) {
  const path = `sim-out/${name}.png`;
  await page.screenshot({ path });
  shots.push(path);
}

try {
  await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
  await shot('01-menu');

  await page.getByRole('button', { name: 'How to play' }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'next' }).click();
  await shot('02-howto');
  await page.getByRole('button', { name: 'done' }).click();

  await page.getByRole('button', { name: 'Casual' }).click();
  await page.waitForTimeout(300);
  await shot('03-shipdraft');

  // Three ship packs.
  for (let i = 0; i < 3; i++) {
    await page.locator('.card-surface.row').first().click();
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(400);
  await shot('04-carddraft');

  // Three card packs.
  for (let i = 0; i < 3; i++) {
    await page.locator('.grid4 button').first().click();
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(400);
  await shot('05-deploy');

  await page.getByRole('button', { name: 'auto' }).click();
  await page.getByRole('button', { name: 'commit fleet' }).click();
  await page.waitForTimeout(400);
  await shot('06-battle');

  // Play the match out, so the result screen and its replay check are
  // exercised too, not just the first few rounds.
  for (let round = 0; round < 24; round++) {
    const live = await page.locator('.board .cell').first().isVisible();
    if (!live) break;
    await page.locator('.board').first().locator('.cell').nth(round * 3 + 1).click();
    // Aiming the free shot rewrites the prompt line, which reflows the buttons
    // underneath it. Let the layout settle before reaching for one.
    await page.waitForTimeout(150);
    // Note the exact match: card text contains the word "charges", so a
    // substring match on the accessible name hits the card, not the button.
    await page.getByRole('button', { name: 'charge', exact: true }).first().click();
    await page.waitForTimeout(150);
    if (round === 0) await shot('06b-planned');
    const commit = page.getByRole('button', { name: /^commit/ });
    if (!(await commit.isVisible())) {
      console.log(`round ${round}: no commit button — stopping`);
      break;
    }
    if (!(await commit.isEnabled())) {
      console.log(`round ${round}: commit disabled — stopping`);
      break;
    }
    await commit.click();
    // Walk through the resolve overlay.
    await page.waitForTimeout(200);
    const overlay = page.locator('.overlay');
    if (await overlay.isVisible()) await overlay.click();
    await page.waitForTimeout(300);
    if (round === 1) await shot('07-midbattle');
    if (await page.getByRole('button', { name: 'REMATCH' }).isVisible()) {
      console.log(`match ended after ${round + 1} rounds`);
      break;
    }
  }
  await shot('08-result');

  const verified = await page.getByText('replay verified').isVisible().catch(() => false);
  console.log(`result screen replay check: ${verified ? 'verified' : 'NOT SHOWN'}`);
  if (!verified) errors.push('result screen did not report a verified replay');

  await page.getByRole('button', { name: 'menu' }).click();
  await page.getByRole('button', { name: 'Leaderboard' }).click();
  await shot('09-leaderboard');
  await page.getByRole('button', { name: 'back' }).click();
  await page.getByRole('button', { name: 'Season' }).click();
  await shot('10-season');
  await page.getByRole('button', { name: 'back' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await shot('11-settings');
  await page.getByRole('button', { name: 'back' }).click();
  await page.getByRole('button', { name: 'Arena' }).click();
  await shot('12-queue');
} finally {
  const failed = errors.filter((e) => !e.includes('favicon'));
  console.log(`screenshots: ${shots.join(', ')}`);
  if (failed.length) {
    console.error(`\n${failed.length} console error(s):`);
    for (const e of failed.slice(0, 10)) console.error(`  ${e}`);
  } else {
    console.log('no console errors.');
  }
  await browser.close();
  await server.close();
  process.exit(failed.length ? 1 : 0);
}
