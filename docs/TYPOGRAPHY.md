# Typography

Two families, eight sizes, and a test that fails the build when either rule is
broken. Everything here is enforced by `src/ui/typography.test.ts` — a scale
written down in a document is a suggestion; a scale a test can fail is a
system.

---

## Two families, and one utility

| Family | Where |
| --- | --- |
| **Baloo 2** (`--display`) | Display, headings, buttons, pills, **and every numeral in the game** |
| **Nunito** (`--body`) | Body text, UI labels, running prose |
| **JetBrains Mono** (`--mono`) | Not a third voice. A utility, four uses only — see below |

Build 6 removed JetBrains Mono from every number it was setting. Ratings,
deltas, pot sizes, charge counts, volume percentages and leaderboard rows were
all monospaced because they were numbers, which is the wrong reason: a number
wants a **fixed advance width**, not a different typeface. That is what `.num`
is for.

```css
.num {
  font-family: var(--display);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
}
```

### The four things mono is still for

Strings a player may compare character by character, where a lookalike glyph
would be a real problem:

1. **Wallet addresses** — Settings.
2. **Commitment hashes** — the "both committed" beat, and the chain journal.
3. **Transaction signatures** — the settlement receipt, and the bracket payout.
4. **Board coordinates** — the `A1`–`F6` labels on the enemy board.

`typography.test.ts` holds the allowlist by filename and fails on any use
outside it, including `var(--mono)` in an inline style.

---

## The scale

Eight steps, defined once in `src/ui/theme.css`. Every text element in the
game maps to one of them, and nothing invents a ninth.

| Token | Size | What it carries |
| --- | --- | --- |
| `--fs-display` | 88px | The wordmark, and nothing else |
| `--fs-hero` | 64px | The screen's one level-1 element |
| `--fs-title` | 48px | Screen titles, phase-card titles, the round stamp |
| `--fs-head` | 32px | Panel headings, stat values, the large charge gem |
| `--fs-sub` | 24px | Card names at `lg`, the commit button, mid charge gems |
| `--fs-lead` | 18px | The sentence that matters on a screen; default button |
| `--fs-body` | 15px | Running text, UI default, `md` card names |
| `--fs-fine` | 13px | Labels, pips, fine print, coordinates, `sm` cards |

Each is also available as a class (`.fs-hero`, `.fs-body`, …) for the places
that would otherwise reach for an inline number.

### Enforcement

```
✓ defines all eight steps and the measure as tokens
✓ uses no font size outside the scale
✓ keeps the mono family to addresses, hashes, signatures and coordinates
✓ keeps board coordinates in mono, since a player reads them back
✓ caps running text at the measure
```

The size test allows exactly three shapes: a `var(--fs-*)` token, a ternary
over tokens, and the pass-through variable `size` in `ChargeNumber`, whose own
type was changed from `number` to a CSS length string so it cannot smuggle a
raw pixel value through.

---

## Hierarchy is structural

One level-1 element per screen. Never two competing for primary attention.

| Screen | Its level-1 | At |
| --- | --- | --- |
| Main menu | The wordmark | `--fs-display` |
| Battle | **The clock** | `--fs-hero` |
| Result | The verdict — VICTORY / DEFEAT / DRAW | `--fs-hero` |
| Arena / Tournament | The stake on the selected tier | `--fs-head` |
| Draft | The collision slam, when there is one | `--fs-hero` |
| Resolve overlay | The sink stamp | `--fs-hero` |
| Champion | CHAMPION | `--fs-display` |
| Phase beats | The phase name | `--fs-title` |

The battle screen's clock moved from 40px to 64px in Build 6 and is now the
largest thing on it. That is not decoration: every decision a player makes on
that screen is a decision about how to spend that number, and the separate
timer bar that used to sit above the commit button was removed in the same
change. One clock, at the top of the hierarchy.

---

## Tabular figures

Everywhere a number stacks in a column or updates in place:

- the leaderboard's rating column
- the rating pill and rating delta on the result receipt
- the season payout chart's percentage column
- the battle clock (`.big-num` carries `tabular-nums`)
- charge gems (`.gem` and `.charges`)
- the round counter
- volume percentage
- every settlement figure

A rating going `1200 → 1188` no longer shifts the row it sits in.

---

## Measure

Running text is capped at `--measure`, 65ch, on the `p` element itself:

```css
p {
  max-width: var(--measure);
}
```

That is deliberately global rather than opt-in — several explanatory blocks
ran the full width of their panel and read as walls. A paragraph that is
genuinely a single-line label opts out with `.full`.

---

## The one thing that does not fit, and why

**The wordmark.** A logotype is a drawing, and the circle beside SHADOW has to
track the cap height of the word or the lockup comes apart. The type takes its
two sizes from the scale (`--fs-display` / `--fs-head` at hero size,
`--fs-head` / `--fs-fine` otherwise) and the *drawing* is derived from them —
which is the dependency the right way round. It is the only place in the game
where a size is computed rather than chosen, and the test permits it because
no `fontSize` in that component is a number any more.

Two sizes were rounded rather than kept: the `md` card's rule text was 10.5px
and is now 13, and the compact board's coordinate labels were 9px — those were
removed entirely rather than resized, because you never name a cell on your
own water. Both are recorded in `REMOVED.md`.
