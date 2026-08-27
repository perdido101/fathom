/**
 * Every provisional number in one file.
 *
 * The build prompt says all card and ship values are provisional and that
 * nothing may be changed to make a test pass. Collecting the tunables here
 * means the sim can print exactly which constants produced a given report,
 * and a proposed change is a one-line diff rather than a hunt.
 */
export const BALANCE = {
  /**
   * Charges granted for a round in which you landed at least one hit. Once,
   * however many cells connected — ruling Q1.
   */
  hitBonusPerRound: 1,
  /** Charges placed on a card each round by its owner. */
  chargePerRound: 1,
  /** Mirror's payoff multiplier on a successful read. */
  mirrorGainPerCharge: 2,
  /**
   * Mirror cancels the opponent's entire round, so it may not be fished with
   * cheaply — ruling Q6. Mirrored in CARDS.mirror.minCharges, which is what
   * the rules actually read.
   */
  mirrorMinCharges: 2,
  /**
   * Ember's payoff per hit. Deliberately untouched by the Build 7 patch:
   * halving it was measured on the same seeds and moved the ship's win rate
   * by 0.1pp, which is what proved the free cells were the strength.
   */
  emberGainPerHit: 2,
  /**
   * How many cells Ember fires. Build 4 cut it 4 → 3; Build 7 cut it 3 → 2,
   * on a measurement of 59.5% at n=2234 that had not moved across three
   * sample sizes. Measured landing: 51.9%, with every ship in band.
   */
  emberCells: 2,
  /** How many cells Beacon fires after its read. Build 4 balance patch: was 4. */
  beaconCells: 2,
  /**
   * Forge's flat charge payoff. Build 4 balance patch: was 2 — the free
   * 3-cell line is already the payoff; the charges were doubling up.
   */
  forgeGain: 0,
  /** Kiln's charge uplift on the card it fires. */
  kilnUplift: 3,
  /** Leech's steal size. */
  leechSteal: 3,
  /** Blackout's random strip. */
  blackoutStrip: 2,
  /** Dreadnought's scatter on death. */
  dreadnoughtScatter: 4,
  /**
   * Cinder's scatter on death. Its lockout is now a full fire-lock (no card
   * may be fired next round) — Build 4 balance patch, replacing the
   * exactly-2-charges lock that almost never bound.
   */
  cinderScatter: 2,
  /**
   * How many times a REACT chain may fire before the resolver stops. Thorn
   * shooting back can sink a ship whose REACT shoots back again; without a cap
   * two facing Thorns would loop forever.
   */
  reactCascadeLimit: 4,
} as const;
