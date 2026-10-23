// Closed sets of values shared by the database, the collector, the dashboard and the web app.

export const ROLES = ['admin', 'operator'] as const;
export type Role = (typeof ROLES)[number];

/** Connection state of a station as tracked by the collector. */
export const CONNECTION_STATES = ['unknown', 'online', 'sleeping', 'offline'] as const;
export type ConnectionState = (typeof CONNECTION_STATES)[number];

/** Power profile currently running on the station firmware. */
export const POWER_MODES = ['normal', 'economy', 'survival'] as const;
export type PowerMode = (typeof POWER_MODES)[number];

/** Power profile selection sent in the device config (`auto` switches by battery voltage). */
export const POWER_CONFIG_MODES = ['auto', 'normal', 'economy'] as const;
export type PowerConfigMode = (typeof POWER_CONFIG_MODES)[number];

/** How the rain gauge input is counted: every state change or only falling edges. */
export const RAIN_EDGES = ['change', 'falling'] as const;
export type RainEdge = (typeof RAIN_EDGES)[number];

/**
 * Temperature/humidity sensor a station is built with: BME280 (the full version, which also
 * measures pressure) or HTU21D (temperature and humidity only).
 */
export const CLIMATE_SENSORS = ['bme280', 'htu21d'] as const;
export type ClimateSensor = (typeof CLIMATE_SENSORS)[number];

export const SENSORS = ['bme280', 'htu21d', 'anemometer', 'rain_gauge', 'battery'] as const;
export type Sensor = (typeof SENSORS)[number];

export const SENSOR_STATUSES = [
  'unknown',
  'ok',
  'stale',
  'error',
  'not_measured',
  'disabled',
] as const;
export type SensorStatus = (typeof SENSOR_STATUSES)[number];

export const ALERT_TYPES = [
  'station_offline',
  'sensor_stale',
  'sensor_error',
  'battery_low',
  'battery_critical',
  'data_dropped',
  'collector_down',
] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

export const ALERT_SEVERITIES = ['info', 'warning', 'critical'] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export const ALERT_STATUSES = ['active', 'resolved'] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'critical'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export const LOG_SOURCES = ['collector', 'dashboard', 'device'] as const;
export type LogSource = (typeof LOG_SOURCES)[number];

export const LOG_CATEGORIES = [
  'ingest',
  'mqtt',
  'station',
  'sensor',
  'power',
  'command',
  'config',
  'auth',
  'audit',
  'system',
] as const;
export type LogCategory = (typeof LOG_CATEGORIES)[number];

/** Commands the dashboard can send to a station (topic `cmd`). */
export const COMMANDS = ['reboot', 'identify', 'flush', 'health'] as const;
export type Command = (typeof COMMANDS)[number];

export const COMMAND_STATUSES = ['sent', 'acked', 'failed', 'expired'] as const;
export type CommandStatus = (typeof COMMAND_STATUSES)[number];

export const SERVICES = ['collector', 'dashboard'] as const;
export type Service = (typeof SERVICES)[number];
