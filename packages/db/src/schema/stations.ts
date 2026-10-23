import {
  CLIMATE_SENSORS,
  type ClimateSensor,
  CONNECTION_STATES,
  type ConnectionState,
  DEFAULT_CALIBRATION,
  DEFAULT_TIMEZONE,
  type DeviceConfig,
  POWER_MODES,
  type PowerMode,
  SENSOR_STATUSES,
  SENSORS,
  type Sensor,
  type SensorStatus,
} from '@wx/shared';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { createdAt, oneOf, timestamptz, updatedAt } from './helpers';

/** Station registry, edited by admins. */
export const stations = pgTable(
  'stations',
  {
    id: uuid('id').primaryKey().default(sql`uuidv7()`),
    /** Immutable; also the MQTT username and the topic segment. */
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    description: text('description'),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    /** Site elevation, used for the sea-level pressure. */
    elevationM: real('elevation_m'),
    timezone: text('timezone').notNull().default(DEFAULT_TIMEZONE),
    /** Station version: BME280 (temperature, humidity and pressure) or HTU21D (no pressure). */
    climateSensor: text('climate_sensor').$type<ClimateSensor>().notNull().default('bme280'),
    isActive: boolean('is_active').notNull().default(true),
    rainMmPerTip: real('rain_mm_per_tip').notNull().default(DEFAULT_CALIBRATION.rainMmPerTip),
    windMsPerHz: real('wind_ms_per_hz').notNull().default(DEFAULT_CALIBRATION.windMsPerHz),
    tempOffsetC: real('temp_offset_c').notNull().default(0),
    humOffsetPct: real('hum_offset_pct').notNull().default(0),
    presOffsetHpa: real('pres_offset_hpa').notNull().default(0),
    /** Desired device configuration, published retained on `weather/v1/{code}/config`. */
    deviceConfig: jsonb('device_config').$type<DeviceConfig>().notNull(),
    deviceConfigRev: integer('device_config_rev').notNull().default(1),
    mqttCredentialsSetAt: timestamptz('mqtt_credentials_set_at'),
    /**
     * Password of the configuration page the station serves on its local network. Unlike the
     * MQTT password it stays readable: admins look it up on the station page.
     */
    localPassword: text('local_password'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('stations_code_format_check', sql`${t.code} ~ '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$'`),
    check('stations_latitude_check', sql`${t.latitude} between -90 and 90`),
    check('stations_longitude_check', sql`${t.longitude} between -180 and 180`),
    check('stations_rain_factor_check', sql`${t.rainMmPerTip} > 0`),
    check('stations_wind_factor_check', sql`${t.windMsPerHz} > 0`),
    check('stations_device_config_rev_check', sql`${t.deviceConfigRev} >= 1`),
    check('stations_climate_sensor_check', oneOf(t.climateSensor, CLIMATE_SENSORS)),
  ],
);

/** Live state written by the collector (1:1 with stations). */
export const stationState = pgTable(
  'station_state',
  {
    stationId: uuid('station_id')
      .primaryKey()
      .references(() => stations.id, { onDelete: 'cascade' }),
    connection: text('connection').$type<ConnectionState>().notNull().default('unknown'),
    connectionChangedAt: timestamptz('connection_changed_at'),
    nextContactAt: timestamptz('next_contact_at'),
    lastSeenAt: timestamptz('last_seen_at'),
    lastReadingAt: timestamptz('last_reading_at'),
    lastHealthAt: timestamptz('last_health_at'),
    powerMode: text('power_mode').$type<PowerMode>(),
    batteryMv: integer('battery_mv'),
    rssi: integer('rssi'),
    firmwareVersion: text('firmware_version'),
    /** Last address the station reported on its local network. */
    ipAddress: text('ip_address'),
    configAppliedRev: integer('config_applied_rev'),
    /** Rain counter baseline (design §6.1). */
    rainRun: bigint('rain_run', { mode: 'number' }),
    rainLastCount: bigint('rain_last_count', { mode: 'number' }),
    rainLastSeq: bigint('rain_last_seq', { mode: 'number' }),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('station_state_connection_check', oneOf(t.connection, CONNECTION_STATES)),
    check('station_state_power_mode_check', oneOf(t.powerMode, POWER_MODES)),
  ],
);

/** Situation of each sensor of a station. */
export const stationSensors = pgTable(
  'station_sensors',
  {
    stationId: uuid('station_id')
      .notNull()
      .references(() => stations.id, { onDelete: 'cascade' }),
    sensor: text('sensor').$type<Sensor>().notNull(),
    status: text('status').$type<SensorStatus>().notNull().default('unknown'),
    /** Last reading with a non-null value from this sensor. */
    lastValueAt: timestamptz('last_value_at'),
    statusChangedAt: timestamptz('status_changed_at'),
    detail: text('detail'),
  },
  (t) => [
    primaryKey({ columns: [t.stationId, t.sensor] }),
    check('station_sensors_sensor_check', oneOf(t.sensor, SENSORS)),
    check('station_sensors_status_check', oneOf(t.status, SENSOR_STATUSES)),
  ],
);
