import {
  barometricAltitude,
  DEFAULT_CALIBRATION,
  dewPoint,
  seaLevelPressure,
  type TelemetryMessage,
  type TelemetryReading,
} from '@wx/shared';
import { describe, expect, it } from 'vitest';
import type { CachedStation } from '../stations/cache';
import { processTelemetry } from './process-reading';

const station: CachedStation = {
  id: 'station-1',
  code: 'sede',
  name: 'Sede',
  label: 'Estação Sede',
  isActive: true,
  timezone: 'America/Sao_Paulo',
  elevationM: 500,
  calibration: DEFAULT_CALIBRATION,
  intervalS: 60,
  economyBatchS: 600,
  survivalSleepS: 1800,
};

const NOW_MS = Date.UTC(2026, 9, 22, 15, 0, 0);
const NOW_S = NOW_MS / 1000;

const reading = (overrides: Partial<TelemetryReading> = {}): TelemetryReading => ({
  seq: 1,
  ts: NOW_S - 60,
  dur: 60,
  temp: 25,
  hum: 60,
  pres: 950,
  wind_p: 120,
  gust_p: 9,
  rain_c: 10,
  ...overrides,
});

const message = (readings: TelemetryReading[], run = 7): TelemetryMessage => ({
  v: 1,
  run,
  readings,
});

describe('processTelemetry', () => {
  it('computes calibrated and derived values', () => {
    const result = processTelemetry(message([reading()]), station, null, NOW_MS);
    const [processed] = result.readings;

    expect(processed).toMatchObject({
      seq: 1,
      intervalS: 60,
      temperatureC: 25,
      humidityPct: 60,
      pressureHpa: 950,
      windPulses: 120,
      gustPulses: 9,
      rainCount: 10,
    });
    expect(processed?.ts).toEqual(new Date((NOW_S - 60) * 1000));
    expect(processed?.dewPointC).toBeCloseTo(dewPoint(25, 60) ?? Number.NaN, 2);
    expect(processed?.pressureMslHpa).toBeCloseTo(seaLevelPressure(950, 25, 500), 2);
    expect(processed?.altitudeM).toBeCloseTo(barometricAltitude(950), 1);
    expect(processed?.windSpeedMs).toBeCloseTo(0.84, 3); // 120 pulses / 60 s × 0.42
    expect(processed?.windGustMs).toBeCloseTo(1.26, 3); // 9 pulses / 3 s × 0.42
    expect(processed?.rainMm).toBe(0); // first reading is the baseline
    expect(result.rainState).toEqual({ run: 7, count: 10, seq: 1 });
    expect(result.issues).toEqual([]);
  });

  it('applies the station offsets before deriving', () => {
    const calibrated = {
      ...station,
      calibration: {
        ...DEFAULT_CALIBRATION,
        tempOffsetC: -1.5,
        humOffsetPct: 3,
        presOffsetHpa: 0.8,
      },
    };
    const [processed] = processTelemetry(message([reading()]), calibrated, null, NOW_MS).readings;
    expect(processed?.temperatureC).toBe(23.5);
    expect(processed?.humidityPct).toBe(63);
    expect(processed?.pressureHpa).toBe(950.8);
    expect(processed?.dewPointC).toBeCloseTo(dewPoint(23.5, 63) ?? Number.NaN, 2);
  });

  it('computes rain by difference across a batch, in sequence order', () => {
    const result = processTelemetry(
      message([reading({ seq: 3, rain_c: 16 }), reading({ seq: 2, rain_c: 13 })]),
      station,
      { run: 7, count: 10, seq: 1 },
      NOW_MS,
    );
    expect(result.readings.map((r) => r.seq)).toEqual([2, 3]);
    expect(result.readings.map((r) => r.rainMm)).toEqual([1.92, 1.92]);
    expect(result.rainState).toEqual({ run: 7, count: 16, seq: 3 });
  });

  it('omits the sea-level pressure when the site elevation is unknown', () => {
    const [processed] = processTelemetry(
      message([reading()]),
      { ...station, elevationM: null },
      null,
      NOW_MS,
    ).readings;
    expect(processed?.pressureMslHpa).toBeNull();
    expect(processed?.altitudeM).not.toBeNull();
  });

  it('keeps "not measured" as null', () => {
    const [processed] = processTelemetry(
      message([reading({ wind_p: null, gust_p: null, rain_c: null })]),
      station,
      { run: 7, count: 10, seq: 0 },
      NOW_MS,
    ).readings;
    expect(processed?.windSpeedMs).toBeNull();
    expect(processed?.windGustMs).toBeNull();
    expect(processed?.rainMm).toBeNull();
  });

  it('skips readings with bad timestamps without moving the rain baseline', () => {
    const result = processTelemetry(
      message([reading({ seq: 2, ts: NOW_S + 3600, rain_c: 20 })]),
      station,
      { run: 7, count: 10, seq: 1 },
      NOW_MS,
    );
    expect(result.readings).toEqual([]);
    expect(result.rainState).toEqual({ run: 7, count: 10, seq: 1 });
    expect(result.issues).toEqual([
      { kind: 'timestamp', seq: 2, ts: NOW_S + 3600, check: 'future' },
    ]);
  });

  it('nulls impossible values and reports them', () => {
    const result = processTelemetry(message([reading({ temp: 150 })]), station, null, NOW_MS);
    const [processed] = result.readings;
    expect(processed?.temperatureC).toBeNull();
    expect(processed?.dewPointC).toBeNull();
    expect(processed?.pressureMslHpa).toBeNull();
    expect(processed?.humidityPct).toBe(60);
    expect(result.issues[0]).toMatchObject({ kind: 'range', seq: 1 });
  });

  it('reports a rain counter that went backwards without a new run', () => {
    const result = processTelemetry(
      message([reading({ seq: 5, rain_c: 3 })]),
      station,
      { run: 7, count: 40, seq: 4 },
      NOW_MS,
    );
    expect(result.readings[0]?.rainMm).toBe(0);
    expect(result.issues).toEqual([{ kind: 'rain_anomaly', seq: 5, previousCount: 40, count: 3 }]);
  });

  it('counts all tips since the restart when the run changes', () => {
    const result = processTelemetry(
      message([reading({ seq: 1, rain_c: 2 })], 8),
      station,
      { run: 7, count: 40, seq: 99 },
      NOW_MS,
    );
    expect(result.readings[0]?.rainMm).toBe(1.28);
    expect(result.rainState).toEqual({ run: 8, count: 2, seq: 1 });
  });
});
