/**
 * A token bucket per identity.
 *
 * Match creation and queue joins are the two places where a script costs the
 * service more than it costs the scripter: each one reserves a seat a real
 * player wanted. On a staked ladder that is cheap griefing rather than a
 * hypothetical, so both are limited.
 *
 * The clock is injected. A limiter that reads the wall clock cannot be tested
 * without sleeping, and a limiter nobody tests is a limiter that lets
 * everything through the day someone changes it.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, { tokens: number; refilledAt: number }>();

  constructor(
    private readonly capacity: number,
    private readonly windowMs: number,
    private readonly now: () => number,
  ) {}

  /** Spend one token. False when the identity is over its allowance. */
  take(identity: string, cost = 1): boolean {
    const t = this.now();
    const bucket = this.buckets.get(identity) ?? { tokens: this.capacity, refilledAt: t };
    // Continuous refill, so a burst is smoothed rather than reset on a boundary
    // an attacker could line up against.
    const elapsed = t - bucket.refilledAt;
    if (elapsed > 0) {
      const gained = (elapsed / this.windowMs) * this.capacity;
      bucket.tokens = Math.min(this.capacity, bucket.tokens + gained);
      bucket.refilledAt = t;
    }
    if (bucket.tokens < cost) {
      this.buckets.set(identity, bucket);
      return false;
    }
    bucket.tokens -= cost;
    this.buckets.set(identity, bucket);
    return true;
  }

  remaining(identity: string): number {
    return Math.floor(this.buckets.get(identity)?.tokens ?? this.capacity);
  }

  /** Drop buckets that have fully refilled, so the map cannot grow forever. */
  prune(): void {
    const t = this.now();
    for (const [id, bucket] of this.buckets) {
      if (t - bucket.refilledAt > this.windowMs * 2) this.buckets.delete(id);
    }
  }
}
