/**
 * Lets one event per key through each window and counts the ones it held back, so a
 * misbehaving station cannot flood the log table.
 */
export class RateLimiter {
  private readonly entries = new Map<string, { at: number; suppressed: number }>();

  constructor(private readonly windowMs: number) {}

  /** null when the event must be suppressed; otherwise how many were suppressed since the last one. */
  take(key: string, now = Date.now()): number | null {
    const entry = this.entries.get(key);
    if (entry && now - entry.at < this.windowMs) {
      entry.suppressed++;
      return null;
    }
    this.entries.set(key, { at: now, suppressed: 0 });
    return entry?.suppressed ?? 0;
  }
}
