import { describe, expect, it } from 'vitest';
import { stationLabel } from './labels';

describe('stationLabel', () => {
  it('prefixes the station name', () => {
    expect(stationLabel('Pivô Norte')).toBe('Estação Pivô Norte');
  });

  it('does not repeat the word when the name already has it', () => {
    expect(stationLabel('Estação Sede')).toBe('Estação Sede');
    expect(stationLabel('estacao experimental')).toBe('estacao experimental');
    expect(stationLabel('  ESTAÇÃO 2 ')).toBe('ESTAÇÃO 2');
  });
});
