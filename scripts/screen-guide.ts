import { readFileSync, writeFileSync } from 'node:fs';

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

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// --- the plates ------------------------------------------------------------

/** A numbered callout: x/y are percentages of the screenshot, centre of the pin. */
interface Pin {
  x: number;
  y: number;
  label: string;
  text: string;
}

interface Plate {
  file: string;
  /** The capture number, so a plate maps to the file it came from. */
  num: string;
  name: string;
  thesis: string;
  pins?: Pin[];
  /** Used when a screen is better explained in prose than in pins. */
  notes?: string[];
}

interface Section {
  id: string;
  title: string;
  standfirst: string;
  plates: Plate[];
}

const SECTIONS: Section[] = [
  {
    id: 'arrival',
    title: 'Arrival',
    standfirst:
      'What a player meets before they have decided anything. Nothing here asks for a wallet, and nothing here costs money — the first job of these screens is to let someone find out whether they like the game.',
    plates: [
      {
        file: '01-main-menu',
        num: '01',
        name: 'Main menu',
        thesis:
          'Four ways to play, each wearing its money story on its face. What a mode costs is the first thing a player choosing between them wants to know, so the price is never a click away.',
        pins: [
          { x: 42, y: 22, label: 'Wordmark', text: 'Two chevrons in a circle — a fleet in echelon. Drawn in code, so it stays sharp at any size and needs no asset.' },
          { x: 36.4, y: 33.3, label: 'The whole game in one line', text: '“Three ships · twelve cards · both plans resolve at once.” The third clause is the one that makes this not Battleship.' },
          { x: 26.4, y: 35.4, label: 'Casual', text: 'Free, no wallet, full game. The default door: a player can play the entire product without ever connecting anything.' },
          { x: 42.1, y: 35.4, label: 'Ranked', text: 'One season entry, unlimited matches. The blurb carries the live pool so the number is real, not a promise.' },
          { x: 57.8, y: 35.4, label: 'Arena', text: 'Head-to-head for a stake. The card states the rake (5%) and the draw rule up front rather than in a help article.' },
          { x: 73.5, y: 35.4, label: 'Tournament', text: 'Eight seats, one pot, single elimination. The card admits the hard part — quarter-final losers take nothing — because that is exactly why the champion’s share is worth chasing.' },
          { x: 47.9, y: 46.8, label: 'Stake pill', text: 'Gold, always. Gold is spent on money and charges in this game and on nothing else, so a gold pill anywhere means “this is a number about value”.' },
          { x: 21.2, y: 58.6, label: 'Mode CTA', text: 'Green means go, everywhere in the product. The verb changes with state — “Enter season” becomes “Play ranked” once the entry is paid.' },
          { x: 38.9, y: 74.3, label: 'Secondary row', text: 'How to play, Leaderboard, Season, Settings. Quiet white pills: reachable, never competing with the four money cards.' },
          { x: 50, y: 80.9, label: 'Standing pills', text: 'Rating, season rank, and — for a new account — how many rated matches remain before the higher stake tables unlock.' },
          { x: 88, y: 5.9, label: 'Wallet chip', text: 'On every screen. Short address, live devnet balance, and a faucet link the moment the balance falls under the cheapest table.' },
        ],
      },
      {
        file: '02-howto-charging',
        num: '02',
        name: 'How to play · charging',
        thesis:
          'Four things you do, not four things you read. The cards in this panel are live: clicking one charges it and the gem pops, so the rule is learned by hand.',
        notes: [
          'Each round you place exactly one charge. Charges are public — both players can see what the other is building, which is what makes the bluff possible.',
          'The card components here are the same `GameCard` the battle screen uses, at the same proportions. A player learns the object once and meets it everywhere.',
        ],
      },
      {
        file: '03-howto-firing',
        num: '03',
        name: 'How to play · firing',
        thesis:
          'The rule that catches everyone out, taught before it can cost anything: firing spends every charge on the card and destroys the card for good.',
        notes: [
          'A card is a resource you grow and then spend once. There is no discard, no reshuffle, no second copy — the tension in the whole game lives in “one more round or now?”.',
          'The step order is deliberate: charge, then fire, then simultaneity, then sinks. Each step only assumes what the previous one taught.',
        ],
      },
      {
        file: '04-howto-sinks',
        num: '04',
        name: 'How to play · sinks',
        thesis:
          'A sink announces a length and never a name. Every fleet is one 4, one 3 and one 2, so the length names the slot and leaves the candidates open.',
        notes: [
          'This is the hidden-information rule in one sentence. Sinking their 3 tells you which slot went down, not which of the four possible 3-length ships it was.',
          'That gap is the deduction surface the whole game rests on — and the reason the opponent’s hand renders as card backs everywhere else in this guide.',
        ],
      },
      {
        file: '28-desktop-gate',
        num: '28',
        name: 'The desktop gate',
        thesis:
          'Below 1280×720 the game does not attempt a squeezed layout. Logo, one sentence, nothing else — a polished refusal beats a broken board.',
        notes: [
          'Enforced in CSS with a media query, not a resize listener, so there is no JavaScript state that can fall out of sync with the viewport.',
          'The game is 16:9 desktop by decision: the battle screen puts two boards, two hands and a timer on screen at once, and that composition has nowhere to go on a phone.',
        ],
      },
    ],
  },
  {
    id: 'money',
    title: 'Money on the table',
    standfirst:
      'Every surface where value moves. These are the screens a wagered game is judged on, so each one states the amount, the rake, and the way out before anything is committed.',
    plates: [
      {
        file: '05-ranked-join-modal',
        num: '05',
        name: 'Season entry',
        thesis:
          'The season as a purchase decision: the price, exactly what it buys, the pool so far, and one confirm. A short balance is warned about here, not discovered at settlement.',
        notes: [
          'One entry buys unlimited ranked matches for the season. Entries are pooled and paid out at season end on a curve, which the modal says in plain words.',
          'Two buttons only — “Not now” and “Pay ◎0.1 and play”. A money dialog with three ways forward is a money dialog someone clicks by accident.',
        ],
      },
      {
        file: '06-arena-tiers',
        num: '06',
        name: 'Arena tables',
        thesis:
          'Four stake tables, each with the rating band it draws from and what a win actually pays. Tiers a provisional account cannot enter are visibly locked and say why.',
        pins: [
          { x: 32.7, y: 28.1, label: 'The rule, above the choice', text: 'Winner takes the pot minus 5%. A draw returns both stakes in full and takes no rake — the one outcome that has to stay costless.' },
          { x: 33.7, y: 30.3, label: 'Stake tier', text: 'The stake as the largest number on the card, with the gold gem above it. Four tiers: ◎0.05, ◎0.1, ◎0.25, ◎0.5.' },
          { x: 29.6, y: 44.4, label: 'Rating band', text: 'Who else sits at this table. The band is wider for a provisional account and widens further the longer the queue waits.' },
          { x: 36.8, y: 47.6, label: 'What a win pays', text: 'The post-rake number, computed the same way the on-chain program computes it — not an estimate rounded for display.' },
          { x: 66.2, y: 30.3, label: 'Selection', text: 'A gold ring and a lifted shadow. Gold again, because the thing being selected is an amount of money.' },
          { x: 34.5, y: 56.2, label: 'Pot · rake · to winner', text: 'The full arithmetic of the selected tier in one strip, so nobody has to do it in their head.' },
          { x: 46.4, y: 76.6, label: 'Find match', text: 'The commit control, carrying the stake in its own label. You cannot press this without having read the number.' },
        ],
      },
      {
        file: '07-insufficient-funds',
        num: '07',
        name: 'Not enough SOL',
        thesis:
          'The error state as a human sentence: what the table needs, what the wallet holds, a working faucet link, and a way down to a cheaper table.',
        pins: [
          { x: 34.5, y: 63.4, label: 'What went wrong', text: '“Not enough devnet SOL for this table.” Named in the first four words, before any explanation.' },
          { x: 65.5, y: 66.2, label: 'Both numbers', text: 'What is required and what is held, side by side. An error that states only one of them makes the player go and look up the other.' },
          { x: 44.1, y: 69.6, label: 'The fix', text: 'A live link to the devnet faucet. The alternative fix — pick a lower table — is named in the same sentence.' },
          { x: 46.4, y: 76.6, label: 'Inert, not hidden', text: 'The commit button greys out and stops breathing rather than disappearing, so the layout never jumps and the goal stays visible.' },
          { x: 66.2, y: 30.3, label: 'The retry is the UI', text: 'The tier row itself is the retry: click a cheaper table and the error clears. No modal to dismiss.' },
        ],
      },
      {
        file: '08-escrow-forming',
        num: '08',
        name: 'The escrow forming',
        thesis:
          'The stakes landing in view — your chips in, theirs following, the pot growing between them. The reclaim rule is on the screen while the money is moving, not in a FAQ.',
        pins: [
          { x: 39.3, y: 43.5, label: 'Your stake', text: 'A stack of gold chips that fills as the transaction confirms. Green tick and amount underneath when it has landed.' },
          { x: 50.2, y: 38.4, label: 'The pot', text: 'The central gem carries the live total and scales up as the second stake arrives. Both stakes land in one on-chain account.' },
          { x: 60.4, y: 43.5, label: 'Their stake', text: 'Pale until it confirms. A half-funded match is not a state the program can reach — both stakes move in the same transaction.' },
          { x: 23.9, y: 56.2, label: 'Status line', text: '“You staked ✓ · Opponent staking…” — which half of the escrow is waiting, in words.' },
          { x: 76, y: 58.7, label: 'The reclaim rule', text: 'If the match is never played, either player reclaims their own stake after 30 minutes and nobody can take the other’s. Stated here because this is the moment it matters.' },
          { x: 43.9, y: 66.4, label: 'Cancel and reclaim', text: 'The way out, available while the escrow is still forming.' },
        ],
      },
      {
        file: '24-tournament-tiers',
        num: '24',
        name: 'Bracket tiers',
        thesis:
          'The same tier picker as the arena, re-priced for eight seats: the whole payout curve is stated before entry, including the part that pays nothing.',
        notes: [
          'Eight stakes pool into one escrow. 5% rake off the pot, then champion 55%, runner-up 25%, and 10% to each losing semifinalist.',
          'Quarter-final losers take nothing. That is the mode’s whole proposition — the curve is steeper than the arena’s, which is the reason to sit down here instead.',
          'The gold pill on each tier card shows the champion’s share at that stake rather than a generic “win” figure.',
        ],
      },
      {
        file: '25-bracket-forming',
        num: '25',
        name: 'Seats filling',
        thesis:
          'Eight seats staking in view. A bracket only ever starts full — byes cannot exist — and if it never fills, every stake reclaims and no rake is taken.',
        notes: [
          'Each seat is a card: dashed and faded while open, solid with a green border and “◎ staked ✓” once that entrant’s stake has landed.',
          'The counter beneath reads “N/8 staked”. The eighth stake is what starts play, on-chain as well as in the interface — the program refuses a ninth join.',
          'If ten minutes pass without a full bracket, every seat recovers its own stake through a permissionless path. The escrow cannot strand funds even if the server dies.',
        ],
      },
    ],
  },
  {
    id: 'draft',
    title: 'The draft',
    standfirst:
      'Both fleets end up one 4, one 3 and one 2 — only the abilities differ. Picks are blind and simultaneous, and the only thing a draft ever leaks is a collision.',
    plates: [
      {
        file: '09-ship-draft',
        num: '09',
        name: 'Ship draft',
        thesis:
          'A pack of four, face up to both players. You pick in secret; duplicates are legal and carry no penalty.',
        pins: [
          { x: 45.8, y: 36.8, label: 'Pack progress', text: 'Three packs, three picks. The filled pip is the pack on screen — a three-step process shown as three steps.' },
          { x: 25.8, y: 38.7, label: 'The rule in one line', text: 'What the draft does and what happens on a collision, stated above the choice rather than after it.' },
          { x: 28.4, y: 41.2, label: 'Type stripe', text: 'The card’s top edge is coloured by ability type: purple NERF, orange REACT, green ACTIVE. The same colours are used for these types everywhere.' },
          { x: 33.2, y: 47.9, label: 'Type tag', text: 'ACTIVE and NERF fire once per match as an extra action; REACT ships have no decision at all — they go off when they sink.' },
          { x: 26, y: 49.2, label: 'Length pips', text: 'How many hull cells the ship occupies. Four pips here: this is one of the length-4 ships.' },
          { x: 21.4, y: 55.2, label: 'The whole ability', text: 'Full rule text on the face. Nothing about a draft pick is hidden behind a hover — you are choosing, so you get everything.' },
          { x: 32.6, y: 61.8, label: 'Type · length', text: 'The two facts that decide where the ship sits in your fleet, restated as a pill at the point of decision.' },
          { x: 44.8, y: 68.7, label: 'Taken so far', text: 'Your own picks accumulate here, flagged “· both!” where a collision made a pick public.' },
        ],
      },
      {
        file: '10-draft-collision',
        num: '10',
        name: 'The collision',
        thesis:
          'The best moment in the draft, treated like one: a gold slam that tells you both players reached for the same thing. This is the only information a draft ever gives away.',
        notes: [
          'You learn their pick only when it was also yours. Everything else stays open — which is what keeps 64 possible enemy fleets on the table for most of a match.',
          'A non-collision gets its own quieter beat (“PICKS DIFFER”), so the absence of information is also confirmed rather than left ambiguous.',
          'Because a collision makes a card public, it is also the only case where that card later renders face-up in the opponent’s hand during battle.',
        ],
      },
      {
        file: '11-card-draft',
        num: '11',
        name: 'Card draft',
        thesis:
          'The same mechanism, second time, now with real cards — so the interaction is learned once and used twice. Everything nobody takes becomes the shared draw pile.',
        pins: [
          { x: 38.8, y: 41.2, label: 'Role border', text: 'Every card is framed in its role colour: red attack, cyan intel, purple control, amber prediction. Colour tells you what a card is before you read it.' },
          { x: 27.5, y: 48.4, label: 'Art window', text: 'The top 60% of the card. A composed role gradient with the glyph today; generated illustration drops in here later without touching the layout.' },
          { x: 27.5, y: 57.5, label: 'Name banner', text: 'Across the middle in the role colour, white on colour — the card’s identity at a glance in a fanned hand.' },
          { x: 33.1, y: 69, label: 'Short rule', text: 'The face carries the compressed rule. The full text arrives on hover, so the card stays readable at hand size.' },
          { x: 38.8, y: 68.5, label: 'Charge gem', text: 'Bottom-right, gold, and deliberately the biggest number on the card. Charges are the currency of every decision in the match.' },
          { x: 45.8, y: 35.2, label: 'Pack progress', text: 'Three packs again. Three picks become your opening hand.' },
          { x: 31.5, y: 37.1, label: 'The pile rule', text: 'Whatever neither player takes becomes the shared draw pile — so the cards you pass are the cards you may both draw later.' },
        ],
      },
      {
        file: '12-card-hover',
        num: '12',
        name: 'Card hover',
        thesis:
          'Hover lifts the card and floats the full rule. The desktop pattern used everywhere a card appears — draft, hand, result, inventory.',
        notes: [
          'The lift is a transform, not a layout change, so nothing around the card reflows and the pointer never loses its target.',
          'This is why the card face can carry a compressed rule: the complete text is always one hover away, and the two never disagree because both come from the same card definition.',
        ],
      },
    ],
  },
  {
    id: 'deploy',
    title: 'Deployment',
    standfirst:
      'Where your fleet actually sits — the last decision made in private, and the one that gets hashed and written before a single shot is fired.',
    plates: [
      {
        file: '13-deployment',
        num: '13',
        name: 'Deploy',
        thesis:
          'Your water large in the centre, the fleet as cards in a side tray. Hovering the board previews a legal placement before you commit to it.',
        pins: [
          { x: 33.9, y: 40.3, label: 'Your board', text: 'Six by six, lettered columns and numbered rows. The same coordinate language the resolve log speaks: “C2”, “E4”.' },
          { x: 39.3, y: 54.6, label: 'Placement preview', text: 'The gold outline is the run the selected ship would occupy from the hovered cell. An illegal run simply does not preview — the interface never has to say no.' },
          { x: 56.7, y: 26.9, label: 'The placement rule', text: 'Orthogonal only, and hulls may touch. Two ships side by side read as one long ship for several rounds, which is a real defensive choice.' },
          { x: 78.1, y: 20.7, label: 'Phase clock', text: 'The deployment window. Let it lapse and the fleet auto-places and commits — the match never stalls on a player who walked away.' },
          { x: 57.9, y: 38.1, label: 'Fleet tray', text: 'Your three drafted ships as landscape cards, each with its glyph, length pips and type. The highlighted one is being placed.' },
          { x: 57.7, y: 60.9, label: 'Orientation and shortcuts', text: 'Horizontal/vertical toggle, Auto for a legal random layout, Clear to start over.' },
          { x: 58.9, y: 71, label: 'Commit fleet', text: 'Disabled until all three ships are legally placed. Grey and flat, not merely dimmed — clearly inert.' },
          { x: 56.7, y: 79, label: 'Why this matters', text: 'The layout is hashed and written before the first shot. It cannot change afterwards, and that commitment is what proves the match honest to a third party later.' },
        ],
      },
      {
        file: '14-deployment-placed',
        num: '14',
        name: 'Fleet placed',
        thesis:
          'All three ships down, the commit button live. What happens on press is a cryptographic commitment, not a save.',
        notes: [
          'The client hashes the layout with a secret nonce and publishes only the hash. The opponent — and the server — learn nothing about where anything sits.',
          'At the end of the match the layout and nonce are revealed, and anyone can check the hash. A fleet that “moved” mid-match would fail that check publicly.',
          'In a staked match the same commitment is written on-chain, which is what lets a stranger audit the match weeks later.',
        ],
      },
    ],
  },
  {
    id: 'fight',
    title: 'The fight',
    standfirst:
      'The screen the game is built around. Both players plan at the same time, in secret, and both plans resolve together — so nothing here is a turn you wait through.',
    plates: [
      {
        file: '15-battle',
        num: '15',
        name: 'Battle · the full anatomy',
        thesis:
          'Their water dominant and centre-left; your own board small at lower right; your hand fanned along the bottom; the pot in gold in the top bar; and the commit button the biggest control on screen.',
        pins: [
          { x: 4.5, y: 7.2, label: 'Round counter', text: 'Which round of a maximum twenty. A match that reaches the cap is decided on remaining hull cells.' },
          { x: 16.1, y: 4, label: 'Your hull', text: 'Nine pips, one per hull cell across your three ships. Green while yours; they go dark as cells are hit.' },
          { x: 39.2, y: 4, label: 'The clock', text: 'The plan window, huge and outlined in the centre. Under five seconds it turns red, pulses, and ticks audibly. In a networked match the server owns this clock and the client only renders an estimate.' },
          { x: 66.4, y: 4, label: 'Their hull', text: 'The same nine pips in red. This is not a leak: every fleet is nine cells and you know which of your shots landed, so the number is derivable anyway.' },
          { x: 77.1, y: 4.1, label: 'The pot', text: 'In gold, always visible in a staked match. You never have to leave the board to remember what is riding on it.' },
          { x: 87.6, y: 3.2, label: 'Wallet chip', text: 'Address and live balance, on this screen like every other.' },
          { x: 14.7, y: 14.6, label: 'Their fleet', text: 'Three ship cards showing only what the rules make public — “Length 4”, “Length 3”, “Length 2”. A card flips face-up the moment that ship uses an ability or sinks.' },
          { x: 86.7, y: 10.3, label: 'Their hand size', text: 'How many cards they hold and their total banked charges. Public, because charges are public — the bluff is built on shared information.' },
          { x: 95, y: 15, label: 'Their cards', text: 'Mini card backs with readable gold charge gems. An identity only shows here if a draft collision already made it public.' },
          { x: 37.3, y: 43.5, label: 'Their water', text: 'The biggest single element on screen — this is where you act. Click a cell to aim your free shot; cells remember hits, misses and intel.' },
          { x: 75.5, y: 23.8, label: 'Prompt panel', text: 'What the next click does, in words. Every card aims differently, so the interface says which rather than assuming you remember twelve rules.' },
          { x: 74.2, y: 28.7, label: 'Your ships', text: 'Your three, face up to you, with their type and whether the once-per-match ability is still available.' },
          { x: 81.8, y: 53, label: 'Your water', text: 'Your own board, compact and lower-right: this is damage arriving, not a place you act. Your hulls are the dark cells.' },
          { x: 85.9, y: 69.7, label: 'Hull readout', text: '“Your waters · hull 9/9” — the same number as the pips up top, spelled out where you are looking at the damage.' },
          { x: 24.2, y: 81.5, label: 'Your hand', text: 'Real cards, fanned, lifting on hover. Three at a time, one drawn per round while the shared pile lasts.' },
          { x: 24.9, y: 96.5, label: 'Charge / Fire', text: 'Two verbs per card, and the whole game between them. Charge grows it; Fire spends every charge and destroys the card.' },
          { x: 74, y: 88.7, label: 'Timer bar', text: 'The clock again as a depleting bar directly above the commit button, so the pressure is visible where the decision is made.' },
          { x: 75.8, y: 93.9, label: 'Commit', text: 'The largest control in the product. It breathes while a plan is complete and goes flat grey when it is not. Pressing it seals your plan as a hash — the opponent’s is already sealed too.' },
        ],
      },
      {
        file: '16-battle-planned',
        num: '16',
        name: 'A plan half-built',
        thesis:
          'The same screen mid-decision: a free shot aimed on their water, one card carrying this round’s charge, and the prompt updated to match.',
        pins: [
          { x: 33.5, y: 27.5, label: 'The aimed cell', text: 'C2 outlined in gold on their board. Gold marks intent — this is where your free deck gun will fire when the round resolves.' },
          { x: 73.7, y: 19.2, label: 'Plan readout', text: 'The prompt panel now reads back what is planned — “Free shot: C2.” — rather than what to do next.' },
          { x: 30.7, y: 92.3, label: 'Charged card', text: 'The gem has ticked to 1 and pulses. The pitch of the click rises with the count, so a fifth charge sounds different from a first.' },
          { x: 49.2, y: 96.5, label: 'Fire becomes live', text: 'Fire lights up only once the card holds enough charges to be legal. Below its minimum it stays inert.' },
          { x: 75.8, y: 93.9, label: 'Armed', text: 'With a complete plan the commit button pulses. Both plans are held sealed until both have arrived — there is no window in which a late plan can be informed by an early one.' },
        ],
      },
      {
        file: '17-target-hover',
        num: '17',
        name: 'Pattern preview',
        thesis:
          'Aiming a card previews the exact pattern it would cover, before anything is locked. Twelve cards aim twelve ways; none of them should require memorised geometry.',
        notes: [
          'Burst covers a 2×2 block — and a 3×3 at four charges. Lance runs a straight line whose length is its charge count. Rake takes three in a row, plus one per extra charge.',
          'The preview uses the same gold aim state as the free shot, so “this is what I am about to do” always looks the same.',
          'Cancel and Lock in sit under the prompt: nothing is committed by hovering, and nothing is committed by aiming either.',
        ],
      },
      {
        file: '18-resolve',
        num: '18',
        name: 'The resolve',
        thesis:
          'Both plans turn face up and the round plays out beat by beat, in the exact order the rules resolve it — so a player can see why something happened, not just that it did.',
        pins: [
          { x: 32.9, y: 44.3, label: 'Step marker', text: '“4 · ATTACKS”. The resolve has a fixed order — reveal, control effects, predictions, attacks, reactions, charges — and the overlay names which step you are watching.' },
          { x: 67.1, y: 49.2, label: 'What just happened', text: 'Plain language, always. “Your deck gun at C2 — miss.” Never “P0 basic → miss”.' },
          { x: 52.7, y: 57.3, label: 'Click to skip', text: 'The whole sequence can be skipped, and a Settings toggle collapses it to about a second permanently.' },
          { x: 26, y: 43.5, label: 'Board stays visible', text: 'The panel is small and the boards dim rather than disappear, so each described shot lands where you can see it land.' },
        ],
      },
    ],
  },
  {
    id: 'after',
    title: 'Settling up',
    standfirst:
      'What a match is worth, and the proof that it was played honestly. Both fleets are revealed here and nowhere earlier.',
    plates: [
      {
        file: '19-result-settlement',
        num: '19',
        name: 'Result and receipt',
        thesis:
          'The outcome, both fleets revealed, and a settlement receipt that shows the arithmetic — pot, rake, net — with the transaction and a replay check beside it.',
        pins: [
          { x: 41.4, y: 7.2, label: 'The verdict', text: 'VICTORY, DEFEAT or DRAW, slammed in at 72px. The reason line underneath names how it ended — fleet destroyed, hull count, mutual elimination.' },
          { x: 28.4, y: 14.6, label: 'Your fleet, revealed', text: 'Your board, your ships and the cards you fired. Sunk ships show hollow pips; spent cards keep their final charge count.' },
          { x: 50.9, y: 14.6, label: 'Their fleet, revealed', text: 'The first and only moment their layout and identities become visible. Everything hidden during play is shown once it can no longer matter.' },
          { x: 83.3, y: 21.4, label: 'Rating', text: 'The new rating with the delta. Provisional accounts move at double K so a new rating finds its level fast.' },
          { x: 83.3, y: 26.4, label: 'The arithmetic', text: 'Pot, the 5% rake on its own line, and the net in gold. A draw replaces these with “stakes returned — no rake”.' },
          { x: 83.3, y: 33.7, label: 'Transaction', text: 'The settlement signature. On devnet it links to the explorer; on the local adapter it is labelled “(simulated)” rather than dressed up as real.' },
          { x: 83.3, y: 39.9, label: 'Replay verified', text: 'The client re-ran the entire match from the seed and the signed transcript and got the same result. This badge is the product’s core claim, checked rather than asserted.' },
          { x: 83.3, y: 45.9, label: 'Export match proof', text: 'Downloads the transcript as JSON. Anyone can verify it independently — the check does not depend on this client.' },
          { x: 67.9, y: 63.4, label: 'Rematch · next opponent', text: 'Same size, same weight: the two things a player actually wants next, one press away.' },
        ],
      },
      {
        file: '26-bracket-live',
        num: '26',
        name: 'The bracket',
        thesis:
          'Eight seats, three rounds, one pot. Your path is picked out in gold, and the payout split never leaves the screen.',
        pins: [
          { x: 31.5, y: 25, label: 'Pot and split', text: 'The pot, the rake, and every share — champion, runner-up, semifinalists, and the explicit “QF exit ◎0” — always visible while you play.' },
          { x: 27.5, y: 38, label: 'Your match', text: 'Gold border and a ★ against your name. In a bracket of eight, the first thing you need is to find yourself.' },
          { x: 27.5, y: 49, label: 'Quarter-finals', text: 'Four matches. Each box shows both seats, strikes through the loser, and ticks the winner in green.' },
          { x: 39.1, y: 49, label: 'Semi-finals', text: 'Slots read “…” until the feeding matches decide them, and say what they are waiting on.' },
          { x: 50.5, y: 54.4, label: 'The final', text: 'One match. A drawn bracket match replays in full — sudden death — because a bracket needs a winner.' },
          { x: 72.4, y: 54.2, label: 'Champion slot', text: 'Undecided until it is not. Gold framed, because that is where the 55% goes.' },
          { x: 43.8, y: 81.5, label: 'Play your round', text: 'One green button when it is your turn, naming which round you are about to play.' },
        ],
      },
      {
        file: '27-champion',
        num: '27',
        name: 'Champion',
        thesis:
          'The loudest screen in the game, and the mode’s whole reason to exist: eight entered, one takes 55% of the pot.',
        pins: [
          { x: 46.6, y: 38.9, label: 'Trophy', text: 'Gold on gold, slammed in with the banner animation used for nothing else.' },
          { x: 37.6, y: 48, label: 'CHAMPION', text: 'Set in the outlined display numerals at 88px — the same treatment as the charge gems and the clock, at the largest size the product ever uses.' },
          { x: 35.9, y: 54.4, label: 'The number', text: 'What you actually take, against the pot it came from. The celebration and the receipt are the same sentence.' },
          { x: 43.8, y: 61.2, label: 'Collect and return', text: 'One way onward. The settlement itself already happened on-chain; this is acknowledgement, not a transaction.' },
        ],
      },
    ],
  },
  {
    id: 'ladder',
    title: 'The ladder and the shelf',
    standfirst:
      'Where a season stands, what the game is made of, and who made the parts that were not made here.',
    plates: [
      {
        file: '20-leaderboard',
        num: '20',
        name: 'Leaderboard',
        thesis:
          'The standings with the payout curve drawn on the page rather than described in a help article — and your own row pinned wherever you actually rank.',
        pins: [
          { x: 67.1, y: 6.4, label: 'Live pool', text: 'What all the season entries add up to right now, in gold.' },
          { x: 21.6, y: 23.7, label: 'The top of the ladder', text: 'Rank, handle, rating. Tabular figures so the numbers line up as a column rather than drifting.' },
          { x: 21.6, y: 46.1, label: 'Your row, pinned', text: 'Ranked 2608th and still on screen. A ladder that only shows the top eight tells almost every player nothing.' },
          { x: 65.7, y: 9.5, label: 'Payout curve', text: 'Five bands, each with its share of the pool and what that works out to per player.' },
          { x: 79.7, y: 16.4, label: 'Band bars', text: 'Length encodes share, so the shape of the curve is legible before any number is read.' },
          { x: 52, y: 31, label: 'Why this shape', text: 'The top 1% take the largest share; the top tenth at least recover their entry. A ladder nobody below the podium can profit from stops being a ladder.' },
        ],
      },
      {
        file: '21-season',
        num: '21',
        name: 'Season',
        thesis:
          'Days left, the live pool, where you stand, and what that position would pay if the season ended now.',
        notes: [
          'The projection is computed from the same curve the leaderboard draws, against your current rank — not a marketing number.',
          'Match history sits underneath: result, rating delta, rounds, mode and stake for every recent match.',
          'A player who has not entered the season sees the same page with the projection zeroed and the entry offered, so the value of entering is legible before paying.',
        ],
      },
      {
        file: '22-settings',
        num: '22',
        name: 'Settings',
        thesis:
          'Wallet, sound, opponent strength — and a running journal of everything the chain adapter actually did, because a staking product should never make you guess.',
        pins: [
          { x: 36, y: 9.5, label: 'Wallet', text: 'Connect and disconnect. The adapter in use is named — “mock” here, “devnet” against a real cluster.' },
          { x: 21.8, y: 20.4, label: 'What a session key is', text: 'Connecting issues a key that signs your moves for the session. It cannot move funds: the escrow answers to your wallet and never to the session. That claim is enforced by the program and proven by a test.' },
          { x: 49.2, y: 37.6, label: 'Sound', text: 'Fifteen cues, all real CC0 audio. Master volume and mute persist across reloads.' },
          { x: 21.8, y: 41.1, label: 'Master volume', text: 'A slider that plays a click on release, so you hear the level you just set.' },
          { x: 21.8, y: 51.9, label: 'Opponent strength', text: 'Four bots: Deckhand plays at random, Admiral models your fleet distribution and predicts your next shot.' },
          { x: 78.1, y: 13.2, label: 'Credits', text: 'The icon set is CC BY, which requires attribution. That is a licence condition rather than a courtesy, so the screen ships with the game.' },
          { x: 78.1, y: 29, label: 'Chain journal', text: 'Every escrow, commitment and settlement the adapter performed this session, in order, with amounts and hashes.' },
          { x: 78.1, y: 44.4, label: 'Sound cue log', text: 'The last cues fired. A quiet way to prove the audio hooks are live even with the volume down.' },
        ],
      },
      {
        file: '23-credits',
        num: '23',
        name: 'Credits and licences',
        thesis:
          'Thirty-seven icons under CC BY, fifteen sounds under CC0, three typefaces under the OFL — each with its author and source, in the build itself.',
        notes: [
          'Attribution is a licence condition for the icon set, so the screen is part of the product rather than a document kept alongside it.',
          'The list is generated by the same script that downloads the assets, so the credits cannot drift from what actually shipped.',
          'No Epic Games asset, model, texture, font or sound is used or referenced anywhere. “Stylised 3D” is a visual target, not a source.',
        ],
      },
    ],
  },
  {
    id: 'wire',
    title: 'When the wire breaks',
    standfirst:
      'Real network play means real network failure. Five states a player is owed the truth about — three of them while money is on the table.',
    plates: [
      {
        file: '29-reconnecting',
        num: '29',
        name: 'Reconnecting',
        thesis:
          'The socket dropped mid-match. The server holds your seat for the grace period, and the client says exactly that while it retries.',
        notes: [
          'Input is blocked while this shows: acting on a stale view would only queue intents the server will refuse.',
          '“Your plans are safe — nothing is decided by your clock” is the important sentence. Every deadline is server-side; a slow or backgrounded client changes nothing about when the server acts.',
        ],
      },
      {
        file: '30-connection-lost',
        num: '30',
        name: 'Connection lost',
        thesis:
          'Reconnection gave up. Said plainly, with the consequence spelled out and exactly one useful button.',
        notes: [
          'The consequence is named rather than softened: if a match was running, the seat forfeits when the grace period lapses.',
          'A staked player who does not know that is a player about to lose money to a wording choice.',
        ],
      },
      {
        file: '31-opponent-disconnected',
        num: '31',
        name: 'Opponent disconnected',
        thesis:
          'Their socket, their problem — but you are told, and the match holds rather than hanging.',
        pins: [
          { x: 30.8, y: 8.6, label: 'The banner', text: 'Amber, non-blocking, at the top of the board. You can keep planning; the round resolves as normal.' },
          { x: 69.2, y: 8.6, label: 'The rule, stated', text: 'They forfeit if they stay away past the grace period — and with real money that path is exercised in the tests, not assumed.' },
          { x: 26, y: 43.5, label: 'Play continues', text: 'The board stays live underneath. A disconnect is not a modal that stops the game for the player who is still there.' },
        ],
      },
      {
        file: '32-server-error',
        num: '32',
        name: 'Server error',
        thesis:
          'A refusal from the server surfaces as a sentence. Codes travel on the wire; humans get words.',
        notes: [
          'The protocol carries a machine code — `rate-limited`, `provisional`, `stale-round` — and the interface renders the message beside it rather than the code alone.',
          'Non-blocking, bottom of the screen: a refusal you can read and act on without losing the screen you were on.',
        ],
      },
      {
        file: '33-queue-timeout',
        num: '33',
        name: 'Queue timeout',
        thesis:
          'Nobody in your band joined in time. The stake was never taken — and a staked player is never silently handed a bot.',
        notes: [
          'Casual falls back to a bot after a few seconds and says so in the match-found message. Staked queues never do; they time out loudly instead.',
          'Quietly substituting a bot for a paying opponent would be the single worst thing this product could do. The queue is built so it cannot.',
        ],
      },
    ],
  },
];

// --- the anatomy primer ----------------------------------------------------

const COLOURS = [
  ['#FFC531', 'Gold', 'Money and charges. Spent on nothing else, anywhere — a gold thing is always a number about value.'],
  ['#2ED573', 'Green', 'Go. Commit, play, confirm — and a landed win.'],
  ['#FF4D5E', 'Red', 'Damage, loss, refusal. Hits on a hull, a defeat banner, an error border.'],
  ['#FF6B4A', 'Attack', 'Card role: shells and patterns. Salvo, Lance, Burst, Rake, Breaker.'],
  ['#19C8E8', 'Intel', 'Card role: knowledge, not damage. Ping, Echo, Sounding.'],
  ['#9B5CFF', 'Control', 'Card role: taking things away. Jam, Siphon — and NERF ships.'],
  ['#FF9F1C', 'Prediction', 'Card role: reading them. Mirror, Ambush — and REACT ships.'],
  ['#23B5E8', 'Water', 'Playable board. Both grids, in the same blue, on every screen.'],
];

const ANATOMY = [
  {
    h: 'A card, every time',
    p: 'One component draws every card in the product — draft, hand, result, opponent strip. Portrait 2:3, framed in its role colour, art window across the top 60%, name banner through the middle, the compressed rule on the face, and the gold charge gem in the bottom-right corner as the largest number on the object. The full rule text arrives on hover. A player learns this shape once.',
  },
  {
    h: 'A ship, every time',
    p: 'Landscape, with the ship’s glyph, its length as pips, and its type — ACTIVE, NERF or REACT — in the type’s own colour. The unrevealed enemy version is the same card admitting only a length, because a length is all the rules make public until that ship acts or sinks.',
  },
  {
    h: 'A cell, and what it remembers',
    p: 'Board cells carry state: gold outline for what you are about to fire at, red for a hit, white for a miss, cyan for a cell intel exposed as occupied, and steel for your own hull on your own board. Every mark is a fact you have earned; none of them are ever guesses the interface made for you.',
  },
  {
    h: 'Numbers are display objects',
    p: 'Charge counts, the round clock and hull totals are set in an outlined display face at sizes no ordinary interface would use. They are the numbers a player checks under time pressure from across a desk, so they are built to be read at a glance rather than inspected.',
  },
];

// --- render ----------------------------------------------------------------

const plateCount = SECTIONS.reduce((n, s) => n + s.plates.length, 0);
const pinCount = SECTIONS.reduce(
  (n, s) => n + s.plates.reduce((m, p) => m + (p.pins?.length ?? 0), 0),
  0,
);

function renderPlate(plate: Plate): string {
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

  return `<article class="plate${pins.length ? ' has-pins' : ''}" id="plate-${plate.num}">
  <header class="plate-head">
    <p class="plate-num">Plate ${plate.num}</p>
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

const nav = SECTIONS.map(
  (s) => `<div class="nav-group">
    <p class="nav-title"><a href="#${s.id}">${esc(s.title)}</a></p>
    <ul>${s.plates
      .map(
        (p) =>
          `<li><a href="#plate-${p.num}"><span>${p.num}</span>${esc(p.name)}</a></li>`,
      )
      .join('')}</ul>
  </div>`,
).join('');

const body = SECTIONS.map(
  (s) => `<section class="chapter" id="${s.id}">
  <header class="chapter-head">
    <h2>${esc(s.title)}</h2>
    <p>${esc(s.standfirst)}</p>
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
    <p class="kicker">Shadow Armada · build 5 · captured at 1920×1080</p>
    <h1>Every screen,<br>and what <em>every part of it</em> is for.</h1>
    <p class="lede">A hidden-information naval duel wagered on Solana, documented plate by plate:
      ${plateCount} screens photographed from the running game, with ${pinCount} callouts naming
      what each element is, what it does, and why it was built that way.</p>
    <div class="tally">
      <div><b>${plateCount}</b><span>Plates</span></div>
      <div><b>${pinCount}</b><span>Callouts</span></div>
      <div><b>8</b><span>Chapters</span></div>
      <div><b>1920×1080</b><span>Capture</span></div>
    </div>
  </header>

  <nav class="rail" aria-label="Plate index"><div class="rail-inner">${nav}</div></nav>

  <main>
    <section class="primer" id="primer">
      <h2>Reading the screens</h2>
      <p>Four conventions carry every plate that follows. Learn these and the rest of the
        document explains itself.</p>

      <div class="swatches">
        ${COLOURS.map(
          ([hex, name, use]) =>
            `<div class="sw"><span class="chip" style="background:${hex}"></span>
             <div><b>${esc(name)}</b><span>${esc(use)}</span></div></div>`,
        ).join('')}
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
