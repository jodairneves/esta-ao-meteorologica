import { describe, expect, it } from 'vitest';
import { computeRainTips, type RainCounterState } from './rain';

const previous: RainCounterState = { run: 7, count: 150, seq: 100 };

describe('computeRainTips (design §6.1)', () => {
  it('uses the first reading as a baseline', () => {
    expect(computeRainTips(null, 7, 1, 500)).toEqual({
      tips: 0,
      state: { run: 7, count: 500, seq: 1 },
      anomaly: null,
    });
  });

  it('counts the difference within the same run', () => {
    expect(computeRainTips(previous, 7, 101, 153)).toEqual({
      tips: 3,
      state: { run: 7, count: 153, seq: 101 },
      anomaly: null,
    });
  });

  it('counts everything since the restart when the run changes', () => {
    expect(computeRainTips(previous, 8, 1, 4)).toEqual({
      tips: 4,
      state: { run: 8, count: 4, seq: 1 },
      anomaly: null,
    });
  });

  it('ignores redelivered or out-of-order readings', () => {
    expect(computeRainTips(previous, 7, 100, 150)).toEqual({
      tips: null,
      state: previous,
      anomaly: null,
    });
    expect(computeRainTips(previous, 7, 99, 149)).toEqual({
      tips: null,
      state: previous,
      anomaly: null,
    });
  });

  it('flags a counter that went backwards and resets the baseline', () => {
    expect(computeRainTips(previous, 7, 101, 10)).toEqual({
      tips: 0,
      state: { run: 7, count: 10, seq: 101 },
      anomaly: 'counter_decreased',
    });
  });

  it('treats a missing counter as not measured', () => {
    expect(computeRainTips(previous, 7, 101, null)).toEqual({
      tips: null,
      state: previous,
      anomaly: null,
    });
  });

  it('accumulates correctly across a gap of lost messages', () => {
    // Readings 101–104 never arrived: their rain shows up in reading 105.
    expect(computeRainTips(previous, 7, 105, 162).tips).toBe(12);
  });
});
