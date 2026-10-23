import { resolve } from 'node:path';
import { z } from 'zod';

const flag = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

/**
 * How stations log in to the broker (design §3.10):
 * - `per-station`: our own Mosquitto; the dashboard gives each station a login of its own
 *   (Dynamic Security) and confines it to its topics;
 * - `shared`: a broker run by someone else, with one login for everyone (stations included).
 */
const mqttEnvSchema = z.discriminatedUnion('MQTT_AUTH_MODE', [
  z.object({
    MQTT_AUTH_MODE: z.literal('per-station'),
    /** The Dynamic Security admin, created by Mosquitto from MOSQUITTO_DYNSEC_PASSWORD. */
    MQTT_ADMIN_USERNAME: z.string().min(1).default('admin'),
    MOSQUITTO_DYNSEC_PASSWORD: z.string().min(12),
    MQTT_COLLECTOR_PASSWORD: z.string().min(1),
  }),
  z.object({
    MQTT_AUTH_MODE: z.literal('shared'),
    MQTT_USERNAME: z.string().min(1),
    MQTT_PASSWORD: z.string().min(1),
  }),
]);

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  MQTT_URL: z.string().min(1),
  /** First administrator, created only while the users table is empty. */
  ADMIN_EMAIL: z.email().optional(),
  ADMIN_PASSWORD: z.string().min(10).optional(),
  ADMIN_NAME: z.string().min(1).default('Administrador'),
  /** Public URL of the dashboard: allowed Origin and secure cookies when https. */
  APP_URL: z.url(),
  /** Shown in the station setup instructions. */
  PUBLIC_MQTT_HOST: z.string().min(1).optional(),
  PUBLIC_MQTT_PORT: z.coerce.number().int().min(1).max(65_535).default(8883),
  PUBLIC_MQTT_TLS: flag.default(true),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  TRUST_PROXY: flag.default(false),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  MIGRATIONS_DIR: z.string().min(1).optional(),
  /** Built SPA to serve in production; unset in development (Vite serves it). */
  WEB_DIST: z.string().min(1).optional(),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(12),
  SESSION_REMEMBER_DAYS: z.coerce.number().int().min(1).max(365).default(30),
});

export type LogLevel = z.infer<typeof envSchema>['LOG_LEVEL'];

export type MqttConfig =
  | {
      mode: 'per-station';
      url: string;
      adminUsername: string;
      adminPassword: string;
      collectorPassword: string;
    }
  | { mode: 'shared'; url: string; username: string; password: string };

export interface DashboardConfig {
  databaseUrl: string;
  migrationsFolder?: string;
  mqtt: MqttConfig;
  firstAdmin: { email: string; password: string; name: string } | null;
  appUrl: URL;
  publicMqtt: { host: string; port: number; tls: boolean };
  host: string;
  port: number;
  trustProxy: boolean;
  logLevel: LogLevel;
  webDist?: string;
  session: { ttlMs: number; rememberMs: number; secureCookie: boolean };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): DashboardConfig {
  const parsed = envSchema.safeParse(env);
  const mqttParsed = mqttEnvSchema.safeParse({ MQTT_AUTH_MODE: 'per-station', ...env });
  if (!parsed.success || !mqttParsed.success) {
    const errors = [parsed.error, mqttParsed.error].flatMap((error) =>
      error ? [z.prettifyError(error)] : [],
    );
    throw new Error(`Invalid dashboard configuration:\n${errors.join('\n')}`);
  }
  const e = parsed.data;
  const m = mqttParsed.data;
  const appUrl = new URL(e.APP_URL);
  return {
    databaseUrl: e.DATABASE_URL,
    migrationsFolder: e.MIGRATIONS_DIR,
    mqtt:
      m.MQTT_AUTH_MODE === 'per-station'
        ? {
            mode: 'per-station',
            url: e.MQTT_URL,
            adminUsername: m.MQTT_ADMIN_USERNAME,
            adminPassword: m.MOSQUITTO_DYNSEC_PASSWORD,
            collectorPassword: m.MQTT_COLLECTOR_PASSWORD,
          }
        : { mode: 'shared', url: e.MQTT_URL, username: m.MQTT_USERNAME, password: m.MQTT_PASSWORD },
    firstAdmin:
      e.ADMIN_EMAIL && e.ADMIN_PASSWORD
        ? { email: e.ADMIN_EMAIL.toLowerCase(), password: e.ADMIN_PASSWORD, name: e.ADMIN_NAME }
        : null,
    appUrl,
    publicMqtt: {
      host: e.PUBLIC_MQTT_HOST ?? appUrl.hostname,
      port: e.PUBLIC_MQTT_PORT,
      tls: e.PUBLIC_MQTT_TLS,
    },
    host: e.HOST,
    port: e.PORT,
    trustProxy: e.TRUST_PROXY,
    logLevel: e.LOG_LEVEL,
    webDist: e.WEB_DIST ? resolve(e.WEB_DIST) : undefined,
    session: {
      ttlMs: e.SESSION_TTL_HOURS * 3_600_000,
      rememberMs: e.SESSION_REMEMBER_DAYS * 86_400_000,
      secureCookie: appUrl.protocol === 'https:',
    },
  };
}
