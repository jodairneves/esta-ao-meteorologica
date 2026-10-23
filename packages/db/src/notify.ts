import type {
  AlertSeverity,
  AlertStatus,
  AlertType,
  ConnectionState,
  LogLevel,
  PowerMode,
} from '@wx/shared';
import { type SQL, sql } from 'drizzle-orm';
import pg from 'pg';

// Typed LISTEN/NOTIFY channels (design §5.3). A NOTIFY issued inside a transaction is only
// delivered if the transaction commits, so listeners never see uncommitted data.

export const CHANNELS = {
  reading: 'wx_reading',
  station: 'wx_station',
  alert: 'wx_alert',
  log: 'wx_log',
  stationChanged: 'wx_station_changed',
} as const;
export type Channel = (typeof CHANNELS)[keyof typeof CHANNELS];

export interface ReadingValues {
  temperatureC: number | null;
  humidityPct: number | null;
  pressureHpa: number | null;
  pressureMslHpa: number | null;
  altitudeM: number | null;
  dewPointC: number | null;
  windSpeedMs: number | null;
  windGustMs: number | null;
  rainMm: number | null;
}

export interface ReadingNotification {
  stationId: string;
  readingId: number;
  /** ISO 8601. */
  ts: string;
  values: ReadingValues;
}

export interface StationStateSnapshot {
  connection: ConnectionState;
  connectionChangedAt: string | null;
  nextContactAt: string | null;
  lastSeenAt: string | null;
  lastReadingAt: string | null;
  powerMode: PowerMode | null;
  batteryMv: number | null;
  rssi: number | null;
  firmwareVersion: string | null;
  ipAddress: string | null;
}

export interface StationNotification {
  stationId: string;
  state: StationStateSnapshot;
}

export interface AlertNotification {
  alertId: number;
  stationId: string | null;
  type: AlertType;
  status: AlertStatus;
  severity: AlertSeverity;
}

export interface LogNotification {
  id: number;
  level: LogLevel;
  ts: string;
  stationId: string | null;
}

export interface StationChangedNotification {
  stationId: string;
}

export interface ChannelPayloads {
  wx_reading: ReadingNotification;
  wx_station: StationNotification;
  wx_alert: AlertNotification;
  wx_log: LogNotification;
  wx_station_changed: StationChangedNotification;
}

export type Notification = {
  [C in Channel]: { channel: C; payload: ChannelPayloads[C] };
}[Channel];

/** Postgres rejects NOTIFY payloads of 8000 bytes or more. */
const MAX_PAYLOAD_BYTES = 7900;

/** `select pg_notify(...)`, to run with `db.execute()` or `tx.execute()`. */
export function notifyStatement<C extends Channel>(channel: C, payload: ChannelPayloads[C]): SQL {
  const text = JSON.stringify(payload);
  if (Buffer.byteLength(text, 'utf8') > MAX_PAYLOAD_BYTES) {
    throw new Error(`NOTIFY payload on ${channel} exceeds ${MAX_PAYLOAD_BYTES} bytes`);
  }
  return sql`select pg_notify(${channel}, ${text})`;
}

export interface ListenerOptions {
  connectionString: string;
  channels: readonly Channel[];
  onNotification: (notification: Notification) => void;
  /** Called after every (re)connection: notifications sent while disconnected are lost. */
  onConnected?: () => void;
  onError?: (error: Error) => void;
  applicationName?: string;
}

export interface Listener {
  close(): Promise<void>;
}

const MAX_RECONNECT_DELAY_MS = 30_000;

/** Dedicated connection that LISTENs on the given channels and reconnects with backoff. */
export function startListener(options: ListenerOptions): Listener {
  let active: pg.Client | null = null;
  let closed = false;
  let attempt = 0;
  let timer: NodeJS.Timeout | undefined;

  const scheduleReconnect = () => {
    if (closed || timer) return;
    const delay = Math.min(MAX_RECONNECT_DELAY_MS, 500 * 2 ** attempt++);
    timer = setTimeout(() => {
      timer = undefined;
      void connect();
    }, delay);
  };

  const connect = async () => {
    const client = new pg.Client({
      connectionString: options.connectionString,
      keepAlive: true,
      application_name: options.applicationName ?? 'wx-listener',
    });

    client.on('notification', (message) => {
      if (!message.payload) return;
      try {
        const payload: unknown = JSON.parse(message.payload);
        options.onNotification({ channel: message.channel, payload } as Notification);
      } catch (error) {
        options.onError?.(error as Error);
      }
    });
    client.on('error', (error) => {
      options.onError?.(error);
      client.end().catch(() => {});
    });
    client.on('end', () => {
      // Only the active connection triggers a reconnect; failed attempts reconnect below.
      if (client !== active) return;
      active = null;
      scheduleReconnect();
    });

    try {
      await client.connect();
      for (const channel of options.channels) {
        await client.query(`LISTEN ${client.escapeIdentifier(channel)}`);
      }
      if (closed) {
        await client.end();
        return;
      }
      active = client;
      attempt = 0;
      options.onConnected?.();
    } catch (error) {
      options.onError?.(error as Error);
      client.end().catch(() => {});
      scheduleReconnect();
    }
  };

  void connect();

  return {
    async close() {
      closed = true;
      clearTimeout(timer);
      const client = active;
      active = null;
      await client?.end();
    },
  };
}
