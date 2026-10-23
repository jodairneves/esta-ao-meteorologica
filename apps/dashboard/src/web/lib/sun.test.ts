import { describe, expect, it } from 'vitest';
import { sunPosition } from './sun';

// Piracicaba (SP), the demo stations' region.
const LAT = -22.72;
const LON = -47.65;
const at = (iso: string) => sunPosition(new Date(iso), LAT, LON);

describe('sunPosition', () => {
  it('puts the winter noon sun to the north at about 44°', () => {
    const noon = at('2026-06-21T12:10:00-03:00');
    expect(noon.elevation).toBeCloseTo(43.8, 0);
    expect(Math.min(noon.azimuth, 360 - noon.azimuth)).toBeLessThan(5);
  });

  it('rises in the east and sets in the west', () => {
    expect(at('2026-10-23T07:00:00-03:00').azimuth).toBeGreaterThan(60);
    expect(at('2026-10-23T07:00:00-03:00').azimuth).toBeLessThan(120);
    expect(at('2026-10-23T17:30:00-03:00').azimuth).toBeGreaterThan(240);
  });

  it('is below the horizon at night', () => {
    expect(at('2026-10-23T23:00:00-03:00').elevation).toBeLessThan(-30);
  });
});
