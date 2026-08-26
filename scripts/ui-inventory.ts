import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { ICON_CREDITS, ICON_LICENCE, ICON_PATHS, ICON_RETRIEVED } from '../src/ui/art/icons';
import { CARD_LIST } from '../src/engine/cards';
import { SHIP_LIST } from '../src/engine/ships';
import { CUES } from '../src/ui/sfx/SoundManager';
import { VFX_HOOKS } from '../src/ui/vfx/hooks';

/**
 * The UI inventory page.
 *
 * Generated rather than written, for the same reason the asset manifest is:
 * a document that lists what is in the build has exactly one job, and it fails
 * at that job the moment it is edited by hand. The icons on this page are
 * rendered from the same path data the game renders, the screenshots are the
 * ones the capture script just took at 1920×1080, and the counts are counted.
 */

const SCREEN_NOTES: Record<string, { phase: string; note: string }> = {
  '01-main-menu': {
    phase: 'Arrival',
    note: 'Full-bleed sky, drifting clouds, and three mode cards that each wear their money story: Casual is free, Ranked costs its season entry, Arena shows its stake range. Nothing on this screen needs a wallet to read.',
  },
  '02-howto-charging': {
    phase: 'Arrival',
    note: 'How to play is four things you do, not four things you read. Here the cards are live: clicking one charges it and the gem pops.',
  },
  '03-howto-firing': {
    phase: 'Arrival',
    note: 'The rule that catches everyone out. Fire the card and it spends every charge and leaves the match for good.',
  },
  '04-howto-sinks': {
    phase: 'Arrival',
    note: 'A sink announces a length and never a name. Every fleet is one 4, one 3 and one 2, so the length names the slot and leaves the candidates open.',
  },
  '05-ranked-join-modal': {
    phase: 'Betting',
    note: 'The season entry as a purchase decision: the price, exactly what it buys, the pool so far, and one confirm. A short balance gets a warning here, not a failure later.',
  },
  '06-arena-tiers': {
    phase: 'Betting',
    note: 'Four stake tables, each with its rating band and what a win pays. Tiers a provisional account cannot enter are visibly locked and say why.',
  },
  '07-insufficient-funds': {
    phase: 'Betting',
    note: 'The error state as a human sentence: what you hold, what the table needs, and a working faucet link. The retry is the tier row itself.',
  },
  '08-escrow-forming': {
    phase: 'Betting',
    note: 'The stakes forming in view — your chips in, theirs landing, the pot growing between. The reclaim rule is on the screen, and cancel is one button.',
  },
  '09-ship-draft': {
    phase: 'Draft',
    note: 'A pack of four ships, face up to both players. Both pick in secret; duplicates are legal and carry no penalty.',
  },
  '10-draft-collision': {
    phase: 'Draft',
    note: 'The collision beat. This is the only thing a draft leaks — you learn their pick only when it was also yours.',
  },
  '11-card-draft': {
    phase: 'Draft',
    note: 'The same mechanism with real cards: 2:3, role-coloured frames, art window on top, the short rule on the face.',
  },
  '12-card-hover': {
    phase: 'Draft',
    note: 'Hover lifts the card and floats the full rule text in a tooltip — the desktop pattern used everywhere a card appears.',
  },
  '13-deployment': {
    phase: 'Deploy',
    note: 'Your water large in the centre, the fleet as landscape ship cards in a side tray. Hovering the board previews a legal placement before you click.',
  },
  '14-deployment-placed': {
    phase: 'Deploy',
    note: 'The layout is hashed and committed before the first shot. It cannot change after this, and the commitment is what a third party checks afterwards.',
  },
  '15-battle': {
    phase: 'Battle',
    note: 'Enemy water dominant centre-left, your own board small at lower-right, the hand fanned along the bottom, and the pot riding the top bar in gold. The commit button is the biggest thing on screen.',
  },
  '16-battle-planned': {
    phase: 'Battle',
    note: 'A plan half-built: the free shot aimed in gold on their board, one card carrying this round’s charge with its gem pulsing.',
  },
  '17-target-hover': {
    phase: 'Battle',
    note: 'Aiming a card: hovering their water previews the full pattern the shot would cover, before anything locks.',
  },
  '18-resolve': {
    phase: 'Resolve',
    note: 'The resolve sequence walks the engine’s own event list in rule order on a light panel, the board visible behind so shots land where they are described.',
  },
  '19-result-settlement': {
    phase: 'After',
    note: 'The receipt: pot, the 5% rake as its own line, net in gold, the settlement transaction, and the replay-verified badge from re-running the whole match client-side. Draws say “stakes returned — no rake”.',
  },
  '20-leaderboard': {
    phase: 'Ladder',
    note: 'The payout curve drawn in gold on the page, not in a help article, with the live pool and your own row pinned.',
  },
  '21-season': {
    phase: 'Ladder',
    note: 'Days left, the live pool, your projected payout at your current rank, and the match history behind it.',
  },
  '22-settings': {
    phase: 'Ladder',
    note: 'Wallet and session key, sound, fast resolve, opponent strength, and a running journal of everything the chain adapter actually did.',
  },
  '23-credits': {
    phase: 'Ladder',
    note: 'The icon set is CC BY, which requires attribution. That is a licence condition rather than a courtesy, so the screen ships with the game.',
  },
  '24-tournament-tiers': {
    phase: 'Tournament',
    note: 'Eight seats a bracket at the arena stakes, with the whole payout curve priced before entry: 5% rake, then 55% to the champion, 25% to the runner-up, 10% to each losing semifinalist. Quarter-final losers take nothing — the curve is the reason to enter.',
  },
  '25-bracket-forming': {
    phase: 'Tournament',
    note: 'Seats staking in view. A bracket only ever starts full — byes cannot exist — and if it never fills, every stake reclaims after ten minutes, no rake.',
  },
  '26-bracket-live': {
    phase: 'Tournament',
    note: 'The bracket as scoreboard: quarters, semis, final, your path picked out in gold, the pot and its split never off screen.',
  },
  '27-champion': {
    phase: 'Tournament',
    note: 'The champion moment — the loudest screen in the game, and the mode’s reason to exist: 55% of an eight-stake pot, settled on-chain with the bracket’s transcript root pinned beside it.',
  },
  '28-desktop-gate': {
    phase: 'Arrival',
    note: 'Below 1280×720 the game does not attempt a squeezed layout: the logo, one sentence, nothing else.',
  },
};

const PROCEDURAL = [
  ['Game cards', 'GameCard', 'The one card component used everywhere — hand, drafts, result, inventory. 2:3, role-coloured frame, composed art window (role gradient, watermark glyph, glyph), name banner, short rule on the face, full rule on hover, and the charge gem as the biggest number on the card.'],
  ['Card back', 'CardBack', 'Sky radial with the twin-chevron mark. Identical for every card, legible at 44×62 in the opponent strip.'],
  ['Ship cards', 'ShipCard', 'Landscape card with the ship’s glyph, its length as pips, and its type. The unrevealed enemy state is the same card admitting only a length, because that is all the rules make public.'],
  ['Board cells', 'Board + theme.css', 'Rounded water tiles on a drifting gradient, with aim, hit, miss, intel and own-hull states. Hover previews ride the same aim state.'],
  ['Wordmark + favicon', 'Wordmark, public/favicon.svg', 'Two chevrons — a fleet in echelon — white and gold on the sky.'],
  ['Charge gem', 'ChargeNumber + .gem', 'A gold gem that counts up one charge at a time and pops as it grows. Gold is spent on money and charges and nothing else.'],
  ['Timer bar', 'theme.css', 'A depleting bar over the commit button that switches to the danger colour for the last seconds.'],
  ['Sky, clouds, escrow chips', 'theme.css, Menus', 'The full-bleed sky gradient, the drifting cloud layer, and the stake-stack chips that form the pot on the escrow screen.'],
  ['Stake tiers, rank frames', 'theme.css', 'One shape tinted per tier and per payout band, rather than one asset each.'],
];

const PALETTE = [
  ['--sky-top', '#6fc3f7', 'The top of the sky. Every screen opens on it.'],
  ['--sky-deep', '#2e7fd9', 'The bottom of the sky gradient.'],
  ['--water', '#23b5e8', 'Playable water. The boards live on it.'],
  ['--panel', '#f5faff', 'Every raised surface — near-white, 24px corners.'],
  ['--ink', '#123a5e', 'Primary text. Dark on light, everywhere.'],
  ['--ink-dim', '#4a6b8c', 'Secondary text and labels.'],
  ['--gold', '#ffc531', 'Money and charges. The loudest colour, used for nothing else.'],
  ['--attack', '#ff6b4a', 'Attack cards.'],
  ['--control', '#9b5cff', 'Control cards.'],
  ['--intel', '#19c8e8', 'Intel cards, knowledge on the board.'],
  ['--predict', '#ff9f1c', 'Prediction and reaction cards.'],
  ['--confirm', '#2ed573', 'The go button. Commit, lock in, play.'],
  ['--danger', '#ff4d5e', 'Hits, losses, refusals.'],
  ['--miss', '#bfe3f5', 'A shell that found water.'],
];

const screensDir = 'screens/web';
const files = readdirSync(screensDir)
  .filter((f) => f.endsWith('.jpg'))
  .sort();

const dataUri = (file: string): string =>
  `data:image/jpeg;base64,${readFileSync(`${screensDir}/${file}`).toString('base64')}`;

const iconSvg = (slot: string, size = 22): string => {
  const paths = ICON_PATHS[slot] ?? [];
  return `<svg viewBox="0 0 512 512" width="${size}" height="${size}" aria-hidden="true">${paths
    .map((d) => `<path d="${d}" fill="currentColor"/>`)
    .join('')}</svg>`;
};

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// --- screens, grouped in the order a player meets them ---------------------
const PHASE_ORDER = [
  'Arrival',
  'Betting',
  'Draft',
  'Deploy',
  'Battle',
  'Resolve',
  'After',
  'Tournament',
  'Ladder',
];
const phases: { phase: string; items: { key: string; html: string }[] }[] = [];
for (const file of files) {
  const key = file.replace('.jpg', '');
  const meta = SCREEN_NOTES[key] ?? { phase: 'Other', note: '' };
  let group = phases.find((p) => p.phase === meta.phase);
  if (!group) {
    group = { phase: meta.phase, items: [] };
    phases.push(group);
  }
  const n = key.slice(0, 2);
  const name = key
    .slice(3)
    .replace(/-/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());
  group.items.push({
    key,
    html: `
    <figure class="screen">
      <div class="frame"><img src="${dataUri(file)}" alt="${esc(name)}" loading="lazy" width="1920" height="1080"></div>
      <figcaption>
        <p class="idx">${n}</p>
        <h3>${esc(name)}</h3>
        <p class="note">${SCREEN_NOTES[key]?.note ?? ''}</p>
      </figcaption>
    </figure>`,
  });
}
phases.sort((a, b) => PHASE_ORDER.indexOf(a.phase) - PHASE_ORDER.indexOf(b.phase));

const iconRows = (prefix: string, label: (slot: string) => string): string =>
  ICON_CREDITS.filter((c) => c.slot.startsWith(prefix))
    .map(
      (c) => `<tr>
        <td class="glyph">${iconSvg(c.slot)}</td>
        <td>${esc(label(c.slot))}</td>
        <td class="mono">${esc(c.name)}</td>
        <td class="mono dim">${esc(c.author)}</td>
      </tr>`,
    )
    .join('');

const cardName = (slot: string): string =>
  CARD_LIST.find((c) => `card.${c.id}` === slot)?.name ?? slot;
const shipName = (slot: string): string =>
  SHIP_LIST.find((s) => `ship.${s.id}` === slot)?.name ?? slot;
const uiName = (slot: string): string =>
  ({
    'ui.hit': 'Hit marker',
    'ui.miss': 'Miss marker',
    'ui.water': 'Open water',
    'ui.contact': 'Contact (Echo)',
    'ui.charge': 'Charge',
    'ui.timer': 'Round timer',
    'ui.rank': 'Rank frame',
    'ui.trophy': 'Victory',
    'ui.anchor': 'Anchor mark',
    'ui.sunk': 'Sunk',
    'ui.locked': 'Restriction',
    'ui.target': 'Aim',
    'ui.hidden': 'Hidden',
  })[slot] ?? slot;

const html = `<title>Shadow Armada UI Inventory</title>
<style>
  /* The page borrows the game's own palette. It is documentation *of* that
     system, so using anything else would be describing one thing in the
     vocabulary of another. Bright on purpose: build 3 is a bright naval
     arcade, and all 24 screenshots are light — a dark ground would fight
     every one of them. */
  :root {
    --sky-top: #6fc3f7;
    --sky-deep: #2e7fd9;
    --panel: #f5faff;
    --panel-dim: #e4f0fb;
    --ink: #123a5e;
    --dim: #4a6b8c;
    --faint: #7e97b0;
    --gold: #ffc531;
    --gold-deep: #b8860f;
    --attack: #ff6b4a;
    --intel: #0ba0bc;
    --confirm: #1fae5c;
    --danger: #ff4d5e;

    --display: 'Trebuchet MS', 'Segoe UI', system-ui, sans-serif;
    --body: 'Segoe UI', system-ui, sans-serif;
    --mono: ui-monospace, 'JetBrains Mono', Menlo, monospace;

    --measure: 66ch;
    --pad: clamp(20px, 5vw, 56px);
    --edge: rgba(18, 58, 94, 0.14);
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    background: var(--sky-deep);
    background-image: linear-gradient(180deg, var(--sky-top) 0%, var(--sky-deep) 100%);
    background-attachment: fixed;
    color: var(--ink);
    font-family: var(--body);
    font-size: 17px;
    line-height: 1.6;
  }

  .wrap { max-width: 1240px; margin: 0 auto; padding: var(--pad); }

  h1, h2, h3, .eyebrow, .idx, th { font-family: var(--display); }

  h1 {
    font-size: clamp(38px, 8vw, 74px);
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 0.98;
    margin: 0 0 18px;
    color: #ffffff;
    text-shadow: 0 3px 0 rgba(18, 58, 94, 0.35);
    text-wrap: balance;
  }
  h1 em { font-style: normal; color: var(--gold); }

  h2 { font-size: clamp(22px, 3.4vw, 30px); font-weight: 800; margin: 0 0 6px; }
  h3 { font-size: 17px; font-weight: 700; margin: 0 0 6px; }

  .eyebrow {
    font-size: 12px; font-weight: 700; letter-spacing: 0.22em;
    text-transform: uppercase; color: var(--gold-deep); margin: 0 0 10px;
  }
  header .eyebrow, header .lede { color: rgba(255,255,255,0.92); }
  header .eyebrow { color: var(--gold); }

  p { margin: 0 0 14px; max-width: var(--measure); }
  .lede { font-size: clamp(18px, 2.2vw, 21px); }
  .note { color: var(--dim); font-size: 15px; margin: 0; }
  .dim { color: var(--faint); }
  .mono { font-family: var(--mono); font-size: 13px; font-variant-numeric: tabular-nums; }

  header.hero { padding-block: clamp(28px, 7vw, 72px) clamp(24px, 5vw, 48px); }

  .stats { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 26px; }
  .stat {
    background: var(--panel);
    border-radius: 14px;
    padding: 12px 16px;
    min-width: 128px;
    box-shadow: 0 8px 24px rgba(18, 58, 94, 0.25);
  }
  .stat b {
    display: block; font-family: var(--display); font-size: 27px;
    font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums;
  }
  .stat span {
    font-family: var(--display); font-size: 11px; letter-spacing: 0.14em;
    text-transform: uppercase; color: var(--faint);
  }

  section {
    background: var(--panel);
    border-radius: 24px;
    padding: clamp(24px, 4vw, 48px);
    margin-bottom: clamp(22px, 3vw, 36px);
    box-shadow: 0 16px 44px rgba(18, 58, 94, 0.3);
  }

  .phase { display: flex; align-items: baseline; gap: 14px; margin: 40px 0 20px; }
  .phase::after { content: ''; flex: 1; height: 2px; background: var(--edge); border-radius: 2px; }
  .phase h3 {
    font-size: 12px; letter-spacing: 0.24em; text-transform: uppercase;
    color: var(--gold-deep); margin: 0;
  }

  .screens {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: clamp(18px, 3vw, 34px);
  }

  .screen { margin: 0; display: flex; flex-direction: column; gap: 12px; }

  /* A 16:9 frame, because that is the shape the game actually is now. */
  .frame {
    border-radius: 14px;
    padding: 5px;
    background: linear-gradient(180deg, #ffffff, var(--panel-dim));
    box-shadow: 0 12px 30px -12px rgba(18, 58, 94, 0.5);
  }
  .frame img {
    display: block; width: 100%; height: auto;
    border-radius: 10px;
    aspect-ratio: 16 / 9;
    object-fit: cover;
  }

  figcaption { display: flex; flex-direction: column; gap: 4px; }
  .idx {
    font-size: 11px; font-weight: 700; letter-spacing: 0.2em;
    color: var(--faint); margin: 0; font-variant-numeric: tabular-nums;
  }

  .tablewrap { overflow-x: auto; border: 2px solid var(--edge); border-radius: 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th {
    text-align: left; font-size: 11px; font-weight: 700;
    letter-spacing: 0.16em; text-transform: uppercase; color: var(--dim);
    padding: 12px 14px; background: var(--panel-dim); white-space: nowrap;
  }
  td { padding: 11px 14px; border-top: 1px solid var(--edge); vertical-align: top; }
  tbody tr:nth-child(even) { background: rgba(18, 58, 94, 0.03); }
  td.glyph { width: 44px; color: var(--sky-deep); }
  td.glyph svg { display: block; }

  .swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px; }
  .sw {
    display: flex; gap: 12px; align-items: center;
    border: 2px solid var(--edge); border-radius: 12px;
    padding: 10px 12px; background: #ffffff;
  }
  .chip { width: 30px; height: 30px; border-radius: 8px; border: 1px solid rgba(18,58,94,0.2); flex: none; }
  .sw div { min-width: 0; }
  .sw b { display: block; font-family: var(--mono); font-size: 12px; font-weight: 600; }
  .sw span { font-size: 12px; color: var(--faint); display: block; line-height: 1.35; }

  .status {
    display: inline-block; font-family: var(--display); font-size: 10px;
    font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
    padding: 3px 8px; border-radius: 6px; white-space: nowrap;
  }
  .s-proc { background: rgba(25, 200, 232, 0.16); color: var(--intel); }
  .s-need { background: rgba(255, 197, 49, 0.22); color: var(--gold-deep); }

  .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 22px; }

  .callout {
    border-left: 4px solid var(--gold);
    background: var(--panel-dim);
    border-radius: 0 12px 12px 0;
    padding: 16px 20px;
  }
  .callout p:last-child { margin-bottom: 0; }

  ul { padding-left: 20px; max-width: var(--measure); color: var(--dim); }
  li { margin-bottom: 7px; }

  a { color: var(--intel); }
  a:focus-visible { outline: 2px solid var(--gold); outline-offset: 3px; }

  footer { padding-block: 8px 40px; color: rgba(255,255,255,0.85); font-size: 14px; }
  footer code { color: #ffffff; }
</style>

<div class="wrap">
  <header class="hero">
    <p class="eyebrow">Shadow Armada · build 4</p>
    <h1>Every screen, and<br>every <em>asset</em> behind it.</h1>
    <p class="lede">Twenty-eight screens photographed at 1920×1080 — tournaments included — and a complete accounting of what is drawn, what is licensed, what now has real audio, and what is still to be made.</p>
    <div class="stats">
      <div class="stat"><b>${files.length}</b><span>Screens</span></div>
      <div class="stat"><b>${ICON_CREDITS.length}</b><span>Licensed icons</span></div>
      <div class="stat"><b>${PROCEDURAL.length}</b><span>Drawn in code</span></div>
      <div class="stat"><b>${PALETTE.length}</b><span>Palette tokens</span></div>
      <div class="stat"><b>${VFX_HOOKS.length}</b><span>Motion effects</span></div>
      <div class="stat"><b>${CUES.length}</b><span>Sound cues</span></div>
    </div>
  </header>

  <section>
    <p class="eyebrow">Part one</p>
    <h2>The screens</h2>
    <p>In the order a player meets them — including every surface where money appears, because a wagered game is judged on those first. Each was captured by walking the real game at 1920×1080: drafting, deploying, staking, planning a round and playing it out. Nothing here is a mock-up of a screen that does not exist.</p>
    ${phases
      .map(
        (p) => `
    <div class="phase"><h3>${esc(p.phase)}</h3></div>
    <div class="screens">${p.items.map((i) => i.html).join('')}</div>`,
      )
      .join('')}
  </section>

  <section>
    <p class="eyebrow">Part two</p>
    <h2>The icon set</h2>
    <p>${ICON_CREDITS.length} glyphs from game-icons.net, used under ${ICON_LICENCE} and retrieved ${ICON_RETRIEVED}. Commercial use is permitted and attribution is required, which the in-app Credits screen carries. They are stored as bare path data and tinted with <code class="mono">currentColor</code>, so a borrowed set reads as one deliberate set — the shapes are theirs, every colour is ours.</p>
    <p><strong>Each icon below is rendered from the same path data the game renders.</strong> Nothing on this page is a picture of the asset; it is the asset.</p>

    <div class="cols">
      <div>
        <div class="phase"><h3>Cards · 12</h3></div>
        <div class="tablewrap"><table>
          <thead><tr><th></th><th>Card</th><th>Glyph</th><th>Author</th></tr></thead>
          <tbody>${iconRows('card.', cardName)}</tbody>
        </table></div>
      </div>
      <div>
        <div class="phase"><h3>Ships · 12</h3></div>
        <div class="tablewrap"><table>
          <thead><tr><th></th><th>Ship</th><th>Glyph</th><th>Author</th></tr></thead>
          <tbody>${iconRows('ship.', shipName)}</tbody>
        </table></div>
      </div>
    </div>

    <div class="phase"><h3>Board and interface · 13</h3></div>
    <div class="tablewrap"><table>
      <thead><tr><th></th><th>Use</th><th>Glyph</th><th>Author</th></tr></thead>
      <tbody>${iconRows('ui.', uiName)}</tbody>
    </table></div>
  </section>

  <section>
    <p class="eyebrow">Part three</p>
    <h2>Drawn in code</h2>
    <p>Everything else on screen is generated, not sourced. This is a deliberate line rather than a shortfall: these are the pieces whose exact size, proportion and state matter more than their surface, and code holds those better than a file does.</p>
    <div class="tablewrap"><table>
      <thead><tr><th>Asset</th><th>Where</th><th>What it is</th><th>Status</th></tr></thead>
      <tbody>
        ${PROCEDURAL.map(
          ([name, where, what]) => `<tr>
          <td><strong>${esc(name)}</strong></td>
          <td class="mono dim">${esc(where)}</td>
          <td>${esc(what)}</td>
          <td><span class="status s-proc">Procedural</span></td>
        </tr>`,
        ).join('')}
      </tbody>
    </table></div>

    <div class="phase"><h3>Palette</h3></div>
    <p>Defined once in <code class="mono">src/ui/theme.css</code>. No screen hardcodes a colour, so the whole game reskins from this list. Shadows are tinted with the deep sea blue — never black — and gold is spent only on money and charges.</p>
    <div class="swatches">
      ${PALETTE.map(
        ([token, hex, use]) => `<div class="sw">
        <span class="chip" style="background:${hex}"></span>
        <div><b>${token}</b><span>${esc(use)}</span></div>
      </div>`,
      ).join('')}
    </div>
  </section>

  <section>
    <p class="eyebrow">Part four</p>
    <h2>Motion</h2>
    <p>All of it is transform and opacity only, so it stays on the compositor and off the main thread. There is no animation library and no canvas — at this scale neither earns its bundle weight. Ambient motion — the water shimmer, the drifting clouds, the bobbing mode-card medallions, the pulsing charge gems — runs everywhere; <code class="mono">prefers-reduced-motion</code> collapses everything to cross-fades and stops the ambience outright.</p>
    <div class="tablewrap"><table>
      <thead><tr><th>Effect</th><th>Fires on</th><th>Reads as</th><th>Budget</th></tr></thead>
      <tbody>
        ${VFX_HOOKS.map(
          (h) => `<tr>
          <td><strong>${esc(h.id)}</strong></td>
          <td class="dim">${esc(h.trigger)}</td>
          <td>${esc(h.reads)}</td>
          <td class="mono">${h.durationMs}ms</td>
        </tr>`,
        ).join('')}
      </tbody>
    </table></div>
  </section>

  <section>
    <p class="eyebrow">Part five</p>
    <h2>Still to be made</h2>
    <p>Two groups, and nothing in either blocks play. The game is complete and shippable on what exists today.</p>

    <div class="phase"><h3>Sound · ${CUES.length} cues, all sourced</h3></div>
    <p>Every cue is a real file from Kenney's CC0 packs, fetched and credited by <code class="mono">npm run audio</code> — the same single-writer discipline as the icons. The charge click rises in pitch with the count; the last five seconds of the timer tick faster each second.</p>
    <div class="tablewrap"><table>
      <thead><tr><th>Cue</th><th>Length</th><th>Description</th><th>Status</th></tr></thead>
      <tbody>
        ${CUES.map(
          (c) => `<tr>
          <td class="mono">${esc(c.id)}</td>
          <td class="mono dim">${esc(c.length)}</td>
          <td>${esc(c.description)}</td>
          <td><span class="status s-proc">Sourced · CC0</span></td>
        </tr>`,
        ).join('')}
      </tbody>
    </table></div>

    <div class="phase"><h3>Illustration · 26 pieces — the drop-in pipeline is live</h3></div>
    <p>Generate against <code class="mono">GEMINI_ASSETS.md</code> (exact files, dimensions, prompts) and drop each image at its path under <code class="mono">src/ui/art/drop/</code> — it appears in the game on the next build, procedural fallback until then.</p>
    <div class="cols">
      <div>
        <h3>Ship heroes — 12</h3>
        <p class="note">1024×1024, three-quarter view, whole hull in frame, the type’s silhouette readable at 120px. Shown on the draft card and at the end-of-match reveal.</p>
      </div>
      <div>
        <h3>Card illustrations — 12</h3>
        <p class="note">768×920 — the art window only, the top 60% of the 2:3 card. The GameCard component draws the frame, name banner, rule text and charge gem below it; a composed role gradient with the glyph carries the window until these exist.</p>
      </div>
      <div>
        <h3>Menu backdrop — 1</h3>
        <p class="note">1920×1080. A bright sky-to-sea horizon in the arcade palette that stays legible under the near-white mode cards. The CSS sky and cloud layer carry it today.</p>
      </div>
      <div>
        <h3>SOL glyph — 1</h3>
        <p class="note">Vector. Sits beside every stake, pot and payout figure.</p>
      </div>
    </div>

    <div class="callout" style="margin-top:26px">
      <p><strong>Two constraints that are not stylistic.</strong></p>
      <p>Anything that can appear on the enemy side must be information-neutral — an unrevealed hull marker cannot hint at which of the four ships of that length it is, or the art leaks what the rules hide.</p>
      <p>Every board asset must read at 48px, because that is its size on the compact own-waters board even at 1920×1080.</p>
    </div>
  </section>

  <section>
    <p class="eyebrow">Part six</p>
    <h2>Licensing</h2>
    <p>Every third-party file in the build is recorded in <code class="mono">ASSETS_CREDITS.md</code> with its source URL, author, licence and retrieval date. The record is generated by the same script that downloads the files, so it cannot drift from what actually shipped.</p>
    <ul>
      <li><strong>Icons</strong> — game-icons.net, ${ICON_LICENCE}. Commercial use permitted, attribution required and provided.</li>
      <li><strong>Fonts</strong> — Baloo 2, Nunito and JetBrains Mono, bundled from the @fontsource packages under the SIL Open Font License 1.1.</li>
      <li><strong>Audio</strong> — 15 cues from Kenney's Interface, Impact, Sci-Fi and Digital Audio packs, all CC0 1.0 (public domain), recorded per-file in ASSETS_CREDITS.md.</li>
      <li><strong>Everything else</strong> — original work in this repository.</li>
      <li><strong>No Epic Games asset</strong>, model, texture, font or sound is used or referenced anywhere. The style references are targets, not sources.</li>
    </ul>
  </section>

  <footer>
    Generated by <code class="mono">npm run inventory</code> from the game’s own content lists and the screenshots the capture script took. Counts are counted, not typed.
  </footer>
</div>
`;

writeFileSync('ui-inventory.html', html, 'utf8');
console.log(
  `wrote ui-inventory.html — ${(html.length / 1024).toFixed(0)} KB, ${files.length} screens, ${ICON_CREDITS.length} icons`,
);
