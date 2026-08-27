import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';

/**
 * The product is called ARMADA, and no artefact anywhere says otherwise.
 *
 * Build 8 dropped "Shadow" from the name. A rename is a one-line change in
 * thirty places, which means it is the kind of change that is 97% done
 * forever: one stale string in a generated document, a localStorage key, a
 * Rust crate, a page title. Those are exactly the places nobody looks again.
 *
 * So the check is a check rather than a claim. It greps the working tree for
 * every spelling of the old name and fails on any of them, which means a
 * future file that reintroduces it fails CI on the commit that adds it rather
 * than being found in a screenshot months later.
 *
 * What is deliberately not searched, and why:
 *
 *   `.git`          history is the record of the rename; rewriting it would
 *                   be the opposite of explicable.
 *   `node_modules`  not ours.
 *   build output    `dist/`, `dist-single/` and `chain/program/target/` are
 *                   regenerated from sources this test does cover, so
 *                   covering them too would only report the same miss twice
 *                   — and would fail on a stale artefact that a rebuild
 *                   fixes.
 *   `screens/`      screenshots are pixels; the wordmark in them is checked
 *                   by looking at the sweep, not by grep.
 *   the guide       `Armada-Screen-Guide.pdf/.docx` and `SCREEN_GUIDE.html`
 *                   are generated from `scripts/guide-content.ts`, which is
 *                   covered. A stale guide is a stale build, not a bug.
 *   `RULINGS.md`    the one file whose job is to name the old name. The brief
 *                   asked for a dated record of the rename so that the
 *                   earlier name, which is all over the git history, is
 *                   explicable rather than confusing — and a record that
 *                   cannot quote what it renamed is not a record. This
 *                   exclusion was added because the check found that entry
 *                   and failed, which is the check working.
 *
 * The two lockfiles are *not* excluded, and that is deliberate. They were, on
 * the first draft of this test, under the build-output reasoning above — and
 * the artefact sweep then found `"name": "shadow-armada"` sitting committed in
 * `package-lock.json`, because a lockfile does not regenerate itself on a
 * build the way `dist/` does. Anything that only heals when somebody
 * remembers to run a command is exactly what this check is for.
 */

/** Every spelling the old name ever took in this repository. */
const OLD_NAME = 'shadow[ _-]*armada';

const EXCLUDE_DIRS = ['.git', 'node_modules', 'dist', 'dist-single', 'target', 'screens', 'clips'];
const EXCLUDE_FILES = [
  '*.pdf',
  '*.docx',
  '*.webm',
  'SCREEN_GUIDE.html',
  'ui-inventory.html',
  'sim-out.log',
  // The two files that name the old spelling on purpose: the record of the
  // rename, and this check.
  'RULINGS.md',
  'name.test.ts',
];

function grepOldName(): string[] {
  const args = [
    '-rniI',
    OLD_NAME,
    ...EXCLUDE_DIRS.map((d) => `--exclude-dir=${d}`),
    ...EXCLUDE_FILES.map((f) => `--exclude=${f}`),
    '.',
  ];
  try {
    const out = execFileSync('grep', args, { encoding: 'utf8', cwd: process.cwd() });
    return out.trim().split('\n').filter(Boolean);
  } catch (err) {
    // grep exits 1 with no output when it finds nothing, which is the pass.
    const e = err as { status?: number; stdout?: string };
    if (e.status === 1 && !e.stdout?.trim()) return [];
    throw err;
  }
}

describe('the product is called ARMADA', () => {
  it('has no source, comment, document or config still saying the old name', () => {
    const hits = grepOldName();
    expect(hits, `still says the old name:\n  ${hits.join('\n  ')}`).toEqual([]);
  });

  it('says ARMADA in the places a player or a packager actually reads', () => {
    const title = execFileSync('grep', ['-o', '<title>[^<]*</title>', 'index.html'], {
      encoding: 'utf8',
    }).trim();
    expect(title).toBe('<title>ARMADA</title>');

    const pkg = JSON.parse(execFileSync('cat', ['package.json'], { encoding: 'utf8' })) as {
      name: string;
      description: string;
    };
    expect(pkg.name).toBe('armada');
    expect(pkg.description).toMatch(/^ARMADA\b/);
  });
});
