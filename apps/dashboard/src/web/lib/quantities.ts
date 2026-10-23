import type { Metric } from '../../common/api';
import { msToKmh } from './format';

export interface Quantity {
  label: string;
  unit: string;
  /** CSS custom property holding the quantity's identity hue. */
  color: string;
  digits: number;
  /** API values are SI (m/s); the interface shows km/h. */
  toDisplay: (value: number) => number;
}

const identity = (value: number) => value;

/** One fixed hue per quantity, the same in every chart (validated palette, see styles.css). */
export const QUANTITIES: Record<Metric, Quantity> = {
  temperature: {
    label: 'Temperatura',
    unit: '°C',
    color: '--q-temp',
    digits: 1,
    toDisplay: identity,
  },
  dewPoint: {
    label: 'Ponto de orvalho',
    unit: '°C',
    color: '--q-dew',
    digits: 1,
    toDisplay: identity,
  },
  humidity: { label: 'Umidade', unit: '%', color: '--q-hum', digits: 0, toDisplay: identity },
  pressure: {
    label: 'Pressão da estação',
    unit: 'hPa',
    color: '--q-pres',
    digits: 1,
    toDisplay: identity,
  },
  pressureMsl: {
    label: 'Pressão ao nível do mar',
    unit: 'hPa',
    color: '--q-pres',
    digits: 1,
    toDisplay: identity,
  },
  wind: { label: 'Vento médio', unit: 'km/h', color: '--q-wind', digits: 0, toDisplay: msToKmh },
  gust: { label: 'Rajada', unit: 'km/h', color: '--q-wind', digits: 0, toDisplay: msToKmh },
  rain: { label: 'Chuva', unit: 'mm', color: '--q-rain', digits: 1, toDisplay: identity },
};

export const displayValue = (metric: Metric, value: number | null | undefined) =>
  value === null || value === undefined ? null : QUANTITIES[metric].toDisplay(value);
