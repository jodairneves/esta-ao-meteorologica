import { describe, expect, it } from 'vitest';
import { RateLimiter } from './rate-limiter';

describe('RateLimiter', () => {
  it('lets one event per window through and counts the suppressed ones', () => {
    const limiter = new RateLimiter(1000);
    expect(limiter.take('a', 0)).toBe(0);
    expect(limiter.take('a', 100)).toBeNull();
    expect(limiter.take('a', 999)).toBeNull();
    expect(limiter.take('b', 999)).toBe(0);
    expect(limiter.take('a', 1000)).toBe(2);
    expect(limiter.take('a', 1500)).toBeNull();
  });
});
