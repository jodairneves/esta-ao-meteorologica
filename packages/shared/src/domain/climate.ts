import type { ClimateSensor, Sensor } from './enums';

/** What each climate sensor measures. Only the BME280 has a barometer. */
export const CLIMATE_SENSOR_MEASURES: Record<ClimateSensor, { pressure: boolean }> = {
  bme280: { pressure: true },
  htu21d: { pressure: false },
};

export const measuresPressure = (sensor: ClimateSensor): boolean =>
  CLIMATE_SENSOR_MEASURES[sensor].pressure;

export const isClimateSensor = (sensor: Sensor): sensor is ClimateSensor =>
  sensor === 'bme280' || sensor === 'htu21d';
