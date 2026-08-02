/**
 * Headless sim harness CLI: `npm run sim -- --matches 2000 --seed 42`
 *
 * Runs AI-vs-AI matches across every round of a voyage (default 6 rounds,
 * override with --voyage 3|4|5|6|8), checks the determinism invariant and
 * the balance bands, writes sim-report.md, and exits non-zero if anything
 * is red. Every balance change lands only if this is green.
 */
import { writeFileSync } from 'node:fs';
import { runMatch } from './harness';
import { assertBands, summarize } from './assertions';
import { renderReport } from './report';
import { VOYAGE_LENGTHS, type VoyageLength } from '../content/voyage';

function arg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

const matchesRequested = parseInt(arg('matches', '400'), 10);
const seed = arg('seed', '42');
const voyageLength = parseInt(arg('voyage', '6'), 10) as VoyageLength;
if (!VOYAGE_LENGTHS.includes(voyageLength)) {
  console.error(`--voyage must be one of ${VOYAGE_LENGTHS.join(', ')}`);
  process.exit(1);
}
const perRound = Math.max(1, Math.floor(matchesRequested / voyageLength));

console.log(
  `Fathom sim — ${perRound * voyageLength} matches (${perRound} per round, ${voyageLength}-round voyage), seed ${seed}`,
);

// Determinism gate: same seed + same action log ⇒ byte-identical final state.
{
  const a = runMatch(`${seed}:determinism`, voyageLength, Math.min(3, voyageLength));
  const b = runMatch(`${seed}:determinism`, voyageLength, Math.min(3, voyageLength));
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    console.error('DETERMINISM FAILURE: identical seeds produced different matches.');
    process.exit(1);
  }
  console.log('Determinism: identical seed reproduces byte-identical results ✅');
}

const started = Date.now();
const records = [];
for (let round = 1; round <= voyageLength; round++) {
  for (let i = 0; i < perRound; i++) {
    records.push(runMatch(`${seed}:r${round}:m${i}`, voyageLength, round));
  }
  process.stdout.write(`round ${round} done. `);
}
console.log(`\nSimulated ${records.length} matches in ${((Date.now() - started) / 1000).toFixed(1)}s`);

const summary = summarize(records);
const assertions = assertBands(summary);
const report = renderReport(summary, assertions, { seed, matchesRequested, voyageLength });
writeFileSync('sim-report.md', report);

for (const a of assertions) {
  console.log(`${a.pass ? '✅' : '❌'} ${a.name}: ${a.detail}`);
}
const pass = assertions.every((a) => a.pass);
console.log(pass ? '\nSIM GREEN' : '\nSIM RED — see sim-report.md');
process.exit(pass ? 0 : 1);
