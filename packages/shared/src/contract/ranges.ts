import type { TelemetryReading } from './schemas';

/** Physical range of the BME280; values outside are sensor or transmission errors. */
export const VALUE_RANGES = {
  temp: { min: -40, max: 85 },
  hum: { min: 0, max: 100 },
  pres: { min: 300, max: 1100 },
} as const;

/** Highest pulse rate accepted from the anemometer input (firmware debounce allows up to 500 Hz). */
export const MAX_PULSE_RATE_HZ = 300;
/** Gust window (WMO: maximum 3-second average). */
export const GUST_WINDOW_S = 3;
export const MAX_GUST_PULSES = MAX_PULSE_RATE_HZ * GUST_WINDOW_S;

export const MAX_READINGS_PER_MESSAGE = 30;

/** Accepted window for reading timestamps relative to the time the message is processed. */
export const TS_MAX_FUTURE_S = 5 * 60;
export const TS_MAX_AGE_S = 30 * 24 * 60 * 60;

export type SanitizedField = 'temp' | 'hum' | 'pres' | 'wind_p' | 'gust_p';

export interface RangeViolation {
  field: SanitizedField;
  value: number;
  reason: 'out_of_range' | 'gust_exceeds_total';
}

/**
 * Replaces implausible values with null (never 0) and reports what was discarded.
 * The rest of the reading is kept.
 */
export function sanitizeReadingValues(reading: TelemetryReading): {
  reading: TelemetryReading;
  violations: RangeViolation[];
} {
  const violations: RangeViolation[] = [];
  const result: TelemetryReading = { ...reading };

  for (const field of ['temp', 'hum', 'pres'] as const) {
    const value = result[field];
    const range = VALUE_RANGES[field];
    if (value !== null && (value < range.min || value > range.max)) {
      violations.push({ field, value, reason: 'out_of_range' });
      result[field] = null;
    }
  }

  if (result.wind_p !== null && result.wind_p > MAX_PULSE_RATE_HZ * result.dur) {
    violations.push({ field: 'wind_p', value: result.wind_p, reason: 'out_of_range' });
    result.wind_p = null;
  }

  if (result.gust_p !== null) {
    if (result.gust_p > MAX_GUST_PULSES) {
      violations.push({ field: 'gust_p', value: result.gust_p, reason: 'out_of_range' });
      result.gust_p = null;
    } else if (
      result.wind_p !== null &&
      result.dur >= GUST_WINDOW_S &&
      result.gust_p > result.wind_p
    ) {
      violations.push({ field: 'gust_p', value: result.gust_p, reason: 'gust_exceeds_total' });
      result.gust_p = null;
    }
  }

  return { reading: result, violations };
}

export type TimestampCheck = 'ok' | 'future' | 'too_old';

export function checkReadingTimestamp(tsSeconds: number, nowSeconds: number): TimestampCheck {
  if (tsSeconds > nowSeconds + TS_MAX_FUTURE_S) return 'future';
  if (tsSeconds < nowSeconds - TS_MAX_AGE_S) return 'too_old';
  return 'ok';
}
