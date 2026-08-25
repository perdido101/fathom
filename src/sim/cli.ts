import { writeFileSync } from "node:fs";
import { playBotMatch } from "./runner";
import { analyse, pct, renderMarkdown, type PairingReport } from "./report";
import type { Level } from "../bots/bot";

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

const MATCHES = arg("matches", 2000);

/**
 * The hit bonus is the one number the rules leave genuinely open, and it is
 * the number the failing bands are most sensitive to, so both readings are
 * measured every run. Nothing is switched on the strength of the result — the
 * comparison exists so the choice can be made with the figures in hand.
 */
const HIT_BONUS_MODES: ("per-hit" | "per-round")[] = ["per-hit", "per-round"];
const PAIRINGS: [Level, Level][] = [
  [4, 4],
  [3, 3],
  [4, 3],
  [2, 2],
  [4, 1],
];

function checkDeterminism(): void {
  const seed = "determinism-probe";
  const a = playBotMatch(seed, [4, 4]);
  const b = playBotMatch(seed, [4, 4]);
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    console.error(
      "DETERMINISM FAILED: the same seed produced two different matches.",
    );
    process.exit(1);
  }
  console.log("determinism: same seed, same match.");
}

function main(): void {
  checkDeterminism();
  const reports: PairingReport[] = [];
  for (const mode of HIT_BONUS_MODES) {
    console.log(`\n########## hit bonus: ${mode} ##########`);
    for (const levels of PAIRINGS) {
      const started = Date.now();
      const records = [];
      for (let i = 0; i < MATCHES; i++) {
        records.push(
          playBotMatch(`sa-${levels[0]}${levels[1]}-${i}`, levels, {
            hitBonusMode: mode,
          }),
        );
      }
      const report = analyse(records, levels);
      report.pairing = `${report.pairing} [${mode}]`;
      reports.push(report);
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      console.log(
        `\n=== ${report.pairing} — ${MATCHES} matches in ${secs}s ===`,
      );
      for (const band of report.bands) {
        const mark = band.informational ? "     " : band.ok ? "PASS " : "FAIL ";
        console.log(`${mark} ${band.name}\n        ${band.detail}`);
      }
      console.log(
        `      win rate P0 ${pct(report.winRate[0])} / P1 ${pct(report.winRate[1])} / draw ${pct(report.drawRate)}`,
      );
    }
  }

  writeFileSync("sim-report.md", `${renderMarkdown(reports)}\n`, "utf8");
  console.log("\nwrote sim-report.md");

  const failed = reports.flatMap((r) =>
    r.bands
      .filter((b) => !b.informational && !b.ok)
      .map((b) => `${r.pairing}: ${b.name} — ${b.detail}`),
  );
  if (failed.length) {
    console.log(`\n${failed.length} band(s) outside their range:`);
    for (const f of failed) console.log(`  - ${f}`);
    console.log(
      "\nNothing has been tuned. Propose changes before touching src/engine/balance.ts.",
    );
  } else {
    console.log("\nall bands inside their ranges.");
  }
}

main();
