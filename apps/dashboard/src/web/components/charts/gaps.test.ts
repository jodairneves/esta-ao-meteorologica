import { describe, expect, it } from 'vitest';
import { withGaps } from './gaps';

const MIN = 60_000;

describe('withGaps', () => {
  it('leaves a regular series untouched', () => {
    const t = [0, MIN, 2 * MIN, 3 * MIN];
    const result = withGaps(t, { v: [1, 2, 3, 4] });
    expect(result.t).toEqual(t);
    expect(result.columns.v).toEqual([1, 2, 3, 4]);
  });

  it('breaks the line where the station went quiet for more than three steps', () => {
    const t = [0, MIN, 2 * MIN, 10 * MIN, 11 * MIN];
    const result = withGaps(t, { v: [1, 2, 3, 4, 5], w: [5, 4, 3, 2, 1] });
    expect(result.t).toEqual([0, MIN, 2 * MIN, 3 * MIN, 10 * MIN, 11 * MIN]);
    expect(result.columns.v).toEqual([1, 2, 3, null, 4, 5]);
    expect(result.columns.w).toEqual([5, 4, 3, null, 2, 1]);
  });

  it('measures the typical step of each series (a sparse station is not all gaps)', () => {
    const thirty = 30 * MIN;
    const t = [0, thirty, 2 * thirty, 3 * thirty];
    expect(withGaps(t, { v: [1, 2, 3, 4] }).columns.v).toEqual([1, 2, 3, 4]);
  });

  it('keeps short series as they are', () => {
    expect(withGaps([0, 10 * MIN], { v: [1, 2] }).columns.v).toEqual([1, 2]);
  });
});
