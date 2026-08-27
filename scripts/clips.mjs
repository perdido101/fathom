/**
 * Short WebM clips of the moments screenshots cannot show.
 *
 * Each clip records its own browser context, so the videos are naturally
 * short rather than trimmed — there is no ffmpeg in this environment. The
 * sink and card-fire clips read the enemy fleet through the dev-only store
 * handle so the shots land on camera; that is staging, not gameplay — the
 * engine underneath is untouched.
 *
 * Build 6 added three: the draft's five-beat sequence, the beats between
 * phases, and a round of the feedback layer working. All three are motion by
 * definition and a still frame can only hint at them.
 *
 * The prediction trigger is still not captured: it needs the bot to fire into
 * a Mirror read, which cannot be staged deterministically from outside. Its
 * behaviour is pinned by engine tests and its beat was verified by eye;
 * documented in FUNCTIONAL_AUDIT.md.
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
const seen = (page, sel) => page.locator(sel).isVisible().catch(() => false);

/** Step past every phase beat currently queued. */
async function skipBeats(page, limit = 5) {
  for (let i = 0; i < limit; i++) {
    if (!(await seen(page, '.beat-screen'))) return;
    await page
      .locator('.beat-screen')
      .click({ position: { x: 40, y: 40 }, timeout: 2000 })
      .catch(() => undefined);
    await page.waitForTimeout(240);
  }
}

/** Charge a card: since Build 6 the card itself is the charge control. */
async function chargeFirst(page) {
  await page.locator('.hand-slot .gamecard').first().click({ timeout: 4000 }).catch(() => undefined);
  await page.waitForTimeout(160);
}

/** Cells of the enemy's ships, via the dev store handle. Staging, not play. */
const enemyCells = (page) =>
  page.evaluate(() => {
    const ms = window.__store.getState().match;
    return ms ? ms.players[1].ships.flatMap((s) => s.cells) : [];
  });

async function draftPick(page, selector) {
  await page.locator(selector).first().click({ timeout: 6000 }).catch(() => undefined);
  await page.waitForTimeout(2500);
  await skipBeats(page);
}

async function intoBattle(page, { keepBeats = false } = {}) {
  await page.getByRole('button', { name: /Casual/ }).click();
  await page.waitForTimeout(400);
  if (!keepBeats) await skipBeats(page);
  for (let i = 0; i < 3; i++) await draftPick(page, '.draft-pick');
  await skipBeats(page);
  for (let i = 0; i < 3; i++) await draftPick(page, 'button.gamecard');
  await skipBeats(page);
  await click(page, 'Auto');
  await click(page, 'Commit fleet');
  await page.waitForTimeout(500);
  if (!keepBeats) await skipBeats(page);
}

async function playAimedRound(page, cells, charge = true) {
  // Every step is best-effort: the match can end under the camera, and a
  // finished clip beats a perfect drive that times out.
  const t = { timeout: 6000 };
  await skipBeats(page);
  await page.locator('.board').first().locator('.cell').nth(cells[0]).click(t).catch(() => undefined);
  await page.waitForTimeout(150);
  if (charge) await chargeFirst(page);
  await page.getByRole('button', { name: /^COMMIT/ }).click(t).catch(() => undefined);
  // Let the floaters and the resolve overlay play out on camera.
  await page.waitForTimeout(4200);
  const overlay = page.locator('.overlay').first();
  if (await overlay.isVisible().catch(() => false)) {
    await overlay.click({ position: { x: 30, y: 30 } }).catch(() => undefined);
  }
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

// 2. NEW — the beats between phases, at their natural pace. Nothing is
// skipped here: this is what a first-time player actually sees between
// pressing Play and firing a shot.
await record('phase-beats', async (page) => {
  await page.getByRole('button', { name: /Casual/ }).click();
  // Match found, then the ship-draft card, both at 1.5s.
  await page.waitForTimeout(3600);
  for (let i = 0; i < 3; i++) {
    await page.locator('.draft-pick').first().click({ timeout: 6000 }).catch(() => undefined);
    await page.waitForTimeout(2500);
  }
  // Fleet assembled, then the card-draft card.
  await page.waitForTimeout(3400);
  for (let i = 0; i < 3; i++) {
    await page.locator('button.gamecard').first().click({ timeout: 6000 }).catch(() => undefined);
    await page.waitForTimeout(2500);
  }
  // The deploy card.
  await page.waitForTimeout(1800);
  await click(page, 'Auto').catch(() => undefined);
  await click(page, 'Commit fleet').catch(() => undefined);
  // Both committed, sealing, then the battle card.
  await page.waitForTimeout(3600);
});

// 3. NEW — the draft's five beats: deal in, your pick lifts, their card back
// slides in, resolve, pack counter advances. Two picks, so the deal-in of the
// second pack is on camera too.
await record('draft-sequence', async (page) => {
  await page.getByRole('button', { name: /Casual/ }).click();
  await page.waitForTimeout(400);
  await skipBeats(page);
  await page.waitForTimeout(700);
  await page.locator('.draft-pick').first().click({ timeout: 6000 }).catch(() => undefined);
  await page.waitForTimeout(3000);
  await page.locator('.draft-pick').nth(1).click({ timeout: 6000 }).catch(() => undefined);
  await page.waitForTimeout(3000);
});

// 4. The collision beat. Pack A always holds Warhead and the bot values it
// highest, so picking it collides.
await record('draft-collision', async (page) => {
  await page.getByRole('button', { name: /Casual/ }).click();
  await page.waitForTimeout(400);
  await skipBeats(page);
  await page.waitForTimeout(600);
  await page.locator('.draft-pick', { hasText: 'Warhead' }).first().click().catch(() => undefined);
  await page.waitForTimeout(3000);
});

// 5. NEW — one round of the feedback layer: floaters rising off the cells
// that took the shots, and whatever named event the round produces.
await record('round-feedback', async (page) => {
  await intoBattle(page);
  const cells = await enemyCells(page);
  // Aim the free shot at real hull so a HIT is on camera, not just misses.
  await playAimedRound(page, [cells[0]]);
  await playAimedRound(page, [cells[1]]);
});

// 6. A card firing with its hits landing — aimed at real hull.
await record('card-fire-hits', async (page) => {
  await intoBattle(page);
  const cells = await enemyCells(page);
  await playAimedRound(page, cells);
  const t = { timeout: 6000 };
  await skipBeats(page);
  await page.locator('.board').first().locator('.cell').nth(cells[1]).click(t).catch(() => undefined);
  await page.waitForTimeout(150);
  // The Fire control appears on the hovered card, and only where it is legal.
  const slots = await page.locator('.hand-slot').count();
  for (let i = 0; i < slots; i++) {
    await page.locator('.hand-slot').nth(i).hover().catch(() => undefined);
    await page.waitForTimeout(240);
    const fire = page.getByRole('button', { name: /^Fire · / }).first();
    if (!(await fire.isVisible().catch(() => false))) continue;
    await fire.click(t).catch(() => undefined);
    await page.waitForTimeout(200);
    await page.locator('.board').first().locator('.cell').nth(cells[2]).click(t).catch(() => undefined);
    await page.waitForTimeout(150);
    const lock = page.getByRole('button', { name: 'Lock in' });
    if (await lock.isVisible().catch(() => false)) await lock.click().catch(() => undefined);
    break;
  }
  await chargeFirst(page);
  await page.getByRole('button', { name: /^COMMIT/ }).click(t).catch(() => undefined);
  await page.waitForTimeout(5200);
});

// 7. A sink: hammer the shortest enemy ship's cells with the free shot.
await record('ship-sink', async (page) => {
  await intoBattle(page);
  const shortShip = await page.evaluate(() => {
    const ms = window.__store.getState().match;
    const ships = ms.players[1].ships.slice().sort((a, b) => a.cells.length - b.cells.length);
    return ships[0].cells;
  });
  for (const cell of shortShip) {
    await playAimedRound(page, [cell]);
    if (await seen(page, 'text=PLAY AGAIN')) break;
  }
});

await browser.close();
await server.close();
const failed = errors.filter((e) => !e.includes('favicon'));
console.log(failed.length ? `${failed.length} problem(s):` : 'clips recorded cleanly.');
for (const e of failed) console.log(`  ${e}`);
process.exit(failed.length ? 1 : 0);
