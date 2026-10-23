import { CLIMATE_SENSORS, type ClimateSensor, type HealthMessage } from '@wx/shared';

export const CLIMATE_SENSOR_NAMES: Record<ClimateSensor, string> = {
  bme280: 'BME280',
  htu21d: 'HTU21D',
};

/** The climate sensor the station says is working, when exactly one of them is. */
export function installedClimateSensor(
  message: Pick<HealthMessage, 'sensors'>,
): ClimateSensor | null {
  const working = CLIMATE_SENSORS.filter((sensor) => message.sensors[sensor] === 'ok');
  return working.length === 1 ? (working[0] ?? null) : null;
}
