import { describe, expect, it } from 'vitest';
import { liIonPercent } from './battery';
import { feelsLike, heatIndex, windChill } from './comfort';
import { dewPoint } from './dew-point';
import { barometricAltitude, pressureTrend, seaLevelPressure } from './pressure';
import { beaufort, kmhToMs, msToKmh } from './wind';

describe('dewPoint', () => {
  it('matches reference values', () => {
    expect(dewPoint(20, 50)).toBeCloseTo(9.26, 1);
    expect(dewPoint(25, 60)).toBeCloseTo(16.69, 1);
  });

  it('equals the temperature at saturation', () => {
    expect(dewPoint(15, 100)).toBeCloseTo(15, 6);
  });

  it('is undefined for non-positive humidity', () => {
    expect(dewPoint(20, 0)).toBeNull();
  });
});

describe('pressure', () => {
  it('reduces station pressure to sea level', () => {
    expect(seaLevelPressure(1000, 20, 0)).toBeCloseTo(1000, 6);
    expect(seaLevelPressure(1000, 20, 500)).toBeCloseTo(1059.7, 0);
  });

  it('computes the standard-atmosphere altitude', () => {
    expect(barometricAltitude(1013.25)).toBeCloseTo(0, 6);
    expect(Math.abs(barometricAltitude(898.76) - 1000)).toBeLessThan(1);
  });

  it.each([
    [0.05, 'steady'],
    [-0.05, 'steady'],
    [0.1, 'rising_slowly'],
    [-1.5, 'falling_slowly'],
    [1.6, 'rising'],
    [-3.5, 'falling'],
    [3.6, 'rising_quickly'],
    [-6, 'falling_quickly'],
    [6.1, 'rising_very_rapidly'],
  ] as const)('classifies a 3 h change of %s hPa as %s', (change, trend) => {
    expect(pressureTrend(change)).toBe(trend);
  });
});

describe('comfort', () => {
  it('computes the heat index (NOAA)', () => {
    expect(heatIndex(32, 70)).toBeCloseTo(40.4, 1);
    expect(heatIndex(20, 50)).toBeCloseTo(19.4, 1);
  });

  it('computes the wind chill', () => {
    expect(windChill(-5, 20)).toBeCloseTo(-11.55, 1);
  });

  it('picks the right apparent temperature', () => {
    expect(feelsLike(32, 70, 1)).toBeCloseTo(heatIndex(32, 70), 6);
    expect(feelsLike(5, 80, 5)).toBeCloseTo(windChill(5, 18), 6);
    expect(feelsLike(5, 80, 1)).toBe(5);
    expect(feelsLike(22, 50, 3)).toBe(22);
    expect(feelsLike(30, null, null)).toBe(30);
  });
});

describe('wind', () => {
  it('converts units', () => {
    expect(msToKmh(10)).toBeCloseTo(36, 6);
    expect(kmhToMs(36)).toBeCloseTo(10, 6);
  });

  it.each([
    [0, 0, 'Calmaria'],
    [0.3, 1, 'Bafagem'],
    [5.5, 4, 'Moderado'],
    [10, 5, 'Fresco'],
    [32.6, 11, 'Tempestuoso'],
    [32.7, 12, 'Furacão'],
  ])('%s m/s is Beaufort %s (%s)', (ms, force, label) => {
    expect(beaufort(ms)).toEqual({ force, label });
  });
});

describe('liIonPercent', () => {
  it.each([
    [4300, 100],
    [4200, 100],
    [3790, 50],
    [3770, 45],
    [3300, 0],
    [3000, 0],
  ])('%s mV ≈ %s %%', (mv, pct) => {
    expect(liIonPercent(mv)).toBe(pct);
  });
});
