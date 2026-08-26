/**
 * Short WebM clips of the moments screenshots cannot show.
 *
 * Each clip records its own browser context, so the videos are naturally
 * short rather than trimmed — there is no ffmpeg in this environment. The
 * sink and card-fire clips read the enemy fleet through the dev-only store
 * handle so the shots land on camera; that is staging, not gameplay — the
 * engine underneath is untouched.
 *
 * The prediction trigger is not captured: it needs the bot to fire into a
 * Mirror read, which cannot be staged deterministically from outside. Its
 * behaviour is pinned by engine tests and the resolve overlay beat was
 * verified by eye; documented in FUNCTIONAL_AUDIT.md.
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, rmSync, readdirSync, renameSync, statSync } from 'node:fs';

const OUT = 'clips';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const server = await createServer({ server: { port: 5244 } });
await server.listen();
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});

const errors = [];

async function record(name, drive) {
  const dir = `${OUT}/.rec-${name}`;
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir, size: { width: 1280, height: 720 } },
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e}`));
  try {
    await page.goto('http://localhost:5244/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    await drive(page);
  } catch (err) {
    errors.push(`${name}: ${err instanceof Error ? err.message.split('\n')[0] : err}`);
  }
  await context.close();
  const file = readdirSync(dir).find((f) => f.endsWith('.webm'));
  if (file) {
    renameSync(`${dir}/${file}`, `${OUT}/${name}.webm`);
    const kb = Math.round(statSync(`${OUT}/${name}.webm`).size / 1024);
    console.log(`  ${name}.webm  ${kb} KB`);
  }
  rmSync(dir, { recursive: true, force: true });
}

const click = (page, name, opts) => page.getByRole('button', { name, ...opts }).click();

/** Cells of the enemy's ships, via the dev store handle. Staging, not play. */
const enemyCells = (page) =>
  page.evaluate(() => {
    const ms = window.__store.getState().match;
    return ms ? ms.players[1].ships.flatMap((s) => s.cells) : [];
  });

async function intoBattle(page) {
  await page.getByRole('button', { name: /Casual/ }).click();
  await page.waitForTimeout(300);
  for (let i = 0; i < 3; i++) {
    await page.locator('.draft-pick').first().click();
    await page.waitForTimeout(1600);
  }
  for (let i = 0; i < 3; i++) {
    await page.locator('button.gamecard').first().click();
    await page.waitForTimeout(1600);
  }
  await click(page, 'Auto');
  await click(page, 'Commit fleet');
  await page.waitForTimeout(400);
}

async function playAimedRound(page, cells, chargeFirst = true) {
  // Every step is best-effort: the match can end under the camera, and a
  // finished clip beats a perfect drive that times out.
  const t = { timeout: 6000 };
  await page.locator('.board').first().locator('.cell').nth(cells[0]).click(t).catch(() => undefined);
  await page.waitForTimeout(150);
  if (chargeFirst) {
    await page
      .getByRole('button', { name: 'Charge', exact: true })
      .first()
      .click(t)
      .catch(() => undefined);
  }
  await page.getByRole('button', { name: /^COMMIT/ }).click(t).catch(() => undefined);
  // Let the resolve overlay play out on camera.
  await page.waitForTimeout(4200);
  const overlay = page.locator('.overlay');
  if (await overlay.isVisible().catch(() => false)) await overlay.click().catch(() => undefined);
  await page.waitForTimeout(400);
}

console.log('recording clips at 1280x720 …');

// 1. A screen transition: menu -> arena tiers -> back -> tournament tiers.
await record('screen-transition', async (page) => {
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /Arena/ }).click();
  await page.waitForTimeout(1100);
  await click(page, 'Back');
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: /Tournament/ }).click();
  await page.waitForTimeout(1100);
});

// 2. The draft collision beat. Pack A always holds Warhead and the bot
// values it highest, so picking it collides.
await record('draft-collision', async (page) => {
  await page.getByRole('button', { name: /Casual/ }).click();
  await page.waitForTimeout(400);
  await page.locator('.draft-pick', { hasText: 'Warhead' }).first().click();
  await page.waitForTimeout(2000);
});

// 3. A card firing with its hits landing — aimed at real hull.
await record('card-fire-hits', async (page) => {
  await intoBattle(page);
  const cells = await enemyCells(page);
  // Round 1: charge Salvo-or-whatever sits first; free shot onto hull.
  await playAimedRound(page, cells);
  // Round 2: fire the charged card at hull cells.
  const t = { timeout: 6000 };
  await page.locator('.board').first().locator('.cell').nth(cells[1]).click(t).catch(() => undefined);
  await page.waitForTimeout(150);
  const fire = page.getByRole('button', { name: 'Fire', exact: true }).first();
  if (await fire.isEnabled().catch(() => false)) {
    await fire.click(t).catch(() => undefined);
    await page.waitForTimeout(200);
    await page.locator('.board').first().locator('.cell').nth(cells[2]).click(t).catch(() => undefined);
    await page.waitForTimeout(150);
    const lock = page.getByRole('button', { name: 'Lock in' });
    if (await lock.isVisible().catch(() => false)) await lock.click().catch(() => undefined);
  }
  await page
    .getByRole('button', { name: 'Charge', exact: true })
    .first()
    .click(t)
    .catch(() => undefined);
  await page.getByRole('button', { name: /^COMMIT/ }).click(t).catch(() => undefined);
  await page.waitForTimeout(5200);
});

// 4. A sink: hammer the shortest enemy ship's cells with the free shot.
await record('ship-sink', async (page) => {
  await intoBattle(page);
  const shortShip = await page.evaluate(() => {
    const ms = window.__store.getState().match;
    const ships = ms.players[1].ships.slice().sort((a, b) => a.cells.length - b.cells.length);
    return ships[0].cells;
  });
  for (const cell of shortShip) {
    await playAimedRound(page, [cell]);
    const done = await page
      .getByRole('button', { name: 'REMATCH' })
      .isVisible()
      .catch(() => false);
    if (done) break;
  }
});

await browser.close();
await server.close();
const failed = errors.filter((e) => !e.includes('favicon'));
console.log(failed.length ? `${failed.length} problem(s):` : 'clips recorded cleanly.');
for (const e of failed) console.log(`  ${e}`);
process.exit(failed.length ? 1 : 0);
