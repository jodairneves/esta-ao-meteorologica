import { describe, expect, it } from 'vitest';
import {
  anemometerMsPerHz,
  applyOffsets,
  DEFAULT_ANEMOMETER_GEOMETRY,
  DEFAULT_CALIBRATION,
  rainMm,
  windGustMs,
  windSpeedMs,
} from './calibration';

describe('wind', () => {
  it('converts pulses over the interval to mean speed', () => {
    expect(windSpeedMs(87, 60, 0.42)).toBeCloseTo(0.609, 6);
    expect(windSpeedMs(0, 60, 0.42)).toBe(0);
    expect(windSpeedMs(null, 60, 0.42)).toBeNull();
  });

  it('converts the 3-second pulse peak to gust speed', () => {
    expect(windGustMs(7, 0.42)).toBeCloseTo(0.98, 6);
    expect(windGustMs(null, 0.42)).toBeNull();
  });

  it('derives the default factor from the MakerWorld anemometer geometry', () => {
    expect(anemometerMsPerHz(DEFAULT_ANEMOMETER_GEOMETRY)).toBeCloseTo(0.419, 3);
    expect(DEFAULT_CALIBRATION.windMsPerHz).toBeCloseTo(
      anemometerMsPerHz(DEFAULT_ANEMOMETER_GEOMETRY),
      2,
    );
  });
});

describe('rain', () => {
  it('converts tips to millimetres', () => {
    expect(rainMm(3, 0.64)).toBeCloseTo(1.92, 6);
    expect(rainMm(0, 0.64)).toBe(0);
    expect(rainMm(null, 0.64)).toBeNull();
  });
});

describe('applyOffsets', () => {
  it('applies offsets and clamps humidity', () => {
    const calibration = {
      ...DEFAULT_CALIBRATION,
      tempOffsetC: -0.5,
      humOffsetPct: 2,
      presOffsetHpa: 1.2,
    };
    const result = applyOffsets({ temp: 20, hum: 99, pres: 1000 }, calibration);
    expect(result.temp).toBeCloseTo(19.5, 6);
    expect(result.hum).toBe(100);
    expect(result.pres).toBeCloseTo(1001.2, 6);
  });

  it('keeps missing values as null', () => {
    expect(applyOffsets({ temp: null, hum: null, pres: null }, DEFAULT_CALIBRATION)).toEqual({
      temp: null,
      hum: null,
      pres: null,
    });
  });
});
