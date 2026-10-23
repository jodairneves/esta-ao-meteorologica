import type { DeviceSensorHealth, PowerMode } from '@wx/shared';
import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { timestamptz } from './helpers';
import { stations } from './stations';

/** One row per reading; one column per quantity (design §5.1). */
export const readings = pgTable(
  'readings',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    stationId: uuid('station_id')
      .notNull()
      .references(() => stations.id, { onDelete: 'cascade' }),
    /** End of the measured interval, as reported by the station. */
    ts: timestamptz('ts').notNull(),
    receivedAt: timestamptz('received_at').notNull().defaultNow(),
    run: bigint('run', { mode: 'number' }).notNull(),
    seq: bigint('seq', { mode: 'number' }).notNull(),
    intervalS: integer('interval_s').notNull(),
    // Calibrated values (offsets applied); null means "not measured".
    temperatureC: real('temperature_c'),
    humidityPct: real('humidity_pct'),
    pressureHpa: real('pressure_hpa'),
    // Derived values.
    pressureMslHpa: real('pressure_msl_hpa'),
    altitudeM: real('altitude_m'),
    dewPointC: real('dew_point_c'),
    windSpeedMs: real('wind_speed_ms'),
    windGustMs: real('wind_gust_ms'),
    rainMm: real('rain_mm'),
    // Raw counters as sent by the station.
    windPulses: integer('wind_pulses'),
    gustPulses: integer('gust_pulses'),
    rainCount: bigint('rain_count', { mode: 'number' }),
  },
  (t) => [
    uniqueIndex('readings_station_run_seq_uq').on(t.stationId, t.run, t.seq),
    index('readings_station_ts_idx').on(t.stationId, t.ts),
  ],
);

/** Diagnostics history from the `health` topic. */
export const deviceHealth = pgTable(
  'device_health',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    stationId: uuid('station_id')
      .notNull()
      .references(() => stations.id, { onDelete: 'cascade' }),
    ts: timestamptz('ts').notNull(),
    receivedAt: timestamptz('received_at').notNull().defaultNow(),
    firmwareVersion: text('firmware_version'),
    powerMode: text('power_mode').$type<PowerMode>(),
    resetReason: text('reset_reason'),
    batteryMv: integer('battery_mv'),
    rssi: integer('rssi'),
    heapFree: integer('heap_free'),
    heapFrag: integer('heap_frag'),
    wifiReconnects: integer('wifi_reconnects'),
    mqttReconnects: integer('mqtt_reconnects'),
    buffered: integer('buffered'),
    dropped: integer('dropped'),
    uptimeS: bigint('uptime_s', { mode: 'number' }),
    sensors: jsonb('sensors').$type<Partial<Record<string, DeviceSensorHealth>>>(),
  },
  (t) => [index('device_health_station_ts_idx').on(t.stationId, t.ts)],
);
