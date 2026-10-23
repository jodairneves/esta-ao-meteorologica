import { describe, expect, it } from 'vitest';
import { autoBucket } from './series';

const HOUR = 3_600_000;
const from = new Date('2026-10-01T00:00:00Z');
const after = (ms: number) => new Date(from.getTime() + ms);

describe('autoBucket (design §8.5)', () => {
  it.each([
    [24 * HOUR, 'raw'],
    [48 * HOUR, 'raw'],
    [48 * HOUR + 1, '10m'],
    [10 * 24 * HOUR, '10m'],
    [10 * 24 * HOUR + 1, '1h'],
    [62 * 24 * HOUR, '1h'],
    [62 * 24 * HOUR + 1, '1d'],
    [365 * 24 * HOUR, '1d'],
  ])('a span of %s ms uses %s', (span, bucket) => {
    expect(autoBucket(from, after(span))).toBe(bucket);
  });
});
