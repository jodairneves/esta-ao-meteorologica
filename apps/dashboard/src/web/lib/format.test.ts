import { describe, expect, it } from 'vitest';
import {
  formatAxisNumber,
  formatDay,
  formatNumber,
  formatRelative,
  localDayOf,
  MISSING,
  withUnit,
} from './format';

describe('format', () => {
  it('writes numbers the Brazilian way and never turns "not measured" into zero', () => {
    expect(formatNumber(1014.25, 1)).toBe('1.014,3');
    expect(formatNumber(null)).toBe(MISSING);
    expect(formatNumber(Number.NaN)).toBe(MISSING);
    expect(withUnit(23.44, '°C')).toBe('23,4 °C');
    expect(withUnit(undefined, '°C')).toBe(MISSING);
  });

  it('gives axis ticks only the decimals they need', () => {
    expect(formatAxisNumber(4, 2)).toBe('4');
    expect(formatAxisNumber(4.1, 2)).toBe('4,1');
    expect(formatAxisNumber(4.15, 2)).toBe('4,15');
  });

  it('finds the calendar day of an instant in the station time zone', () => {
    // 01:30 UTC is still the previous evening in Brasília.
    expect(localDayOf('2026-10-23T01:30:00Z', 'America/Sao_Paulo')).toBe('2026-10-22');
    expect(formatDay('2026-10-22')).toMatch(/22\/10/);
  });

  it('describes time in words, past and future', () => {
    const now = Date.parse('2026-10-23T12:00:00Z');
    expect(formatRelative('2026-10-23T11:59:55Z', now)).toBe('agora');
    expect(formatRelative('2026-10-23T11:57:00Z', now)).toBe('há 3 minutos');
    expect(formatRelative('2026-10-23T12:10:00Z', now)).toBe('em 10 minutos');
  });
});
