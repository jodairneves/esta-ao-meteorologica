import type { StationSummary } from '../../../common/api';
import { msToKmh } from '../../lib/format';

/** What the overview map columns measure; each keeps its quantity's hue. */
export const MAP_METRICS = {
  temperature: {
    label: 'Temperatura',
    unit: '°C',
    color: '--q-temp',
    digits: 1,
    value: (station: StationSummary) => station.latest?.temperatureC ?? null,
  },
  rainToday: {
    label: 'Chuva hoje',
    unit: 'mm',
    color: '--q-rain',
    digits: 1,
    value: (station: StationSummary) => station.rainTodayMm,
  },
  wind: {
    label: 'Vento',
    unit: 'km/h',
    color: '--q-wind',
    digits: 0,
    value: (station: StationSummary) => {
      const ms = station.latest?.windSpeedMs;
      return ms === null || ms === undefined ? null : msToKmh(ms);
    },
  },
  humidity: {
    label: 'Umidade',
    unit: '%',
    color: '--q-hum',
    digits: 0,
    value: (station: StationSummary) => station.latest?.humidityPct ?? null,
  },
} as const;

export type MapMetric = keyof typeof MAP_METRICS;
