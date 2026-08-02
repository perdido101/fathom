import type { AssertionResult, SimSummary } from './assertions';
import { CARDS } from '../content/cards';
import { SHIPS } from '../content/ships';
import { MODIFIERS } from '../content/modifiers';

export function renderReport(
  summary: SimSummary,
  assertions: AssertionResult[],
  meta: { seed: string; matchesRequested: number; voyageLength: number },
): string {
  const lines: string[] = [];
  const pass = assertions.every((a) => a.pass);
  lines.push('# Fathom — sim report');
  lines.push('');
  lines.push(`- Seed: \`${meta.seed}\``);
  lines.push(`- Voyage length: ${meta.voyageLength} rounds`);
  lines.push(`- Matches: ${summary.matches} (requested ${meta.matchesRequested})`);
  lines.push(`- Result: **${pass ? 'GREEN' : 'RED'}**`);
  lines.push('');
  lines.push('## Assertions');
  lines.push('');
  lines.push('| Assertion | Result | Detail |');
  lines.push('|---|---|---|');
  for (const a of assertions) {
    lines.push(`| ${a.name} | ${a.pass ? '✅' : '❌'} | ${a.detail} |`);
  }
  lines.push('');
  lines.push('## Match length by round');
  lines.push('');
  lines.push('| Round | Median plies |');
  lines.push('|---|---|');
  for (const [round, med] of Object.entries(summary.pliesByRound)) {
    lines.push(`| ${round} | ${med} |`);
  }
  lines.push('');
  lines.push('## Cards');
  lines.push('');
  lines.push(
    "_Usage share = a card's plays as a fraction of all draftable-card plays by players who drafted it (basic salvo excluded)._",
  );
  lines.push('');
  lines.push('| Card | Tier | Drafted in | Plays | Usage share |');
  lines.push('|---|---|---|---|---|');
  for (const c of summary.cards) {
    const def = CARDS[c.id];
    lines.push(
      `| ${def.name} | T${def.tier} | ${c.draftedIn} | ${c.plays} | ${c.share === null ? '—' : (c.share * 100).toFixed(1) + '%'} |`,
    );
  }
  lines.push('');
  lines.push('## Ships');
  lines.push('');
  lines.push('| Ship | Size | Drafted in | Wins | Win rate |');
  lines.push('|---|---|---|---|---|');
  for (const s of summary.ships) {
    const def = SHIPS[s.id];
    lines.push(
      `| ${def.name} | ${def.size} | ${s.draftedIn} | ${s.wins} | ${s.winRate === null ? '—' : (s.winRate * 100).toFixed(1) + '%'} |`,
    );
  }
  lines.push('');
  lines.push('## Terrain modifiers');
  lines.push('');
  lines.push(
    '_Detection win rate = win rate of the player who drafted more detection cards, in matches under that modifier._',
  );
  lines.push('');
  lines.push('| Modifier | Matches | Detection-skewed | Detection win rate |');
  lines.push('|---|---|---|---|');
  for (const m of summary.modifiers) {
    lines.push(
      `| ${MODIFIERS[m.id].name} | ${m.matches} | ${m.detectionSkewed} | ${m.detectionWinRate === null ? '—' : (m.detectionWinRate * 100).toFixed(1) + '%'} |`,
    );
  }
  lines.push('');
  lines.push(
    `_First-player win rate: ${(summary.firstPlayerWinRate * 100).toFixed(1)}%. ` +
      `Endgame drag median: ${summary.endgameDragMedian}. ` +
      `Shots-to-final-ship median: ${summary.shotsToFinalShipMedian}. ` +
      `Longest match: ${summary.maxPlies} plies. ` +
      `Burn leaks: ${summary.burnLeaks}._`,
  );
  lines.push('');
  return lines.join('\n');
}
