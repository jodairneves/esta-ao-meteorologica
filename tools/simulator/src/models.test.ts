import { DEFAULT_DEVICE_CONFIG, seaLevelPressure } from '@wx/shared';
import { describe, expect, it } from 'vitest';
import { DEMO_STATIONS, type SimulatedStation } from './demo-stations';
import { PowerModel, socToMv } from './power-model';
import { relativeHumidity, stationPressure, WeatherModel } from './weather-model';

function demo(code: string): SimulatedStation {
  const station = DEMO_STATIONS.find((s) => s.code === code);
  if (!station) throw new Error(`demo station ${code} missing`);
  return station;
}

const sede = demo('sede');
const talhao = demo('talhao-sul');

const START = Date.UTC(2026, 9, 1, 3, 0, 0);
const MINUTE = 60_000;

function simulateWeek(seed: number) {
  const model = new WeatherModel(sede.climate, sede, seed);
  return Array.from({ length: 7 * 1440 }, (_, i) => ({
    ms: START + i * MINUTE,
    ...model.sample(START + i * MINUTE, 60),
  }));
}

describe('weather model', () => {
  it('is deterministic for a seed', () => {
    expect(simulateWeek(42).slice(0, 50)).toEqual(simulateWeek(42).slice(0, 50));
    expect(simulateWeek(42)[100]).not.toEqual(simulateWeek(7)[100]);
  });

  it('stays within plausible ranges', () => {
    for (const s of simulateWeek(42)) {
      expect(s.tempC).toBeGreaterThan(5);
      expect(s.tempC).toBeLessThan(40);
      expect(s.humidityPct).toBeGreaterThanOrEqual(12);
      expect(s.humidityPct).toBeLessThanOrEqual(100);
      expect(s.pressureHpa).toBeGreaterThan(930);
      expect(s.pressureHpa).toBeLessThan(975);
      expect(s.windMeanMs).toBeGreaterThanOrEqual(0);
      expect(s.windGustMs).toBeGreaterThanOrEqual(s.windMeanMs);
      expect(s.rainMm).toBeGreaterThanOrEqual(0);
    }
  });

  it('is warmer in the afternoon than before dawn', () => {
    const week = simulateWeek(42);
    // Solar time ≈ UTC − 3.2 h at this longitude.
    const meanAt = (utcHour: number) => {
      const temps = week
        .filter((s) => new Date(s.ms).getUTCHours() === utcHour)
        .map((s) => s.tempC);
      return temps.reduce((a, b) => a + b, 0) / temps.length;
    };
    expect(meanAt(18)).toBeGreaterThan(meanAt(7) + 6);
  });

  it('produces some rain over a week', () => {
    const total = simulateWeek(42).reduce((sum, s) => sum + s.rainMm, 0);
    expect(total).toBeGreaterThan(0);
  });

  it('inverts the sea-level reduction of @wx/shared', () => {
    const station = stationPressure(1013, 23, 547);
    expect(seaLevelPressure(station, 23, 547)).toBeCloseTo(1013, 6);
    expect(relativeHumidity(20, 20)).toBeCloseTo(100, 6);
  });
});

describe('power model', () => {
  const thresholds = () => DEFAULT_DEVICE_CONFIG.power;

  it('maps the state of charge to the Li-ion curve', () => {
    expect(socToMv(100)).toBe(4200);
    expect(socToMv(50)).toBe(3790);
    expect(socToMv(0)).toBe(3300);
  });

  it('keeps a well-sized solar station in the normal profile', () => {
    const power = new PowerModel(sede.power, sede.longitude, thresholds);
    const modes = new Set<string>();
    for (let i = 0; i < 7 * 1440; i++) modes.add(power.step(START + i * MINUTE, 60, false).mode);
    expect([...modes]).toEqual(['normal']);
  });

  it('drops a weak battery station to economy and survival, with hysteresis', () => {
    const power = new PowerModel(talhao.power, talhao.longitude, thresholds);
    const changes: string[] = [];
    let survivalReadings = 0;
    for (let i = 0; i < 4 * 1440; i++) {
      const step = power.step(START + i * MINUTE, 60, true);
      if (step.modeChanged) changes.push(`${step.modeChanged.from}->${step.modeChanged.to}`);
      if (step.mode === 'survival') survivalReadings++;
    }
    expect(changes).toContain('economy->survival');
    expect(survivalReadings).toBeGreaterThan(0);
    // No flapping: every switch needs three consecutive measurements.
    expect(changes.length).toBeLessThan(10);
  });

  it('respects a fixed profile', () => {
    const power = new PowerModel(talhao.power, talhao.longitude, () => ({
      ...DEFAULT_DEVICE_CONFIG.power,
      mode: 'normal',
    }));
    expect(power.currentMode).toBe('normal');
    for (let i = 0; i < 600; i++)
      expect(power.step(START + i * MINUTE, 60, true).mode).toBe('normal');
  });
});
