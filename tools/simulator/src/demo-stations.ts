import { CLIMATE_SENSORS } from '@wx/shared';
import { z } from 'zod';

export const climateProfileSchema = z.object({
  meanTempC: z.number(),
  dailyAmplitudeC: z.number().min(0),
  meanPressureMslHpa: z.number(),
  windMeanMs: z.number().min(0),
  rainEventsPerDay: z.number().min(0),
});
export type ClimateProfile = z.infer<typeof climateProfileSchema>;

export const powerProfileSchema = z.object({
  capacityMah: z.number().positive(),
  /** Charge current at solar noon on a clear day; 0 = battery only. */
  solarPeakMa: z.number().min(0),
  initialSocPct: z.number().min(0).max(100),
});
export type PowerProfile = z.infer<typeof powerProfileSchema>;

export const simulatedStationSchema = z.object({
  code: z.string(),
  name: z.string(),
  description: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  elevationM: z.number(),
  timezone: z.string(),
  /** Station version: BME280 (with pressure) or HTU21D (temperature and humidity only). */
  climateSensor: z.enum(CLIMATE_SENSORS).default('bme280'),
  rainMmPerTip: z.number().positive(),
  windMsPerHz: z.number().positive(),
  climate: climateProfileSchema,
  power: powerProfileSchema,
});
export type SimulatedStation = z.output<typeof simulatedStationSchema>;

// Demo stations near Piracicaba (SP) in spring: three full stations, each exercising a different
// power profile, and one of the HTU21D version (no barometer).
export const DEMO_STATIONS: readonly SimulatedStation[] = [
  {
    code: 'sede',
    name: 'Estação Sede',
    description: 'Junto ao escritório; painel solar de 3 W e duas 18650.',
    latitude: -22.7253,
    longitude: -47.6492,
    elevationM: 547,
    timezone: 'America/Sao_Paulo',
    climateSensor: 'bme280',
    rainMmPerTip: 0.64,
    windMsPerHz: 0.42,
    climate: {
      meanTempC: 23,
      dailyAmplitudeC: 6,
      meanPressureMslHpa: 1013,
      windMeanMs: 2.5,
      rainEventsPerDay: 0.5,
    },
    power: { capacityMah: 6000, solarPeakMa: 450, initialSocPct: 85 },
  },
  {
    code: 'pivo-norte',
    name: 'Pivô Norte',
    description: 'No pivô central; pluviômetro do modelo Instructables (0,173 mm por pulso).',
    latitude: -22.6981,
    longitude: -47.6105,
    elevationM: 568,
    timezone: 'America/Sao_Paulo',
    climateSensor: 'bme280',
    rainMmPerTip: 0.173,
    windMsPerHz: 0.42,
    climate: {
      meanTempC: 22.5,
      dailyAmplitudeC: 7,
      meanPressureMslHpa: 1013,
      windMeanMs: 3.5,
      rainEventsPerDay: 0.6,
    },
    power: { capacityMah: 3000, solarPeakMa: 180, initialSocPct: 60 },
  },
  {
    code: 'talhao-sul',
    name: 'Talhão Sul',
    description:
      'Somente bateria, com painel pequeno e sombreado: entra em economia e sobrevivência.',
    latitude: -22.7614,
    longitude: -47.6687,
    elevationM: 521,
    timezone: 'America/Sao_Paulo',
    climateSensor: 'bme280',
    rainMmPerTip: 0.64,
    windMsPerHz: 0.42,
    climate: {
      meanTempC: 23.5,
      dailyAmplitudeC: 6.5,
      meanPressureMslHpa: 1013,
      windMeanMs: 2,
      rainEventsPerDay: 0.5,
    },
    power: { capacityMah: 3000, solarPeakMa: 45, initialSocPct: 28 },
  },
  {
    code: 'horta',
    name: 'Horta',
    description: 'Versão com HTU21D (sem pressão), na horta comunitária; painel de 2 W.',
    latitude: -22.7402,
    longitude: -47.6311,
    elevationM: 534,
    timezone: 'America/Sao_Paulo',
    climateSensor: 'htu21d',
    rainMmPerTip: 0.64,
    windMsPerHz: 0.42,
    climate: {
      meanTempC: 23,
      dailyAmplitudeC: 7.5,
      meanPressureMslHpa: 1013,
      windMeanMs: 1.8,
      rainEventsPerDay: 0.5,
    },
    power: { capacityMah: 3000, solarPeakMa: 300, initialSocPct: 75 },
  },
];
