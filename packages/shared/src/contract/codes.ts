/** Event codes emitted by the station firmware on the `event` topic (design §3.6). */
export const DEVICE_EVENT_CODES = [
  'BOOT',
  'MODE_CHANGED',
  'SENSOR_FAILED',
  'SENSOR_RECOVERED',
  'BUFFER_OVERFLOW',
  'NTP_FAILED',
  'CONFIG_APPLIED',
  'CONFIG_REJECTED',
  'CMD_ACK',
] as const;
export type DeviceEventCode = (typeof DEVICE_EVENT_CODES)[number];

/** Codes written to `event_logs` by the collector (design §7.5). */
export const COLLECTOR_LOG_CODES = [
  'PAYLOAD_INVALID',
  'UNKNOWN_STATION',
  'STATION_INACTIVE',
  'READING_TS_OUT_OF_RANGE',
  'VALUE_OUT_OF_RANGE',
  'RAIN_COUNTER_ANOMALY',
  'STATION_ONLINE',
  'STATION_SLEEPING',
  'STATION_OFFLINE',
  'STATION_OVERDUE',
  'SENSOR_STALE',
  'MQTT_CONNECTED',
  'MQTT_DISCONNECTED',
  'DB_ERROR',
  'COLLECTOR_STARTED',
  'COLLECTOR_STOPPED',
] as const;
export type CollectorLogCode = (typeof COLLECTOR_LOG_CODES)[number];
