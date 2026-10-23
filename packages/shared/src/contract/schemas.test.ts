import { describe, expect, it } from 'vitest';
import { DEFAULT_DEVICE_CONFIG } from '../domain/defaults';
import {
  commandMessageSchema,
  configMessageSchema,
  decodeStationMessage,
  deviceConfigSchema,
  deviceEventMessageSchema,
  healthMessageSchema,
  statusMessageSchema,
  telemetryMessageSchema,
} from './schemas';

const reading = {
  seq: 1042,
  ts: 1761181260,
  dur: 60,
  temp: 24.61,
  hum: 63.2,
  pres: 1008.42,
  wind_p: 87,
  gust_p: 7,
  rain_c: 152,
};

describe('telemetry', () => {
  it('accepts the example from the design', () => {
    const parsed = telemetryMessageSchema.parse({ v: 1, run: 2864434397, readings: [reading] });
    expect(parsed.readings[0]).toEqual(reading);
  });

  it('defaults missing measurements to null and strips unknown keys', () => {
    const parsed = telemetryMessageSchema.parse({
      v: 1,
      run: 1,
      extra: 'ignored',
      readings: [{ seq: 1, ts: 1761181260, dur: 60, uv: 3 }],
    });
    expect(parsed).toEqual({
      v: 1,
      run: 1,
      readings: [
        {
          seq: 1,
          ts: 1761181260,
          dur: 60,
          temp: null,
          hum: null,
          pres: null,
          wind_p: null,
          gust_p: null,
          rain_c: null,
        },
      ],
    });
  });

  it.each([
    ['unsupported version', { v: 2, run: 1, readings: [reading] }],
    ['empty batch', { v: 1, run: 1, readings: [] }],
    ['batch over 30', { v: 1, run: 1, readings: Array.from({ length: 31 }, () => reading) }],
    ['run above uint32', { v: 1, run: 2 ** 32, readings: [reading] }],
    ['negative pulses', { v: 1, run: 1, readings: [{ ...reading, wind_p: -1 }] }],
    ['fractional seq', { v: 1, run: 1, readings: [{ ...reading, seq: 1.5 }] }],
    ['zero duration', { v: 1, run: 1, readings: [{ ...reading, dur: 0 }] }],
    ['string temperature', { v: 1, run: 1, readings: [{ ...reading, temp: '24.6' }] }],
  ])('rejects %s', (_name, payload) => {
    expect(telemetryMessageSchema.safeParse(payload).success).toBe(false);
  });
});

describe('status, health and event', () => {
  it('accepts the minimal LWT payload', () => {
    expect(statusMessageSchema.parse({ v: 1, state: 'offline' })).toEqual({
      v: 1,
      state: 'offline',
      ts: null,
      mode: null,
      next: null,
      fw: null,
    });
  });

  it('accepts a sleeping status with next contact', () => {
    const parsed = statusMessageSchema.parse({
      v: 1,
      state: 'sleeping',
      ts: 1761181260,
      mode: 'economy',
      next: 1761181860,
      fw: '1.0.0',
    });
    expect(parsed.next).toBe(1761181860);
  });

  it('accepts a minimal health payload', () => {
    const parsed = healthMessageSchema.parse({ v: 1, ts: 1761181260, fw: '1.0.0', mode: 'normal' });
    expect(parsed.bat_mv).toBeNull();
    expect(parsed.sensors).toEqual({});
  });

  it('rejects impossible health values', () => {
    const base = { v: 1, ts: 1761181260, fw: '1.0.0', mode: 'normal' };
    expect(healthMessageSchema.safeParse({ ...base, rssi: 10 }).success).toBe(false);
    expect(healthMessageSchema.safeParse({ ...base, mode: 'turbo' }).success).toBe(false);
    expect(healthMessageSchema.safeParse({ ...base, sensors: { bme280: 'broken' } }).success).toBe(
      false,
    );
  });

  it('validates event codes', () => {
    const event = { v: 1, level: 'warn', code: 'SENSOR_FAILED', msg: 'BME280 não respondeu' };
    expect(deviceEventMessageSchema.parse(event).data).toBeNull();
    expect(deviceEventMessageSchema.safeParse({ ...event, code: 'sensor_failed' }).success).toBe(
      false,
    );
  });
});

describe('config and commands', () => {
  it('accepts the default device config', () => {
    expect(deviceConfigSchema.parse(DEFAULT_DEVICE_CONFIG)).toEqual(DEFAULT_DEVICE_CONFIG);
    expect(configMessageSchema.parse({ v: 1, rev: 3, ...DEFAULT_DEVICE_CONFIG }).rev).toBe(3);
  });

  it('rejects thresholds out of order', () => {
    const config = {
      ...DEFAULT_DEVICE_CONFIG,
      power: { ...DEFAULT_DEVICE_CONFIG.power, economy_below_mv: 3400 },
    };
    expect(deviceConfigSchema.safeParse(config).success).toBe(false);
  });

  it('rejects an economy batch shorter than the reading interval', () => {
    const config = { ...DEFAULT_DEVICE_CONFIG, interval_s: 900, economy_batch_s: 600 };
    expect(deviceConfigSchema.safeParse(config).success).toBe(false);
  });

  it('validates commands', () => {
    const command = {
      v: 1,
      id: '0192f1c4-7a3e-7c1d-9a52-2c1f0b6e4d10',
      cmd: 'identify',
      exp: 1761184860,
    };
    expect(commandMessageSchema.parse(command).args).toEqual({});
    expect(commandMessageSchema.safeParse({ ...command, cmd: 'format' }).success).toBe(false);
    expect(commandMessageSchema.safeParse({ ...command, id: 'not-a-uuid' }).success).toBe(false);
  });
});

describe('decodeStationMessage', () => {
  it('decodes valid bytes', () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ v: 1, state: 'online' }));
    const result = decodeStationMessage('status', bytes);
    expect(result.ok && result.message.state).toBe('online');
  });

  it('reports invalid JSON and invalid UTF-8 without throwing', () => {
    expect(decodeStationMessage('status', '{oops').ok).toBe(false);
    expect(decodeStationMessage('status', new Uint8Array([0xff, 0xfe, 0x7b])).ok).toBe(false);
  });

  it('reports schema errors in a readable form', () => {
    const result = decodeStationMessage('telemetry', JSON.stringify({ v: 1, run: 1 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('readings');
  });
});
