import { describe, expect, it } from 'vitest';
import { checkReadingTimestamp, sanitizeReadingValues, TS_MAX_AGE_S } from './ranges';
import type { TelemetryReading } from './schemas';

const reading: TelemetryReading = {
  seq: 1,
  ts: 1761181260,
  dur: 60,
  temp: 24.6,
  hum: 63.2,
  pres: 1008.4,
  wind_p: 87,
  gust_p: 7,
  rain_c: 152,
};

describe('sanitizeReadingValues', () => {
  it('keeps valid readings untouched', () => {
    expect(sanitizeReadingValues(reading)).toEqual({ reading, violations: [] });
  });

  it('nulls out-of-range BME280 values and keeps the rest', () => {
    const { reading: result, violations } = sanitizeReadingValues({
      ...reading,
      temp: 120,
      hum: -1,
    });
    expect(result.temp).toBeNull();
    expect(result.hum).toBeNull();
    expect(result.pres).toBe(1008.4);
    expect(violations.map((v) => v.field)).toEqual(['temp', 'hum']);
  });

  it('nulls impossible pulse counts', () => {
    const { reading: result } = sanitizeReadingValues({ ...reading, wind_p: 300 * 60 + 1 });
    expect(result.wind_p).toBeNull();
  });

  it('nulls a gust above the 3-second maximum', () => {
    const { reading: result, violations } = sanitizeReadingValues({
      ...reading,
      wind_p: 5000,
      gust_p: 901,
    });
    expect(result.gust_p).toBeNull();
    expect(violations[0]?.reason).toBe('out_of_range');
  });

  it('nulls a gust larger than the whole interval', () => {
    const { reading: result, violations } = sanitizeReadingValues({
      ...reading,
      wind_p: 5,
      gust_p: 7,
    });
    expect(result.gust_p).toBeNull();
    expect(result.wind_p).toBe(5);
    expect(violations[0]?.reason).toBe('gust_exceeds_total');
  });
});

describe('checkReadingTimestamp', () => {
  const now = 1_761_181_260;

  it('accepts recent readings and small clock skew', () => {
    expect(checkReadingTimestamp(now, now)).toBe('ok');
    expect(checkReadingTimestamp(now + 300, now)).toBe('ok');
    expect(checkReadingTimestamp(now - TS_MAX_AGE_S, now)).toBe('ok');
  });

  it('rejects readings too far in the future or too old', () => {
    expect(checkReadingTimestamp(now + 301, now)).toBe('future');
    expect(checkReadingTimestamp(now - TS_MAX_AGE_S - 1, now)).toBe('too_old');
  });
});
