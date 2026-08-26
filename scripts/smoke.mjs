/**
 * A real browser plays a real match, at desktop size.
 *
 * Clicks through the menu, both drafts, deployment and a full battle to the
 * result screen, then walks every other screen. Fails on any console error.
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ server: { port: 5199 } });
await server.listen();

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

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

const click = (name, opts) => page.getByRole('button', { name, ...opts }).click();
const wait = (ms) => page.waitForTimeout(ms);

try {
  await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
  await wait(500);
  await shot('01-menu');

  await click('How to play');
  for (let i = 0; i < 3; i++) await click('Next');
  await shot('02-howto');
  await click('Done');
  await wait(300);

  // Casual: straight into the ship draft.
  await page.getByRole('button', { name: /Casual/ }).click();
  await wait(400);
  await shot('03-shipdraft');

  for (let i = 0; i < 3; i++) {
    await page.locator('.draft-pick').first().click();
    await wait(1600);
  }
  await wait(300);
  await shot('04-carddraft');
  for (let i = 0; i < 3; i++) {
    await page.locator('.draft-pick button, button.gamecard').first().click();
    await wait(1600);
  }
  await wait(300);
  await shot('05-deploy');

  await click('Auto');
  await click('Commit fleet');
  await wait(400);
  await shot('06-battle');

  for (let round = 0; round < 24; round++) {
    const live = await page.locator('.board .cell').first().isVisible();
    if (!live) break;
    await page.locator('.board').first().locator('.cell').nth((round * 3 + 1) % 36).click();
    await wait(150);
    await page.getByRole('button', { name: 'Charge', exact: true }).first().click();
    await wait(150);
    if (round === 0) await shot('06b-planned');
    const commit = page.getByRole('button', { name: /^COMMIT/ });
    if (!(await commit.isVisible())) {
      console.log(`round ${round}: no commit button — stopping`);
      break;
    }
    if (!(await commit.isEnabled())) {
      console.log(`round ${round}: commit disabled — stopping`);
      break;
    }
    await commit.click();
    await wait(250);
    const overlay = page.locator('.overlay');
    if (await overlay.isVisible()) await overlay.click();
    await wait(300);
    if (round === 1) await shot('07-midbattle');
    if (await page.getByRole('button', { name: 'REMATCH' }).isVisible()) {
      console.log(`match ended after ${round + 1} rounds`);
      break;
    }
  }
  await shot('08-result');

  const verified = await page.getByText('Replay verified').isVisible().catch(() => false);
  console.log(`result screen replay check: ${verified ? 'verified' : 'NOT SHOWN'}`);
  if (!verified) errors.push('result screen did not report a verified replay');

  await click('Menu');
  await wait(300);
  await click('Leaderboard');
  await shot('09-leaderboard');
  await click('Back');
  await click('Season', { exact: true });
  await shot('10-season');
  await click('Back');
  await click('Settings');
  await shot('11-settings');
  await click('Art credits and licences');
  await shot('12-credits');
  await click('back');
  await wait(200);
  await click('Back');
  await page.getByRole('button', { name: /Pick a table/ }).click();
  await wait(300);
  await shot('13-arena');
} catch (err) {
  errors.push(`smoke aborted: ${err instanceof Error ? err.message.split('\n')[0] : err}`);
} finally {
  const failed = errors.filter((e) => !e.includes('favicon') && !e.includes('fonts.googleapis'));
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
