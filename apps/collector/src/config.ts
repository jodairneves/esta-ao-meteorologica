import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  MQTT_URL: z.string().min(1),
  MQTT_COLLECTOR_USERNAME: z.string().min(1).default('collector'),
  MQTT_COLLECTOR_PASSWORD: z.string().min(1),
  MQTT_COLLECTOR_CLIENT_ID: z.string().min(1).default('collector'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Only needed when running from a bundle (production image). */
  MIGRATIONS_DIR: z.string().min(1).optional(),
  /** Touched after each heartbeat reaches the database: the container health check reads it. */
  HEALTH_FILE: z.string().min(1).optional(),
  MONITOR_INTERVAL_S: z.coerce.number().int().min(5).default(60),
  HEARTBEAT_INTERVAL_S: z.coerce.number().int().min(5).default(30),
  RETENTION_INTERVAL_H: z.coerce.number().int().min(1).default(6),
});

export type LogLevel = z.infer<typeof envSchema>['LOG_LEVEL'];

export interface CollectorConfig {
  databaseUrl: string;
  migrationsFolder?: string;
  healthFile?: string;
  mqtt: { url: string; username: string; password: string; clientId: string };
  logLevel: LogLevel;
  /** 0 disables the periodic task (tests call it directly). */
  monitorIntervalMs: number;
  heartbeatIntervalMs: number;
  retentionIntervalMs: number;
  /** Backoff while waiting for the database to come back. */
  dbRetry: { minMs: number; maxMs: number };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): CollectorConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid collector configuration:\n${z.prettifyError(parsed.error)}`);
  }
  const e = parsed.data;
  return {
    databaseUrl: e.DATABASE_URL,
    migrationsFolder: e.MIGRATIONS_DIR,
    healthFile: e.HEALTH_FILE,
    mqtt: {
      url: e.MQTT_URL,
      username: e.MQTT_COLLECTOR_USERNAME,
      password: e.MQTT_COLLECTOR_PASSWORD,
      clientId: e.MQTT_COLLECTOR_CLIENT_ID,
    },
    logLevel: e.LOG_LEVEL,
    monitorIntervalMs: e.MONITOR_INTERVAL_S * 1000,
    heartbeatIntervalMs: e.HEARTBEAT_INTERVAL_S * 1000,
    retentionIntervalMs: e.RETENTION_INTERVAL_H * 3_600_000,
    dbRetry: { minMs: 1000, maxMs: 30_000 },
  };
}
