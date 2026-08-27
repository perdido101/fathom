import { readFileSync, writeFileSync } from 'node:fs';
import {
  ANATOMY,
  COLOURS,
  SECTIONS,
  TYPE_SCALE,
  type Plate,
} from './guide-content';

/**
 * SCREEN_GUIDE.html — every screen, annotated element by element.
 *
 * Generated rather than hand-written so the screenshots stay the ones the
 * capture script actually took, and so the same source produces both the
 * shareable page and the printed PDF. Fonts and images are inlined as data
 * URIs: the page then renders identically with no network at all, which is
 * what makes the PDF match the artifact exactly.
 */

// --- assets ----------------------------------------------------------------

const font = (path: string): string =>
  `data:font/woff2;base64,${readFileSync(path).toString('base64')}`;

const FONTS = {
  display700: font('node_modules/@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-700-normal.woff2'),
  display800: font('node_modules/@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-800-normal.woff2'),
  body400: font('node_modules/@fontsource/source-serif-4/files/source-serif-4-latin-400-normal.woff2'),
  body600: font('node_modules/@fontsource/source-serif-4/files/source-serif-4-latin-600-normal.woff2'),
  mono400: font('node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2'),
  mono600: font('node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-600-normal.woff2'),
};

const shot = (name: string): string =>
  `data:image/jpeg;base64,${readFileSync(`screens/web/${name}.jpg`).toString('base64')}`;

/**
 * Plates whose screenshot the sweep did not manage to take.
 *
 * Two plates are conditional on what a real match produces — a named event
 * needs a REACT, a prediction or a restriction to actually fire — so a sweep
 * can finish clean and still come back one frame short. Crashing the guide
 * over it is the wrong trade, and so is silently shipping a chapter with a
 * hole in it: the plate is dropped and the omission is printed.
 */
const missing: string[] = [];
const hasShot = (name: string): boolean => {
  try {
    readFileSync(`screens/web/${name}.jpg`);
    return true;
  } catch {
    missing.push(name);
    return false;
  }
};

/** Any jpeg by path, for the before/after spread's archived frame. */
const jpeg = (path: string): string =>
  `data:image/jpeg;base64,${readFileSync(path).toString('base64')}`;

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// --- the plates ------------------------------------------------------------

// --- render ----------------------------------------------------------------

/** Every chapter, with any plate the sweep could not photograph dropped. */
const CHAPTERS = SECTIONS.map((s) => ({
  ...s,
  plates: s.plates.filter((p) => p.spread !== undefined || hasShot(p.file)),
}));

const plateCount = CHAPTERS.reduce((n, s) => n + s.plates.length, 0);
const pinCount = CHAPTERS.reduce(
  (n, s) => n + s.plates.reduce((m, p) => m + (p.pins?.length ?? 0), 0),
  0,
);

/** A spread has no capture number, so its anchor comes from its file key. */
function spreadId(plate: Plate): string {
  return `plate-${plate.file.toLowerCase()}`;
}

function renderSpread(plate: Plate): string {
  const s = plate.spread!;
  const before = s.beforeCaption ?? 'Before · Build 5';
  const after = s.afterCaption ?? 'After · Build 6';
  return `<article class="plate spread-plate" id="${spreadId(plate)}">
  <header class="plate-head">
    <p class="plate-num">${esc(s.kicker ?? 'The restraint pass')}</p>
    <h3>${esc(plate.name)}</h3>
    <p class="thesis">${esc(plate.thesis)}</p>
  </header>
  <div class="spread">
    <figure><img src="${jpeg(s.before)}" alt="${esc(before)}" width="1920" height="1080"><figcaption>${esc(before)}</figcaption></figure>
    <figure><img src="${jpeg(s.after)}" alt="${esc(after)}" width="1920" height="1080"><figcaption>${esc(after)}</figcaption></figure>
  </div>
  <div class="spread-lists">
    <div>
      <h4 class="gone-h">${esc(s.goneTitle ?? 'Removed')} — ${s.gone.length}</h4>
      <ul class="gone">${s.gone.map(([h, p]) => `<li><b>${esc(h)}</b><span>${esc(p)}</span></li>`).join('')}</ul>
    </div>
    <div>
      <h4 class="arrived-h">${esc(s.arrivedTitle ?? 'Arrived')} — ${s.arrived.length}</h4>
      <ul class="arrived">${s.arrived.map(([h, p]) => `<li><b>${esc(h)}</b><span>${esc(p)}</span></li>`).join('')}</ul>
    </div>
  </div>
</article>`;
}

function renderPlate(plate: Plate): string {
  if (plate.spread) return renderSpread(plate);
  const pins = plate.pins ?? [];
  const markers = pins
    .map(
      (pin, i) =>
        `<span class="pin" style="left:${pin.x}%;top:${pin.y}%" aria-hidden="true">${i + 1}</span>`,
    )
    .join('');
  const legend = pins.length
    ? `<ol class="legend">${pins
        .map(
          (pin, i) =>
            `<li><span class="legend-n">${i + 1}</span><div><b>${esc(pin.label)}</b><span>${esc(pin.text)}</span></div></li>`,
        )
        .join('')}</ol>`
    : '';
  const notes = plate.notes?.length
    ? `<ul class="notes">${plate.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`
    : '';

  // Before/after callout counts, where the restraint pass changed one. A
  // plate whose count did not move says nothing — "4 4 callouts" reads as a
  // typo rather than as a result.
  const count =
    plate.was !== undefined && plate.was !== pins.length
      ? `<span class="count"><s>${plate.was}</s> ${pins.length} callouts</span>`
      : '';

  return `<article class="plate${pins.length ? ' has-pins' : ''}" id="plate-${plate.num}">
  <header class="plate-head">
    <p class="plate-num">Plate ${plate.num}${count}</p>
    <h3>${esc(plate.name)}</h3>
    <p class="thesis">${esc(plate.thesis)}</p>
  </header>
  <figure class="shot${pins.length ? ' pinned' : ''}">
    <img src="${shot(plate.file)}" alt="${esc(plate.name)}" width="1920" height="1080" loading="lazy">
    ${markers}
  </figure>
  ${legend}
  ${notes}
</article>`;
}

const nav = CHAPTERS.map(
  (s) => `<div class="nav-group">
    <p class="nav-title"><a href="#${s.id}">${esc(s.title)}</a></p>
    <ul>${s.plates
      .map(
        (p) =>
          `<li><a href="#${p.spread ? spreadId(p) : `plate-${p.num}`}"><span>${p.num}</span>${esc(p.name)}</a></li>`,
      )
      .join('')}</ul>
  </div>`,
).join('');

const body = CHAPTERS.map(
  (s) => `<section class="chapter" id="${s.id}">
  <header class="chapter-head">
    <h2>${esc(s.title)}</h2>
    <p>${esc(s.standfirst)}</p>
    <p class="journey">${esc(s.journey)}</p>
  </header>
  ${s.plates.map(renderPlate).join('\n')}
</section>`,
).join('\n');

const html = `<title>Shadow Armada Dossier</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
@font-face{font-family:'Bricolage';src:url(${FONTS.display700}) format('woff2');font-weight:700;font-display:swap}
@font-face{font-family:'Bricolage';src:url(${FONTS.display800}) format('woff2');font-weight:800;font-display:swap}
@font-face{font-family:'SourceSerif';src:url(${FONTS.body400}) format('woff2');font-weight:400;font-display:swap}
@font-face{font-family:'SourceSerif';src:url(${FONTS.body600}) format('woff2');font-weight:600;font-display:swap}
@font-face{font-family:'JB';src:url(${FONTS.mono400}) format('woff2');font-weight:400;font-display:swap}
@font-face{font-family:'JB';src:url(${FONTS.mono600}) format('woff2');font-weight:600;font-display:swap}

/* The game is light-on-sky; this dossier inverts the roles — a quiet chart
   stock so the bright screens read as lit plates, with the game's own gold
   as the single accent and its navy as the ink. */
:root{
  --paper:#E8EFF6;
  --panel:#FFFFFF;
  --panel-2:#F4F8FC;
  --ink:#0E2A44;
  --ink-soft:#4E6A85;
  --ink-faint:#7D95AC;
  --gold:#B7790A;
  --gold-bright:#FFC531;
  --sea:#12639F;
  --rule:rgba(14,42,68,.14);
  --rule-soft:rgba(14,42,68,.08);
  --shadow:0 18px 40px -22px rgba(14,42,68,.55);
  --display:'Bricolage','Trebuchet MS',system-ui,sans-serif;
  --body:'SourceSerif',Georgia,'Times New Roman',serif;
  --mono:'JB',ui-monospace,Menlo,monospace;
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --paper:#081726;
    --panel:#0F2436;
    --panel-2:#132B40;
    --ink:#E6EFF7;
    --ink-soft:#9DB6CC;
    --ink-faint:#6D8AA5;
    --gold:#FFC531;
    --gold-bright:#FFC531;
    --sea:#6BB9F2;
    --rule:rgba(230,239,247,.16);
    --rule-soft:rgba(230,239,247,.09);
    --shadow:0 22px 48px -24px rgba(0,0,0,.85);
  }
}
:root[data-theme="dark"]{
  --paper:#081726;
  --panel:#0F2436;
  --panel-2:#132B40;
  --ink:#E6EFF7;
  --ink-soft:#9DB6CC;
  --ink-faint:#6D8AA5;
  --gold:#FFC531;
  --gold-bright:#FFC531;
  --sea:#6BB9F2;
  --rule:rgba(230,239,247,.16);
  --rule-soft:rgba(230,239,247,.09);
  --shadow:0 22px 48px -24px rgba(0,0,0,.85);
}

*{box-sizing:border-box}
body{
  margin:0;background:var(--paper);color:var(--ink);
  font-family:var(--body);font-size:17px;line-height:1.62;
  -webkit-font-smoothing:antialiased;
}
h1,h2,h3,h4{font-family:var(--display);font-weight:800;line-height:1.06;text-wrap:balance;margin:0}
a{color:inherit}

.wrap{display:grid;grid-template-columns:250px minmax(0,1fr);gap:clamp(28px,4vw,64px);
  max-width:1500px;margin:0 auto;padding:0 clamp(20px,3.5vw,52px)}

/* --- masthead ---------------------------------------------------------- */
.masthead{grid-column:1/-1;padding:clamp(48px,7vw,104px) 0 clamp(28px,4vw,52px);
  border-bottom:2px solid var(--ink)}
.kicker{font-family:var(--mono);font-size:12px;font-weight:600;letter-spacing:.24em;
  text-transform:uppercase;color:var(--gold);margin:0 0 20px}
.masthead h1{font-size:clamp(46px,8.2vw,104px);letter-spacing:-.035em}
.masthead h1 em{font-style:normal;color:var(--ink-faint)}
.lede{font-size:clamp(19px,2vw,23px);color:var(--ink-soft);max-width:60ch;margin:22px 0 0}
.tally{display:flex;flex-wrap:wrap;gap:0;margin-top:34px;border-top:1px solid var(--rule)}
.tally div{padding:16px 28px 0 0;margin-right:28px;border-right:1px solid var(--rule)}
.tally div:last-child{border-right:0}
.tally b{display:block;font-family:var(--display);font-size:30px;line-height:1;
  font-variant-numeric:tabular-nums}
.tally span{font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;
  color:var(--ink-faint)}

/* --- nav rail ---------------------------------------------------------- */
.rail{padding:44px 0 80px}
.rail-inner{position:sticky;top:28px;max-height:calc(100vh - 56px);overflow-y:auto;
  padding-right:8px}
.nav-group{margin-bottom:26px}
.nav-title{margin:0 0 8px;font-family:var(--mono);font-size:11px;font-weight:600;
  letter-spacing:.16em;text-transform:uppercase;color:var(--gold)}
.nav-title a{text-decoration:none}
.rail ul{list-style:none;margin:0;padding:0;border-left:1px solid var(--rule)}
.rail li a{display:flex;gap:10px;padding:4px 0 4px 12px;font-size:14px;color:var(--ink-soft);
  text-decoration:none;line-height:1.35;border-left:2px solid transparent;margin-left:-1px}
.rail li a span{font-family:var(--mono);font-size:11px;color:var(--ink-faint);padding-top:2px}
.rail li a:hover{color:var(--ink);border-left-color:var(--gold)}

/* --- primer ------------------------------------------------------------ */
.primer{padding:clamp(40px,5vw,72px) 0;border-bottom:1px solid var(--rule)}
.primer > h2{font-size:clamp(26px,3vw,38px);letter-spacing:-.02em}
.primer > p{color:var(--ink-soft);max-width:62ch;margin:14px 0 0}
.swatches{display:grid;grid-template-columns:repeat(auto-fill,minmax(215px,1fr));gap:14px;
  margin-top:34px}
.sw{display:flex;gap:12px;align-items:flex-start}
.chip{width:26px;height:26px;border-radius:7px;flex:none;margin-top:3px;
  box-shadow:inset 0 0 0 1px rgba(14,42,68,.22)}
.sw b{display:block;font-family:var(--display);font-size:15px;font-weight:700}
.sw span{display:block;font-size:14px;line-height:1.45;color:var(--ink-soft)}
.anat{display:grid;grid-template-columns:repeat(auto-fit,minmax(275px,1fr));gap:26px;margin-top:40px}
.anat h4{font-size:17px;font-weight:700;margin-bottom:7px}
.anat p{margin:0;font-size:15.5px;line-height:1.55;color:var(--ink-soft)}

/* --- chapters and plates ------------------------------------------------ */
.chapter{padding-top:clamp(46px,5.5vw,86px)}
.chapter-head{max-width:66ch;margin-bottom:40px}
.chapter-head h2{font-size:clamp(30px,4vw,50px);letter-spacing:-.028em}
.chapter-head p{margin:16px 0 0;color:var(--ink-soft);font-size:18px}

.plate{margin-bottom:clamp(46px,5vw,80px)}
.plate-head{max-width:70ch;margin-bottom:20px}
.plate-num{margin:0 0 6px;font-family:var(--mono);font-size:11px;font-weight:600;
  letter-spacing:.18em;text-transform:uppercase;color:var(--gold)}
.plate-head h3{font-size:clamp(22px,2.4vw,29px);letter-spacing:-.02em}
.thesis{margin:10px 0 0;font-size:17.5px;color:var(--ink-soft)}
/* The journey passage: what the player is doing in this phase, set apart
   from the standfirst so a reader can take one and skip the other. */
.journey{margin:18px 0 0;padding-left:18px;border-left:3px solid var(--gold);
  font-size:17px;color:var(--ink);font-style:italic}
/* Before/after callout counts. The claim that the pass worked, shown. */
.count{margin-left:10px;color:var(--gold);letter-spacing:.02em}
/* The type scale, shown at something like its own proportions. */
.scale{margin-top:34px;padding-top:26px;border-top:1px solid var(--rule-soft)}
.scale h4{margin:0 0 6px;font-family:var(--display);font-size:19px;letter-spacing:-.02em}
.scale > p{margin:0 0 16px;color:var(--ink-soft);max-width:60ch}
.scale ul{list-style:none;margin:0;padding:0;display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 30px}
.scale li{display:flex;align-items:baseline;gap:14px;padding-bottom:9px;
  border-bottom:1px solid var(--rule-soft)}
.scale li b{font-family:var(--display);font-weight:800;color:var(--gold);
  min-width:64px;line-height:1;flex:none;text-align:right}
.scale li span{font-size:14px;color:var(--ink-soft);line-height:1.4}
.count s{color:var(--ink-faint);text-decoration-thickness:1px;margin-right:4px}

/* The restraint spread: two frames, then what left and what arrived. */
.spread{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:6px}
.spread figure{margin:0}
.spread img{width:100%;height:auto;display:block;border-radius:10px;
  border:1px solid var(--rule);box-shadow:var(--shadow)}
.spread figcaption{margin-top:8px;font-family:var(--mono);font-size:11px;
  font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-faint)}
.spread-lists{display:grid;grid-template-columns:1.55fr 1fr;gap:22px;margin-top:24px}
.spread-lists h4{margin:0 0 10px;font-family:var(--mono);font-size:11px;font-weight:600;
  letter-spacing:.1em;text-transform:uppercase}
.gone-h{color:#B4472F}
.arrived-h{color:#1F7A4C}
.spread-lists ul{list-style:none;margin:0;padding:0;display:grid;gap:9px}
.spread-lists li{padding-left:16px;position:relative;font-size:14px;line-height:1.45}
.spread-lists li b{display:block;color:var(--ink)}
.spread-lists li span{color:var(--ink-soft)}
.gone li::before{content:'−';position:absolute;left:0;top:0;color:#B4472F;font-weight:700}
.arrived li::before{content:'+';position:absolute;left:0;top:0;color:#1F7A4C;font-weight:700}

.shot{position:relative;margin:0;border-radius:10px;overflow:hidden;
  background:var(--panel);box-shadow:var(--shadow);border:1px solid var(--rule)}
.shot img{display:block;width:100%;height:auto}

.pin{position:absolute;transform:translate(-50%,-50%);
  min-width:26px;height:26px;padding:0 5px;border-radius:999px;
  display:grid;place-items:center;
  background:var(--gold-bright);color:#3D2600;
  font-family:var(--mono);font-size:13px;font-weight:600;
  box-shadow:0 0 0 2.5px rgba(255,255,255,.92),0 3px 10px rgba(14,42,68,.45);
  font-variant-numeric:tabular-nums}

.legend{list-style:none;margin:22px 0 0;padding:0;
  display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));
  gap:14px 34px}
.legend li{display:flex;gap:12px;align-items:flex-start;
  padding-top:12px;border-top:1px solid var(--rule-soft)}
.legend-n{flex:none;width:24px;height:24px;border-radius:999px;display:grid;place-items:center;
  background:var(--gold-bright);color:#3D2600;
  font-family:var(--mono);font-size:12px;font-weight:600;margin-top:2px;
  font-variant-numeric:tabular-nums}
.legend b{display:block;font-family:var(--display);font-size:15px;font-weight:700;
  letter-spacing:-.005em;margin-bottom:2px}
.legend span{display:block;font-size:15px;line-height:1.5;color:var(--ink-soft)}

.notes{margin:22px 0 0;padding:0;list-style:none;max-width:74ch;
  display:flex;flex-direction:column;gap:10px}
.notes li{padding-left:20px;position:relative;font-size:16px;color:var(--ink-soft)}
.notes li::before{content:'';position:absolute;left:0;top:.62em;width:9px;height:2px;
  background:var(--gold)}

footer{grid-column:1/-1;margin-top:60px;padding:34px 0 70px;border-top:2px solid var(--ink);
  display:flex;flex-wrap:wrap;gap:18px 40px;align-items:baseline}
footer p{margin:0;font-size:14.5px;color:var(--ink-soft);max-width:64ch}
footer .mono{font-family:var(--mono);font-size:11.5px;letter-spacing:.1em;
  text-transform:uppercase;color:var(--ink-faint)}

@media (max-width:980px){
  .wrap{grid-template-columns:minmax(0,1fr)}
  .rail{display:none}
}

/* --- print: the same document, paginated -------------------------------- */
@page{size:A4 landscape;margin:13mm}
@media print{
  :root{
    --paper:#FFFFFF;--panel:#FFFFFF;--panel-2:#F4F8FC;
    --ink:#0E2A44;--ink-soft:#3F5A73;--ink-faint:#6B8299;
    --gold:#9A6708;--gold-bright:#FFC531;--sea:#12639F;
    --rule:rgba(14,42,68,.22);--rule-soft:rgba(14,42,68,.12);
    --shadow:none;
  }
  body{background:#fff;font-size:10.5pt;line-height:1.5}
  .wrap{display:block;max-width:none;padding:0}
  .rail{display:none}
  .masthead{padding:0 0 16pt;break-after:page}
  .masthead h1{font-size:44pt}
  .lede{font-size:12pt}
  .primer{break-after:page;padding:0 0 12pt;border-bottom:0}
  .chapter{padding-top:0;break-before:page}
  .chapter-head{margin-bottom:16pt}
  .chapter-head h2{font-size:26pt}
  .chapter-head p{font-size:11pt}
  .journey{font-size:10.5pt;margin-top:9pt;padding-left:10pt;border-left-width:2pt}
  .spread-plate{break-before:page}
  .spread{gap:9pt;margin-top:4pt}
  .spread figcaption{font-size:7pt;margin-top:3pt}
  .spread-lists{gap:12pt;margin-top:10pt}
  .spread-lists h4{font-size:7.5pt;margin-bottom:5pt}
  .spread-lists li{font-size:8.2pt;line-height:1.34;gap:5pt}
  .count{font-size:7pt}
  .scale{margin-top:14pt;padding-top:12pt}
  .scale ul{gap:5pt 20pt}
  .scale li{padding-bottom:4pt}
  .scale li b{min-width:38pt}
  .scale li span{font-size:8.2pt;line-height:1.32}
  /* One plate to a page: the screenshot is sized against the legend it has
     to share the sheet with, rather than taking the full measure and
     pushing its own explanation onto the next page. */
  .plate{break-inside:avoid;break-before:page;margin-bottom:0}
  .chapter > .plate:first-of-type{break-before:auto}
  .plate-head{margin-bottom:7pt}
  .plate-head h3{font-size:16pt}
  .thesis{font-size:10pt;margin-top:5pt}
  .shot{box-shadow:none;border:.5pt solid var(--rule);width:57%;margin:0 auto}
  .plate:not(.has-pins) .shot{width:74%}
  .pin{box-shadow:0 0 0 1.2pt #fff;min-width:13pt;height:13pt;font-size:7pt;padding:0 3pt}
  .legend{gap:5pt 15pt;grid-template-columns:repeat(3,minmax(0,1fr));margin-top:9pt}
  .legend li{padding-top:5pt}
  .legend b{font-size:9pt;margin-bottom:1pt}
  .legend span{font-size:8.2pt;line-height:1.34}
  .legend-n{width:12pt;height:12pt;font-size:7pt;margin-top:1pt}
  .notes{margin-top:11pt;max-width:none;
    display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8pt 16pt}
  .notes li{font-size:8.8pt;line-height:1.4;padding-left:12pt}
  .notes li::before{top:.55em;width:6pt}
  footer{margin-top:20pt;padding:14pt 0 0;break-before:page}
  img{image-rendering:auto}
}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>

<div class="wrap">
  <header class="masthead">
    <p class="kicker">Shadow Armada · build 7 · captured at 1920×1080</p>
    <h1>Every screen,<br>and what <em>every part of it</em> is for.</h1>
    <p class="lede">A hidden-information naval duel wagered on Solana, documented plate by plate:
      ${plateCount} screens photographed from the running game, with ${pinCount} callouts naming
      what each element is, what it does, and why it was built that way.</p>
    <div class="tally">
      <div><b>${plateCount}</b><span>Plates</span></div>
      <div><b>${pinCount}</b><span>Callouts</span></div>
      <div><b>${CHAPTERS.length}</b><span>Chapters</span></div>
      <div><b>1920×1080</b><span>Capture</span></div>
    </div>
  </header>

  <nav class="rail" aria-label="Plate index"><div class="rail-inner">${nav}</div></nav>

  <main>
    <section class="primer" id="primer">
      <h2>Reading the screens</h2>
      <p>A palette, a type scale and six conventions carry every plate that follows. Learn
        these and the rest of the document explains itself.</p>

      <div class="swatches">
        ${COLOURS.map(
          ([hex, name, use]) =>
            `<div class="sw"><span class="chip" style="background:${hex}"></span>
             <div><b>${esc(name)}</b><span>${esc(use)}</span></div></div>`,
        ).join('')}
      </div>

      <div class="scale">
        <h4>The type scale</h4>
        <p>Eight steps, defined once as tokens. Every text element in the game maps to one of
          them and nothing invents a ninth.</p>
        <ul>
          ${TYPE_SCALE.map(
            ([px, use]) =>
              `<li><b style="font-size:${Math.max(11, Math.round(Number(px) * 0.34))}px">${px}</b><span>${esc(use)}</span></li>`,
          ).join('')}
        </ul>
      </div>

      <div class="anat">
        ${ANATOMY.map((a) => `<div><h4>${esc(a.h)}</h4><p>${esc(a.p)}</p></div>`).join('')}
      </div>
    </section>

    ${body}
  </main>

  <footer>
    <p><b>How these were made.</b> Every plate is a real screenshot taken by
      <code class="mono">npm run screens</code>, which drives a browser through the actual game —
      queueing, drafting, deploying, planning rounds, settling — and photographs what is on
      screen. Nothing here is a mock-up of a screen that does not exist.</p>
    <p class="mono">Shadow Armada · devnet only · ${plateCount} plates</p>
  </footer>
</div>
`;

writeFileSync('SCREEN_GUIDE.html', html, 'utf8');
console.log(
  `wrote SCREEN_GUIDE.html — ${(html.length / 1024 / 1024).toFixed(1)} MB, ${plateCount} plates, ${pinCount} callouts`,
);
if (missing.length) {
  console.warn(
    `  ! ${missing.length} plate(s) dropped — the sweep took no frame for: ${missing.join(', ')}`,
  );
}
