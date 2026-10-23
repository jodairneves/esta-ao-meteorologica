import {
  applyOffsets,
  barometricAltitude,
  checkReadingTimestamp,
  computeRainTips,
  dewPoint,
  type RainCounterState,
  type RangeViolation,
  rainMm,
  sanitizeReadingValues,
  seaLevelPressure,
  type TelemetryMessage,
  windGustMs,
  windSpeedMs,
} from '@wx/shared';
import type { CachedStation } from '../stations/cache';

/** A reading ready to be stored: calibrated, derived values computed, raw counters kept. */
export interface ProcessedReading {
  seq: number;
  ts: Date;
  intervalS: number;
  temperatureC: number | null;
  humidityPct: number | null;
  pressureHpa: number | null;
  pressureMslHpa: number | null;
  altitudeM: number | null;
  dewPointC: number | null;
  windSpeedMs: number | null;
  windGustMs: number | null;
  rainMm: number | null;
  windPulses: number | null;
  gustPulses: number | null;
  rainCount: number | null;
}

export type ReadingIssue =
  | { kind: 'timestamp'; seq: number; ts: number; check: 'future' | 'too_old' }
  | { kind: 'range'; seq: number; violations: RangeViolation[] }
  | { kind: 'rain_anomaly'; seq: number; previousCount: number; count: number };

export interface TelemetryResult {
  readings: ProcessedReading[];
  /** Rain counter baseline after this message. */
  rainState: RainCounterState | null;
  issues: ReadingIssue[];
}

const round = (value: number | null, digits: number): number | null =>
  value === null ? null : Math.round(value * 10 ** digits) / 10 ** digits;

/**
 * Turns a telemetry message into rows (design §6). Pure: the caller provides the station, the
 * rain baseline stored in station_state and the current time.
 */
export function processTelemetry(
  message: TelemetryMessage,
  station: CachedStation,
  previousRain: RainCounterState | null,
  nowMs: number,
): TelemetryResult {
  const nowSeconds = Math.floor(nowMs / 1000);
  const { calibration } = station;
  const readings: ProcessedReading[] = [];
  const issues: ReadingIssue[] = [];
  let rainState = previousRain;

  for (const raw of [...message.readings].sort((a, b) => a.seq - b.seq)) {
    const tsCheck = checkReadingTimestamp(raw.ts, nowSeconds);
    if (tsCheck !== 'ok') {
      // Skipped readings leave the rain baseline alone: their tips show up in the next reading.
      issues.push({ kind: 'timestamp', seq: raw.seq, ts: raw.ts, check: tsCheck });
      continue;
    }

    const { reading, violations } = sanitizeReadingValues(raw);
    if (violations.length > 0) issues.push({ kind: 'range', seq: reading.seq, violations });

    const { temp, hum, pres } = applyOffsets(reading, calibration);

    const rain = computeRainTips(rainState, message.run, reading.seq, reading.rain_c);
    if (rain.anomaly && rainState && reading.rain_c !== null) {
      issues.push({
        kind: 'rain_anomaly',
        seq: reading.seq,
        previousCount: rainState.count,
        count: reading.rain_c,
      });
    }
    rainState = rain.state;

    readings.push({
      seq: reading.seq,
      ts: new Date(reading.ts * 1000),
      intervalS: reading.dur,
      temperatureC: round(temp, 2),
      humidityPct: round(hum, 2),
      pressureHpa: round(pres, 2),
      pressureMslHpa:
        pres !== null && temp !== null && station.elevationM !== null
          ? round(seaLevelPressure(pres, temp, station.elevationM), 2)
          : null,
      altitudeM: pres !== null ? round(barometricAltitude(pres), 1) : null,
      dewPointC: temp !== null && hum !== null ? round(dewPoint(temp, hum), 2) : null,
      windSpeedMs: round(windSpeedMs(reading.wind_p, reading.dur, calibration.windMsPerHz), 3),
      windGustMs: round(windGustMs(reading.gust_p, calibration.windMsPerHz), 3),
      rainMm: round(rainMm(rain.tips, calibration.rainMmPerTip), 3),
      windPulses: reading.wind_p,
      gustPulses: reading.gust_p,
      rainCount: reading.rain_c,
    });
  }

  return { readings, rainState, issues };
}
