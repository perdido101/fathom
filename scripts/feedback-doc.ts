import { writeFileSync } from 'node:fs';
import {
  EXPLAINERS,
  FLOATER_SPECS,
  NAMED_SPECS,
  type Explainer,
} from '../src/ui/feedback/content';
import { CARD_LIST } from '../src/engine/cards';
import { SHIP_LIST } from '../src/engine/ships';

/**
 * `npm run feedback` — writes `docs/FEEDBACK.md` from the game's own lists.
 *
 * The document is generated rather than written for one reason: a document
 * that restates copy is a document that goes stale the first time the copy
 * changes. Every rule line below is read out of `CARD_LIST` and `SHIP_LIST`,
 * so a balance change rewrites the document in the same commit that makes it.
 *
 * It also checks coverage. The brief requires an explainer for each of the 12
 * cards, each of the 8 ACTIVE/NERF abilities, each of the 4 REACTs, plus the
 * hull tiebreak, a draw, a timer strike and the first draw from the pile. If
 * a card were added tomorrow with no copy written for it, this exits non-zero
 * rather than quietly shipping an undocumented mechanic.
 */

const cards = EXPLAINERS.filter((e) => e.group === 'card');
const abilities = EXPLAINERS.filter((e) => e.group === 'ability');
const reacts = EXPLAINERS.filter((e) => e.group === 'react');
const rules = EXPLAINERS.filter((e) => e.group === 'rule');

const expected = {
  cards: CARD_LIST.length,
  abilities: SHIP_LIST.filter((s) => s.type !== 'REACT').length,
  reacts: SHIP_LIST.filter((s) => s.type === 'REACT').length,
  rules: 4,
};

const problems: string[] = [];
if (cards.length !== expected.cards) problems.push(`cards: ${cards.length}/${expected.cards}`);
if (abilities.length !== expected.abilities)
  problems.push(`abilities: ${abilities.length}/${expected.abilities}`);
if (reacts.length !== expected.reacts) problems.push(`reacts: ${reacts.length}/${expected.reacts}`);
if (rules.length !== expected.rules) problems.push(`rules: ${rules.length}/${expected.rules}`);
for (const e of EXPLAINERS) {
  if (!e.soWhat) problems.push(`${e.key}: no consequence line written`);
  if (!e.rule) problems.push(`${e.key}: no rule text`);
}

function table(rows: Explainer[]): string {
  return [
    '| Mechanic | When it fires | The rule (from the content list) | Why it matters |',
    '| --- | --- | --- | --- |',
    ...rows.map(
      (e) => `| **${e.title}** | ${e.trigger} | ${e.rule} | ${e.soWhat} |`,
    ),
  ].join('\n');
}

const doc = `# What the game tells you

Three tiers of feedback, ordered from wordless to explanatory. This file is
**generated** by \`npm run feedback\` from \`src/ui/feedback/content.ts\`, which
in turn reads the card and ship definitions — so the rule text here cannot
drift from the rules the engine runs.

The design constraint that shapes all of it: the resolve event stream carries
**no plan payload** (Build 5's outbound-frame test made sure of it), so the
feedback layer works from the events plus the difference between the client
view before a round and after it. A charge that vanished off an opponent's
card is visible in that diff; the Jam that took it is not, and does not need
to be.

---

## The budget

**At most one Tier 2 line and one Tier 3 card on screen at once.** If a round
would produce several, the most consequential is shown and the resolve overlay
carries the rest — it narrates every step in order and remains the
authoritative account.

Tier 1 has no budget. Floaters are wordless, they overlap harmlessly, and six
cells resolving should read as six things happening.

A mechanic crowded out by the budget stays **unmarked** — it is still
first-time, so it gets its explanation the next time it happens rather than
losing it silently.

---

## Tier 1 — board floaters

Always on. No reading required, no interaction, no dismissal. Each rises from
the exact cell or object it belongs to and is gone in **600ms**. They never
queue: six cells resolving stagger at 55ms with the projectiles rather than
waiting in line.

| Reads | Rises from | Class |
| --- | --- | --- |
${FLOATER_SPECS.map((f) => `| **${f.says}** | ${f.from} | \`.floater-${f.kind}\` |`).join('\n')}

Anchoring is by \`[data-anchor]\` and a measured screen rectangle, so the layer
draws above the resolve overlay without knowing anything about the layout
underneath it. That is what lets a HIT rise off a cell while the overlay is
narrating the same beat over the top of it.

**BLOCKED** is the one floater that cannot come from the event stream: a
cancelled attack fires no shots and so leaves no trace at all. It uses the aim
the local player themselves declared, and nothing else.

---

## Tier 2 — named events

Always on, one line, a fixed position under the opponent strip. Not a modal,
not blocking, never more than two deep. Each holds for 2.2 seconds.

Only for things that have a name and would otherwise be mysterious — where the
board changes for a reason that is not on screen.

| Fires when | Says |
| --- | --- |
${NAMED_SPECS.map((n) => `| ${n.trigger} | ${n.copy} |`).join('\n')}

The wording rule, held to across all of them: say what happened to the board,
in the same plain register the resolve overlay uses. *"Firing back at every
cell they hit"*, never *"THORN triggers REACT"*.

---

## Tier 3 — first-time explainers

Once ever, per mechanic, per player. A fuller card with a **Got it**
dismissal, persisted in \`localStorage\` under
\`shadow-armada:seen-mechanics\`, and resettable from Settings — which also
shows how many of the ${EXPLAINERS.length} have been seen.

This is the mechanism that lets Tier 2 stay to one line: the teaching load
decays to zero instead of becoming permanent noise.

### The twelve cards

${table(cards)}

### The eight ACTIVE and NERF abilities

${table(abilities)}

### The four REACTs

${table(reacts)}

### The four rules with no card to hang on

${table(rules)}

---

## The "why can't I?" affordance

A disabled control that says nothing was the single most confusing gap in the
build. Hovering one now states the reason, and costs nothing when the pointer
is elsewhere. The reason named is always the **first** rule that stops the
action — a card that is both pinned and under-charged says "pinned", because
lifting the pin is what the player would have to do first.

| Control | Reasons it can give |
| --- | --- |
| **Fire**, on a hovered hand card | *Your cards are locked this round — a Pin or a Cinder landed.* / *You have already declared a card this round.* / *NAME needs N charges. It holds M.* |
| **Commit** | *Finish aiming first — lock the declaration in or cancel it.* / *One charge is mandatory every round. Click a card to place it.* |
| **Commit fleet**, on deployment | *N ships still to place.* |
| A locked arena tier | *Provisional accounts play the lowest table. N more rated matches unlocks this one.* |

Implemented as \`WhyNot\`, which wraps a control and takes the pointer events
itself — a disabled button never fires them.

---

## Coverage

| Group | Written | Required |
| --- | --- | --- |
| Cards | ${cards.length} | ${expected.cards} |
| ACTIVE / NERF abilities | ${abilities.length} | ${expected.abilities} |
| REACTs | ${reacts.length} | ${expected.reacts} |
| Rules | ${rules.length} | ${expected.rules} |
| **Total** | **${EXPLAINERS.length}** | **${
  expected.cards + expected.abilities + expected.reacts + expected.rules
}** |

${problems.length ? `> **Gaps:** ${problems.join('; ')}` : '> Complete. `npm run feedback` fails the build if a mechanic ever ships without copy.'}
`;

writeFileSync('docs/FEEDBACK.md', doc);
console.log(`docs/FEEDBACK.md — ${EXPLAINERS.length} explainers, ${NAMED_SPECS.length} named events, ${FLOATER_SPECS.length} floaters`);
if (problems.length) {
  console.error('coverage gaps:', problems.join('; '));
  process.exit(1);
}
