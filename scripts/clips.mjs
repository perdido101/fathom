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
 * Build 9 added three for the effects layer: a multi-cell volley, a sink, and
 * one that hunts the three rare effects — a REACT, a prediction landing and a
 * charge theft — across up to three real matches against the strongest bot.
 * What it caught is written to `clips-vfx.json` either way, because a clip
 * harness that quietly reports only its successes is not evidence.
 *
 * The prediction trigger is still not reliably captured: it needs the bot to fire into
 * a Mirror read, which cannot be staged deterministically from outside. Its
 * behaviour is pinned by engine tests and its beat was verified by eye;
 * documented in FUNCTIONAL_AUDIT.md.
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, rmSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';

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

/**
 * Fire a card: hover it, then take the one control it reveals.
 *
 * Which card is legal depends on what the draft handed you and how many
 * charges it holds, so this tries each in turn rather than assuming the
 * leftmost one can fire. Returns whether anything went off.
 */
async function fireFirst(page) {
  const count = await page.locator('.hand-slot').count();
  for (let i = 0; i < count; i++) {
    await page.locator('.hand-slot').nth(i).hover().catch(() => undefined);
    await page.waitForTimeout(220);
    const fire = page.getByRole('button', { name: /^Fire · / }).first();
    if (!(await fire.isVisible().catch(() => false))) continue;
    await fire.click().catch(() => undefined);
    await page.waitForTimeout(200);
    /*
     * A card that wants a target gets one — and not every card wants a cell.
     *
     * Siphon and Jam aim at the opponent's *cards*, not their water, and the
     * first version of this helper only ever clicked cells: Lock in stayed
     * disabled, the declaration was cancelled, and the charge-theft effect
     * never once reached the camera. Try cells, then cards, then give up on
     * this card rather than on the round.
     */
    const lock = page.getByRole('button', { name: 'Lock in' });
    if (await lock.isVisible().catch(() => false)) {
      await page.locator('.board').first().locator('.cell').nth(20).click().catch(() => undefined);
      await page.waitForTimeout(160);
      if (!(await lock.isEnabled().catch(() => false))) {
        const foe = page.locator('.foe-card');
        const n = await foe.count();
        for (let k = 0; k < n; k++) {
          await foe.nth(k).click().catch(() => undefined);
          await page.waitForTimeout(140);
          if (await lock.isEnabled().catch(() => false)) break;
        }
      }
      if (await lock.isEnabled().catch(() => false)) {
        await lock.click().catch(() => undefined);
        await page.waitForTimeout(180);
        return true;
      }
      await page.getByRole('button', { name: 'Cancel' }).click().catch(() => undefined);
      continue;
    }
    return true;
  }
  return false;
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

/**
 * Play out a match until the end-of-match banner is up, and stay on it.
 *
 * The banner holds two seconds and then hands to the result screen, so the
 * camera has to still be running when it lands — this stops driving the
 * moment `.slam` appears and simply waits.
 */
async function playToSlam(page, max = 26) {
  const t = { timeout: 6000 };
  for (let r = 0; r < max; r++) {
    await skipBeats(page);
    if (await seen(page, '.slam')) break;
    await page
      .locator('.board')
      .first()
      .locator('.cell')
      .nth((r * 7 + 2) % 36)
      .click(t)
      .catch(() => undefined);
    await chargeFirst(page);
    const commit = page.getByRole('button', { name: /^COMMIT/ });
    if (!(await commit.isEnabled().catch(() => false))) break;
    await commit.click(t).catch(() => undefined);
    await page.waitForTimeout(900);
    if (await seen(page, '.slam')) break;
    const overlay = page.locator('.overlay').first();
    if (await overlay.isVisible().catch(() => false)) {
      await overlay.click({ position: { x: 30, y: 30 } }).catch(() => undefined);
      await page.waitForTimeout(300);
    }
    if (await seen(page, '.slam')) break;
  }
  // Let it hold, then let the result screen arrive underneath it.
  await page.waitForTimeout(2600);
}

/**
 * Which opponent you face is a dial the player owns in Settings, so setting
 * it is not staging. A victory clip and a defeat clip both have to exist, and
 * which one a match produces is not something a harness can ask for.
 */
async function setBot(page, level) {
  await page.evaluate((l) => window.__store.getState().setSettings({ botLevel: l }), level);
  await page.waitForTimeout(120);
}

// 8. NEW — the winning moment. The verdict at display scale and the number
// immediately beneath it, both rendered from one call to settlement().
await record('victory-slam', async (page) => {
  await intoBattle(page);
  await setBot(page, 1);
  await playToSlam(page);
});

// 9. NEW — and the losing one. Same scale, same timing, different colour and
// a different sound: a defeat slam is built as carefully as a victory one.
await record('defeat-slam', async (page) => {
  await intoBattle(page);
  await setBot(page, 4);
  await playToSlam(page);
});

// 10. NEW — a bracket round landing before the grid redraws, announcing the
// floor it secured rather than the prize it might still win.
await record('round-win-slam', async (page) => {
  await page.getByRole('button', { name: /Tournament/ }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /Take a seat/ }).click();
  await page.waitForTimeout(3600);
  const qf = page.getByRole('button', { name: /Play quarter-final/ });
  if (!(await qf.isVisible().catch(() => false))) return;
  await qf.click();
  await page.waitForTimeout(500);
  await skipBeats(page);
  for (let i = 0; i < 3; i++) await draftPick(page, '.draft-pick');
  await skipBeats(page);
  for (let i = 0; i < 3; i++) await draftPick(page, 'button.gamecard');
  await skipBeats(page);
  await click(page, 'Auto').catch(() => undefined);
  await click(page, 'Commit fleet').catch(() => undefined);
  await page.waitForTimeout(500);
  await skipBeats(page);
  await setBot(page, 1);
  await playToSlam(page);
});

/**
 * Play rounds, firing a charged card into a mix of hull and water, until the
 * predicate says stop. Returns what it saw.
 *
 * Most of the Build 9 effects are conditional on what a real round produces —
 * a REACT needs a ship to die, a prediction needs a read to land — so the
 * honest harness is one that plays on and reports what it got rather than one
 * that stages a match state and calls it a capture.
 */
async function playUntil(page, want, { rounds = 24 } = {}) {
  const t = { timeout: 6000 };
  const cells = await enemyCells(page);
  const seen = new Set();
  for (let r = 0; r < rounds; r++) {
    await skipBeats(page);
    if (await seen_(page, '.slam')) break;
    // A mix: one cell of real hull, one of open water, so a multi-cell
    // pattern shows impacts and splashes in the same volley.
    const aim = r % 2 === 0 ? cells[r % cells.length] : (r * 13 + 5) % 36;
    await page.locator('.board').first().locator('.cell').nth(aim).click(t).catch(() => undefined);
    await page.waitForTimeout(120);
    await fireFirst(page).catch(() => undefined);
    await chargeFirst(page);
    const commit = page.getByRole('button', { name: /^COMMIT/ });
    if (!(await commit.isEnabled().catch(() => false))) break;
    await commit.click(t).catch(() => undefined);
    // Watch the effect layer while the round resolves.
    for (let k = 0; k < 60; k++) {
      const kinds = await page.evaluate(() =>
        [...document.querySelectorAll('.vfx')].map((e) =>
          [...e.classList].find((c) => c.startsWith('vfx-')),
        ),
      );
      kinds.forEach((x) => x && seen.add(x));
      if (want.every((w) => seen.has(w))) return seen;
      await page.waitForTimeout(40);
    }
    const ov = page.locator('.overlay').first();
    if (await ov.isVisible().catch(() => false)) {
      await ov.click({ position: { x: 30, y: 30 } }).catch(() => undefined);
      await page.waitForTimeout(300);
    }
    const g = page.getByRole('button', { name: 'Got it' });
    if (await g.isVisible().catch(() => false)) {
      await g.click().catch(() => undefined);
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(900);
  }
  return seen;
}

const seen_ = (page, sel) => page.locator(sel).isVisible().catch(() => false);

/** Which effects each clip actually managed to record. */
const vfxSeen = {};

// 11. NEW — a multi-cell volley: tracers out, impacts and splashes back.
await record('vfx-volley', async (page) => {
  await intoBattle(page);
  vfxSeen['vfx-volley'] = [...(await playUntil(page, ['vfx-impact', 'vfx-splash'], { rounds: 8 }))];
});

// 12. NEW — a ship going down: cells dousing in sequence, then the slick.
await record('vfx-sink', async (page) => {
  await intoBattle(page);
  const shortShip = await page.evaluate(() => {
    const ms = window.__store.getState().match;
    const ships = ms.players[1].ships.slice().sort((a, b) => a.cells.length - b.cells.length);
    return ships[0].cells;
  });
  const t = { timeout: 6000 };
  const got = new Set();
  for (const cell of shortShip) {
    await skipBeats(page);
    await page.locator('.board').first().locator('.cell').nth(cell).click(t).catch(() => undefined);
    await page.waitForTimeout(120);
    await chargeFirst(page);
    await page.getByRole('button', { name: /^COMMIT/ }).click(t).catch(() => undefined);
    for (let k = 0; k < 70; k++) {
      const kinds = await page.evaluate(() =>
        [...document.querySelectorAll('.vfx')].map((e) =>
          [...e.classList].find((c) => c.startsWith('vfx-')),
        ),
      );
      kinds.forEach((x) => x && got.add(x));
      await page.waitForTimeout(40);
    }
    const ov = page.locator('.overlay').first();
    if (await ov.isVisible().catch(() => false)) {
      await ov.click({ position: { x: 30, y: 30 } }).catch(() => undefined);
      await page.waitForTimeout(300);
    }
    if (got.has('vfx-douse')) break;
    if (await seen_(page, '.slam')) break;
  }
  vfxSeen['vfx-sink'] = [...got];
});

/**
 * 13. NEW — the rare ones, hunted rather than staged.
 *
 * A REACT needs a ship to die with a death-rattle on it; a prediction needs a
 * read to land on a cell the opponent actually fired at; a charge theft needs
 * a Siphon or a Jam to be drafted *and* fired. None of that can be asked for,
 * and staging a match state to force it would be photographing a mock-up.
 *
 * So this plays real matches against the strongest bot — which fires more,
 * sinks more and triggers more — and reports which of the three it caught.
 * `clips-vfx.json` records the answer either way.
 */
await record('vfx-rare', async (page) => {
  const got = new Set();
  for (let match = 0; match < 3; match++) {
    await page.evaluate(() => window.__store.getState().setSettings({ botLevel: 4 }));
    await intoBattle(page);
    const s = await playUntil(page, ['vfx-react', 'vfx-carry'], { rounds: 22 });
    s.forEach((x) => got.add(x));
    if (['vfx-react', 'vfx-foretold', 'vfx-carry'].every((w) => got.has(w))) break;
    await page.evaluate(() => window.__store.getState().leaveMatch());
    await page.waitForTimeout(400);
  }
  vfxSeen['vfx-rare'] = [...got];
});

/**
 * 14. NEW — a charge theft, drafted for on purpose.
 *
 * Hoping for one did not work: two runs of the rare-effect hunt came back
 * without it, because Siphon and Jam have to be *drafted*, then *charged past
 * their cost*, then *fired at a card rather than a cell*, and a harness
 * picking the leftmost card each time satisfies none of the three.
 *
 * So this drafts the thief by name — the same move `draft-collision` makes
 * for Warhead — charges that specific card every round until it can fire, and
 * aims it at their hand. Determinism in a capture harness comes from choosing
 * a controllable subject, not from running longer.
 */
await record('vfx-theft', async (page) => {
  const THIEF = /Siphon|Jam/;
  await page.getByRole('button', { name: /Casual/ }).click();
  await page.waitForTimeout(400);
  await skipBeats(page);
  for (let i = 0; i < 3; i++) await draftPick(page, '.draft-pick');
  await skipBeats(page);
  // Take Siphon or Jam from whichever pack offers it; otherwise take anything.
  for (let i = 0; i < 3; i++) {
    const thief = page.locator('button.gamecard', { hasText: THIEF }).first();
    const target = (await thief.isVisible().catch(() => false)) ? thief : page.locator('button.gamecard').first();
    await target.click({ timeout: 6000 }).catch(() => undefined);
    await page.waitForTimeout(2500);
    await skipBeats(page);
  }
  await skipBeats(page);
  await click(page, 'Auto');
  await click(page, 'Commit fleet');
  await page.waitForTimeout(500);
  await skipBeats(page);

  const got = new Set();
  const t = { timeout: 6000 };
  for (let r = 0; r < 14; r++) {
    await skipBeats(page);
    if (await seen_(page, '.slam')) break;
    // Charge the thief specifically, not whatever sits leftmost.
    const slots = await page.locator('.hand-slot').count();
    let charged = false;
    for (let i = 0; i < slots; i++) {
      const slot = page.locator('.hand-slot').nth(i);
      if (!THIEF.test((await slot.textContent().catch(() => '')) ?? '')) continue;
      await slot.locator('.gamecard').click(t).catch(() => undefined);
      charged = true;
      break;
    }
    if (!charged) await chargeFirst(page);
    await page.waitForTimeout(150);
    // From round three on it should be able to pay for itself.
    if (r >= 2) await fireFirst(page).catch(() => undefined);
    const commit = page.getByRole('button', { name: /^COMMIT/ });
    if (!(await commit.isEnabled().catch(() => false))) break;
    await commit.click(t).catch(() => undefined);
    for (let k = 0; k < 70; k++) {
      const kinds = await page.evaluate(() =>
        [...document.querySelectorAll('.vfx')].map((e) =>
          [...e.classList].find((c) => c.startsWith('vfx-')),
        ),
      );
      kinds.forEach((x) => x && got.add(x));
      if (got.has('vfx-carry')) break;
      await page.waitForTimeout(40);
    }
    if (got.has('vfx-carry')) break;
    const ov = page.locator('.overlay').first();
    if (await ov.isVisible().catch(() => false)) {
      await ov.click({ position: { x: 30, y: 30 } }).catch(() => undefined);
      await page.waitForTimeout(300);
    }
    const g = page.getByRole('button', { name: 'Got it' });
    if (await g.isVisible().catch(() => false)) {
      await g.click().catch(() => undefined);
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(800);
  }
  vfxSeen['vfx-theft'] = [...got];
});

writeFileSync('clips-vfx.json', `${JSON.stringify(vfxSeen, null, 2)}\n`, 'utf8');
const allSeen = new Set(Object.values(vfxSeen).flat());
console.log(`\neffects recorded: ${[...allSeen].sort().join(' ')}`);

await browser.close();
await server.close();
const failed = errors.filter((e) => !e.includes('favicon'));
console.log(failed.length ? `${failed.length} problem(s):` : 'clips recorded cleanly.');
for (const e of failed) console.log(`  ${e}`);
process.exit(failed.length ? 1 : 0);
