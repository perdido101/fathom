/**
 * A screenshot of every screen, at a real phone size.
 *
 * This walks the whole game once and photographs each screen in a state worth
 * looking at — the battle screen with a plan half-built rather than empty, the
 * resolve overlay caught mid-beat rather than after it, the menu both before
 * and after a first match, since they are deliberately different.
 *
 * Output goes to `screens/`, numbered in the order a player meets them.
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, rmSync } from 'node:fs';

const OUT = 'screens';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const server = await createServer({ server: { port: 5233 } });
await server.listen();

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
// A common mid-range phone. The layout is built for 9:16 portrait and this is
// the size the brief asks it to survive.
const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

const taken = [];
async function shot(name, note) {
  const file = `${OUT}/${name}.png`;
  await page.screenshot({ path: file });
  taken.push({ file, note });
  console.log(`  ${file.padEnd(34)} ${note}`);
}

const click = (name, opts) => page.getByRole('button', { name, ...opts }).click();
const wait = (ms) => page.waitForTimeout(ms);

try {
  await page.goto('http://localhost:5233/', { waitUntil: 'networkidle' });
  await wait(500);
  await shot('01-menu-first-run', 'first run: one button in, no wallet mentioned');

  await click(/learn the rules first/);
  await wait(300);
  await shot('02-howto-charging', 'how to play 1/4 — charging, live cards');
  await click('next');
  await wait(250);
  await shot('03-howto-firing', 'how to play 2/4 — firing destroys the card');
  await click('next');
  await wait(250);
  await shot('04-howto-simultaneous', 'how to play 3/4 — both plans resolve at once');
  await click('next');
  await wait(250);
  await shot('05-howto-sinks', 'how to play 4/4 — a sink announces a length');
  await click('done');
  await wait(300);

  await click(/^PLAY/);
  await wait(600);
  await shot('06-ship-draft', 'ship draft — pack of four, both players see it');

  // Collide on purpose so the moment gets photographed.
  const firstShip = page.locator('.card-surface.row').first();
  await firstShip.click();
  await wait(160);
  await shot('07-draft-collision', 'the collision reveal — the only thing a draft leaks');
  await wait(1400);
  for (let i = 0; i < 2; i++) {
    await page.locator('.card-surface.row').first().click();
    await wait(1600);
  }
  await wait(400);
  await shot('08-card-draft', 'card draft — same mechanism, twelve-card pool');

  for (let i = 0; i < 3; i++) {
    await page.locator('.grid4 button').first().click();
    await wait(1600);
  }
  await wait(400);
  await shot('09-deployment', 'deployment — orthogonal only, hulls may touch');

  await click('auto');
  await wait(200);
  await shot('10-deployment-placed', 'fleet placed, ready to commit as a hash');
  await click('commit fleet');
  await wait(500);
  await shot('11-battle-empty', 'battle — their water dominant, charges loudest');

  // Build a real plan so the screen is photographed doing something.
  await page.locator('.board').first().locator('.cell').nth(8).click();
  await wait(200);
  await page.getByRole('button', { name: 'charge', exact: true }).first().click();
  await wait(260);
  await shot('12-battle-planned', 'a plan half-built: free shot aimed, a card charged');

  // Aim a card, to photograph the targeting state.
  const fire = page.getByRole('button', { name: 'fire', exact: true }).first();
  if (await fire.isEnabled().catch(() => false)) {
    await fire.click();
    await wait(200);
    await page.locator('.board').first().locator('.cell').nth(14).click();
    await wait(200);
    await shot('13-battle-targeting', 'targeting a card — prompt says what the next tap does');
    const lock = page.getByRole('button', { name: 'lock in' });
    if (await lock.isEnabled().catch(() => false)) await lock.click();
    else await page.getByRole('button', { name: 'cancel' }).click();
    await wait(200);
  }

  await page.getByRole('button', { name: /^commit/ }).click();
  await wait(700);
  await shot('14-resolve-overlay', 'the resolve sequence, caught mid-beat');
  await wait(1200);
  await shot('15-resolve-shots', 'attacks resolving, plain language, hit and miss by shape');

  // Play the match out to reach the result screen.
  const overlay = page.locator('.overlay');
  if (await overlay.isVisible().catch(() => false)) await overlay.click();
  await wait(400);
  for (let round = 0; round < 24; round++) {
    if (await page.getByRole('button', { name: 'REMATCH' }).isVisible().catch(() => false)) break;
    const cell = page.locator('.board').first().locator('.cell').nth((round * 5 + 3) % 36);
    await cell.click().catch(() => undefined);
    await wait(140);
    await page
      .getByRole('button', { name: 'charge', exact: true })
      .first()
      .click()
      .catch(() => undefined);
    await wait(140);
    const commit = page.getByRole('button', { name: /^commit/ });
    if (!(await commit.isEnabled().catch(() => false))) break;
    await commit.click();
    await wait(250);
    if (await overlay.isVisible().catch(() => false)) await overlay.click();
    await wait(250);
  }
  await wait(400);
  await shot('16-result', 'result — both fleets revealed, replay verified, one-tap rematch');

  await click('menu');
  await wait(400);
  await shot('17-menu-returning', 'the menu after a first match: modes and rating appear');

  await click('Leaderboard');
  await wait(300);
  await shot('18-leaderboard', 'leaderboard — payout curve and live pot');
  await click('back');
  await wait(200);

  await click('Season');
  await wait(300);
  await shot('19-season', 'season — days left, projected payout, match history');
  await click('back');
  await wait(200);

  await click('Settings');
  await wait(300);
  await shot('20-settings', 'settings — wallet, sound, fast resolve, opponent strength');

  await click(/Art credits/);
  await wait(300);
  await shot('21-credits', 'credits — the attribution the icon licence requires');
  await click('back');
  await wait(200);
  await click('back');
  await wait(200);

  await click('Arena');
  await wait(400);
  await shot('22-queue-arena', 'arena — stake tiers, pot, rake, provisional lock');
} finally {
  const failed = errors.filter((e) => !e.includes('favicon'));
  console.log(`\n${taken.length} screens captured into ${OUT}/`);
  if (failed.length) {
    console.error(`${failed.length} console error(s):`);
    for (const e of failed.slice(0, 8)) console.error(`  ${e}`);
  } else {
    console.log('no console errors.');
  }
  await browser.close();
  await server.close();
  process.exit(failed.length ? 1 : 0);
}
