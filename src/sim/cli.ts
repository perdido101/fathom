import { writeFileSync } from 'node:fs';
import { playBotMatch } from './runner';
import { analyse, pct, renderMarkdown, type PairingReport } from './report';
import type { Level } from '../bots/bot';
import { CARDS } from '../engine/cards';

/**
 * `npm run sim` — thousands of seeded bot matches, then the bands.
 *
 * Determinism is checked first and separately, because every number that
 * follows is worthless if the same seed can produce two different matches.
 */

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : fallback;
}

const MATCHES = arg('matches', 2000);

/**
 * Mirror's threshold, overridable for measurement only.
 *
 * The value that ships lives in `src/engine/cards.ts`. This exists so the
 * alternatives can be measured on the same seeds rather than adopted on a
 * hunch, and it announces itself loudly when it differs so no report can be
 * mistaken for a report on the shipped rules.
 */
const MIRROR_MIN = arg('mirror-min', CARDS.mirror.minCharges);
if (MIRROR_MIN !== CARDS.mirror.minCharges) {
  console.log(
    `MEASURING with Mirror at ${MIRROR_MIN} charges — the shipped value is ${CARDS.mirror.minCharges}`,
  );
  CARDS.mirror.minCharges = MIRROR_MIN;
}

interface Pairing {
  levels: [Level, Level];
  label: string;
  randomDraft?: boolean;
}

const PAIRINGS_RAW: [Level, Level][] = [
  [4, 4],
  [3, 3],
  [4, 3],
  [2, 2],
  [4, 1],
];

const PAIRINGS: Pairing[] = [
  ...PAIRINGS_RAW.map((levels) => ({ levels, label: `L${levels[0]} vs L${levels[1]}` })),
  // Plays at full strength but drafts blind, so every ship gets priced.
  { levels: [4, 4] as [Level, Level], label: 'L4 vs L4 (random drafts)', randomDraft: true },
];

function checkDeterminism(): void {
  const seed = 'determinism-probe';
  const a = playBotMatch(seed, [4, 4]);
  const b = playBotMatch(seed, [4, 4]);
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    console.error('DETERMINISM FAILED: the same seed produced two different matches.');
    process.exit(1);
  }
  console.log('determinism: same seed, same match.');
}

function main(): void {
  checkDeterminism();
  const reports: PairingReport[] = [];
  for (const pairing of PAIRINGS) {
    const { levels } = pairing;
    const started = Date.now();
    const records = [];
    for (let i = 0; i < MATCHES; i++) {
      records.push(
        playBotMatch(`sa-${pairing.label}-${i}`, levels, { randomDraft: pairing.randomDraft }),
      );
    }
    const report = analyse(records, levels, pairing.randomDraft === true);
    report.pairing = pairing.label;
    reports.push(report);
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`\n=== ${report.pairing} — ${MATCHES} matches in ${secs}s ===`);
    for (const band of report.bands) {
      const mark = band.informational ? '     ' : band.ok ? 'PASS ' : 'FAIL ';
      console.log(`${mark} ${band.name}\n        ${band.detail}`);
    }
    console.log(
      `      win rate P0 ${pct(report.winRate[0])} / P1 ${pct(report.winRate[1])} / draw ${pct(report.drawRate)}`,
    );
  }

  writeFileSync('sim-report.md', `${renderMarkdown(reports)}\n`, 'utf8');
  console.log('\nwrote sim-report.md');

  const failed = reports.flatMap((r) =>
    r.bands
      .filter((b) => !b.informational && !b.ok)
      .map((b) => `${r.pairing}: ${b.name} — ${b.detail}`),
  );
  if (failed.length) {
    console.log(`\n${failed.length} band(s) outside their range:`);
    for (const f of failed) console.log(`  - ${f}`);
    console.log('\nNothing has been tuned. Propose changes before touching src/engine/balance.ts.');
  } else {
    console.log('\nall bands inside their ranges.');
  }
}

main();
