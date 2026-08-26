/**
 * Every screen at 1920×1080, photographed from the running game.
 *
 * The sweep walks the real loop — menu, drafts, deployment, a full battle —
 * and then every betting surface: the tier picker, the escrow forming, the
 * ranked-join modal, the season page, the insufficient-funds error, the
 * settlement receipt. Plus the desktop gate and two hover states, because
 * hover is half the desktop design.
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, rmSync } from 'node:fs';

const OUT = 'screens';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
// JPEG copies for the inventory page, which embeds every screen as a data
// URI — 24 full-size PNGs would put the page past what a browser forgives.
mkdirSync(`${OUT}/web`, { recursive: true });

const server = await createServer({ server: { port: 5233 } });
await server.listen();

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

const taken = [];
async function shot(name, note) {
  const file = `${OUT}/${name}.png`;
  await page.screenshot({ path: file });
  await page.screenshot({ path: `${OUT}/web/${name}.jpg`, type: 'jpeg', quality: 74 });
  taken.push({ file, note });
  console.log(`  ${file.padEnd(40)} ${note}`);
}

const click = (name, opts) => page.getByRole('button', { name, ...opts }).click();
const wait = (ms) => page.waitForTimeout(ms);

async function playRounds(max) {
  for (let round = 0; round < max; round++) {
    if (await page.getByRole('button', { name: 'REMATCH' }).isVisible().catch(() => false)) return true;
    await page
      .locator('.board')
      .first()
      .locator('.cell')
      .nth((round * 5 + 3) % 36)
      .click()
      .catch(() => undefined);
    await wait(140);
    await page
      .getByRole('button', { name: 'Charge', exact: true })
      .first()
      .click()
      .catch(() => undefined);
    await wait(140);
    const commit = page.getByRole('button', { name: /^COMMIT/ });
    if (!(await commit.isEnabled().catch(() => false))) return false;
    await commit.click();
    await wait(250);
    const overlay = page.locator('.overlay');
    if (await overlay.isVisible().catch(() => false)) await overlay.click();
    await wait(250);
  }
  return false;
}

try {
  await page.goto('http://localhost:5233/', { waitUntil: 'networkidle' });
  await wait(600);
  await shot('01-main-menu', 'three mode cards, each wearing its money story');

  // How to play.
  await click('How to play');
  await wait(300);
  await shot('02-howto-charging', 'teach by doing — live cards, click to charge');
  await click('Next');
  await wait(250);
  await shot('03-howto-firing', 'firing destroys the card');
  await click('Next');
  await click('Next');
  await wait(250);
  await shot('04-howto-sinks', 'a sink announces a length, never a name');
  await click('Done');
  await wait(300);

  // Ranked join modal — a betting surface.
  await page.getByRole('button', { name: /Ranked/ }).click();
  await wait(300);
  await shot('05-ranked-join-modal', 'season entry: price, what it buys, pool so far');
  await page.getByRole('button', { name: 'Not now' }).click();
  await wait(200);

  // Arena tier picker. Fresh profile first, so the locked tiers show.
  await page.getByRole('button', { name: /Arena/ }).click();
  await wait(300);
  await shot('06-arena-tiers', 'four stake tables, rating band per tier, locked tiers explained');

  // Insufficient funds: graduate the profile (dev store handle) so the 0.5
  // table unlocks, then sit down at it with a 0.3 balance.
  await page.evaluate(() => {
    const store = window.__store;
    store.setState({ profile: { ...store.getState().profile, provisionalMatches: 10 } });
  });
  await page.getByRole('button', { name: 'Back' }).click();
  await wait(200);
  await page.getByRole('button', { name: /Arena/ }).click();
  await wait(300);
  await page.getByRole('button', { name: /0\.5/ }).first().click();
  await wait(200);
  await shot('07-insufficient-funds', 'not enough SOL: the amounts, the faucet, a way down');
  await page.evaluate(() => {
    const store = window.__store;
    store.setState({ profile: { ...store.getState().profile, provisionalMatches: 0 } });
  });
  await page.getByRole('button', { name: /0\.05/ }).first().click();
  await wait(200);

  // The escrow forming.
  await page.getByRole('button', { name: /Find match/ }).click();
  await wait(1400);
  await shot('08-escrow-forming', 'you staked, opponent staking — the pot forming in view');
  await wait(2200);

  // Ship draft (arena match continues).
  await shot('09-ship-draft', 'four ships in a row, the whole pack face up');
  await page.locator('.draft-pick').first().click();
  await wait(160);
  await shot('10-draft-collision', 'the collision beat — the only thing a draft leaks');
  await wait(1500);
  for (let i = 0; i < 2; i++) {
    await page.locator('.draft-pick').first().click();
    await wait(1600);
  }
  await wait(300);
  await shot('11-card-draft', 'four real cards, full rules on their faces');

  // Hover state on a draft card.
  await page.locator('button.gamecard').first().hover();
  await wait(300);
  await shot('12-card-hover', 'hover lifts the card and shows the full rule tooltip');

  for (let i = 0; i < 3; i++) {
    await page.locator('button.gamecard').first().click();
    await wait(1600);
  }
  await wait(300);
  await shot('13-deployment', 'board centred large, fleet in the side tray');

  await click('Auto');
  await wait(200);
  await shot('14-deployment-placed', 'fleet placed; the layout commits as a hash');
  await click('Commit fleet');
  await wait(400);
  await shot('15-battle', 'enemy water dominant, hand fanned, commit huge and green');

  // Aim the free shot + charge, then photograph the planned state.
  await page.locator('.board').first().locator('.cell').nth(8).click();
  await wait(150);
  await page.getByRole('button', { name: 'Charge', exact: true }).first().click();
  await wait(250);
  await shot('16-battle-planned', 'free shot aimed, a card charged, the gem pulsing');

  // Targeting with a hover pattern preview.
  const fire = page.getByRole('button', { name: 'Fire', exact: true }).first();
  if (await fire.isEnabled().catch(() => false)) {
    await fire.click();
    await wait(200);
    await page.locator('.board').first().locator('.cell').nth(14).hover();
    await wait(250);
    await shot('17-target-hover', 'the pattern about to fire, previewed on hover before locking');
    await page.locator('.board').first().locator('.cell').nth(14).click();
    await wait(200);
    const lock = page.getByRole('button', { name: 'Lock in' });
    if (await lock.isEnabled().catch(() => false)) await lock.click();
    else await page.getByRole('button', { name: 'Cancel' }).click();
    await wait(200);
  }

  await page.getByRole('button', { name: /^COMMIT/ }).click();
  await wait(800);
  await shot('18-resolve', 'the resolve sequence on its own panel, board visible behind');
  const overlay = page.locator('.overlay');
  if (await overlay.isVisible().catch(() => false)) await overlay.click();
  await wait(300);

  // Play the match out to the receipt.
  await playRounds(24);
  await wait(400);
  await shot('19-result-settlement', 'celebration + receipt: pot, rake, net, tx, replay verified');

  await click('Menu');
  await wait(400);
  await click('Leaderboard');
  await wait(300);
  await shot('20-leaderboard', 'payout curve drawn, live pool in gold, your row pinned');
  await click('Back');
  await click('Season', { exact: true });
  await wait(300);
  await shot('21-season', 'pool, days left, projected payout at current rank');
  await click('Back');
  await click('Settings');
  await wait(300);
  await shot('22-settings', 'wallet, session key, bot strength, chain journal');
  await click('Art credits and licences');
  await wait(300);
  await shot('23-credits', 'the attribution the icon licence requires');
  await click('back');
  await wait(200);
  await click('Back');

  // Tournaments: the tier picker, the bracket forming, and the bracket live.
  await page.getByRole('button', { name: /Tournament/ }).click();
  await wait(300);
  await shot('24-tournament-tiers', 'eight seats a bracket, the whole curve priced before entry');
  await page.getByRole('button', { name: /Take a seat/ }).click();
  await wait(1100);
  await shot('25-bracket-forming', 'seats staking in view — a bracket only starts full');
  await wait(2400);
  await shot('26-bracket-live', 'eight seats, three rounds, your path in gold, pot always visible');

  // The champion moment, staged through the dev store handle: the real path
  // (three straight wins) is proven by audit-ui; the screenshot only needs
  // the state, not the forty minutes.
  await page.evaluate(() => {
    const store = window.__store;
    const t = store.getState().tournament;
    if (!t) return;
    let b = t.bracket;
    const report = (idx, winner) => {
      const m = b.matches[idx];
      const w = m.seats.includes(winner) ? winner : m.seats[0];
      b = window.__bracketReport ? window.__bracketReport(b, idx, w) : b;
    };
    void report;
    // Walk the bracket with seat 0 winning throughout.
    const feeds = (i) => (i < 4 ? [4 + (i >> 1), i & 1] : i < 6 ? [6, i - 4] : null);
    for (let i = 0; i < 7; i++) {
      const m = b.matches[i];
      const winner = m.seats.includes(0) ? 0 : m.seats[0];
      b = {
        ...b,
        matches: b.matches.map((x, j) => (j === i ? { ...x, winner } : { ...x })),
      };
      const to = feeds(i);
      if (to) b.matches[to[0]].seats[to[1]] = winner;
    }
    store.setState({
      tournament: { ...t, bracket: b, yourPlace: 'champion', settled: true },
      lastTx: 'staged-for-screenshot',
    });
  });
  await wait(600);
  await shot('27-champion', 'the loudest screen in the game — 55% of the pot');
  await page.evaluate(() => window.__store.getState().leaveMatch());
  await wait(400);

  // The desktop gate.
  await page.setViewportSize({ width: 1024, height: 640 });
  await wait(300);
  await shot('28-desktop-gate', 'below 1280×720: logo, one line, nothing else');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await wait(200);
} catch (err) {
  errors.push(`sweep aborted: ${err instanceof Error ? err.message.split('\n')[0] : err}`);
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
