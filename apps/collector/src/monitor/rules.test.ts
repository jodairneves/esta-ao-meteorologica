import { DEFAULT_SETTINGS } from '@wx/shared';
import { describe, expect, it } from 'vitest';
import {
  type ContactInput,
  contactDeadline,
  evaluateContact,
  expectedContactIntervalS,
  findStaleSensors,
  isSensorExpected,
} from './rules';

const settings = DEFAULT_SETTINGS.monitoring;
const seen = new Date('2026-10-22T12:00:00Z');
const after = (seconds: number) => new Date(seen.getTime() + seconds * 1000);

const input = (overrides: Partial<ContactInput> = {}): ContactInput => ({
  connection: 'online',
  lastSeenAt: seen,
  nextContactAt: null,
  powerMode: 'normal',
  intervalS: 60,
  economyBatchS: 600,
  survivalSleepS: 1800,
  ...overrides,
});

describe('contact rules', () => {
  it('expects contact according to the power profile', () => {
    expect(expectedContactIntervalS(input())).toBe(60);
    expect(expectedContactIntervalS(input({ powerMode: 'economy' }))).toBe(600);
    expect(expectedContactIntervalS(input({ powerMode: 'survival' }))).toBe(1800);
  });

  it('allows 3 intervals, never less than the minimum', () => {
    expect(contactDeadline(input(), settings)).toEqual(after(180));
    expect(contactDeadline(input({ intervalS: 10 }), settings)).toEqual(after(180));
    expect(contactDeadline(input({ powerMode: 'economy' }), settings)).toEqual(after(1800));
  });

  it('uses the announced next contact of a sleeping station, plus a grace period', () => {
    const next = after(600);
    const deadline = contactDeadline(
      input({ connection: 'sleeping', nextContactAt: next }),
      settings,
    );
    expect(deadline).toEqual(new Date(next.getTime() + 300_000));
  });

  it('has no deadline for a station that never talked to us', () => {
    expect(evaluateContact(input({ lastSeenAt: null }), settings, after(10_000))).toEqual({
      status: 'never_seen',
    });
  });

  it('becomes overdue, then critical after an hour', () => {
    expect(evaluateContact(input(), settings, after(179)).status).toBe('ok');
    expect(evaluateContact(input(), settings, after(181))).toMatchObject({
      status: 'overdue',
      severity: 'warning',
    });
    expect(evaluateContact(input(), settings, after(180 + 3600))).toMatchObject({
      status: 'overdue',
      severity: 'critical',
    });
  });
});

describe('sensor rules', () => {
  it('does not expect wind and rain while the station is in survival', () => {
    expect(isSensorExpected('bme280', 'survival')).toBe(true);
    expect(isSensorExpected('anemometer', 'survival')).toBe(false);
    expect(isSensorExpected('rain_gauge', 'survival')).toBe(false);
    expect(isSensorExpected('anemometer', 'economy')).toBe(true);
    expect(isSensorExpected('battery', 'normal')).toBe(false);
  });

  it('flags sensors that stopped delivering data', () => {
    const sensors = [
      { sensor: 'bme280' as const, status: 'ok' as const, lastValueAt: after(-301) },
      { sensor: 'anemometer' as const, status: 'ok' as const, lastValueAt: after(-10) },
      { sensor: 'rain_gauge' as const, status: 'error' as const, lastValueAt: after(-9999) },
    ];
    expect(findStaleSensors(sensors, input(), settings, seen)).toEqual(['bme280']);
  });

  it('waits longer for stations that send in batches', () => {
    const sensors = [
      { sensor: 'bme280' as const, status: 'ok' as const, lastValueAt: after(-900) },
    ];
    expect(findStaleSensors(sensors, input({ powerMode: 'economy' }), settings, seen)).toEqual([]);
  });
});
