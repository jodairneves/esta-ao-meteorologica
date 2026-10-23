import { describe, expect, it } from 'vitest';
import { installedClimateSensor } from './climate-sensor';

describe('installedClimateSensor', () => {
  it('names the climate sensor the station reports as working', () => {
    expect(installedClimateSensor({ sensors: { htu21d: 'ok', wind: 'ok' } })).toBe('htu21d');
    expect(installedClimateSensor({ sensors: { bme280: 'ok', htu21d: 'absent' } })).toBe('bme280');
  });

  it('stays silent when none or both are working (nothing reliable to compare)', () => {
    expect(installedClimateSensor({ sensors: { bme280: 'error', wind: 'ok' } })).toBeNull();
    expect(installedClimateSensor({ sensors: {} })).toBeNull();
    expect(installedClimateSensor({ sensors: { bme280: 'ok', htu21d: 'ok' } })).toBeNull();
  });
});
