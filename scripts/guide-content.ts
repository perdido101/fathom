/**
 * The guide's content, and nothing about how it is drawn.
 *
 * Two generators read this: `screen-guide.ts`, which builds the HTML page and
 * the PDF printed from it, and `guide-docx.ts`, which builds the Word version.
 * The plate list, the callouts and the copy live here precisely once — a
 * second format is not a reason to keep a second copy of the text.
 */

/** A numbered callout: x/y are percentages of the screenshot, centre of the pin. */
export interface Pin {
  x: number;
  y: number;
  label: string;
  text: string;
}

/** A side-by-side comparison, for the restraint pass. */
export interface Spread {
  before: string;
  after: string;
  /**
   * The line above the title. There are two spreads now — the restraint pass
   * and the ownership restructure — so the headings that used to be hardcoded
   * into both renderers are data.
   */
  kicker?: string;
  beforeCaption?: string;
  afterCaption?: string;
  goneTitle?: string;
  arrivedTitle?: string;
  /** What was removed, and why. */
  gone: [string, string][];
  /** What arrived in its place — three things, against eight removals. */
  arrived: [string, string][];
}

export interface Plate {
  file: string;
  /** The capture number, so a plate maps to the file it came from. */
  num: string;
  name: string;
  thesis: string;
  pins?: Pin[];
  /**
   * How many callouts this plate needed before the restraint pass. Build 6
   * required the counts to come down, so the guide reports them rather than
   * asking anyone to take the claim on trust.
   */
  was?: number;
  /** Used when a screen is better explained in prose than in pins. */
  notes?: string[];
  /** A before/after page instead of a plate. */
  spread?: Spread;
}

export interface Section {
  id: string;
  title: string;
  standfirst: string;
  /** What the player is doing, deciding, and does not yet know, in this phase. */
  journey: string;
  plates: Plate[];
}

export const SECTIONS: Section[] = [
  {
    id: 'arrival',
    title: 'Arrival',
    standfirst:
      'What a player meets before they have decided anything. Nothing here asks for a wallet, and nothing here costs money — the first job of these screens is to let someone find out whether they like the game.',
    journey:
      'You have not decided anything yet. You do not know what the game is, whether it costs money, or whether you are any good at it. Everything on these screens exists to let you answer the first two without answering the third — and to make sure that when you do put money down, you already knew the price.',
    plates: [
      {
        file: '01-main-menu',
        num: '01',
        name: 'Main menu',
        was: 11,
        thesis:
          'Four ways to play, each wearing its money story on its face. What a mode costs is the first thing a player choosing between them wants to know, so the price is never a click away.',
        pins: [
          { x: 34, y: 22, label: 'Wordmark', text: 'Two chevrons in a circle — a fleet in echelon. Drawn in code, so it stays sharp at any size and needs no asset. Set at 88px: the one element in the game allowed that size.' },
          { x: 26.4, y: 35.4, label: 'Four doors, four prices', text: 'Casual is free and complete. Ranked is one season entry. Arena is per-match stakes. Tournament is eight seats and one pot. Each card states its own terms, including the unflattering ones — the tournament card admits that quarter-final losers take nothing.' },
          { x: 50, y: 42, label: 'Stake pill', text: 'Gold, always. Gold is spent on money and charges in this game and on nothing else, so a gold pill anywhere means “this is a number about value”.' },
          { x: 17.5, y: 58.6, label: 'Mode CTA', text: 'Green means go, everywhere in the product. The verb changes with state — “Enter season” becomes “Play ranked” once the entry is paid.' },
          { x: 33, y: 79, label: 'Secondary row', text: 'How to play, Leaderboard, Season, Settings. Quiet white pills: reachable, never competing with the four money cards.' },
          { x: 43, y: 85.5, label: 'Rating', text: 'One pill. A season-rank pill stood beside it until Build 6 — a rank is a rating read against the pool, which is the same fact and one click away on the Season screen.' },
          { x: 84.5, y: 9.5, label: 'Wallet chip', text: 'On every screen. Short address, live devnet balance, and a faucet link the moment the balance falls under the cheapest table.' },
        ],
      },
      {
        file: '02-howto-draft',
        num: '02',
        name: 'How to play · the draft',
        thesis:
          'The one rule nobody arrives already knowing, taught first and taught by hand: you both see the same four, you both pick in secret, and a shared pick goes to both of you.',
        notes: [
          'New in Build 6, and placed first because it happens first. Blind simultaneous picking with legal duplicates is unusual, and until now the game never explained it anywhere.',
          'The cards are live. Pick one and the opponent’s card slides in beside it — face down if you differed, face up if you collided. The rule is demonstrated rather than asserted.',
          'The opponent’s pick is fixed rather than random. A tutorial that behaves differently on two readings teaches two different rules.',
        ],
      },
      {
        file: '03-howto-charging',
        num: '03',
        name: 'How to play · charging',
        thesis:
          'Five things you do, not five things you read. The cards in this panel are live: clicking one charges it and the gem pops, so the rule is learned by hand.',
        notes: [
          'Each round you place exactly one charge. Charges are public — both players can see what the other is building, which is what makes the bluff possible.',
          'The card components here are the same `GameCard` the battle screen uses, at the same proportions. A player learns the object once and meets it everywhere.',
        ],
      },
      {
        file: '04-howto-firing',
        num: '04',
        name: 'How to play · firing',
        thesis:
          'The rule that catches everyone out, taught before it can cost anything: firing spends every charge on the card and destroys the card for good.',
        notes: [
          'A card is a resource you grow and then spend once. There is no discard, no reshuffle, no second copy — the tension in the whole game lives in “one more round or now?”.',
          'The step order is deliberate: draft, then charge, then fire, then simultaneity, then sinks. Each step only assumes what the previous one taught.',
        ],
      },
      {
        file: '05-howto-sinks',
        num: '05',
        name: 'How to play · sinks',
        thesis:
          'A sink announces a length and never a name. Every fleet is one 4, one 3 and one 2, so the length names the slot and leaves the candidates open.',
        notes: [
          'This is the hidden-information rule in one sentence. Sinking their 3 tells you which slot went down, not which of the four possible 3-length ships it was.',
          'That gap is the deduction surface the whole game rests on — and the reason the opponent’s hand renders as card backs everywhere else in this guide.',
        ],
      },
      {
        file: '45-desktop-gate',
        num: '45',
        name: 'The desktop gate',
        thesis:
          'Below 1280×720 the game does not attempt a squeezed layout. Logo, one sentence, nothing else — a polished refusal beats a broken board.',
        notes: [
          'Enforced in CSS with a media query, not a resize listener, so there is no JavaScript state that can fall out of sync with the viewport.',
          'The game is 16:9 desktop by decision: the battle screen puts two boards, two hands and a clock on screen at once, and that composition has nowhere to go on a phone.',
        ],
      },
    ],
  },
  {
    id: 'money',
    title: 'Money on the table',
    standfirst:
      'Every surface where value moves. These are the screens a wagered game is judged on, so each one states the amount, the rake, and the way out before anything is committed.',
    journey:
      'You have decided to play for something. From here until settlement, every screen owes you three things before you press anything: what it costs, what it pays, and how you get out. You do not yet know who you are playing — that comes in the next chapter, and deliberately after the money, because the stake is the decision and the opponent is not.',
    plates: [
      {
        file: '06-ranked-join-modal',
        num: '06',
        name: 'Season entry',
        thesis:
          'The season as a purchase decision: the price, exactly what it buys, the pool so far, and one confirm. A short balance is warned about here, not discovered at settlement.',
        notes: [
          'One entry buys unlimited ranked matches for the season. Entries are pooled and paid out at season end on a curve, which the modal says in plain words.',
          'Two buttons only — “Not now” and “Pay ◎0.1 and play”. A money dialog with three ways forward is a money dialog someone clicks by accident.',
        ],
      },
      {
        file: '07-arena-tiers',
        num: '07',
        name: 'Arena tables',
        was: 7,
        thesis:
          'Four stake tables and what a win actually pays at each. Tiers a provisional account cannot enter are visibly locked and now say what unlocks them.',
        pins: [
          { x: 29.5, y: 32.5, label: 'The rule, above the choice', text: 'Winner takes the pot minus 5%. A draw returns both stakes in full and takes no rake — the one outcome that has to stay costless.' },
          { x: 30, y: 48, label: 'Stake tier', text: 'The stake as the largest number on the card, with the gold gem above it. Four tiers: ◎0.05, ◎0.1, ◎0.25, ◎0.5.' },
          { x: 39.5, y: 52.5, label: 'What a win pays', text: 'The post-rake number, computed the same way the on-chain program computes it — not an estimate rounded for display.' },
          { x: 39.5, y: 38.5, label: 'Selection', text: 'A gold ring and a lifted shadow. Gold again, because the thing being selected is an amount of money.' },
          { x: 36.5, y: 59.5, label: 'The matchmaking band, once', text: 'This line was printed on all four tier cards until Build 6 — and it was the same range on every one, because it is a property of your rating and not of the table.' },
          { x: 36.5, y: 65.5, label: 'Pot and rake', text: 'The arithmetic of the selected tier. “To winner” used to sit here too; it is pot minus rake, both of which are on this row, and the figure is already on the card you are choosing between.' },
          { x: 63.5, y: 74, label: 'Find match', text: 'The commit control, carrying the stake in its own label. You cannot press this without having read the number.' },
        ],
      },
      {
        file: '08-locked-tier-why',
        num: '08',
        name: 'A locked table, explaining itself',
        thesis:
          'Hovering a table you cannot sit at says what would unlock it and how far away that is. A disabled control that says nothing was the single most confusing gap in the build.',
        notes: [
          'The reason is computed from your own record — “3 more rated matches unlocks this one” — rather than a fixed sentence about provisional accounts.',
          'The same mechanism (`WhyNot`) covers the inert Fire control, the disabled Commit, and the deployment button. It wraps the control and takes the pointer events itself, because a disabled button never fires them.',
          'It costs nothing when the pointer is elsewhere: no permanent chrome is added to say what is only relevant on hover.',
        ],
      },
      {
        file: '09-insufficient-funds',
        num: '09',
        name: 'Not enough SOL',
        was: 5,
        thesis:
          'The error state as a human sentence: what the table needs, what the wallet holds, a working faucet link, and a way down to a cheaper table.',
        pins: [
          { x: 34.5, y: 66, label: 'What went wrong', text: '“Not enough devnet SOL for this table.” Named in the first four words, before any explanation.' },
          { x: 65.5, y: 69, label: 'Both numbers', text: 'What is required and what is held, side by side. An error that states only one of them makes the player go and look up the other.' },
          { x: 44.1, y: 72.5, label: 'The fix', text: 'A live link to the devnet faucet. The alternative fix — pick a lower table — is named in the same sentence.' },
          { x: 46.4, y: 79, label: 'Inert, not hidden', text: 'The commit button greys out and stops breathing rather than disappearing, so the layout never jumps and the goal stays visible.' },
        ],
      },
      {
        file: '10-escrow-forming',
        num: '10',
        name: 'The escrow forming',
        was: 6,
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
        file: '39-tournament-tiers',
        num: '39',
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
        file: '40-bracket-forming',
        num: '40',
        name: 'Seats filling',
        thesis:
          'Eight seats staking in view. A bracket only ever starts full — byes cannot exist — and if it never fills, every stake reclaims and no rake is taken.',
        notes: [
          'Each seat is a card: dashed and faded while open, solid with a green border and a tick once that entrant’s stake has landed. The amount used to be printed on all eight; it is the same figure on every seat and it is in the title.',
          'The counter beneath reads “N/8 staked”. The eighth stake is what starts play, on-chain as well as in the interface — the program refuses a ninth join.',
          'If ten minutes pass without a full bracket, every seat recovers its own stake through a permissionless path. The escrow cannot strand funds even if the server dies.',
        ],
      },
    ],
  },
  {
    id: 'between',
    title: 'The beats between',
    standfirst:
      'Four moments that did not exist before Build 6. Each is about 1.5 seconds, skippable with a click, and off entirely from one Settings toggle — and each carries a fact the player needed anyway.',
    journey:
      'The match used to jump-cut. You pressed a button and were standing in pack one with no idea who you were facing, and later you were on the battle screen with no memory of having agreed to anything. These four beats fill those cuts. They also earn their keep twice over: the phase cards replaced the permanent headers that sat on the draft and deploy screens forever, so the game now names a phase once, loudly, instead of continuously, quietly.',
    plates: [
      {
        file: '11-beat-match-found',
        num: '11',
        name: 'Match found',
        thesis:
          'Who you are about to face and for how much, in the gap between paying and drafting. A player thrown straight into pack one knows neither, and both change how they draft.',
        pins: [
          { x: 39, y: 49, label: 'The pairing', text: 'You and them, named. In a networked match this is their real handle; against the local bot it says so.' },
          { x: 38.5, y: 53, label: 'Told the truth about the opponent', text: 'A local opponent is a bot and is named as one, with its strength. Inventing a rating for it would be the first lie the product tells, on the screen whose whole job is saying who you are playing.' },
          { x: 61, y: 53, label: 'The stake, restated', text: 'The last time the number appears before it is at risk. Casual reads “no stake” rather than showing nothing.' },
        ],
      },
      {
        file: '12-beat-phase-ship-draft',
        num: '12',
        name: 'Phase card',
        thesis:
          'The phase named once, with one line on what it asks of you. Four of these — SHIP DRAFT, CARD DRAFT, DEPLOY, BATTLE — replaced four permanent page headers.',
        notes: [
          'The trade is the whole build in miniature: a header occupies screen for the entire phase and says the same thing on the last second as on the first. A card occupies screen for a second and a half and then never again.',
          'The vertical space this freed on the deployment screen went straight into the board.',
        ],
      },
      {
        file: '17-beat-fleet-assembled',
        num: '17',
        name: 'Fleet assembled',
        thesis:
          'The moment a player finds out what they drafted. Three ships picked one pack at a time had never appeared together anywhere — you learned your own fleet by playing it.',
        notes: [
          'The three abilities are readable side by side for the first and only time before the match. This is where a player works out what their plan is.',
          'The cards stagger in at 130ms apart, which reads as a fleet forming rather than three boxes appearing.',
        ],
      },
      {
        file: '22-beat-both-committed',
        num: '22',
        name: 'Both committed',
        thesis:
          'Two hashes, written before a shot is fired and checkable by anyone afterwards. It is the thing the whole product rests on, and until Build 6 it had no moment at all.',
        pins: [
          { x: 36, y: 43, label: 'Your commitment', text: 'The SHA-256 of your layout and a secret nonce. Published deliberately: a commitment exists so the other side can hold you to it later.' },
          { x: 64.5, y: 43, label: 'Theirs', text: 'Arrived at the same instant. Neither hash tells the other anything about where a hull sits — that is what makes it safe to show.' },
          { x: 50, y: 51.5, label: 'The seal', text: 'Both boxes go from dashed to solid green together, 620ms in. A commitment that is not yet sealed and one that is should not look the same.' },
          { x: 25, y: 55, label: 'What it buys', text: 'At the end of the match both layouts are revealed and replayed against these two hashes. A fleet that “moved” mid-match fails that check publicly.' },
        ],
      },
    ],
  },
  {
    id: 'draft',
    title: 'The draft',
    standfirst:
      'Both fleets end up one 4, one 3 and one 2 — only the abilities differ. Picks are blind and simultaneous, and the only thing a draft ever leaks is a collision.',
    journey:
      'Six decisions, made blind, in about ninety seconds. You know exactly what is on the table — all four cards are face up to both of you — and nothing at all about what they took, unless you took the same thing. That asymmetry is the entire game: by the end of the draft you will know sixteen possible fleets they might be sailing, and the rest of the match is narrowing that down while they narrow you down.',
    plates: [
      {
        file: '13-ship-draft',
        num: '13',
        name: 'Ship draft',
        was: 8,
        thesis:
          'A pack of four, face up to both players. You pick in secret; duplicates are legal and carry no penalty.',
        pins: [
          { x: 44, y: 30.5, label: 'Pack progress', text: 'Three packs, three picks. The filled pip is the pack on screen — a three-step process shown as three steps. This is the one fact the phase card cannot carry, because it changes twice while you stand here.' },
          { x: 22.5, y: 32.5, label: 'Type stripe', text: 'The card’s top edge is coloured by ability type: purple NERF, orange REACT, green ACTIVE. The same colours mean the same things everywhere.' },
          { x: 22.5, y: 43, label: 'The whole ability', text: 'Full rule text on the face. Nothing about a draft pick is hidden behind a hover — you are choosing, so you get everything.' },
          { x: 39.5, y: 52.5, label: 'Type · length', text: 'The two facts that decide where the ship sits in your fleet, restated at the point of decision.' },
          { x: 21, y: 59, label: 'The mechanism, permanently', text: 'One line under the pack, not a panel. New in Build 6: the rule was never stated anywhere before, and a header saying “Ship draft” was not the same as explaining it.' },
          { x: 42, y: 63.5, label: 'Taken so far', text: 'Your own picks accumulate here, flagged “· both!” where a collision made a pick public.' },
          { x: 33, y: 68, label: 'The first-run coach', text: 'Pack one only, on a player’s first ever draft. It dismisses itself on the first pick and never returns — the mechanism has three teachers and only this one is temporary.' },
        ],
      },
      {
        file: '14-draft-your-pick',
        num: '14',
        name: 'Beat 2 · your pick',
        thesis:
          'The confirmation beat. The card you took lifts and holds; the other three dim and recede. This has to land clearly, because it is the only acknowledgement a blind pick can get.',
        notes: [
          'Beat 1 is the deal-in: four cards arc in from off-screen, staggered 80ms, settling with a small bounce. The whole five-beat sequence runs about two seconds.',
          'Everything is skippable with a click, and `prefers-reduced-motion` collapses the sequence to a cross-fade.',
          'The pick reaches the engine on the click, not at the end of the animation. Holding the engine back for theatre would hold the opponent back too.',
        ],
      },
      {
        file: '15-draft-their-pick',
        num: '15',
        name: 'Beat 3 · their pick',
        thesis:
          'A card back slides in beside yours and both sit there for a moment. This is the tension beat, and until Build 6 it did not exist — the screen went straight from your click to a verdict.',
        notes: [
          'The back is the same face-down design used for the draw pile and the opponent’s hand. A player learns one “this is hidden” object.',
          'The pause is the point. A blind simultaneous pick has a moment of not-knowing in it, and an interface that skips that moment throws away the only drama the draft has.',
        ],
      },
      {
        file: '16-draft-resolve',
        num: '16',
        name: 'Beat 4 · resolve',
        thesis:
          'No collision: their card back flips away and yours flies to the tray. Nothing is announced. A collision instead flips both face up together into the gold slam.',
        notes: [
          'Build 6 deleted the “PICKS DIFFER” screen entirely. It announced the absence of information, which is the default state of every pack and therefore not news — a player who sees no collision already knows the picks differed.',
          'The collision keeps its slam. It is the only thing a draft ever tells you, so it should be the only thing that interrupts.',
          'Because a collision makes a card public, it is also the only case where that card later renders face-up in the opponent’s hand during battle.',
        ],
      },
      {
        file: '18-card-draft',
        num: '18',
        name: 'Card draft',
        was: 7,
        thesis:
          'The same mechanism, second time, now with real cards — so the interaction is learned once and used twice. Everything nobody takes becomes the shared draw pile.',
        pins: [
          { x: 26.5, y: 35, label: 'Role border', text: 'Every card is framed in its role colour: red attack, cyan intel, purple control, amber prediction. Colour tells you what a card is before you read it.' },
          { x: 26.5, y: 42.5, label: 'Art window', text: 'The top 60% of the card. A composed role gradient with the glyph today; generated illustration drops in here later without touching the layout.' },
          { x: 26.5, y: 51, label: 'Name banner', text: 'Across the middle in the role colour, white on colour — the card’s identity at a glance in a fanned hand.' },
          { x: 39.5, y: 60.5, label: 'Charge gem', text: 'Bottom-right, gold, and deliberately the biggest number on the card. Charges are the currency of every decision in the match.' },
          { x: 21, y: 65.5, label: 'The pile rule', text: 'Whatever neither player takes becomes the shared draw pile — so the cards you pass are the cards you may both draw later.' },
        ],
      },
      {
        file: '19-card-hover',
        num: '19',
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
    journey:
      'One decision, and it is the only one in the match you cannot revisit. Everything after this is played against a board you fixed in the next sixty seconds. The interface’s job here is narrow: show you what is legal, never say no, and make it obvious that pressing the button is a commitment rather than a save.',
    plates: [
      {
        file: '20-deployment',
        num: '20',
        name: 'Deploy',
        was: 8,
        thesis:
          'Your water large in the centre, the fleet as cards in a side tray. Hovering the board previews a legal placement before you commit to it.',
        pins: [
          { x: 33.9, y: 40.3, label: 'Your board', text: 'Six by six, lettered columns and numbered rows. The same coordinate language the resolve log speaks: “C2”, “E4”.' },
          { x: 39.3, y: 54.6, label: 'Placement preview', text: 'The gold outline is the run the selected ship would occupy from the hovered cell. An illegal run simply does not preview — the interface never has to say no.' },
          { x: 56.7, y: 24, label: 'The placement rule', text: 'Orthogonal only, and hulls may touch. Two ships side by side read as one long ship for several rounds, which is a real defensive choice.' },
          { x: 78.1, y: 24, label: 'Phase clock', text: 'The deployment window. Let it lapse and the fleet auto-places and commits — the match never stalls on a player who walked away.' },
          { x: 57.9, y: 38.1, label: 'Fleet tray', text: 'Your three drafted ships as landscape cards. The heading “Your fleet” sat above them until Build 6, labelling three of your own ships, in a tray, on the deployment screen.' },
          { x: 57.7, y: 60.9, label: 'Orientation and shortcuts', text: 'Horizontal/vertical toggle, Auto for a legal random layout, Clear to start over.' },
          { x: 58.9, y: 74, label: 'Commit fleet', text: 'Disabled until all three ships are legally placed, and hovering it then says how many are left. The paragraph explaining the commitment hash used to sit below this button; it moved to the beat where the hashes are actually shown sealing.' },
        ],
      },
      {
        file: '21-deployment-placed',
        num: '21',
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
    journey:
      'Twenty seconds, up to twenty times. Each round you must place exactly one charge, you may aim one free shot, and you may fire one card and use one ship ability. You are doing that while reading nine pips, three gems, a board of thirty-six cells and a clock — which is why Build 6 spent itself removing everything on this screen that said the same thing twice. What is left says each fact once, and the loudest object on it is the number you are spending. Build 7 then rebuilt the arrangement around the thing Build 6’s last removal exposed: the screen had never actually said whose board was whose. It had said so in a caption. Everything above the division is now theirs and everything below it is yours, and nothing is labelled. Build 8 finished the half that restructure left unresolved: their fleet and their hand now flank their board as two columns rather than floating beside it, and the columns line up with yours across the division.',
    plates: [
      {
        file: 'HULLS',
        num: '—',
        name: 'Where a hull row belongs',
        thesis:
          'Build 8 left both hull readouts in the top strip, which put a fact about *them* and a fact about *you* side by side in neutral ground — and left the strip needing labels to tell two identical rows of pips apart.',
        spread: {
          kicker: 'The last of the composition',
          before: 'docs/before/battle-build8.jpg',
          after: 'screens/web/24-battle.jpg',
          beforeCaption: 'Before · Build 8',
          afterCaption: 'After · Build 9',
          goneTitle: 'What moved out of the strip',
          arrivedTitle: 'What it bought',
          gone: [
            ['Both hull rows, and their labels', 'Two identical rows of nine pips in one strip have to be told apart somehow, so each carried a name. Beside the fleet it counts, a row of pips needs no name at all.'],
            ['The full-width bar', 'Holding three small objects, a strip spanning the screen was mostly empty surface — and a bar across the top is the shape of a thing belonging to the product. What is left belongs to neither player, which is a different claim and wants a different shape: a centred capsule with the water showing at both ends.'],
            ['Twelve pixels of strip height', '72px to 60px. Only the clock sets it now, and the clock overhangs it on purpose — a 64px numeral in a 60px strip reads as sitting on the water rather than inside a box.'],
            ['The inverted priority in their flank', 'Their card backs, which carry one number each, were the largest opponent element on screen; their ship cards, which carry a length, a type, a reveal state and whether the ability is spent, were smaller. The backs came down to 76×106 and the fleet cards took the width of their column.'],
          ],
          arrived: [
            ['Hull lives with the fleet it counts', 'Theirs above the division with their ships, yours below it with yours — one rule, applied on both sides of the line, and one more thing the layout says instead of labelling.'],
            ['Two flank groups of identical height', 'The claim Build 8 made and the plate disagreed with. The fleet column carries a name, a hull row and three ship cards; the hand carries three backs; the gaps — 19px and 12px — are the two numbers that make those stacks come out the same. Measured into sim-out/anchors.json on every sweep rather than asserted.'],
            ['A neutral strip that is honestly neutral', 'Round, clock, pot. The three things that belong to neither player, and nothing else.'],
            ['COMMIT filling its column', 'It sat 60px short of the prompt above it. Between the button and the prompt, that space was for nothing.'],
          ],
        },
      },
      {
        file: 'COMPOSITION',
        num: '—',
        name: 'Finishing the top half',
        thesis:
          'Build 7 resolved the bottom of this screen and left the top unfinished. Their board sat in the middle of a region holding 55% of the screen height, their fleet and their hand were stacked in a rail to its left aligned to nothing in particular, and the entire right-hand flank held one line of text — which was not even theirs.',
        spread: {
          kicker: 'The top-region composition',
          before: 'docs/before/battle-build7.jpg',
          after: 'screens/web/24-battle.jpg',
          beforeCaption: 'Before · Build 7',
          afterCaption: 'After · Build 8',
          goneTitle: 'What was unfinished',
          arrivedTitle: 'What resolved it',
          gone: [
            ['Their fleet and their hand floated', 'Two rows of three items each, of three different widths, right-aligned to nothing — not to each other, not to the board, not to any edge. Beside a board, rather than part of a composition with it.'],
            ['The whole right flank was empty', 'A quarter of the screen’s width, holding one sentence.'],
            ['That sentence was in the wrong half', '“Click their water to aim your free shot. Click a card to charge it.” An instruction to you, rendered in their territory, on a screen whose entire argument is that the two halves belong to different people. The ownership rule was going to be judged first on whether it was applied consistently.'],
            ['The dominant element did not dominate', 'Their board is the one place you act, and it filled about half the width of its own region. A dominant element that does not fill its space stops reading as dominant.'],
          ],
          arrived: [
            ['Their fleet and their hand flank the board', 'Two columns, one either side, each standing exactly as tall as the board and centring its contents in that height. The ship cards fill the column width rather than sizing to their contents, so the fleet has one straight edge instead of three ragged ones.'],
            ['The columns line up across the division', 'Their fleet sits directly above your fleet, their board directly above your hand, their hand directly above your commit. The mirroring the game rests on — same fleet shape, same card pool, opposite sides of a line — is now in the layout rather than only in the rules.'],
            ['The prompt moved into your panel', 'It sits above COMMIT, beside the hand, next to the actions it describes. Not over the hand: that band already belongs to the hovered card’s own affordance, and two things wanting the same forty pixels is a bug this screen has produced once already.'],
            ['The aiming panel took the commit slot', 'Commit is disabled for exactly as long as a declaration is open, so the control you need replaces the control you cannot use — and the last thing of yours rendering above the line came down with it.'],
          ],
        },
      },
      {
        file: 'OWNERSHIP',
        num: '—',
        name: 'Whose board is whose',
        thesis:
          'Build 6 removed the caption “Your waters · hull 9/9”. It was right about the hull number and wrong about everything else — that string was the only thing on screen saying which board belonged to whom. Build 7 did not put the label back.',
        spread: {
          kicker: 'The ownership restructure',
          before: 'docs/before/battle-build6.jpg',
          after: 'screens/web/24-battle.jpg',
          beforeCaption: 'Before · Build 6',
          afterCaption: 'After · Build 7',
          goneTitle: 'What was wrong',
          arrivedTitle: 'What carries it now',
          gone: [
            ['Your things sat in three different corners', 'Your board upper-right, your ships middle-right, your hand bottom-left, your commit bottom-right. Four corners, and no spatial rule a player could infer from any of them.'],
            ['Both boards were the same blue', 'Ownership rested entirely on remembered position, which is the weakest signal available — and the only one a new player does not have.'],
            ['Your ships rendered inside their half', 'Beside their board, in their strip. The layout was actively arguing the wrong thing.'],
            ['Commit was at the far end of the screen from the hand', 'The decision and its confirmation, eighteen inches apart. That eye travel happened every round, twenty times a match.'],
            ['The hand was the smallest readable thing on screen', 'Cards are the primary decision object and were rendered smaller than the opponent’s fleet cards.'],
          ],
          arrived: [
            ['Vertical position', 'Everything above the division is theirs; everything below it is yours, in one continuous cluster. Nothing is labelled — that is the whole point.'],
            ['A second water', 'Your board is green, theirs is blue, and the pair differs in lightness as well as hue: 11.1% apart in greyscale, so the distinction survives a colourblind simulation rather than resting on blue-versus-green.'],
            ['Commit beside the hand', 'The decision and its confirmation, adjacent.'],
            ['The hand at full card size', 'Second only to the boards in weight, with the rule text on the face comfortably legible at 1920×1080.'],
          ],
        },
      },
      {
        file: '51-ownership-greyscale',
        num: '51',
        name: 'The same screen, with every hue removed',
        thesis:
          'The claim above is that position carries ownership and colour reinforces it. This is that claim tested rather than asserted: the battle screen under a full greyscale filter, where hue is worth nothing at all.',
        notes: [
          'The division still reads, the cluster below it still reads, and the two waters still separate — because they were pulled apart in lightness as well as hue. Their water sits at mean luminance 123.5 of 255; yours at 151.8. That is 28.3 apart, or 11.1%.',
          'npm run colourblind renders this frame plus deuteranopia, protanopia and tritanopia simulations, measures the separation from the declared gradient stops, and fails the run below 10%. It is a check, not a screenshot.',
          'Green-versus-blue on its own fails for roughly one man in twelve. If the tint were the carrier rather than the reinforcement, this plate would be the bug report.',
        ],
      },
      {
        file: 'BEFORE-AFTER',
        num: '—',
        name: 'Before and after',
        thesis:
          'The battle screen as it stood at the end of Build 5, and as it stood after the restraint pass. Eight elements removed, four of them replaced by nothing at all.',
        spread: {
          before: 'docs/before/battle-build5.jpg',
          after: 'docs/before/battle-build6.jpg',
          beforeCaption: 'Before · Build 5',
          afterCaption: 'After · Build 6',
          gone: [
            ['The hull readout under your own board', 'The nine pips in the top bar are the same number, larger, and never leave the screen.'],
            ['The timer bar above the commit button', 'A second countdown eighteen inches from the first. The commit button now drains as the window runs out — one element, two jobs.'],
            ['“3 cards · bank 0” in the opponent strip', 'Both are sums of things already on that row. You can count their cards; every gem prints its own number.'],
            ['The prompt panel’s surface', 'One of the heaviest objects on screen, for one sentence. The sentence stayed; the panel went.'],
            ['Four of the six hand buttons', 'Three cards carried a permanent Charge and a permanent Fire each. The card is the charge control now, and Fire appears only on the hovered card, only when legal.'],
            ['“Length 4 / 3 / 2” on their unrevealed ships', 'Beside four pips, the words are the same fact twice — and the pips are the half that scans without reading.'],
            ['Coordinate labels on the compact board', 'You never name a cell on your own water. You cannot click it and you never refer to it by letter.'],
            ['The “· 14s” suffix on the commit button', 'Three statements of the same number, on a screen that now sets the clock at 64px.'],
          ],
          arrived: [
            ['The clock, at 64px', 'The screen’s one level-1 element. Every decision here is a decision about how to spend that number.'],
            ['A draining commit button', 'The pressure the removed timer bar carried, moved into the control it was about.'],
            ['One hover-scoped card control', 'Six competing buttons became one, on the card under the pointer — and when the card cannot fire, the same slot says why.'],
          ],
        },
      },
      {
        file: '24-battle',
        num: '24',
        name: 'Battle · the full anatomy',
        was: 18,
        thesis:
          'Their world above the division and yours below it. Their water dominant in the upper band with their fleet and hand beside it; your water, your ships, your hand and the button that commits them together in the lower one. Nothing on this screen is labelled with whose it is.',
        pins: [
          { x: 30.5, y: 3.7, label: 'Round counter', text: 'Which round of a maximum twenty. A match that reaches the cap is decided on remaining hull cells.' },
          { x: 20.4, y: 23.2, label: 'Their hull', text: 'Nine pips, one per hull cell across three ships, in the danger red — sitting with the fleet it counts rather than in the strip at the top, which is where it was until Build 9. Hull lives with its ships on both sides of the division, and a row of pips inside a player’s own cluster needs no name on it. Showing theirs is not a leak: every fleet is nine cells and you already know which of your shots landed.' },
          { x: 46.6, y: 3.7, label: 'The clock', text: 'The plan window, and the screen’s primary element at 64px. Under five seconds it turns red, pulses and ticks audibly. In a networked match the server owns this clock and the client renders an estimate.' },
          { x: 28.3, y: 68.3, label: 'Your hull', text: 'The same nine pips in your green, above your own fleet — the mirror of theirs, in the same column, on the other side of the line.' },
          { x: 55.2, y: 3.7, label: 'The pot', text: 'In gold, always visible in a staked match. You never have to leave the board to remember what is riding on it.' },
          { x: 20.4, y: 37.5, label: 'Their fleet', text: 'Their name, then three ship cards showing only what the rules make public: a length, as pips. A card flips face-up the moment that ship uses an ability or sinks. The cards fill the column rather than sizing to their contents — a revealed four is wider than an unknown two, and three ragged right edges is what made this rail read as debris beside the board until Build 8.' },
          { x: 73.6, y: 33.7, label: 'Their hand', text: 'Card backs with readable gold charge gems, on the far side of their board from their fleet. Charges are public on both sides — the bluff is built on shared information. An identity shows here only if a draft collision already made it public. This flank held one line of text until Build 8, and the line was not even theirs.' },
          { x: 50, y: 11, label: 'Their water', text: 'The biggest single element on screen, in the blue, and the only place you act — and since Build 8 it fills the height of its region, with their fleet and their hand flanking it as two columns of exactly its height. Click a cell to aim your free shot; cells remember hits, misses and intel.' },
          { x: 75.3, y: 70.5, label: 'The prompt', text: 'What your next click does, in words, immediately above the control that ends the round. It had a panel behind it until Build 6 and was one of the heaviest objects on the screen for one sentence; until Build 8 it was still rendering in *their* half, which is an instruction to you sitting in the opponent’s territory. While a card is aiming, the aiming panel takes this column instead.' },
          { x: 5, y: 62.6, label: 'The division', text: 'A quiet horizontal rule with a lit edge, running the width of the screen. Everything above it is theirs; everything below it is yours. This is the whole ownership argument, and it is why no part of this screen needs a label saying whose it is.' },
          { x: 9.2, y: 80.1, label: 'Your water', text: 'Green rather than blue, and below the line: this is damage arriving, not a place you act. Your hulls are the dark cells. No coordinates — you never name a cell here. The two waters are 11.1% apart in greyscale, so the pairing survives a colourblind reading.' },
          { x: 28.3, y: 91, label: 'Your ships', text: 'Your three, face up to you, beside your own water instead of inside their half of the screen — which is where they rendered until Build 7. They sit in the same column as their fleet above the division, which is the mirroring the whole game rests on, put into the layout. Each shows its type and whether the once-per-match ability is still available.' },
          { x: 50, y: 64.5, label: 'Your hand', text: 'Real cards at full size, fanned, lifting on hover — the rule text on the face is legible without hovering at 1920×1080. Clicking one charges it. Three at a time, one drawn per round while the shared pile lasts.' },
          { x: 87.5, y: 82.8, label: 'Commit', text: 'The largest control in the product, and now adjacent to the hand it commits rather than at the far end of the screen from it. It drains as the window runs out, breathes while a plan is complete, and goes flat grey when it is not. Pressing it seals your plan as a hash — theirs is already sealed too.' },
        ],
        notes: [
          'Two callouts more than Build 6 left here, and the guide would rather say so than quietly round down: the hull row split into two because the top bar now reads the same way round as the screen, and the division earned one of its own because it is the most important object on the plate.',
          'Every pin on this plate sits at a coordinate measured from the live DOM rather than estimated by eye. npm run screens now records the bounding box of each named element and writes sim-out/anchors.json; a pin landing on top of the thing it names is the failure this guide produced twice, and it is not one that can be fixed by looking harder.',
        ],
      },
      {
        file: '25-battle-planned',
        num: '25',
        name: 'A plan half-built',
        was: 5,
        thesis:
          'The same screen mid-decision: a free shot aimed on their water, one card carrying this round’s charge, and the prompt updated to match.',
        pins: [
          { x: 43, y: 22, label: 'The aimed cell', text: 'Outlined in gold on their board. Gold marks intent — this is where your free deck gun fires when the round resolves.' },
          { x: 75.3, y: 70.5, label: 'Plan readout', text: 'The prompt reads back what is planned — “Free shot: C2.” — rather than what to do next, in your half, above the button that commits it.' },
          { x: 39.8, y: 64.3, label: 'Charged card', text: 'The gem has ticked to 1 and pulses. The pitch of the click rises with the count, so a fifth charge sounds different from a first.' },
          { x: 86.5, y: 82, label: 'Armed', text: 'With a complete plan the commit button pulses, a hand’s width from the cards it commits. Both plans are held sealed until both have arrived — there is no window in which a late plan can be informed by an early one.' },
        ],
      },
      {
        file: '27-card-hover-fire',
        num: '27',
        name: 'One control, on one card',
        thesis:
          'The Fire affordance appears only on the card under the pointer, and only when that card holds enough charges to be legal. Six permanent buttons became one conditional one.',
        notes: [
          'It carries the charge count it would fire at — “Fire · 3” — so the decision and its size are the same object.',
          'It sits above the card rather than below it: the hand rests on the bottom edge of the viewport, and anything under a card there is off the screen.',
          'The card’s own rule tooltip moves up to clear it. Two things wanting the same 30 pixels was the first bug this control produced.',
        ],
      },
      {
        file: '26-card-hover-cant',
        num: '26',
        name: 'And when it cannot',
        thesis:
          'The same slot, on a card that cannot fire, says why in a sentence. This was the single most confusing gap in the build: a greyed-out control that named no rule.',
        notes: [
          'The reason given is always the *first* rule that stops the action. A card that is both pinned and under-charged says “pinned”, because lifting the pin is what you would have to do first.',
          'Three reasons cover the Fire control: your cards are locked this round; you have already declared a card; or this card needs N charges and holds M.',
          'Nothing is added to the screen when the pointer is elsewhere. That is the whole rule the restraint pass and the feedback layer agreed on — feedback is transient, chrome is not.',
        ],
      },
      {
        file: '28-target-hover',
        num: '28',
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
        file: '30-resolve',
        num: '30',
        name: 'The resolve',
        was: 4,
        thesis:
          'Both plans turn face up and the round plays out beat by beat, in the exact order the rules resolve it — so a player can see why something happened, not just that it did.',
        pins: [
          { x: 34, y: 44.3, label: 'Step marker', text: '“4 · ATTACKS”. The resolve has a fixed order — reveal, control effects, predictions, attacks, sinks, reactions, charges — and the overlay names which step you are watching.' },
          { x: 67.1, y: 52, label: 'What just happened', text: 'Plain language, always. “Your deck gun at C2 — miss.” Never “P0 basic → miss”.' },
          { x: 52.7, y: 57.5, label: 'Click to skip', text: 'The whole sequence can be skipped, and a Settings toggle collapses it to about a second permanently.' },
          { x: 26, y: 43.5, label: 'Board stays visible', text: 'The panel is small and the boards dim rather than disappear, so each described shot lands where you can see it land — and the floaters rise over the top of it.' },
        ],
      },
    ],
  },
  {
    id: 'tells',
    title: 'What the game tells you',
    standfirst:
      'Three tiers of feedback, ordered from wordless to explanatory, and a budget that keeps them from becoming noise. All of it new in Build 6, and all of it transient by construction.',
    journey:
      'Until this build a player watched things happen to them without being told why. A Thorn went off and shots appeared from nowhere. Fire was greyed out and nothing said which rule was stopping them. The three tiers below answer that, and they are designed to get quieter: floaters and named lines never stop, but the explanations stop the moment a mechanic is no longer new to you. The teaching load decays to zero instead of becoming permanent noise — which is the mechanism that lets the middle tier stay to one line.',
    plates: [
      {
        file: '29-floaters',
        num: '29',
        name: 'Tier 1 · board floaters',
        thesis:
          'Short-lived text rising from the exact cell or object it belongs to, then gone. No panels, no dismissal, no reading required — and a veteran still wants them.',
        pins: [
          { x: 84.5, y: 49, label: 'HIT / MISS', text: 'On the cell that took the shot, on whichever board it landed on. Six cells resolving spawn six floaters staggered 55ms apart with the projectiles, rather than queueing.' },
          { x: 39, y: 19, label: 'A named event, above', text: 'Tier 2, running at the same time: one line for a change with a name behind it. The two tiers are designed to co-exist because they answer different questions — what happened, and what caused it.' },
          { x: 31, y: 49, label: 'The overlay, underneath', text: 'Floaters draw above the resolve overlay. They are anchored by a measured screen rectangle, so a HIT rises off its cell while the overlay narrates the same beat over the top of it.' },
        ],
        notes: [
          'Six floaters in the vocabulary: HIT, MISS, SUNK · N, +N to a card that gained charges, −N off one that lost them, and BLOCKED where a Mirror cancellation ate a shot.',
          'Each lives 600ms. Nothing here can be interacted with and nothing waits for the player.',
          'BLOCKED is the one that cannot come from the event stream: a cancelled attack fires no shots and so leaves no trace at all. It uses the aim the local player themselves declared, and nothing else.',
        ],
      },
      {
        file: '32-named-event',
        num: '32',
        name: 'Tier 2 · named events',
        thesis:
          'One line, fixed position, for the things that have a name and would otherwise be mysterious — where the board changes for a reason that is not on screen.',
        notes: [
          'Eleven of them: the four REACTs, both predictions landing either way, the two restrictions, and an ability activation on either side.',
          'Never stacking more than two deep, never blocking, gone in 2.2 seconds.',
          'The wording rule: say what happened to the board, in the plain register the resolve overlay uses. “THORN — firing back at every cell they hit”, never “THORN triggers REACT”.',
        ],
      },
      {
        file: '31-explainer',
        num: '31',
        name: 'Tier 3 · first-time explainers',
        thesis:
          'The first time each mechanic happens in that player’s history, a fuller card explains why. Once ever, then never again — and every one of them is resettable from Settings.',
        pins: [
          { x: 21.5, y: 78, label: 'The kicker', text: '“FIRST TIME”. It tells you the card will not be back, which is what makes it acceptable to interrupt with at all.' },
          { x: 21.5, y: 84, label: 'The rule', text: 'Read straight out of the ship and card definitions the engine runs on, so it cannot drift from what actually happens.' },
          { x: 21.5, y: 89, label: 'Why it matters', text: 'The one authored sentence: the consequence, which no data file can derive. “Sinking it costs them next round’s card fire and hands them two charges.”' },
          { x: 21.5, y: 95, label: 'Got it', text: 'The only thing in the feedback layer that waits for a click. Dismissing it marks the mechanic seen, in local storage, per player.' },
        ],
        notes: [
          'Twenty-eight in total: each of the twelve cards, each of the eight ACTIVE/NERF abilities, each of the four REACTs, plus the hull tiebreak, a draw, a timer strike and the first draw from the shared pile.',
          'The budget is one Tier-2 line and one Tier-3 card on screen at once. A mechanic crowded out stays unmarked — it is still first-time, so it gets its explanation next time rather than losing it silently.',
          'Settings shows how many of the twenty-eight have been seen and can make all of them first-time again.',
        ],
      },
    ],
  },
  {
    id: 'sensory',
    title: 'Sound and motion',
    standfirst:
      'Fifty-three sound cues and fourteen visual effects, every one of them tied to a discrete event. No ambience, no loops, and nothing that plays because a screen is open.',
    journey:
      'Until Build 9 the game had fifteen sounds and a handful of animations, and the gap showed most in the round that is the whole product: shots appeared on cells with no author, a sink was over in 260ms, and a prediction landing — the rarest and best thing ARMADA produces — had one line of text and nothing else. This chapter is the audit that fixed it. Both layers are derived from the same two inputs the feedback layer uses, which is what stops either of them showing a player something the rules withhold; both run on the same clock as the resolve overlay, so an impact lands on the beat that narrates it; and both degrade rather than disappear when a player asks for less motion.',
    plates: [
      {
        file: '29-floaters',
        num: '29',
        name: 'A round landing',
        thesis:
          'One frame, mid-resolve, with most of the layer visible at once: a tracer still in the air, an impact flare and its shockwave on the cell that took the hit, debris leaving it, and the HIT floater rising over the top of all of it.',
        notes: [
          'Every effect animates transform, opacity and filter and nothing else, so all of it stays on the compositor. The heaviest realistic moment — a four-charge Burst finding nine cells — puts about 55 elements on screen for under a second and touches layout zero times.',
          'There is no canvas, and that is a decision rather than an omission. At those counts a canvas buys nothing and costs a second rendering model, its own resize and device-pixel-ratio handling, and a reduced-motion path that would have to be written twice. The moment one effect needs thousands of particles rather than tens, that trade changes.',
          'The tracer is scheduled to *arrive* on its beat rather than leave on it. A projectile that launches when the overlay says “hit” lands 260ms after the word, which reads as a delay rather than as a cause.',
          'The whole table — every effect, its trigger, its duration, and how it degrades under reduced motion — is in docs/VFX.md, generated from the layer’s own timing table so a documented duration is the duration that runs.',
        ],
      },
      {
        file: '37-settings',
        num: '37',
        name: 'Two channels, two sliders',
        thesis:
          'Effects and music are separate problems and get separate volume controls, both persisted. A player who wants the battle track down almost always still wants to hear a shot land, and one slider forces them to choose between the two.',
        notes: [
          'Fifty-three cues, sourced from six CC0 packs by Kenney. CC0 requires no attribution; it is recorded anyway, by the same script that does the downloading, so the credits cannot drift from what shipped.',
          'The list is enforced rather than described. npm run audio:doc exits non-zero if a cue has no file, a file has no cue, a cue has no credit, or a cue is declared and never fired anywhere in src — the same shape of check that stops a mechanic shipping without a first-time explanation.',
          'Two rules did the filtering. A cue maps to a discrete event the player caused or needs to notice; and two events share a cue only when they are genuinely the same event. The second is what took the list from fifteen to fifty-three — pressing a button and cancelling out of a panel no longer share a sound. It cuts the other way once: nine cells of one volley arriving are one event, and the volley cue fires once per round rather than once per cell.',
          'Four cues carry a number in their pitch rather than in a second sound: the charge click rises with the count the card will hold, a longer hull sinks lower, the timer tick quickens, and cancel sits below press because leaving is not arriving.',
          'Music is not in the cue list and never will be — it is a state, not an event. Eight tracks, generated in Suno from MUSIC_BRIEF.md and dropped into src/ui/music/files/. File present, it plays; file absent, silence; never a crash. The same contract the art pipeline has, for the same reason.',
        ],
      },
    ],
  },
  {
    id: 'after',
    title: 'Settling up',
    standfirst:
      'What a match is worth, and the proof that it was played honestly. Both fleets are revealed here and nowhere earlier.',
    journey:
      'The match is over and every secret in it is now worthless, so all of them are shown at once. But first there is a moment, which until Build 7 there was not: the game used to cut from the last enemy cell dying straight to this page of fleets and receipts, with no beat in between for the thing that had just happened. The verdict now lands at display scale with the number under it, and only then does the analysis arrive. This is also the screen where the product’s central claim gets checked rather than asserted: the client re-runs the whole match from the seed and the signed transcript, and either gets the same result or says loudly that it did not.',
    plates: [
      {
        file: '33-slam-victory',
        num: '33',
        name: 'The winning moment',
        thesis:
          'The verdict at display scale, and immediately beneath it the one number the player actually came for. There was a result screen for six builds and no result moment: the instant the last enemy cell died, the game cut to an analytical page of fleets, ratings and receipts.',
        notes: [
          'Three things, stacked and centred, and no callouts needed to find them. VICTORY at 88px in the outlined display treatment the CHAMPION banner uses — the only two places in the game that share a size with the wordmark. Under it the number, in gold: “+◎0.0950”, what landed in your wallet post-rake. Under that one line of arithmetic: “The ◎0.10 pot, less the 5% rake.”',
          'The rule that keeps this honest is structural rather than a review step: the celebration and the receipt have no second place for the arithmetic to live. settlement.test.ts states it as an inequality — the banner may never exceed what the settlement pays, by any amount at all, including a rounding one.',
          'Two seconds, dismissable by a click, 700ms with fast-resolve on, and skipped entirely when transitions are off. A player who has turned the theatre down has said what they want.',
          'When nothing was staked, the money line is replaced by the rating delta rather than left empty — the slot is for what the match changed, and in an unstaked match that is the rating.',
        ],
      },
      {
        file: '44-slam-defeat',
        num: '44',
        name: 'And the losing one',
        thesis:
          'The same scale, the same timing, a different colour and a different sound. Most players lose about half their matches, and a loss that is visually skimped reads as the product being embarrassed by it.',
        notes: [
          'The frame here is a casual match, so the number slot carries the rating delta and the line under it says “No stake on this table.” In an arena match the same slot prints what left the wallet — “−◎0.0500”, the stake — for the same reason the win prints what arrived: the player is owed the number, not a mood. The slot is never empty and never euphemistic.',
          'The wash behind it is red rather than gold and the headline sits in the danger colour, but nothing about the type, the hold or the dismissal differs. The two banners are the same object with a direction field.',
          'A draw takes the third branch: “stakes returned — no rake”, unsigned, because nothing moved.',
        ],
      },
      {
        file: '34-result-settlement',
        num: '34',
        name: 'Result and receipt',
        was: 9,
        thesis:
          'The outcome, both fleets revealed, and a settlement receipt that shows the arithmetic — pot, rake, net — with the transaction and a replay check beside it.',
        pins: [
          { x: 36, y: 6.5, label: 'The verdict', text: 'VICTORY, DEFEAT or DRAW at 64px — the screen’s one primary element. The line underneath names how it ended: fleet destroyed, hull count, mutual elimination.' },
          { x: 28.4, y: 14.6, label: 'Both fleets, revealed', text: 'Layouts, ships and spent cards for both sides. The first and only moment their identities become visible; sunk ships show hollow pips.' },
          { x: 83.3, y: 24, label: 'The arithmetic', text: 'Pot, the 5% rake on its own line, and the net in gold. A draw replaces these with “stakes returned — no rake”.' },
          { x: 83.3, y: 35, label: 'Transaction', text: 'The settlement signature, in the mono face because it is a string you compare character by character. On devnet it links to the explorer; on the local adapter it is labelled “(simulated)” rather than dressed up as real.' },
          { x: 83.3, y: 42, label: 'Replay verified', text: 'The client re-ran the entire match from the seed and the signed transcript and got the same result. This badge is the product’s core claim, checked rather than asserted.' },
          { x: 83.3, y: 48, label: 'Export match proof', text: 'Downloads the transcript as JSON. Anyone can verify it independently — the check does not depend on this client.' },
          { x: 63.5, y: 60.5, label: 'Play again', text: 'One button. REMATCH and NEXT OPPONENT stood side by side here calling the same function: the queue finds whoever is available, so there was never a rematch to offer.' },
        ],
      },
      {
        file: '41-bracket-live',
        num: '41',
        name: 'The bracket',
        was: 7,
        thesis:
          'Eight seats, three rounds, one pot. Your path is picked out in gold, and the payout split never leaves the screen.',
        pins: [
          { x: 28, y: 25, label: 'Pot and split', text: 'The pot, the rake, and every share — champion, runner-up, semifinalists, and the explicit “QF exit ◎0” — always visible while you play.' },
          { x: 27.5, y: 38, label: 'Your match', text: 'Gold border and a star against your name. In a bracket of eight, the first thing you need is to find yourself.' },
          { x: 37.5, y: 44, label: 'Rounds', text: 'Quarters, semis, final. Losers are struck through, winners ticked green, and undecided slots say what they are waiting on. A decided match used to also say “decided”.' },
          { x: 61, y: 50, label: 'Champion slot', text: 'Undecided until it is not. Gold framed, because that is where the 55% goes.' },
          { x: 38.5, y: 82.5, label: 'Play your round', text: 'One green button when it is your turn, naming which round you are about to play.' },
        ],
      },
      {
        file: '42-slam-round-win',
        num: '42',
        name: 'A round won',
        thesis:
          'A quarter-final or semi-final win lands before the bracket redraws — and announces the floor it just secured, not the prize it might still win.',
        notes: [
          'Winning a quarter-final guarantees at least a losing semifinalist’s share; winning a semi-final guarantees at least runner-up. Those are numbers the player has actually banked, and they come from the same bracket payout function the pot row on the bracket screen uses.',
          'Celebrating a quarter-final with the champion’s 55% would be the same lie the banner/receipt rule exists to prevent, one round earlier. The test asserts that no round below the final can ever announce the champion share.',
          'A won final does not slam. It hands straight to the CHAMPION screen, which is the loudest surface in the product and already carries the number — two celebrations in a row is one too many.',
        ],
      },
      {
        file: '43-champion',
        num: '43',
        name: 'Champion',
        thesis:
          'The loudest screen in the game, and the mode’s whole reason to exist: eight entered, one takes 55% of the pot.',
        pins: [
          { x: 46.6, y: 38.9, label: 'Trophy', text: 'Gold on gold, slammed in with the banner animation used for nothing else.' },
          { x: 37.6, y: 48, label: 'CHAMPION', text: 'Set in the outlined display numerals at 88px — the only place in the game that shares a size with the wordmark.' },
          { x: 35.9, y: 54.4, label: 'The number', text: 'What you actually take, against the pot it came from. The celebration and the receipt are the same sentence.' },
          { x: 43.8, y: 61.2, label: 'Collect and return', text: 'One way onward. The settlement already happened on-chain; this is acknowledgement, not a transaction.' },
        ],
      },
    ],
  },
  {
    id: 'ladder',
    title: 'The ladder and the shelf',
    standfirst:
      'Where a season stands, what the game is made of, and who made the parts that were not made here.',
    journey:
      'These are the screens a player visits between matches rather than during them, which is exactly why the restraint pass was hardest here: a screen nobody is under time pressure on will happily accumulate things nobody reads. The payout curve used to be drawn twice, on two different screens, in the same shape.',
    plates: [
      {
        file: '35-leaderboard',
        num: '35',
        name: 'Leaderboard',
        was: 6,
        thesis:
          'The standings, and your own row pinned wherever you actually rank. The payout curve moved out — it is the Season screen’s entire job, and it was being drawn twice.',
        pins: [
          { x: 60, y: 6.4, label: 'Live pool', text: 'What all the season entries add up to right now, in gold.' },
          { x: 30, y: 24, label: 'The top of the ladder', text: 'Rank, handle, rating — in tabular figures, so the numbers line up as a column rather than drifting as they update.' },
          { x: 29, y: 48, label: 'Your row, pinned', text: 'Ranked 2608th and still on screen. A ladder that only shows the top eight tells almost every player nothing.' },
        ],
      },
      {
        file: '36-season',
        num: '36',
        name: 'Season',
        thesis:
          'Days left, the live pool, where you stand, what that position would pay if the season ended now — and the curve that produces the number.',
        notes: [
          'The projection is computed from the same curve drawn beneath it, against your current rank — not a marketing number.',
          'The curve’s shape is the argument: the top 1% take the largest share, and the top tenth at least recover their entry. A ladder nobody below the podium can profit from stops being a ladder.',
          'Match history sits alongside: result, rating delta, rounds, mode and stake for every recent match.',
        ],
      },
      {
        file: '37-settings',
        num: '37',
        name: 'Settings',
        was: 8,
        thesis:
          'Wallet, sound, the two Build 6 toggles, and a running journal of everything the chain adapter actually did — because a staking product should never make you guess.',
        pins: [
          { x: 36, y: 9.5, label: 'Wallet', text: 'Connect and disconnect. The adapter in use is named — “mock” here, “devnet” against a real cluster. The address is set in mono, because an address is compared character by character.' },
          { x: 21.8, y: 20.4, label: 'What a session key is', text: 'Connecting issues a key that signs your moves for the session. It cannot move funds: the escrow answers to your wallet and never to the session. That claim is enforced by the program and proven by a test.' },
          { x: 21.8, y: 48.5, label: 'Between-phase beats', text: 'New in Build 6. The four transitional moments, off in one click for a player who has seen them enough.' },
          { x: 21.8, y: 53.5, label: 'First-time explanations', text: 'How many of the twenty-eight mechanics have been explained to you, and a button that makes every one of them first-time again.' },
          { x: 21.8, y: 60, label: 'Opponent strength', text: 'Four bots: Deckhand plays at random, Admiral models your fleet distribution and predicts your next shot.' },
          { x: 78.1, y: 29, label: 'Chain journal', text: 'Every escrow, commitment and settlement the adapter performed this session, in order, with amounts and hashes. A debug readout of the last sound cues sat beneath it until Build 6 — a player does nothing differently for that.' },
        ],
      },
      {
        file: '38-credits',
        num: '38',
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
    journey:
      'Everything in this chapter happens to a player who did nothing wrong. That constrains the writing more than any other screen in the product: the sentence has to say what has happened, what it will cost, and what is being done about it, without softening any of the three. A staked player who does not know they are about to forfeit is a player losing money to a wording choice.',
    plates: [
      {
        file: '46-reconnecting',
        num: '46',
        name: 'Reconnecting',
        thesis:
          'The socket dropped mid-match. The server holds your seat for the grace period, and the client says exactly that while it retries.',
        notes: [
          'Input is blocked while this shows: acting on a stale view would only queue intents the server will refuse.',
          '“Your plans are safe — nothing is decided by your clock” is the important sentence. Every deadline is server-side; a slow or backgrounded client changes nothing about when the server acts.',
        ],
      },
      {
        file: '47-connection-lost',
        num: '47',
        name: 'Connection lost',
        thesis:
          'Reconnection gave up. Said plainly, with the consequence spelled out and exactly one useful button.',
        notes: [
          'The consequence is named rather than softened: if a match was running, the seat forfeits when the grace period lapses.',
          'A staked player who does not know that is a player about to lose money to a wording choice.',
        ],
      },
      {
        file: '48-opponent-disconnected',
        num: '48',
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
        file: '49-server-error',
        num: '49',
        name: 'Server error',
        thesis:
          'A refusal from the server surfaces as a sentence. Codes travel on the wire; humans get words.',
        notes: [
          'The protocol carries a machine code — `rate-limited`, `provisional`, `stale-round` — and the interface renders the message beside it rather than the code alone.',
          'Non-blocking, bottom of the screen: a refusal you can read and act on without losing the screen you were on.',
        ],
      },
      {
        file: '50-queue-timeout',
        num: '50',
        name: 'Queue timeout',
        thesis:
          'Nobody in your band joined in time. The stake was never taken — and a staked player is never silently handed a bot.',
        notes: [
          'Casual falls back to a bot after a few seconds and says so in the match-found beat. Staked queues never do; they time out loudly instead.',
          'Quietly substituting a bot for a paying opponent would be the single worst thing this product could do. The queue is built so it cannot.',
        ],
      },
    ],
  },
];

// --- the anatomy primer ----------------------------------------------------

export const COLOURS: [string, string, string][] = [
  ['#FFC531', 'Gold', 'Money and charges. Spent on nothing else, anywhere — a gold thing is always a number about value.'],
  ['#2ED573', 'Green', 'Go. Commit, play, confirm — and a landed win.'],
  ['#FF4D5E', 'Red', 'Damage, loss, refusal. Hits on a hull, a defeat banner, an error border.'],
  ['#FF6B4A', 'Attack', 'Card role: shells and patterns. Salvo, Lance, Burst, Rake, Breaker.'],
  ['#19C8E8', 'Intel', 'Card role: knowledge, not damage. Ping, Echo, Sounding.'],
  ['#9B5CFF', 'Control', 'Card role: taking things away. Jam, Siphon — and NERF ships.'],
  ['#FF9F1C', 'Prediction', 'Card role: reading them. Mirror, Ambush — and REACT ships.'],
  ['#23B5E8', 'Water', 'Playable board. Both grids, in the same blue, on every screen.'],
];

export const TYPE_SCALE: [string, string][] = [
  ['88', 'The wordmark, and the champion slam. Nothing else in the game is allowed this size.'],
  ['64', 'One per screen: the battle clock, the result verdict, the collision slam, a sink stamp.'],
  ['48', 'Screen titles, phase cards, the round stamp inside the wipe.'],
  ['32', 'Panel headings, stat values, the large charge gem.'],
  ['24', 'Card names at full size, the commit button.'],
  ['18', 'The sentence that matters on a screen; the default button.'],
  ['15', 'Running text and UI default.'],
  ['13', 'Labels, pips, fine print, board coordinates.'],
];

export const ANATOMY = [
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
    p: 'Charge counts, the round clock and hull totals are set in an outlined display face at sizes no ordinary interface would use. They are the numbers a player checks under time pressure from across a desk, so they are built to be read at a glance rather than inspected. Every one of them uses tabular figures, so a value updating in place does not shove its row about.',
  },
  {
    h: 'Two families, eight sizes',
    p: 'Baloo 2 carries display, headings and every numeral; Nunito carries body and UI. JetBrains Mono is not a third voice but a utility, reserved for four things a player compares character by character: wallet addresses, commitment hashes, transaction signatures, and board coordinates. Both rules are enforced by a test that fails the build — a scale written down is a suggestion, a scale a test can fail is a system.',
  },
  {
    h: 'Chrome is permanent, feedback is not',
    p: 'The rule the whole build turns on. Anything that occupies screen while it has nothing to say is chrome and had to justify itself; anything that appears, says one thing and leaves does not. That is why a duplicated hull readout was removed and a “+1” that floats for 600ms was added in the same pass — the second occupies no permanent space at all.',
  },
];

