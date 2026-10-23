// HTTP contract between the dashboard server and the SPA: request schemas (validated on the
// server, reused by forms) and response types. Dates travel as ISO 8601 strings.
import {
  type AlertSeverity,
  type AlertStatus,
  type AlertType,
  COMMANDS,
  type Command,
  type CommandStatus,
  type ConnectionState,
  type DeviceConfig,
  deviceConfigSchema,
  type LogCategory,
  type LogLevel,
  type LogSource,
  type MonitoringSettings,
  monitoringSettingsSchema,
  type PowerMode,
  type PressureTrend,
  type RetentionSettings,
  ROLES,
  type Role,
  retentionSettingsSchema,
  SERIES_BUCKETS,
  type Sensor,
  type SensorStatus,
  type SeriesBucket,
  STATION_CODE_PATTERN,
} from '@wx/shared';
import { z } from 'zod';

export const API_PREFIX = '/api/v1';
/** Custom header required on every state-changing request (CSRF protection). */
export const CSRF_HEADER = 'x-wx-request';

const email = z.email('E-mail inválido').trim().toLowerCase();

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone });
    return true;
  } catch {
    return false;
  }
}

// ---- auth --------------------------------------------------------------------------------

export const loginBodySchema = z.object({
  email,
  password: z.string().min(1, 'Informe a senha'),
  remember: z.boolean().default(false),
});

export const passwordSchema = z
  .string()
  .min(10, 'A senha precisa ter pelo menos 10 caracteres')
  .max(200, 'Senha longa demais');

export const changePasswordBodySchema = z.object({
  currentPassword: z.string().min(1, 'Informe a senha atual'),
  newPassword: passwordSchema,
});

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  mustChangePassword: boolean;
}

// ---- users -------------------------------------------------------------------------------

export const createUserBodySchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome').max(100),
  email,
  role: z.enum(ROLES),
});

export const updateUserBodySchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    role: z.enum(ROLES).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Nada para alterar');

export interface UserSummary {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface TemporaryPasswordResponse {
  user: UserSummary;
  temporaryPassword: string;
}

// ---- stations ----------------------------------------------------------------------------

const stationFields = {
  name: z.string().trim().min(2, 'Informe o nome').max(80),
  description: z.string().trim().max(500).nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  elevationM: z.number().min(-500).max(9000).nullable(),
  timezone: z.string().refine(isValidTimeZone, 'Fuso horário inválido'),
  rainMmPerTip: z.number().positive().max(10),
  windMsPerHz: z.number().positive().max(10),
  tempOffsetC: z.number().min(-10).max(10),
  humOffsetPct: z.number().min(-20).max(20),
  presOffsetHpa: z.number().min(-30).max(30),
};

export const createStationBodySchema = z.object({
  ...stationFields,
  code: z
    .string()
    .regex(STATION_CODE_PATTERN, 'Use 3 a 32 letras minúsculas, números ou hífens')
    .optional(),
  description: stationFields.description.optional(),
  latitude: stationFields.latitude.optional(),
  longitude: stationFields.longitude.optional(),
  elevationM: stationFields.elevationM.optional(),
  timezone: stationFields.timezone.optional(),
  rainMmPerTip: stationFields.rainMmPerTip.optional(),
  windMsPerHz: stationFields.windMsPerHz.optional(),
  tempOffsetC: stationFields.tempOffsetC.optional(),
  humOffsetPct: stationFields.humOffsetPct.optional(),
  presOffsetHpa: stationFields.presOffsetHpa.optional(),
});
export type CreateStationBody = z.input<typeof createStationBodySchema>;

export const updateStationBodySchema = z
  .object({ ...stationFields, isActive: z.boolean() })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Nada para alterar');
export type UpdateStationBody = z.input<typeof updateStationBodySchema>;

export const deleteStationBodySchema = z.object({ confirmCode: z.string() });

export const deviceConfigBodySchema = deviceConfigSchema;

export const commandBodySchema = z.object({
  command: z.enum(COMMANDS),
  ttlMinutes: z.int().min(1).max(1440).default(60),
});

/** Status shown in the UI, combining the connection state and the "no contact" alert. */
export type StationStatus =
  | 'online'
  | 'sleeping'
  | 'offline'
  | 'no_contact'
  | 'unknown'
  | 'inactive';

export interface StationStateDto {
  connection: ConnectionState;
  connectionChangedAt: string | null;
  nextContactAt: string | null;
  lastSeenAt: string | null;
  lastReadingAt: string | null;
  powerMode: PowerMode | null;
  batteryMv: number | null;
  batteryPct: number | null;
  rssi: number | null;
  firmwareVersion: string | null;
}

export interface LatestValues {
  ts: string;
  temperatureC: number | null;
  humidityPct: number | null;
  pressureHpa: number | null;
  pressureMslHpa: number | null;
  dewPointC: number | null;
  windSpeedMs: number | null;
  windGustMs: number | null;
}

export interface StationSummary {
  id: string;
  code: string;
  name: string;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  elevationM: number | null;
  timezone: string;
  isActive: boolean;
  status: StationStatus;
  statusSeverity: AlertSeverity | null;
  state: StationStateDto;
  latest: LatestValues | null;
  rainTodayMm: number | null;
  /** Hourly mean temperature of the last 24 hours, oldest first. */
  sparkline: (number | null)[];
  activeAlerts: Record<AlertSeverity, number>;
}

export interface SensorDto {
  sensor: Sensor;
  status: SensorStatus;
  lastValueAt: string | null;
  statusChangedAt: string | null;
  detail: string | null;
}

export interface AlertDto {
  id: number;
  stationId: string | null;
  stationCode: string | null;
  stationName: string | null;
  type: AlertType;
  subject: string;
  severity: AlertSeverity;
  status: AlertStatus;
  message: string;
  details: Record<string, unknown> | null;
  startedAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
}

export interface StationDetail extends StationSummary {
  rainMmPerTip: number;
  windMsPerHz: number;
  tempOffsetC: number;
  humOffsetPct: number;
  presOffsetHpa: number;
  deviceConfig: DeviceConfig;
  deviceConfigRev: number;
  configAppliedRev: number | null;
  mqttCredentialsSetAt: string | null;
  createdAt: string;
  sensors: SensorDto[];
  alerts: AlertDto[];
}

export interface StationCredentials {
  username: string;
  password: string;
  clientId: string;
  host: string;
  port: number;
  tls: boolean;
}

export interface CreateStationResponse {
  station: StationDetail;
  credentials: StationCredentials;
}

export interface CommandDto {
  id: string;
  command: Command;
  status: CommandStatus;
  createdAt: string;
  expiresAt: string;
  ackedAt: string | null;
  createdBy: string | null;
  result: Record<string, unknown> | null;
}

// ---- data --------------------------------------------------------------------------------

export const rangeQuerySchema = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});

export const seriesQuerySchema = rangeQuerySchema.extend({
  bucket: z.enum(['auto', ...SERIES_BUCKETS]).default('auto'),
});

export const METRICS = [
  'temperature',
  'humidity',
  'pressure',
  'pressureMsl',
  'dewPoint',
  'wind',
  'gust',
  'rain',
] as const;
export type Metric = (typeof METRICS)[number];

export const heatmapQuerySchema = rangeQuerySchema.extend({
  metric: z.enum(METRICS).default('temperature'),
});

export const compareQuerySchema = seriesQuerySchema.extend({
  stations: z
    .string()
    .transform((value) => value.split(',').filter(Boolean))
    .pipe(z.array(z.string()).min(1).max(6)),
  metric: z.enum(METRICS).default('temperature'),
});

export interface LatestResponse {
  reading: {
    ts: string;
    intervalS: number;
    temperatureC: number | null;
    humidityPct: number | null;
    pressureHpa: number | null;
    pressureMslHpa: number | null;
    altitudeM: number | null;
    dewPointC: number | null;
    windSpeedMs: number | null;
    windGustMs: number | null;
    rainMm: number | null;
  } | null;
  derived: {
    feelsLikeC: number | null;
    beaufort: { force: number; label: string } | null;
    pressureChange3hHpa: number | null;
    pressureTrend: PressureTrend | null;
    rainRateMmH: number | null;
  };
  today: {
    tempMinC: number | null;
    tempMinAt: string | null;
    tempMaxC: number | null;
    tempMaxAt: string | null;
    gustMaxMs: number | null;
  };
  rain: {
    lastHourMm: number | null;
    todayMm: number | null;
    last24hMm: number | null;
    last7dMm: number | null;
    monthMm: number | null;
    yearMm: number | null;
  };
}

/** Aggregated statistics of a series; raw points only fill `avg`. */
export interface SeriesStat {
  avg: (number | null)[];
  min?: (number | null)[];
  max?: (number | null)[];
}

export interface SeriesResponse {
  bucket: SeriesBucket;
  from: string;
  to: string;
  /** Start of each bucket (or the reading time, for raw), epoch ms. */
  t: number[];
  temperature: SeriesStat;
  humidity: SeriesStat;
  pressure: SeriesStat;
  pressureMsl: SeriesStat;
  dewPoint: SeriesStat;
  wind: SeriesStat;
  gust: SeriesStat;
  rain: SeriesStat;
}

export interface DailyRow {
  day: string;
  tempMin: number | null;
  tempMax: number | null;
  tempAvg: number | null;
  humidityAvg: number | null;
  pressureMslAvg: number | null;
  rainMm: number | null;
  windAvg: number | null;
  gustMax: number | null;
  readings: number;
}

export interface HeatmapResponse {
  metric: Metric;
  days: string[];
  /** [day index, local hour, value]. */
  cells: [number, number, number][];
}

export interface CompareResponse {
  bucket: SeriesBucket;
  metric: Metric;
  series: {
    stationId: string;
    code: string;
    name: string;
    t: number[];
    values: (number | null)[];
  }[];
}

export interface HealthPoint {
  ts: string;
  batteryMv: number | null;
  rssi: number | null;
  heapFree: number | null;
  uptimeS: number | null;
  powerMode: PowerMode | null;
  resetReason: string | null;
  buffered: number | null;
  dropped: number | null;
}

export interface ConnectionEvent {
  ts: string;
  code: string;
  message: string;
}

export interface DeviceOverview {
  station: StationSummary;
  sensors: SensorDto[];
  lastHealth: HealthPoint | null;
}

// ---- alerts and logs ---------------------------------------------------------------------

export const alertsQuerySchema = z.object({
  status: z.enum(['active', 'resolved', 'all']).default('active'),
  stationId: z.string().optional(),
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const logsQuerySchema = rangeQuerySchema.extend({
  level: z.enum(['info', 'warn', 'error', 'critical']).optional(),
  source: z.enum(['collector', 'dashboard', 'device']).optional(),
  category: z.string().optional(),
  stationId: z.string().optional(),
  q: z.string().trim().max(100).optional(),
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export interface LogDto {
  id: number;
  ts: string;
  level: LogLevel;
  source: LogSource;
  category: LogCategory;
  code: string;
  message: string;
  stationId: string | null;
  stationName: string | null;
  userEmail: string | null;
  details: Record<string, unknown> | null;
}

export interface Page<T> {
  items: T[];
  nextCursor: number | null;
}

// ---- system ------------------------------------------------------------------------------

export interface SystemStatus {
  collector: {
    online: boolean;
    lastBeatAt: string;
    startedAt: string;
    version: string;
    stats: Record<string, unknown>;
  } | null;
  dashboard: { version: string; startedAt: string; sseClients: number };
  broker: {
    connected: boolean;
    clients: number | null;
    uptime: string | null;
    version: string | null;
  };
  database: { sizeBytes: number; readingsEstimate: number };
  stations: Record<StationStatus | 'total', number>;
  alerts: { active: number; critical: number };
}

export interface SettingsDto {
  monitoring: MonitoringSettings;
  retention: RetentionSettings;
}

export const updateSettingsBodySchema = z
  .object({ monitoring: monitoringSettingsSchema, retention: retentionSettingsSchema })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Nada para alterar');

// ---- server-sent events ------------------------------------------------------------------

export type StreamEvent =
  | {
      type: 'readings';
      data: {
        stationId: string;
        readingId: number;
        ts: string;
        values: Record<string, number | null>;
      }[];
    }
  | { type: 'station'; data: { stationId: string; state: Omit<StationStateDto, 'batteryPct'> } }
  | {
      type: 'alert';
      data: {
        alertId: number;
        stationId: string | null;
        type: AlertType;
        status: AlertStatus;
        severity: AlertSeverity;
      };
    }
  | { type: 'log'; data: { id: number; level: LogLevel; ts: string; stationId: string | null } }
  | { type: 'resync'; data: Record<string, never> };

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}
