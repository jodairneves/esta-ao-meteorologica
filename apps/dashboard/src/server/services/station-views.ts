import {
  alerts,
  and,
  type Database,
  desc,
  eq,
  inArray,
  type SQL,
  sql,
  stationSensors,
  stations,
  users,
} from '@wx/db';
import {
  type AlertSeverity,
  type ClimateSensor,
  type ConnectionState,
  type DeviceConfig,
  liIonPercent,
  type PowerMode,
} from '@wx/shared';
import type {
  AlertDto,
  SensorDto,
  StationDetail,
  StationStatus,
  StationSummary,
} from '../../common/api';
import { notFound } from '../http';
import { toIso } from './sql-values';

export const iso = (date: Date | null | undefined): string | null => date?.toISOString() ?? null;

interface SummaryRow extends Record<string, unknown> {
  id: string;
  code: string;
  name: string;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  elevation_m: number | null;
  timezone: string;
  climate_sensor: ClimateSensor;
  is_active: boolean;
  connection: ConnectionState | null;
  connection_changed_at: unknown;
  next_contact_at: unknown;
  last_seen_at: unknown;
  last_reading_at: unknown;
  power_mode: PowerMode | null;
  battery_mv: number | null;
  rssi: number | null;
  firmware_version: string | null;
  r_ts: unknown;
  temperature_c: number | null;
  humidity_pct: number | null;
  pressure_hpa: number | null;
  pressure_msl_hpa: number | null;
  dew_point_c: number | null;
  wind_speed_ms: number | null;
  wind_gust_ms: number | null;
  rain_today: number | null;
}

function deriveStatus(
  isActive: boolean,
  connection: ConnectionState | null,
  offlineSeverity: AlertSeverity | undefined,
): { status: StationStatus; severity: AlertSeverity | null } {
  if (!isActive) return { status: 'inactive', severity: null };
  if (offlineSeverity) return { status: 'no_contact', severity: offlineSeverity };
  return { status: connection ?? 'unknown', severity: null };
}

const HOUR_MS = 3_600_000;

/** Station cards: state, latest values, today's rain, 24 h sparkline and active alerts. */
export async function listStationSummaries(
  db: Database,
  onlyIds?: readonly string[],
): Promise<StationSummary[]> {
  const filter = onlyIds ? sql`where s.id in ${[...onlyIds]}` : sql``;
  const { rows } = await db.execute<SummaryRow>(sql`
    select s.id, s.code, s.name, s.description, s.latitude, s.longitude, s.elevation_m,
           s.timezone, s.climate_sensor, s.is_active,
           st.connection, st.connection_changed_at, st.next_contact_at, st.last_seen_at,
           st.last_reading_at, st.power_mode, st.battery_mv, st.rssi, st.firmware_version,
           r.ts as r_ts, r.temperature_c, r.humidity_pct, r.pressure_hpa, r.pressure_msl_hpa,
           r.dew_point_c, r.wind_speed_ms, r.wind_gust_ms,
           (select sum(rr.rain_mm) from readings rr
             where rr.station_id = s.id
               and rr.ts >= (date_trunc('day', now() at time zone s.timezone) at time zone s.timezone)
           ) as rain_today
    from stations s
    left join station_state st on st.station_id = s.id
    left join lateral (
      select * from readings where station_id = s.id order by ts desc limit 1
    ) r on true
    ${filter}
    order by s.name`);
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const now = Date.now();
  const firstHour = Math.floor(now / HOUR_MS) * HOUR_MS - 23 * HOUR_MS;

  const { rows: sparkRows } = await db.execute<{
    station_id: string;
    t: number;
    v: number | null;
  }>(sql`
    select station_id,
           (extract(epoch from date_bin('1 hour', ts, timestamptz '2000-01-01 00:00:00+00')) * 1000)::float8 as t,
           avg(temperature_c) as v
    from readings
    where station_id in ${ids} and ts >= ${new Date(firstHour)}
    group by 1, 2`);
  const sparklines = new Map(ids.map((id) => [id, Array<number | null>(24).fill(null)]));
  for (const point of sparkRows) {
    const slot = Math.round((point.t - firstHour) / HOUR_MS);
    const line = sparklines.get(point.station_id);
    if (line && slot >= 0 && slot < 24) line[slot] = point.v === null ? null : round(point.v, 1);
  }

  const alertRows = await db
    .select({ stationId: alerts.stationId, type: alerts.type, severity: alerts.severity })
    .from(alerts)
    .where(and(eq(alerts.status, 'active'), inArray(alerts.stationId, ids)));

  return rows.map((row) => {
    const readingTs = toIso(row.r_ts);
    const own = alertRows.filter((alert) => alert.stationId === row.id);
    const counts: Record<AlertSeverity, number> = { info: 0, warning: 0, critical: 0 };
    for (const alert of own) counts[alert.severity]++;
    const offline = own.find((alert) => alert.type === 'station_offline');
    const { status, severity } = deriveStatus(row.is_active, row.connection, offline?.severity);

    return {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      latitude: row.latitude,
      longitude: row.longitude,
      elevationM: row.elevation_m,
      timezone: row.timezone,
      climateSensor: row.climate_sensor,
      isActive: row.is_active,
      status,
      statusSeverity: severity,
      state: {
        connection: row.connection ?? 'unknown',
        connectionChangedAt: toIso(row.connection_changed_at),
        nextContactAt: toIso(row.next_contact_at),
        lastSeenAt: toIso(row.last_seen_at),
        lastReadingAt: toIso(row.last_reading_at),
        powerMode: row.power_mode,
        batteryMv: row.battery_mv,
        batteryPct: row.battery_mv === null ? null : liIonPercent(row.battery_mv),
        rssi: row.rssi,
        firmwareVersion: row.firmware_version,
      },
      latest: readingTs
        ? {
            ts: readingTs,
            temperatureC: row.temperature_c,
            humidityPct: row.humidity_pct,
            pressureHpa: row.pressure_hpa,
            pressureMslHpa: row.pressure_msl_hpa,
            dewPointC: row.dew_point_c,
            windSpeedMs: row.wind_speed_ms,
            windGustMs: row.wind_gust_ms,
          }
        : null,
      rainTodayMm: row.rain_today === null ? null : round(row.rain_today, 2),
      sparkline: sparklines.get(row.id) ?? [],
      activeAlerts: counts,
    };
  });
}

export function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Accepts the station uuid or its code (the SPA uses codes in its URLs). */
export async function findStation(db: Database, idOrCode: string) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrCode);
  const [station] = await db
    .select()
    .from(stations)
    .where(isUuid ? eq(stations.id, idOrCode) : eq(stations.code, idOrCode));
  if (!station) throw notFound('Estação não encontrada');
  return station;
}

export async function listAlerts(
  db: Database,
  where: SQL | undefined,
  limit = 100,
): Promise<AlertDto[]> {
  const rows = await db
    .select({
      alert: alerts,
      stationCode: stations.code,
      stationName: stations.name,
      acknowledgedBy: users.email,
    })
    .from(alerts)
    .leftJoin(stations, eq(stations.id, alerts.stationId))
    .leftJoin(users, eq(users.id, alerts.acknowledgedBy))
    .where(where)
    .orderBy(desc(alerts.id))
    .limit(limit);

  return rows.map(({ alert, stationCode, stationName, acknowledgedBy }) => ({
    id: alert.id,
    stationId: alert.stationId,
    stationCode,
    stationName,
    type: alert.type,
    subject: alert.subject,
    severity: alert.severity,
    status: alert.status,
    message: alert.message,
    details: alert.details,
    startedAt: alert.startedAt.toISOString(),
    updatedAt: alert.updatedAt.toISOString(),
    resolvedAt: iso(alert.resolvedAt),
    acknowledgedAt: iso(alert.acknowledgedAt),
    acknowledgedBy,
  }));
}

export async function listSensors(db: Database, stationId: string): Promise<SensorDto[]> {
  const rows = await db
    .select()
    .from(stationSensors)
    .where(eq(stationSensors.stationId, stationId))
    .orderBy(stationSensors.sensor);
  return rows.map((row) => ({
    sensor: row.sensor,
    status: row.status,
    lastValueAt: iso(row.lastValueAt),
    statusChangedAt: iso(row.statusChangedAt),
    detail: row.detail,
  }));
}

export async function getStationDetail(db: Database, idOrCode: string): Promise<StationDetail> {
  const station = await findStation(db, idOrCode);
  const [summary] = await listStationSummaries(db, [station.id]);
  if (!summary) throw notFound('Estação não encontrada');
  const [state] = await db
    .execute<{ config_applied_rev: number | null }>(
      sql`select config_applied_rev from station_state where station_id = ${station.id}`,
    )
    .then((result) => result.rows);

  return {
    ...summary,
    rainMmPerTip: station.rainMmPerTip,
    windMsPerHz: station.windMsPerHz,
    tempOffsetC: station.tempOffsetC,
    humOffsetPct: station.humOffsetPct,
    presOffsetHpa: station.presOffsetHpa,
    deviceConfig: station.deviceConfig as DeviceConfig,
    deviceConfigRev: station.deviceConfigRev,
    configAppliedRev: state?.config_applied_rev ?? null,
    mqttCredentialsSetAt: iso(station.mqttCredentialsSetAt),
    createdAt: station.createdAt.toISOString(),
    sensors: await listSensors(db, station.id),
    alerts: await listAlerts(
      db,
      and(eq(alerts.stationId, station.id), eq(alerts.status, 'active')),
    ),
  };
}
