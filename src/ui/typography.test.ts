import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The type system, enforced rather than described.
 *
 * A scale written down in a document is a suggestion; a scale a test can fail
 * is a system. Two rules, both from Build 6 Part 4:
 *
 *   1. Every font size comes from the eight-step scale in `theme.css`. A
 *      component that invents `fontSize: 17` has quietly added a ninth step,
 *      and the next component will invent a tenth.
 *   2. JetBrains Mono is a utility, not a third family. It is for strings a
 *      player compares character by character — addresses, hashes, signatures
 *      and board coordinates — and the allowlist below is the whole of it.
 *      Anything else that wants monospace wants `.num` instead.
 */

const UI = 'src/ui';
const STEPS = ['display', 'hero', 'title', 'head', 'sub', 'lead', 'body', 'fine'];

/** Where JetBrains Mono is legitimately used, and what for. */
const MONO_ALLOWED: Record<string, string> = {
  'src/ui/screens/Menus.tsx': 'the wallet address, and the chain journal of signatures',
  'src/ui/screens/Result.tsx': 'the settlement transaction signature',
  'src/ui/screens/Bracket.tsx': 'the bracket settlement transaction signature',
  'src/ui/screens/Beats.tsx': 'the two deployment commitment hashes, sealing',
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.tsx') || p.endsWith('.ts')) out.push(p);
  }
  return out;
}

const sources = [...walk(UI), 'src/App.tsx'].filter((p) => !p.endsWith('.test.ts'));

describe('typography', () => {
  it('defines all eight steps and the measure as tokens', () => {
    const css = readFileSync(join(UI, 'theme.css'), 'utf8');
    for (const step of STEPS) expect(css).toContain(`--fs-${step}:`);
    expect(css).toContain('--measure:');
  });

  it('uses no font size outside the scale', () => {
    const offenders: string[] = [];
    for (const file of sources) {
      const text = readFileSync(file, 'utf8');
      text.split('\n').forEach((line, i) => {
        const m = /fontSize:\s*([^,\n]+)/.exec(line);
        if (!m) return;
        const value = m[1].trim();
        // A token, a ternary over tokens, or a pass-through variable named
        // `size` whose own type is a CSS length. Anything else is a new step.
        const ok =
          value.includes('var(--fs-') || value === 'size' || value === 'undefined';
        if (!ok) offenders.push(`${file}:${i + 1}  ${line.trim()}`);
      });
    }
    expect(offenders, `off-scale font sizes:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('keeps the mono family to addresses, hashes, signatures and coordinates', () => {
    const offenders: string[] = [];
    for (const file of sources) {
      if (MONO_ALLOWED[file]) continue;
      const text = readFileSync(file, 'utf8');
      text.split('\n').forEach((line, i) => {
        if (/className=["'`][^"'`]*\bmono\b/.test(line) || /var\(--mono\)/.test(line)) {
          offenders.push(`${file}:${i + 1}  ${line.trim()}`);
        }
      });
    }
    expect(
      offenders,
      `JetBrains Mono outside its four uses — use .num for numbers:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('keeps board coordinates in mono, since a player reads them back', () => {
    const css = readFileSync(join(UI, 'theme.css'), 'utf8');
    const block = /\.cell-label\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(block).toContain('var(--mono)');
  });

  it('caps running text at the measure', () => {
    const css = readFileSync(join(UI, 'theme.css'), 'utf8');
    const block = /\np\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(block).toContain('max-width: var(--measure)');
  });
});
