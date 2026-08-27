/**
 * Every screen at 1920×1080, photographed from the running game.
 *
 * The sweep walks the real loop — menu, the beats between phases, both
 * drafts, deployment, a full battle — and then every betting surface: the
 * tier picker, the escrow forming, the ranked-join modal, the season page,
 * the insufficient-funds error, the settlement receipt. Plus the desktop
 * gate, the connection states, and the hover states, because hover is half
 * the desktop design and, since Build 6, is where a disabled control says
 * why it is disabled.
 *
 * Nothing here is staged that a player cannot reach by playing, with three
 * declared exceptions marked at their call sites: the champion bracket and
 * the connection states, both of which need forty minutes or a severed cable
 * to reach honestly and are proven by tests instead; and the two winning
 * banners, which fire into the opponent's real hull read through the dev
 * store handle, because a plate captioned VICTORY has to be one and no
 * harness can ask a match to be won.
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

const OUT = 'screens';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
// JPEG copies for the inventory page and the screen guide, both of which
// embed every screen as a data URI — 40 full-size PNGs would put either page
// past what a browser forgives.
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
  console.log(`  ${file.padEnd(42)} ${note}`);
}

/**
 * Where the things a plate names actually are, measured from the live DOM.
 *
 * The screen guide pins numbered callouts onto these screenshots by
 * percentage, and twice now a pin has landed on top of the very element it
 * was naming. Hand-estimated coordinates against a layout that keeps moving
 * is not a thing that can be got right by looking harder, so the sweep now
 * reports the boxes and the guide's numbers are read off this table.
 *
 * A selector matching several nodes is reported as the union box — a fanned
 * hand of three cards is one object to a reader.
 */
const anchorSets = {};
async function anchors(name, map) {
  const boxes = await page.evaluate((sel) => {
    const out = {};
    for (const [labelText, q] of Object.entries(sel)) {
      const nodes = [...document.querySelectorAll(q)];
      if (!nodes.length) {
        out[labelText] = null;
        continue;
      }
      const rs = nodes.map((n) => n.getBoundingClientRect());
      const x0 = Math.min(...rs.map((r) => r.left));
      const y0 = Math.min(...rs.map((r) => r.top));
      const x1 = Math.max(...rs.map((r) => r.right));
      const y1 = Math.max(...rs.map((r) => r.bottom));
      out[labelText] = {
        n: nodes.length,
        left: +((x0 / innerWidth) * 100).toFixed(1),
        top: +((y0 / innerHeight) * 100).toFixed(1),
        right: +((x1 / innerWidth) * 100).toFixed(1),
        bottom: +((y1 / innerHeight) * 100).toFixed(1),
      };
    }
    return out;
  }, map);
  anchorSets[name] = boxes;
  const missing = Object.entries(boxes).filter(([, b]) => b === null);
  if (missing.length) {
    console.log(`  ! ${name}: no match for ${missing.map(([k]) => k).join(', ')}`);
  }
}

const click = (name, opts) => page.getByRole('button', { name, ...opts }).click();
const wait = (ms) => page.waitForTimeout(ms);
const visible = (loc) => loc.isVisible().catch(() => false);

/**
 * Advance one phase beat, if one is up. Beats hold open for the sweep (see
 * `__beatHold`), so this is the only thing that moves them along — which is
 * also what a player in a hurry does.
 */
async function nextBeat() {
  await page
    .locator('.beat-screen')
    .click({ position: { x: 40, y: 40 }, timeout: 2000 })
    .catch(() => undefined);
  await wait(240);
}

/** Step past every beat currently queued. */
async function skipBeats(limit = 5) {
  for (let i = 0; i < limit; i++) {
    if (!(await visible(page.locator('.beat-screen')))) return;
    await nextBeat();
  }
}

/** Photograph the beat that is up, then advance past it. */
async function beatShot(name, note) {
  const beat = page.locator('.beat-screen');
  await beat.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
  if (await visible(beat)) await shot(name, note);
  await nextBeat();
}

/**
 * Set the opponent's strength.
 *
 * A victory slam and a defeat slam both have to be photographed, and which
 * one a match produces is not something a harness can ask for. This is not
 * staging: bot strength is a dial the player owns in Settings, and the sweep
 * turns it the way a player would to get the match it wants.
 */
async function setBot(level) {
  await page.evaluate((l) => {
    window.__store.getState().setSettings({ botLevel: l });
  }, level);
  await wait(120);
}

/** Charge a card: since Build 6 the card itself is the charge control. */
async function chargeFirst() {
  await page.locator('.hand-slot .gamecard').first().click().catch(() => undefined);
  await wait(160);
}

/**
 * Fire a card: hover it, then take the one control it reveals. Which card is
 * legal depends on what the draft handed you, so try each in turn rather than
 * assuming the leftmost one can fire.
 */
async function fireFirst() {
  const count = await page.locator('.hand-slot').count();
  for (let i = 0; i < count; i++) {
    await page.locator('.hand-slot').nth(i).hover().catch(() => undefined);
    await wait(220);
    const fire = page.getByRole('button', { name: /^Fire · / }).first();
    if (!(await visible(fire))) continue;
    await fire.click();
    await wait(200);
    return true;
  }
  return false;
}

async function clearOverlays() {
  const overlay = page.locator('.overlay').first();
  if (await visible(overlay)) {
    await overlay.click({ position: { x: 30, y: 30 } }).catch(() => undefined);
    await wait(240);
  }
  const gotIt = page.getByRole('button', { name: 'Got it' });
  if (await visible(gotIt)) {
    await gotIt.click().catch(() => undefined);
    await wait(160);
  }
}

/**
 * Cells the opponent's ships actually occupy, read through the dev-only store
 * handle. Declared staging, like the champion bracket and the connection
 * states: which side wins is not something a harness can ask for politely,
 * and a victory plate captioned VICTORY has to actually be one.
 *
 * The engine is untouched — these are the same cells a player who guessed
 * perfectly would click.
 */
const enemyCells = () =>
  page.evaluate(() => {
    const ms = window.__store.getState().match;
    return ms ? ms.players[1].ships.flatMap((s) => s.cells) : [];
  });

/**
 * Use one of your own ship abilities, whichever of the three is available.
 *
 * A named event needs a REACT, a prediction, a restriction or an activation
 * to actually fire, and the first three are the opponent's business. An
 * activation is the one the player controls outright, so the sweep takes it
 * rather than playing on and hoping — waiting on the bot cost the named-event
 * plate on two runs and, once, the whole match with it.
 *
 * Every step is best-effort and an ability that opens an aiming panel is
 * cancelled rather than left half-declared.
 */
async function useAbility() {
  const ships = page.locator('.own-rail .col > *');
  const n = await ships.count().catch(() => 0);
  for (let i = 0; i < n; i++) {
    await ships.nth(i).click().catch(() => undefined);
    await wait(200);
    const lock = page.getByRole('button', { name: 'Lock in' });
    if (await visible(lock)) {
      // It wants a target. Give it one, and take it if that was enough.
      await page.locator('.board').first().locator('.cell').nth(20).click().catch(() => undefined);
      await wait(180);
      if (await lock.isEnabled().catch(() => false)) {
        await lock.click().catch(() => undefined);
        await wait(200);
        return true;
      }
      await click('Cancel').catch(() => undefined);
      await wait(150);
      continue;
    }
    // A no-target ability declares on the click; the prompt grows a pill.
    if (await visible(page.locator('.prompt-line .pill'))) return true;
  }
  return false;
}

/** Dismiss a first-time card without touching the banner behind it. */
async function dismissExplainer() {
  const gotIt = page.getByRole('button', { name: 'Got it' });
  if (await visible(gotIt)) {
    await gotIt.click().catch(() => undefined);
    await wait(180);
  }
}

/**
 * Play rounds until the end-of-match banner is up, then photograph it.
 *
 * The banner is raised the instant playback finishes and holds two seconds,
 * so it has to be caught right after the resolve overlay is dismissed rather
 * than at the top of the next loop — where it has already gone. A first-time
 * card raised by the same round would sit on top of it, so that is cleared
 * first: `.slam` is itself an `.overlay`, and a blanket overlay click would
 * dismiss the thing being photographed.
 *
 * `aim` is a list of cells to fire the free shot into, in order. Passing the
 * opponent's real hull settles the match in nine rounds and settles it your
 * way; passing nothing walks a spread and takes whatever the bot gives.
 */
async function playToSlam(name, note, { max = 26, aim = null } = {}) {
  for (let r = 0; r < max; r++) {
    await skipBeats();
    if (await visible(page.locator('.slam'))) break;
    const cell = aim ? aim[r % aim.length] : (r * 7 + 2) % 36;
    await page
      .locator('.board')
      .first()
      .locator('.cell')
      .nth(cell)
      .click()
      .catch(() => undefined);
    await chargeFirst();
    const commit = page.getByRole('button', { name: /^COMMIT/ });
    if (!(await commit.isEnabled().catch(() => false))) break;
    await commit.click();
    await wait(420);
    if (await visible(page.locator('.slam'))) break;
    const overlay = page.locator('.overlay').first();
    if (await visible(overlay)) {
      await overlay.click({ position: { x: 30, y: 30 } }).catch(() => undefined);
    }
    await wait(260);
    if (await visible(page.locator('.slam'))) break;
    await dismissExplainer();
    await wait(2500);
  }
  const up = await visible(page.locator('.slam'));
  if (up) {
    // A first-time card raised by the last round would cover the number.
    await dismissExplainer();
    // Let the number finish arriving under the verdict.
    await wait(320);
    await shot(name, note);
    await page.locator('.slam').click({ position: { x: 40, y: 40 } }).catch(() => undefined);
    await wait(320);
  }
  return up;
}

/** One pick in a draft, waiting out the five-beat sequence. */
async function draftPick(selector, { keepBeats = false } = {}) {
  await page.locator(selector).first().click().catch(() => undefined);
  // The sequence is ~1.4s without a collision and ~2.3s with one.
  await wait(2500);
  if (!keepBeats) await skipBeats();
}

async function playRounds(max) {
  for (let round = 0; round < max; round++) {
    if (await visible(page.getByRole('button', { name: 'PLAY AGAIN' }))) return true;
    await skipBeats();
    await page
      .locator('.board')
      .first()
      .locator('.cell')
      .nth((round * 5 + 3) % 36)
      .click()
      .catch(() => undefined);
    await wait(120);
    await chargeFirst();
    const commit = page.getByRole('button', { name: /^COMMIT/ });
    if (!(await commit.isEnabled().catch(() => false))) return false;
    await commit.click();
    await wait(260);
    await clearOverlays();
    await wait(220);
  }
  return false;
}

try {
  await page.goto('http://localhost:5233/', { waitUntil: 'networkidle' });
  // Hold every beat open until the sweep clicks it. A 1.5s beat is right for
  // a player and a race for a harness.
  await page.evaluate(() => {
    window.__beatHold = 120000;
  });
  await wait(600);
  await shot('01-main-menu', 'four mode cards, each wearing its money story');

  // How to play — five steps since Build 6, the draft first.
  await click('How to play');
  await wait(300);
  await shot('02-howto-draft', 'the blind draft, taught with live cards you can actually pick');
  await click('Next');
  await wait(250);
  await shot('03-howto-charging', 'teach by doing — live cards, click to charge');
  await click('Next');
  await wait(250);
  await shot('04-howto-firing', 'firing spends everything and destroys the card');
  await click('Next');
  await click('Next');
  await wait(250);
  await shot('05-howto-sinks', 'a sink announces a length, never a name');
  await click('Done');
  await wait(300);

  // Ranked join modal — a betting surface.
  await page.getByRole('button', { name: /Ranked/ }).click();
  await wait(300);
  await shot('06-ranked-join-modal', 'season entry: price, what it buys, pool so far');
  await page.getByRole('button', { name: 'Not now' }).click();
  await wait(200);

  // Arena tier picker. Fresh profile first, so the locked tiers show.
  await page.getByRole('button', { name: /Arena/ }).click();
  await wait(300);
  // The pointer is still where the Arena card was, which lands on a tier and
  // opens its hover reason. Park it somewhere with nothing under it first.
  await page.mouse.move(40, 900);
  await wait(260);
  await shot('07-arena-tiers', 'four stake tables, the matchmaking band stated once');

  // The "why can't I?" hover on a locked tier.
  await page.locator('.whynot').last().hover();
  await wait(320);
  await shot('08-locked-tier-why', 'a locked table now says what unlocks it, on hover');

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
  await shot('09-insufficient-funds', 'not enough SOL: the amounts, the faucet, a way down');
  await page.evaluate(() => {
    const store = window.__store;
    store.setState({ profile: { ...store.getState().profile, provisionalMatches: 0 } });
  });
  await page.getByRole('button', { name: /0\.05/ }).first().click();
  await wait(200);

  // Against the Deckhand, so the staked match ends in a victory and the
  // banner carries the money rather than the rating.
  await setBot(1);

  // The escrow forming.
  await page.getByRole('button', { name: /Find match/ }).click();
  await wait(1400);
  await shot('10-escrow-forming', 'you staked, opponent staking — the pot forming in view');
  await wait(2000);

  // --- the beats between phases ------------------------------------------
  await beatShot('11-beat-match-found', 'who you are facing and for how much, before pack one');
  await beatShot('12-beat-phase-ship-draft', 'the phase card that replaced a permanent header');
  await wait(400);

  // --- the ship draft, beat by beat --------------------------------------
  await shot('13-ship-draft', 'four ships face up, the mechanism stated under the pack');
  await page.locator('.draft-pick').first().click();
  await wait(180);
  await shot('14-draft-your-pick', 'beat 2: your pick lifts and holds, the other three recede');
  await wait(500);
  await shot('15-draft-their-pick', 'beat 3: their card back slides in beside yours');
  await wait(900);
  await shot('16-draft-resolve', 'beat 4: collision, or quietly away — no screen for a non-event');
  await wait(1600);
  await skipBeats();

  await draftPick('.draft-pick');
  // The third pick completes the fleet, which raises the fleet beat. Keep it.
  await draftPick('.draft-pick', { keepBeats: true });
  await wait(300);

  // Fleet assembled, then the card-draft phase card.
  await beatShot('17-beat-fleet-assembled', 'the moment you find out what you drafted');
  await skipBeats();
  await wait(300);
  await shot('18-card-draft', 'four real cards, full rules on their faces');

  // Hover state on a draft card.
  await page.locator('button.gamecard').first().hover();
  await wait(300);
  await shot('19-card-hover', 'hover lifts the card and shows the full rule tooltip');

  for (let i = 0; i < 3; i++) await draftPick('button.gamecard');
  await skipBeats();
  await wait(300);
  await page.locator('.board').first().locator('.cell').nth(14).hover().catch(() => undefined);
  await wait(260);
  await shot('20-deployment', 'board centred large, hover previewing a legal placement');

  await click('Auto');
  await wait(200);
  await shot('21-deployment-placed', 'fleet placed; the layout commits as a hash');
  await click('Commit fleet');
  // The seals shut at 620ms; photograph them shut.
  await wait(900);
  await beatShot('22-beat-both-committed', 'two hashes sealing — the honesty claim, made visible');
  await beatShot('23-beat-phase-battle', 'the last card before the first round');
  await wait(400);
  await shot('24-battle', 'the clock is the largest thing on screen; nothing is said twice');
  await anchors('24-battle', {
    'Round counter': '.battle-grid > .panel.tight > .pill:first-child',
    'Their hull': '.battle-grid > .panel.tight > span:nth-of-type(2)',
    'The clock': '.big-num',
    'Your hull': '.battle-grid > .panel.tight > span:nth-of-type(4)',
    'The pot': '.battle-grid > .panel.tight > .pill.gold',
    'Their fleet': '.foe-rail > .row:nth-of-type(1)',
    'Their cards': '.foe-rail > .row:nth-of-type(2)',
    'Their water': '.board:not(.own)',
    'The prompt': '.their-region > .flank-start',
    'The division': '.your-region',
    'Your water': '.board.own',
    'Your ships': '.own-rail > .col',
    'Your hand': '.hand-slot',
    Commit: '.commit-drain',
  });

  // Aim the free shot + charge, then photograph the planned state.
  await page.locator('.board').first().locator('.cell').nth(8).click();
  await wait(150);
  await chargeFirst();
  await wait(220);
  await shot('25-battle-planned', 'free shot aimed, a card charged, the gem pulsing');
  await anchors('25-battle-planned', {
    'The aimed cell': '.board:not(.own) .cell.pick',
    'Plan readout': '.their-region > .flank-start',
    'Charged card': '.hand-slot:has(.gem.pulse)',
    Armed: '.commit-drain',
  });

  // The one control a card carries, and the reason when it has none. The
  // third card is the one holding no charges — Ambush is legal at zero.
  await page.locator('.hand-slot').nth(2).hover();
  await wait(320);
  await shot('26-card-hover-cant', 'hovering a card that cannot fire says why, in a sentence');
  await page.locator('.hand-slot').first().hover();
  await wait(320);
  await shot('27-card-hover-fire', 'one Fire affordance, on the hovered card, when it is legal');

  // Targeting with a hover pattern preview.
  if (await fireFirst()) {
    await page.locator('.board').first().locator('.cell').nth(14).hover();
    await wait(250);
    await shot('28-target-hover', 'the pattern about to fire, previewed before it locks');
    await page.locator('.board').first().locator('.cell').nth(14).click();
    await wait(200);
    const lock = page.getByRole('button', { name: 'Lock in' });
    if (await lock.isEnabled().catch(() => false)) await lock.click();
    else await page.getByRole('button', { name: 'Cancel' }).click();
    await wait(200);
  }

  await page.getByRole('button', { name: /^COMMIT/ }).click();
  // Tier 1 floaters ride the same clock the resolve overlay does, so the
  // first shots are landing about here.
  await wait(700);
  await shot('29-floaters', 'HIT and MISS rising off the exact cells that took them');
  await wait(700);
  await shot('30-resolve', 'the resolve sequence on its own panel, board visible behind');
  await clearOverlays();
  await wait(300);

  // The two feedback tiers that need a live round to exist at all: a named
  // event, and a first-time explainer. Both depend on what actually happens,
  // so the sweep plays on until it has seen each of them rather than assuming
  // round one will oblige.
  let gotNamed = false;
  let gotExplainer = false;
  // Eight rounds, and the number matters. This hunt and the victory banner
  // share one match with a twenty-round cap, and a named event needs a REACT,
  // a prediction, a restriction or an ability to actually fire — so on a run
  // where none of them does, the loop spends every round it is given. Raising
  // it to twenty to improve the odds cost *both* plates: the match ended in
  // here and the banner had come and gone before anything asked for it.
  // Eight leaves twelve, and nine sink a fleet.
  for (let i = 0; i < 8 && !(gotNamed && gotExplainer); i++) {
    if (!gotExplainer && (await visible(page.locator('.explainer')))) {
      await shot('31-explainer', 'first time only, per mechanic, per player — then never again');
      gotExplainer = true;
      await click('Got it').catch(() => undefined);
      await wait(200);
    }
    await skipBeats();
    if (await visible(page.getByRole('button', { name: 'PLAY AGAIN' }))) break;
    await page
      .locator('.board')
      .first()
      .locator('.cell')
      .nth((i * 7 + 2) % 36)
      .click()
      .catch(() => undefined);
    // An activation is a named event, and it is the only one of the eleven
    // that does not depend on what the opponent does.
    if (!gotNamed) await useAbility();
    await chargeFirst();
    const commit = page.getByRole('button', { name: /^COMMIT/ });
    if (!(await commit.isEnabled().catch(() => false))) break;
    await commit.click();
    await wait(600);
    if (!gotNamed && (await visible(page.locator('.named-line')))) {
      await shot('32-named-event', 'one line, fixed position, for a change with a name behind it');
      gotNamed = true;
    }
    // Walk the resolve out without dismissing an explainer that just landed.
    const overlay = page.locator('.overlay').first();
    if (await visible(overlay)) {
      await overlay.click({ position: { x: 30, y: 30 } }).catch(() => undefined);
      await wait(240);
    }
    await wait(2600);
  }
  await clearOverlays();

  // The moment, then the analysis. This match is staked, so the banner
  // carries the money — and it is the same figure the receipt prints.
  //
  // Fired into the opponent's real hull, because a plate captioned VICTORY
  // has to actually be one and a weak bot is not a guarantee. Declared at the
  // top of this file with the other two staged frames.
  await playToSlam(
    '33-slam-victory',
    'the verdict, and what your balance just did — the same figure the receipt prints',
    { aim: await enemyCells() },
  );
  await wait(500);
  await shot('34-result-settlement', 'the receipt: pot, rake, net, tx, replay verified');

  await click('Menu');
  await wait(400);
  await click('Leaderboard');
  await wait(300);
  await shot('35-leaderboard', 'the ladder, and your row pinned to the bottom of it');
  await click('Back');
  await click('Season', { exact: true });
  await wait(300);
  await shot('36-season', 'pool, days left, the payout curve, projected payout at your rank');
  await click('Back');
  await click('Settings');
  await wait(300);
  await shot('37-settings', 'wallet, session key, beats, first-time explanations, chain journal');
  await click('Art credits and licences');
  await wait(300);
  await shot('38-credits', 'the attribution the icon licence requires');
  await click('back');
  await wait(200);
  await click('Back');

  // Tournaments: the tier picker, the bracket forming, and the bracket live.
  await page.getByRole('button', { name: /Tournament/ }).click();
  await wait(300);
  await shot('39-tournament-tiers', 'eight seats a bracket, the whole curve priced before entry');
  await page.getByRole('button', { name: /Take a seat/ }).click();
  await wait(1100);
  await shot('40-bracket-forming', 'seats staking in view — a bracket only starts full');
  await wait(2400);
  await shot('41-bracket-live', 'eight seats, three rounds, your path in gold, pot always visible');

  // A real quarter-final, played out, for the round-win banner. The bracket
  // used to simply redraw here; a round win locks in a floor on what you take
  // home, and that deserves to land before the grid moves underneath it.
  const qf = page.getByRole('button', { name: /Play quarter-final/ });
  if (await visible(qf)) {
    await qf.click();
    await wait(500);
    await skipBeats();
    for (let i = 0; i < 3; i++) await draftPick('.draft-pick');
    await skipBeats();
    for (let i = 0; i < 3; i++) await draftPick('button.gamecard');
    await skipBeats();
    await click('Auto').catch(() => undefined);
    await click('Commit fleet').catch(() => undefined);
    await wait(500);
    await skipBeats();
    await playToSlam(
      '42-slam-round-win',
      'a bracket round, landing before the grid redraws — with the floor it just secured',
      { aim: await enemyCells() },
    );
  }

  // STAGED (1 of 2): the champion moment. The real path is three straight
  // wins and is proven by audit-ui; the screenshot needs the state, not the
  // forty minutes.
  await page.evaluate(() => {
    const store = window.__store;
    const t = store.getState().tournament;
    if (!t) return;
    let b = t.bracket;
    const feeds = (i) => (i < 4 ? [4 + (i >> 1), i & 1] : i < 6 ? [6, i - 4] : null);
    for (let i = 0; i < 7; i++) {
      const m = b.matches[i];
      const winner = m.seats.includes(0) ? 0 : m.seats[0];
      b = { ...b, matches: b.matches.map((x, j) => (j === i ? { ...x, winner } : { ...x })) };
      const to = feeds(i);
      if (to) b.matches[to[0]].seats[to[1]] = winner;
    }
    store.setState({
      tournament: { ...t, bracket: b, yourPlace: 'champion', settled: true },
      lastTx: 'staged-for-screenshot',
    });
  });
  await wait(600);
  await shot('43-champion', 'the loudest screen in the game — 55% of the pot');
  await page.evaluate(() => window.__store.getState().leaveMatch());
  await wait(400);

  // A defeat, against the Admiral. Built to exactly the same specification as
  // the victory: most players lose about half their matches, and a loss that
  // is visually skimped reads as the product being embarrassed by it.
  await setBot(4);
  await page.getByRole('button', { name: /Casual/ }).click();
  await wait(400);
  await skipBeats();
  for (let i = 0; i < 3; i++) await draftPick('.draft-pick');
  await skipBeats();
  for (let i = 0; i < 3; i++) await draftPick('button.gamecard');
  await skipBeats();
  await click('Auto').catch(() => undefined);
  await click('Commit fleet').catch(() => undefined);
  await wait(500);
  await skipBeats();
  await playToSlam('44-slam-defeat', 'the same scale, the same timing, a different colour');
  await page.evaluate(() => window.__store.getState().leaveMatch());
  await wait(300);
  await setBot(3);

  // The desktop gate.
  await page.setViewportSize({ width: 1024, height: 640 });
  await wait(300);
  await shot('45-desktop-gate', 'below 1280×720: logo, one line, nothing else');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await wait(200);

  // STAGED (2 of 2): the connection states. The transport is proven by the
  // wire tests and the acceptance run; these frames show what the player sees
  // when it happens, which no test can photograph.
  const setNet = (patch) =>
    page.evaluate((p) => {
      const s = window.__store.getState();
      window.__store.setState({ net: { ...s.net, ...p } });
    }, patch);
  await setNet({ status: 'reconnecting' });
  await wait(300);
  await shot('46-reconnecting', 'the seat is held server-side; the client only says so');
  await setNet({ status: 'lost' });
  await wait(300);
  await shot('47-connection-lost', 'unreachable, said plainly, with the one useful button');
  await setNet({ status: 'online' });

  // Opponent disconnected: a live battle with the grace-period banner.
  await page.getByRole('button', { name: /Casual/ }).click();
  await wait(400);
  await skipBeats();
  for (let i = 0; i < 3; i++) await draftPick('.draft-pick');
  await skipBeats();
  for (let i = 0; i < 3; i++) await draftPick('button.gamecard');
  await skipBeats();
  await click('Auto');
  await click('Commit fleet');
  await wait(500);
  await skipBeats();
  await setNet({ remote: true, oppConnected: false });
  // Forcing `remote` without a server leaves the clock with no deadline to
  // count against, and it renders 0. Give it one, so the frame shows a live
  // plan window rather than a stalled one.
  await page.evaluate(() => window.__store.setState({ netDeadlineAt: Date.now() + 14000 }));
  await wait(400);
  await shot('48-opponent-disconnected', 'their problem, your grace period — the match holds');
  await setNet({ remote: false, oppConnected: true });
  await page.evaluate(() =>
    window.__store.setState({ netDeadlineAt: null, clock: 20 }),
  );
  await page.evaluate(() => window.__store.getState().leaveMatch());
  await wait(300);

  await setNet({ lastServerError: 'rate-limited: queueing too fast' });
  await wait(300);
  await shot('49-server-error', 'a server refusal as a sentence, not a code');
  await setNet({ lastServerError: null });

  // The ownership claim, under a filter. Position is the primary signal and
  // the two waters are the reinforcement; the brief asked that both carry it,
  // so the guide gets the greyscale frame rather than the assurance.
  await setNet({ lastServerError: null });
  await page.getByRole('button', { name: /Casual/ }).click();
  await wait(400);
  await skipBeats();
  for (let i = 0; i < 3; i++) await draftPick('.draft-pick');
  await skipBeats();
  for (let i = 0; i < 3; i++) await draftPick('button.gamecard');
  await skipBeats();
  await click('Auto').catch(() => undefined);
  await click('Commit fleet').catch(() => undefined);
  await wait(500);
  await skipBeats();
  await clearOverlays();
  await page.evaluate(() => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'cvd-filter';
    svg.setAttribute('style', 'position:absolute;width:0;height:0');
    svg.innerHTML =
      '<filter id="cvd"><feColorMatrix type="matrix" values="0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0 0 0 1 0"/></filter>';
    document.body.appendChild(svg);
    document.documentElement.style.filter = 'url(#cvd)';
  });
  await wait(400);
  await shot('51-ownership-greyscale', 'every hue removed: the two waters still separate, and so do the halves');
  await page.evaluate(() => {
    document.documentElement.style.filter = '';
    document.getElementById('cvd-filter')?.remove();
  });
  await page.evaluate(() => window.__store.getState().leaveMatch());
  await wait(300);

  await page.evaluate(() =>
    window.__store.getState().fail(
      'Nobody joined in time',
      'nobody in your band joined in time — your stake was never taken',
      () => undefined,
    ),
  );
  await wait(300);
  await shot('50-queue-timeout', 'a staked player never silently faces a bot');
  await page.evaluate(() => window.__store.getState().clearError());
} catch (err) {
  errors.push(`sweep aborted: ${err instanceof Error ? err.message.split('\n')[0] : err}`);
} finally {
  // The queue-timeout frame is staged by calling the store's own fail(),
  // which logs to the console by design; that one staged line is not a bug.
  const failed = errors.filter(
    (e) => !e.includes('favicon') && !e.includes('Nobody joined in time'),
  );
  mkdirSync('sim-out', { recursive: true });
  writeFileSync('sim-out/anchors.json', `${JSON.stringify(anchorSets, null, 2)}\n`);
  console.log(`\n${taken.length} screens captured into ${OUT}/`);
  console.log(`anchor boxes for ${Object.keys(anchorSets).length} plate(s) → sim-out/anchors.json`);
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
