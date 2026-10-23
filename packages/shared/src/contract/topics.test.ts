import { describe, expect, it } from 'vitest';
import {
  COLLECTOR_TOPIC_FILTERS,
  isValidStationCode,
  parseStationTopic,
  stationClientId,
  stationTopic,
  suggestStationCode,
} from './topics';

describe('station codes', () => {
  it.each(['abc', 'fazenda-norte', 'st1', 'a'.repeat(32), 'x-1-y'])('accepts "%s"', (code) => {
    expect(isValidStationCode(code)).toBe(true);
  });

  it.each(['ab', 'Abc', '-abc', 'abc-', 'a_b_c', 'a'.repeat(33), 'são-joão', 'a b c', ''])(
    'rejects "%s"',
    (code) => {
      expect(isValidStationCode(code)).toBe(false);
    },
  );

  it('suggests valid codes from display names', () => {
    expect(suggestStationCode('Fazenda São João')).toBe('fazenda-sao-joao');
    expect(suggestStationCode('  Estação #2 (Pivô)  ')).toBe('estacao-2-pivo');
    expect(suggestStationCode('A')).toBe('a-wx');
    expect(suggestStationCode('***')).toBe('estacao');
    const long = suggestStationCode('Estação meteorológica da sede administrativa principal');
    expect(long.length).toBeLessThanOrEqual(32);
    expect(isValidStationCode(long)).toBe(true);
  });
});

describe('topics', () => {
  it('builds station topics and client ids', () => {
    expect(stationTopic('fazenda-norte', 'telemetry')).toBe('weather/v1/fazenda-norte/telemetry');
    expect(stationClientId('fazenda-norte')).toBe('st-fazenda-norte');
    expect(() => stationTopic('Bad Code', 'status')).toThrow();
  });

  it('parses valid topics', () => {
    expect(parseStationTopic('weather/v1/fazenda-norte/health')).toEqual({
      code: 'fazenda-norte',
      kind: 'health',
    });
  });

  it.each([
    'weather/v2/abc/telemetry',
    'weather/v1/abc/unknown',
    'weather/v1/abc/telemetry/extra',
    'weather/v1/AB/telemetry',
    'other/v1/abc/telemetry',
  ])('rejects "%s"', (topic) => {
    expect(parseStationTopic(topic)).toBeNull();
  });

  it('subscribes the collector only to what stations publish', () => {
    expect(COLLECTOR_TOPIC_FILTERS).toEqual([
      'weather/v1/+/telemetry',
      'weather/v1/+/status',
      'weather/v1/+/health',
      'weather/v1/+/event',
    ]);
  });
});
