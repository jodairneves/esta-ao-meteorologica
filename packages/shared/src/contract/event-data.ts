import { z } from 'zod';
import { POWER_MODES, type Sensor } from '../domain/enums';

// `data` payloads of the station events the server acts upon (design §3.6).

/** Sensor names used by the firmware in `health.sensors` and in sensor events. */
export const DEVICE_SENSOR_KEYS = ['bme280', 'wind', 'rain'] as const;
export type DeviceSensorKey = (typeof DEVICE_SENSOR_KEYS)[number];

export const SENSOR_BY_DEVICE_KEY: Record<DeviceSensorKey, Sensor> = {
  bme280: 'bme280',
  wind: 'anemometer',
  rain: 'rain_gauge',
};

export const cmdAckDataSchema = z.object({
  id: z.uuid(),
  ok: z.boolean(),
  detail: z.string().max(200).optional(),
});
export type CmdAckData = z.infer<typeof cmdAckDataSchema>;

export const configAppliedDataSchema = z.object({ rev: z.int().min(1) });

export const configRejectedDataSchema = z.object({
  rev: z.int().min(1),
  reason: z.string().max(200).optional(),
});

export const sensorEventDataSchema = z.object({
  sensor: z.enum(DEVICE_SENSOR_KEYS),
  detail: z.string().max(200).optional(),
});

export const modeChangedDataSchema = z.object({
  from: z.enum(POWER_MODES).optional(),
  to: z.enum(POWER_MODES),
  bat_mv: z.int().min(0).max(10_000).optional(),
});
