import {
  ALERT_SEVERITIES,
  ALERT_STATUSES,
  ALERT_TYPES,
  type AlertSeverity,
  type AlertStatus,
  type AlertType,
  COMMAND_STATUSES,
  COMMANDS,
  type Command,
  type CommandStatus,
  LOG_CATEGORIES,
  LOG_LEVELS,
  LOG_SOURCES,
  type LogCategory,
  type LogLevel,
  type LogSource,
  SERVICES,
  type Service,
} from '@wx/shared';
import { sql } from 'drizzle-orm';
import { bigint, check, index, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { oneOf, timestamptz } from './helpers';
import { stations } from './stations';

export const alerts = pgTable(
  'alerts',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    /** Null for system-wide alerts (e.g. collector_down). */
    stationId: uuid('station_id').references(() => stations.id, { onDelete: 'cascade' }),
    type: text('type').$type<AlertType>().notNull(),
    /** Distinguishes alerts of the same type (e.g. the sensor name); empty for station alerts. */
    subject: text('subject').notNull().default(''),
    severity: text('severity').$type<AlertSeverity>().notNull(),
    status: text('status').$type<AlertStatus>().notNull().default('active'),
    message: text('message').notNull(),
    details: jsonb('details').$type<Record<string, unknown>>(),
    startedAt: timestamptz('started_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
    resolvedAt: timestamptz('resolved_at'),
    acknowledgedAt: timestamptz('acknowledged_at'),
    acknowledgedBy: uuid('acknowledged_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [
    check('alerts_type_check', oneOf(t.type, ALERT_TYPES)),
    check('alerts_severity_check', oneOf(t.severity, ALERT_SEVERITIES)),
    check('alerts_status_check', oneOf(t.status, ALERT_STATUSES)),
    // At most one active alert per condition (station alerts and system alerts).
    uniqueIndex('alerts_active_station_condition_uq')
      .on(t.stationId, t.type, t.subject)
      .where(sql`status = 'active' and station_id is not null`),
    uniqueIndex('alerts_active_system_condition_uq')
      .on(t.type, t.subject)
      .where(sql`status = 'active' and station_id is null`),
    index('alerts_status_started_idx').on(t.status, t.startedAt),
    index('alerts_station_started_idx').on(t.stationId, t.startedAt),
  ],
);

/** The system's own log: device events, ingestion errors and user audit trail. */
export const eventLogs = pgTable(
  'event_logs',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    ts: timestamptz('ts').notNull().defaultNow(),
    level: text('level').$type<LogLevel>().notNull(),
    source: text('source').$type<LogSource>().notNull(),
    category: text('category').$type<LogCategory>().notNull(),
    code: text('code').notNull(),
    message: text('message').notNull(),
    stationId: uuid('station_id').references(() => stations.id, { onDelete: 'set null' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    details: jsonb('details').$type<Record<string, unknown>>(),
  },
  (t) => [
    check('event_logs_level_check', oneOf(t.level, LOG_LEVELS)),
    check('event_logs_source_check', oneOf(t.source, LOG_SOURCES)),
    check('event_logs_category_check', oneOf(t.category, LOG_CATEGORIES)),
    index('event_logs_ts_idx').on(t.ts),
    index('event_logs_station_ts_idx').on(t.stationId, t.ts),
    index('event_logs_level_ts_idx').on(t.level, t.ts),
  ],
);

export const commands = pgTable(
  'commands',
  {
    /** Sent to the station as the `id` field of the `cmd` message. */
    id: uuid('id').primaryKey().default(sql`uuidv7()`),
    stationId: uuid('station_id')
      .notNull()
      .references(() => stations.id, { onDelete: 'cascade' }),
    command: text('command').$type<Command>().notNull(),
    args: jsonb('args').$type<Record<string, unknown>>(),
    status: text('status').$type<CommandStatus>().notNull().default('sent'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    expiresAt: timestamptz('expires_at').notNull(),
    ackedAt: timestamptz('acked_at'),
    result: jsonb('result').$type<Record<string, unknown>>(),
  },
  (t) => [
    check('commands_command_check', oneOf(t.command, COMMANDS)),
    check('commands_status_check', oneOf(t.status, COMMAND_STATUSES)),
    index('commands_station_created_idx').on(t.stationId, t.createdAt),
  ],
);

export const serviceHeartbeats = pgTable(
  'service_heartbeats',
  {
    service: text('service').$type<Service>().primaryKey(),
    instanceId: text('instance_id').notNull(),
    version: text('version').notNull(),
    startedAt: timestamptz('started_at').notNull(),
    lastBeatAt: timestamptz('last_beat_at').notNull(),
    stats: jsonb('stats').$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [check('service_heartbeats_service_check', oneOf(t.service, SERVICES))],
);

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<unknown>().notNull(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
});
