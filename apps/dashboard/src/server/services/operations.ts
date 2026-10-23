import {
  alerts,
  and,
  CHANNELS,
  type Database,
  desc,
  eq,
  eventLogs,
  getSettings,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  lte,
  notifyStatement,
  or,
  serviceHeartbeats,
  settings,
  sql,
  stations,
  users,
} from '@wx/db';
import { LOG_LEVELS, type LogLevel, SETTINGS_KEYS, type SettingsKey } from '@wx/shared';
import type { z } from 'zod';
import type {
  AlertDto,
  ConnectionEvent,
  DeviceOverview,
  LogDto,
  logsQuerySchema,
  Page,
  SessionUser,
  SettingsDto,
  StationStatus,
  SystemStatus,
  updateSettingsBodySchema,
} from '../../common/api';
import { notFound } from '../http';
import { audit } from './audit';
import type { BrokerAdmin } from './broker';
import { getLastHealth } from './readings';
import { listAlerts, listSensors, listStationSummaries } from './station-views';

export const COLLECTOR_ONLINE_WITHIN_MS = 120_000;

// ---- alerts -------------------------------------------------------------------------------

export async function pageAlerts(
  db: Database,
  query: {
    status: 'active' | 'resolved' | 'all';
    stationId?: string;
    cursor?: number;
    limit: number;
  },
): Promise<Page<AlertDto>> {
  const items = await listAlerts(
    db,
    and(
      query.status === 'all' ? undefined : eq(alerts.status, query.status),
      query.stationId ? eq(alerts.stationId, query.stationId) : undefined,
      query.cursor ? lt(alerts.id, query.cursor) : undefined,
    ),
    query.limit + 1,
  );
  const hasMore = items.length > query.limit;
  const page = items.slice(0, query.limit);
  return { items: page, nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null };
}

export async function acknowledgeAlert(
  db: Database,
  id: number,
  actor: SessionUser,
): Promise<AlertDto> {
  const [row] = await db
    .update(alerts)
    .set({ acknowledgedAt: new Date(), acknowledgedBy: actor.id })
    .where(and(eq(alerts.id, id), isNull(alerts.acknowledgedAt)))
    .returning();
  if (row) {
    await db.execute(
      notifyStatement(CHANNELS.alert, {
        alertId: row.id,
        stationId: row.stationId,
        type: row.type,
        status: row.status,
        severity: row.severity,
      }),
    );
    await audit(db, {
      userId: actor.id,
      code: 'ALERT_ACKNOWLEDGED',
      message: `Alerta reconhecido: ${row.message}`,
      stationId: row.stationId,
      details: { alertId: row.id },
    });
  }
  const [alert] = await listAlerts(db, eq(alerts.id, id), 1);
  if (!alert) throw notFound('Alerta não encontrado');
  return alert;
}

// ---- logs ---------------------------------------------------------------------------------

/** Minimum level filter: "warn" also returns error and critical. */
const levelsFrom = (level: LogLevel) => LOG_LEVELS.slice(LOG_LEVELS.indexOf(level));

export async function pageLogs(
  db: Database,
  query: z.output<typeof logsQuerySchema>,
): Promise<Page<LogDto>> {
  const pattern = query.q ? `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : undefined;
  const rows = await db
    .select({ log: eventLogs, stationName: stations.name, userEmail: users.email })
    .from(eventLogs)
    .leftJoin(stations, eq(stations.id, eventLogs.stationId))
    .leftJoin(users, eq(users.id, eventLogs.userId))
    .where(
      and(
        query.level ? inArray(eventLogs.level, levelsFrom(query.level)) : undefined,
        query.source ? eq(eventLogs.source, query.source) : undefined,
        query.category
          ? eq(eventLogs.category, query.category as typeof eventLogs.$inferSelect.category)
          : undefined,
        query.stationId ? eq(eventLogs.stationId, query.stationId) : undefined,
        query.from ? gte(eventLogs.ts, new Date(query.from)) : undefined,
        query.to ? lte(eventLogs.ts, new Date(query.to)) : undefined,
        pattern ? or(ilike(eventLogs.message, pattern), ilike(eventLogs.code, pattern)) : undefined,
        query.cursor ? lt(eventLogs.id, query.cursor) : undefined,
      ),
    )
    .orderBy(desc(eventLogs.id))
    .limit(query.limit + 1);

  const hasMore = rows.length > query.limit;
  const items = rows.slice(0, query.limit).map(({ log, stationName, userEmail }) => ({
    id: log.id,
    ts: log.ts.toISOString(),
    level: log.level,
    source: log.source,
    category: log.category,
    code: log.code,
    message: log.message,
    stationId: log.stationId,
    stationName,
    userEmail,
    details: log.details,
  }));
  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

// ---- devices ------------------------------------------------------------------------------

export async function listDevices(db: Database): Promise<DeviceOverview[]> {
  const summaries = await listStationSummaries(db);
  return Promise.all(
    summaries.map(async (station) => ({
      station,
      sensors: await listSensors(db, station.id),
      lastHealth: await getLastHealth(db, station.id),
    })),
  );
}

const CONNECTION_CODES = [
  'STATION_ONLINE',
  'STATION_OFFLINE',
  'STATION_SLEEPING',
  'STATION_OVERDUE',
];

export async function getConnectionEvents(
  db: Database,
  stationId: string,
  range: { from: Date; to: Date },
): Promise<ConnectionEvent[]> {
  const rows = await db
    .select({ ts: eventLogs.ts, code: eventLogs.code, message: eventLogs.message })
    .from(eventLogs)
    .where(
      and(
        eq(eventLogs.stationId, stationId),
        inArray(eventLogs.code, CONNECTION_CODES),
        gte(eventLogs.ts, range.from),
        lt(eventLogs.ts, range.to),
      ),
    )
    .orderBy(eventLogs.ts)
    .limit(1000);
  return rows.map((row) => ({ ts: row.ts.toISOString(), code: row.code, message: row.message }));
}

// ---- system -------------------------------------------------------------------------------

export async function getSystemStatus(
  db: Database,
  broker: BrokerAdmin,
  dashboard: { version: string; startedAt: Date; sseClients: number },
): Promise<SystemStatus> {
  const [collector] = await db
    .select()
    .from(serviceHeartbeats)
    .where(eq(serviceHeartbeats.service, 'collector'));

  const { rows: dbRows } = await db.execute<{ size: number; readings: number }>(sql`
    select pg_database_size(current_database())::float8 as size,
           greatest((select reltuples from pg_class where relname = 'readings'), 0)::float8 as readings`);

  const summaries = await listStationSummaries(db);
  const stationCounts: SystemStatus['stations'] = {
    total: summaries.length,
    online: 0,
    sleeping: 0,
    offline: 0,
    no_contact: 0,
    unknown: 0,
    inactive: 0,
  };
  for (const station of summaries) stationCounts[station.status as StationStatus]++;

  const activeAlerts = await db
    .select({ severity: alerts.severity })
    .from(alerts)
    .where(eq(alerts.status, 'active'));

  return {
    collector: collector
      ? {
          online: Date.now() - collector.lastBeatAt.getTime() < COLLECTOR_ONLINE_WITHIN_MS,
          lastBeatAt: collector.lastBeatAt.toISOString(),
          startedAt: collector.startedAt.toISOString(),
          version: collector.version,
          stats: collector.stats,
        }
      : null,
    dashboard: {
      version: dashboard.version,
      startedAt: dashboard.startedAt.toISOString(),
      sseClients: dashboard.sseClients,
    },
    broker: { connected: broker.connected, ...broker.info },
    database: {
      sizeBytes: dbRows[0]?.size ?? 0,
      readingsEstimate: Math.round(dbRows[0]?.readings ?? 0),
    },
    stations: stationCounts,
    alerts: {
      active: activeAlerts.length,
      critical: activeAlerts.filter((alert) => alert.severity === 'critical').length,
    },
  };
}

// ---- settings -----------------------------------------------------------------------------

export async function readSettings(db: Database): Promise<SettingsDto> {
  return {
    monitoring: await getSettings(db, 'monitoring'),
    retention: await getSettings(db, 'retention'),
  };
}

export async function writeSettings(
  db: Database,
  input: z.output<typeof updateSettingsBodySchema>,
  actor: SessionUser,
): Promise<SettingsDto> {
  await db.transaction(async (tx) => {
    for (const key of SETTINGS_KEYS) {
      const value = input[key as SettingsKey];
      if (!value) continue;
      await tx
        .insert(settings)
        .values({ key, value, updatedBy: actor.id })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value, updatedAt: new Date(), updatedBy: actor.id },
        });
    }
    await audit(tx, {
      userId: actor.id,
      code: 'SETTINGS_UPDATED',
      message: 'Configurações do sistema alteradas',
      details: { changes: input },
    });
  });
  return readSettings(db);
}
