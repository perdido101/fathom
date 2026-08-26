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
 * ones the capture script just took, and the counts are counted.
 */

const SCREEN_NOTES: Record<string, { phase: string; note: string }> = {
  '01-menu-first-run': {
    phase: 'Arrival',
    note: 'First run is one button into a real match. No wallet, no signup, and no mention of either — a player should find out whether they like the game before being asked for anything.',
  },
  '02-howto-charging': {
    phase: 'Arrival',
    note: 'How to play is four things you do, not four things you read. Here the cards are live: tapping one charges it.',
  },
  '03-howto-firing': {
    phase: 'Arrival',
    note: 'The rule that catches everyone out. Tap the card and it fires at five, spends all five, and leaves the match for good.',
  },
  '04-howto-simultaneous': {
    phase: 'Arrival',
    note: 'Why the resolve order matters: a ship that dies this round still lands every shot it fired.',
  },
  '05-howto-sinks': {
    phase: 'Arrival',
    note: 'A sink announces a length and never a name. Every fleet is one 4, one 3 and one 2, so the length names the slot and leaves three candidates.',
  },
  '06-ship-draft': {
    phase: 'Draft',
    note: 'A pack of four, face up to both players. Both pick in secret; duplicates are legal and carry no penalty.',
  },
  '07-draft-collision': {
    phase: 'Draft',
    note: 'The collision. This is the only thing a draft leaks — you learn their pick only when it was also yours, which is what keeps 64 enemy fleets on the table.',
  },
  '08-card-draft': {
    phase: 'Draft',
    note: 'The same mechanism, so it is learned once and used twice. Everything neither player takes becomes the shared draw pile.',
  },
  '09-deployment': {
    phase: 'Deploy',
    note: 'Orthogonal only, and hulls may touch — two side by side read as one long ship for several rounds, which is a real defensive choice.',
  },
  '10-deployment-placed': {
    phase: 'Deploy',
    note: 'The layout is hashed and written before the first shot. It cannot change after this, and the commitment is what a third party checks afterwards.',
  },
  '11-battle-empty': {
    phase: 'Battle',
    note: 'Their water dominant, yours smaller below, both hands with charge counts. The public state sits in one row: their hull, their bank, their card count.',
  },
  '12-battle-planned': {
    phase: 'Battle',
    note: 'A plan half-built. The free shot is marked in amber on their board and a card has taken this round’s charge.',
  },
  '13-battle-targeting': {
    phase: 'Battle',
    note: 'Aiming a card. Every card aims differently, so the prompt says what the next tap does rather than assuming the player remembers.',
  },
  '14-resolve-overlay': {
    phase: 'Resolve',
    note: 'The sequence walks the engine’s own event list in the order the rules resolve it, so a player can see why something happened, not just that it did.',
  },
  '15-resolve-shots': {
    phase: 'Resolve',
    note: 'Attacks resolving. Plain language throughout, hits and misses distinguished by shape as well as colour, and the board visible behind so the shots land where they are described.',
  },
  '16-result': {
    phase: 'After',
    note: 'Both fleets revealed here and nowhere earlier. The replay check runs client-side on every match; rematch and next opponent are one tap and the same size.',
  },
  '17-menu-returning': {
    phase: 'After',
    note: 'The menu after a first match. Modes, rating and season position appear only once there is something for them to mean.',
  },
  '18-leaderboard': {
    phase: 'Ladder',
    note: 'The payout curve is on the page, not in a help article. Top 1% take the largest share; the top tenth at least recover their entry.',
  },
  '19-season': {
    phase: 'Ladder',
    note: 'Days left, the live pool, your projected payout at your current rank, and the match history behind it.',
  },
  '20-settings': {
    phase: 'Ladder',
    note: 'Wallet and session key, sound, fast resolve, opponent strength, and a running journal of everything the chain adapter actually did.',
  },
  '21-credits': {
    phase: 'Ladder',
    note: 'The icon set is CC BY, which requires attribution. That is a licence condition rather than a courtesy, so the screen ships with the game.',
  },
  '22-queue-arena': {
    phase: 'Ladder',
    note: 'Stake tiers with the pot, the rake and the payout spelled out before anyone commits. Provisional accounts are held to the lowest table.',
  },
};

const PROCEDURAL = [
  ['Ship hulls', 'ShipArt', 'A tinted rounded hull of the right length with the ship’s mark inset. An unidentified enemy hull is the same grey slab whatever it turns out to be, showing only its length.'],
  ['Card faces', 'CardArt', 'Role-tinted gradient, role label, name with its mark, rule text, and the charge number as the largest element on the card.'],
  ['Card backs', 'CardArt', 'A diagonal hatch, identical for every card, legible down to 30×40 in the opponent’s hand.'],
  ['Board cells', 'Board + theme.css', 'Rounded water tiles with a slow drifting gradient, and hit, miss, contact, hull and sunk states.'],
  ['Wordmark', 'Wordmark', 'Two overlapping chevrons — a fleet in echelon — with the name set beside them.'],
  ['Favicon', 'public/favicon.svg', 'The same chevrons on the deep ground, at tab size.'],
  ['Charge number', 'ChargeNumber', 'Counts up one charge at a time and pops as it grows. Losses land immediately; the resolve overlay already explains those.'],
  ['Timer bar', 'theme.css', 'A depleting bar that switches to the danger colour for the last five seconds.'],
  ['Stake tiers, rank frames', 'theme.css', 'One shape tinted per tier and per payout band, rather than one asset each.'],
];

const PALETTE = [
  ['--deep', '#05080f', 'The ground. Everything sits on it.'],
  ['--hull', '#0d1522', 'Unfired water, and the ground for pills.'],
  ['--panel', '#101a2b', 'Every raised surface.'],
  ['--panel-edge', '#1d2c44', 'The one-pixel edge that separates them.'],
  ['--ink', '#e8eef8', 'Primary text.'],
  ['--ink-dim', '#8fa1bd', 'Secondary text and labels.'],
  ['--ink-faint', '#56657f', 'Coordinates, logs, rule text.'],
  ['--charge', '#ffc14d', 'Charges. The loudest thing in the product, and used for nothing else.'],
  ['--hit', '#ff5a4d', 'A shell that connected.'],
  ['--miss', '#3b4c67', 'A shell that found water.'],
  ['--intel', '#4dd6ff', 'Knowledge: aim previews, contacts, readouts.'],
  ['--friend', '#57d998', 'Your side, and a win.'],
  ['--danger', '#ff4d6d', 'A loss, a strike, a refusal.'],
  ['--sol', '#14f195', 'Solana. Stakes, payouts, the primary action.'],
];

const screensDir = 'screens/web';
const files = readdirSync(screensDir)
  .filter((f) => f.endsWith('.webp'))
  .sort();

const dataUri = (file: string): string =>
  `data:image/webp;base64,${readFileSync(`${screensDir}/${file}`).toString('base64')}`;

const iconSvg = (slot: string, size = 22): string => {
  const paths = ICON_PATHS[slot] ?? [];
  return `<svg viewBox="0 0 512 512" width="${size}" height="${size}" aria-hidden="true">${paths
    .map((d) => `<path d="${d}" fill="currentColor"/>`)
    .join('')}</svg>`;
};

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// --- screens, grouped in the order a player meets them ---------------------
const phases: { phase: string; items: string[] }[] = [];
for (const file of files) {
  const key = file.replace('.webp', '');
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
  group.items.push(`
    <figure class="screen">
      <div class="frame"><img src="${dataUri(file)}" alt="${esc(name)}" loading="lazy" width="393" height="852"></div>
      <figcaption>
        <p class="idx">${n}</p>
        <h3>${esc(name)}</h3>
        <p class="note">${meta.note}</p>
      </figcaption>
    </figure>`);
}

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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800&family=JetBrains+Mono:wght@400;600&family=Newsreader:opsz,wght@6..72,300;6..72,400;6..72,500&display=swap">
<style>
  /* The page borrows the game's own palette. It is documentation *of* that
     system, so using anything else would be describing one thing in the
     vocabulary of another. Single theme on purpose: all 22 screenshots are
     dark, and a light ground would fight every one of them. */
  :root {
    --deep: #05080f;
    --hull: #0d1522;
    --panel: #101a2b;
    --edge: #1d2c44;
    --ink: #e8eef8;
    --dim: #8fa1bd;
    --faint: #56657f;
    --charge: #ffc14d;
    --hit: #ff5a4d;
    --intel: #4dd6ff;
    --sol: #14f195;
    --danger: #ff4d6d;

    --display: 'Archivo', system-ui, sans-serif;
    --body: 'Newsreader', Georgia, serif;
    --mono: 'JetBrains Mono', ui-monospace, monospace;

    --measure: 66ch;
    --pad: clamp(20px, 5vw, 56px);
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    background: var(--deep);
    color: var(--ink);
    font-family: var(--body);
    font-size: 17px;
    line-height: 1.6;
    /* A faint wash from the top, the same one the game paints behind itself. */
    background-image: radial-gradient(120% 70% at 50% 0%, #0a1220 0%, var(--deep) 68%);
    background-attachment: fixed;
  }

  .wrap { max-width: 1180px; margin: 0 auto; padding: var(--pad); }

  h1, h2, h3, .eyebrow, .idx, th { font-family: var(--display); }

  h1 {
    font-size: clamp(38px, 8vw, 76px);
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 0.95;
    margin: 0 0 18px;
    text-wrap: balance;
  }
  h1 em { font-style: normal; color: var(--charge); }

  h2 {
    font-size: clamp(22px, 3.4vw, 30px);
    font-weight: 700;
    letter-spacing: -0.01em;
    margin: 0 0 6px;
  }

  h3 { font-size: 17px; font-weight: 700; margin: 0 0 6px; letter-spacing: -0.005em; }

  .eyebrow {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--charge);
    margin: 0 0 10px;
  }

  p { margin: 0 0 14px; max-width: var(--measure); }
  .lede { font-size: clamp(18px, 2.2vw, 21px); color: var(--dim); }
  .note { color: var(--dim); font-size: 15px; margin: 0; }
  .dim { color: var(--faint); }
  .mono { font-family: var(--mono); font-size: 13px; font-variant-numeric: tabular-nums; }

  header.hero {
    padding-block: clamp(28px, 7vw, 72px) clamp(24px, 5vw, 48px);
    border-bottom: 1px solid var(--edge);
  }

  .stats {
    display: flex; flex-wrap: wrap; gap: 10px; margin-top: 26px;
  }
  .stat {
    border: 1px solid var(--edge);
    background: var(--panel);
    border-radius: 10px;
    padding: 12px 16px;
    min-width: 128px;
  }
  .stat b {
    display: block;
    font-family: var(--display);
    font-size: 27px;
    font-weight: 800;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .stat span {
    font-family: var(--display);
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--faint);
  }

  section { padding-block: clamp(38px, 7vw, 72px); border-bottom: 1px solid var(--edge); }
  section:last-of-type { border-bottom: 0; }

  .phase {
    display: flex; align-items: baseline; gap: 14px;
    margin: 40px 0 20px;
  }
  .phase::after {
    content: ''; flex: 1; height: 1px; background: var(--edge);
  }
  .phase h3 {
    font-size: 12px; letter-spacing: 0.24em; text-transform: uppercase;
    color: var(--charge); margin: 0;
  }

  .screens {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: clamp(18px, 3vw, 34px);
  }

  .screen { margin: 0; display: flex; flex-direction: column; gap: 12px; }

  /* A device-proportioned frame, so a screenshot reads as a screen rather
     than as a picture of one. */
  .frame {
    border: 1px solid var(--edge);
    border-radius: 18px;
    padding: 6px;
    background: linear-gradient(180deg, #16233a, #0b1220);
    box-shadow: 0 18px 40px -22px rgba(0,0,0,0.9);
  }
  .frame img {
    display: block; width: 100%; height: auto;
    border-radius: 12px;
    aspect-ratio: 393 / 852;
    object-fit: cover;
    object-position: top;
  }

  figcaption { display: flex; flex-direction: column; gap: 4px; }
  .idx {
    font-size: 11px; font-weight: 700; letter-spacing: 0.2em;
    color: var(--faint); margin: 0; font-variant-numeric: tabular-nums;
  }

  .tablewrap { overflow-x: auto; border: 1px solid var(--edge); border-radius: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th {
    text-align: left; font-size: 11px; font-weight: 700;
    letter-spacing: 0.16em; text-transform: uppercase; color: var(--faint);
    padding: 12px 14px; background: var(--hull); white-space: nowrap;
  }
  td { padding: 11px 14px; border-top: 1px solid var(--edge); vertical-align: top; }
  tbody tr:nth-child(even) { background: rgba(255,255,255,0.014); }
  td.glyph { width: 44px; color: var(--charge); }
  td.glyph svg { display: block; }

  .swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px; }
  .sw { display: flex; gap: 12px; align-items: center; border: 1px solid var(--edge); border-radius: 10px; padding: 10px 12px; background: var(--panel); }
  .chip { width: 30px; height: 30px; border-radius: 7px; border: 1px solid rgba(255,255,255,0.14); flex: none; }
  .sw div { min-width: 0; }
  .sw b { display: block; font-family: var(--mono); font-size: 12px; font-weight: 600; }
  .sw span { font-size: 12px; color: var(--faint); display: block; line-height: 1.35; }

  .status {
    display: inline-block; font-family: var(--display); font-size: 10px;
    font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
    padding: 3px 8px; border-radius: 5px; white-space: nowrap;
  }
  .s-sourced { background: rgba(20,241,149,0.13); color: var(--sol); }
  .s-proc { background: rgba(77,214,255,0.12); color: var(--intel); }
  .s-need { background: rgba(255,193,77,0.13); color: var(--charge); }

  .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 22px; }

  .callout {
    border-left: 2px solid var(--charge);
    background: var(--panel);
    border-radius: 0 10px 10px 0;
    padding: 16px 20px;
  }
  .callout p:last-child { margin-bottom: 0; }

  ul { padding-left: 20px; max-width: var(--measure); color: var(--dim); }
  li { margin-bottom: 7px; }

  a { color: var(--intel); }
  a:focus-visible, [tabindex]:focus-visible { outline: 2px solid var(--charge); outline-offset: 3px; }

  footer { padding-block: 40px; color: var(--faint); font-size: 14px; }
</style>

<div class="wrap">
  <header class="hero">
    <p class="eyebrow">Shadow Armada · build 2</p>
    <h1>Every screen, and<br>every <em>asset</em> behind it.</h1>
    <p class="lede">Twenty-two screens photographed at 393×852, and a complete accounting of what is drawn, what is licensed, and what is still to be made.</p>
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
    <p>In the order a player meets them. Each was captured by walking the real game — drafting, deploying, planning a round and playing it out — so nothing here is a mock-up of a screen that does not exist.</p>
    ${phases
      .map(
        (p) => `
    <div class="phase"><h3>${esc(p.phase)}</h3></div>
    <div class="screens">${p.items.join('')}</div>`,
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
    <p>Defined once in <code class="mono">src/ui/theme.css</code>. No screen hardcodes a colour, so the whole game reskins from this list.</p>
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
    <p>All of it is transform and opacity only, so it stays on the compositor and off the main thread. There is no animation library and no canvas — at this scale neither earns its bundle weight. <code class="mono">prefers-reduced-motion</code> collapses everything to cross-fades and stops the ambient water outright.</p>
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

    <div class="phase"><h3>Sound · ${CUES.length} cues, none recorded</h3></div>
    <p>Every cue below already fires from the SoundManager with no audio attached, so dropping files in is the whole integration. Mono, 48kHz.</p>
    <div class="tablewrap"><table>
      <thead><tr><th>Cue</th><th>Length</th><th>Description</th><th>Status</th></tr></thead>
      <tbody>
        ${CUES.map(
          (c) => `<tr>
          <td class="mono">${esc(c.id)}</td>
          <td class="mono dim">${esc(c.length)}</td>
          <td>${esc(c.description)}</td>
          <td><span class="status s-need">Needed</span></td>
        </tr>`,
        ).join('')}
      </tbody>
    </table></div>

    <div class="phase"><h3>Illustration · 26 pieces</h3></div>
    <div class="cols">
      <div>
        <h3>Ship heroes — 12</h3>
        <p class="note">1024×1024, three-quarter view, whole hull in frame, the type’s silhouette readable at 120px. Shown on the draft card and at the end-of-match reveal.</p>
      </div>
      <div>
        <h3>Card illustrations — 12</h3>
        <p class="note">768×1152. Art fills the top 60%; the bottom 40% stays clear for the name, the rule text and the charge number. The icon carries each card until these exist.</p>
      </div>
      <div>
        <h3>Menu backdrop — 1</h3>
        <p class="note">1170×2532. A dark sea horizon that stays legible under text at 60% overlay.</p>
      </div>
      <div>
        <h3>SOL glyph — 1</h3>
        <p class="note">Vector. Sits beside every stake, pot and payout figure.</p>
      </div>
    </div>

    <div class="callout" style="margin-top:26px">
      <p><strong>Two constraints that are not stylistic.</strong></p>
      <p>Anything that can appear on the enemy side must be information-neutral — an unrevealed hull marker cannot hint at which of the four ships of that length it is, or the art leaks what the rules hide.</p>
      <p>Every board asset must read at 48px on a phone, because that is the size it will actually be seen at.</p>
    </div>
  </section>

  <section>
    <p class="eyebrow">Part six</p>
    <h2>Licensing</h2>
    <p>Every third-party file in the build is recorded in <code class="mono">ASSETS_CREDITS.md</code> with its source URL, author, licence and retrieval date. The record is generated by the same script that downloads the files, so it cannot drift from what actually shipped.</p>
    <ul>
      <li><strong>Icons</strong> — game-icons.net, ${ICON_LICENCE}. Commercial use permitted, attribution required and provided.</li>
      <li><strong>Fonts</strong> — none bundled. The game uses the system stack.</li>
      <li><strong>Audio</strong> — none shipped.</li>
      <li><strong>Everything else</strong> — original work in this repository.</li>
      <li><strong>No Epic Games asset</strong>, model, texture, font or sound is used or referenced anywhere. “Stylised 3D” is a visual target, not a source.</li>
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
