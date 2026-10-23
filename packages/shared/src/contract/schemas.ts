import { z } from 'zod';
import { COMMANDS, POWER_CONFIG_MODES, POWER_MODES, RAIN_EDGES } from '../domain/enums';
import { MAX_READINGS_PER_MESSAGE } from './ranges';

// MQTT payloads, contract v1 (design §3). Unknown keys are stripped so newer firmware
// can add fields without breaking older servers. Missing optional values default to null.

export const PROTOCOL_VERSION = 1;

const version = z.literal(PROTOCOL_VERSION);
const uint32 = z.int().min(0).max(0xffff_ffff);
const epochSeconds = z.int().min(0);
const optionalCount = z.int().min(0).nullable().default(null);

// ---- telemetry (station → server) ----------------------------------------------------------

export const telemetryReadingSchema = z.object({
  seq: uint32,
  ts: epochSeconds,
  dur: z.int().min(1).max(3600),
  temp: z.number().nullable().default(null),
  hum: z.number().nullable().default(null),
  pres: z.number().nullable().default(null),
  wind_p: z.int().min(0).nullable().default(null),
  gust_p: z.int().min(0).nullable().default(null),
  rain_c: uint32.nullable().default(null),
});
export type TelemetryReading = z.infer<typeof telemetryReadingSchema>;

export const telemetryMessageSchema = z.object({
  v: version,
  run: uint32,
  readings: z.array(telemetryReadingSchema).min(1).max(MAX_READINGS_PER_MESSAGE),
});
export type TelemetryMessage = z.infer<typeof telemetryMessageSchema>;

// ---- status (station → server, retained; "offline" is the LWT) -----------------------------

export const REPORTED_CONNECTION_STATES = ['online', 'sleeping', 'offline'] as const;

export const statusMessageSchema = z.object({
  v: version,
  state: z.enum(REPORTED_CONNECTION_STATES),
  ts: epochSeconds.nullable().default(null),
  mode: z.enum(POWER_MODES).nullable().default(null),
  next: epochSeconds.nullable().default(null),
  fw: z.string().max(32).nullable().default(null),
});
export type StatusMessage = z.infer<typeof statusMessageSchema>;

// ---- health (station → server) -------------------------------------------------------------

export const DEVICE_SENSOR_HEALTH = ['ok', 'error', 'absent', 'disabled'] as const;
export type DeviceSensorHealth = (typeof DEVICE_SENSOR_HEALTH)[number];

const sensorHealth = z.enum(DEVICE_SENSOR_HEALTH).optional();

export const healthMessageSchema = z.object({
  v: version,
  ts: epochSeconds,
  fw: z.string().min(1).max(32),
  mode: z.enum(POWER_MODES),
  bat_mv: z.int().min(0).max(10_000).nullable().default(null),
  rssi: z.int().min(-127).max(0).nullable().default(null),
  heap: optionalCount,
  heap_frag: z.int().min(0).max(100).nullable().default(null),
  uptime: optionalCount,
  reset: z.string().max(64).nullable().default(null),
  wifi_reconn: optionalCount,
  mqtt_reconn: optionalCount,
  buf: optionalCount,
  dropped: optionalCount,
  sensors: z
    .object({ bme280: sensorHealth, htu21d: sensorHealth, wind: sensorHealth, rain: sensorHealth })
    .default({}),
  cfg_rev: z.int().min(0).nullable().default(null),
});
export type HealthMessage = z.infer<typeof healthMessageSchema>;

// ---- event (station → server) --------------------------------------------------------------

export const DEVICE_LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export const EVENT_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;

export const deviceEventMessageSchema = z.object({
  v: version,
  ts: epochSeconds.nullable().default(null),
  level: z.enum(DEVICE_LOG_LEVELS),
  code: z.string().regex(EVENT_CODE_PATTERN),
  msg: z.string().max(500),
  data: z.record(z.string(), z.unknown()).nullable().default(null),
});
export type DeviceEventMessage = z.infer<typeof deviceEventMessageSchema>;

// ---- config (server → station, retained) ---------------------------------------------------

export const powerConfigSchema = z
  .object({
    mode: z.enum(POWER_CONFIG_MODES),
    economy_below_mv: z.int().min(3000).max(4200),
    survival_below_mv: z.int().min(3000).max(4200),
    recover_above_mv: z.int().min(3000).max(4300),
    bat_full_scale_mv: z.int().min(3000).max(6000),
  })
  .refine(
    (p) => p.survival_below_mv < p.economy_below_mv && p.economy_below_mv < p.recover_above_mv,
    { message: 'Expected survival_below_mv < economy_below_mv < recover_above_mv' },
  );

const deviceConfigShape = {
  interval_s: z.int().min(10).max(3600),
  health_s: z.int().min(60).max(86_400),
  economy_batch_s: z.int().min(60).max(3600),
  survival_sleep_s: z.int().min(300).max(10_800),
  rain_edge: z.enum(RAIN_EDGES),
  power: powerConfigSchema,
};

function checkBatchInterval(
  config: { interval_s: number; economy_batch_s: number },
  ctx: z.RefinementCtx,
): void {
  if (config.economy_batch_s < config.interval_s) {
    ctx.addIssue({
      code: 'custom',
      path: ['economy_batch_s'],
      message: 'economy_batch_s must be greater than or equal to interval_s',
    });
  }
}

/** Desired station configuration as stored in `stations.device_config`. */
export const deviceConfigSchema = z.object(deviceConfigShape).superRefine(checkBatchInterval);
export type DeviceConfig = z.infer<typeof deviceConfigSchema>;

export const configMessageSchema = z
  .object({ v: version, rev: z.int().min(1), ...deviceConfigShape })
  .superRefine(checkBatchInterval);
export type ConfigMessage = z.infer<typeof configMessageSchema>;

// ---- cmd (server → station) ----------------------------------------------------------------

export const commandMessageSchema = z.object({
  v: version,
  id: z.uuid(),
  cmd: z.enum(COMMANDS),
  exp: epochSeconds,
  args: z.record(z.string(), z.unknown()).default({}),
});
export type CommandMessage = z.infer<typeof commandMessageSchema>;

// ---- decoding ------------------------------------------------------------------------------

export const STATION_MESSAGE_SCHEMAS = {
  telemetry: telemetryMessageSchema,
  status: statusMessageSchema,
  health: healthMessageSchema,
  event: deviceEventMessageSchema,
} as const;

export type StationMessageKind = keyof typeof STATION_MESSAGE_SCHEMAS;
export type StationMessage<K extends StationMessageKind> = z.infer<
  (typeof STATION_MESSAGE_SCHEMAS)[K]
>;

export type DecodeResult<T> = { ok: true; message: T } | { ok: false; error: string };

const textDecoder = new TextDecoder('utf-8', { fatal: true });

/** Decodes and validates a payload published by a station. Never throws. */
export function decodeStationMessage<K extends StationMessageKind>(
  kind: K,
  payload: Uint8Array | string,
): DecodeResult<StationMessage<K>> {
  let json: unknown;
  try {
    const text = typeof payload === 'string' ? payload : textDecoder.decode(payload);
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Payload is not valid UTF-8 JSON' };
  }
  const parsed = STATION_MESSAGE_SCHEMAS[kind].safeParse(json);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  return { ok: true, message: parsed.data as StationMessage<K> };
}
