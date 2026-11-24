/** Fixed-window attempt limiter (in memory): at most `max` attempts per `windowMs` for one key. */
export class AttemptLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records an attempt. Returns false when the key is over the limit. */
  attempt(key: string): boolean {
    const now = this.now();
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= this.max;
  }

  /** Forgets a key, for example after a successful login. */
  reset(key: string): void {
    this.hits.delete(key);
  }
}
