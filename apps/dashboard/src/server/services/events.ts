import type { Notification, ReadingNotification } from '@wx/db';
import type { StreamEvent } from '../../common/api';
import type { Logger } from '../logger';

export interface StreamClient {
  send(event: StreamEvent): void;
  ping(): void;
}

/** Readings are coalesced per station: a backfill can produce thousands per second. */
const READINGS_FLUSH_MS = 1000;
const PING_MS = 20_000;

/**
 * Fans database notifications (LISTEN) out to the connected browsers (SSE). Keeps only the
 * latest reading of each station per flush window; the SPA refetches series when it needs more.
 */
export class EventHub {
  private readonly clients = new Set<StreamClient>();
  private readonly pendingReadings = new Map<string, ReadingNotification>();
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly pingTimer: NodeJS.Timeout;

  constructor(private readonly logger: Logger) {
    this.pingTimer = setInterval(() => {
      for (const client of this.clients) client.ping();
    }, PING_MS);
    this.pingTimer.unref();
  }

  get size(): number {
    return this.clients.size;
  }

  add(client: StreamClient): () => void {
    this.clients.add(client);
    return () => this.clients.delete(client);
  }

  handle(notification: Notification): void {
    switch (notification.channel) {
      case 'wx_reading':
        this.pendingReadings.set(notification.payload.stationId, notification.payload);
        this.flushTimer ??= setTimeout(() => this.flushReadings(), READINGS_FLUSH_MS);
        break;
      case 'wx_station':
        this.broadcast({ type: 'station', data: notification.payload });
        break;
      case 'wx_alert':
        this.broadcast({ type: 'alert', data: notification.payload });
        break;
      case 'wx_log':
        this.broadcast({ type: 'log', data: notification.payload });
        break;
      case 'wx_station_changed':
        break;
    }
  }

  /** Notifications may have been lost (database reconnect): tell the browsers to refetch. */
  resync(): void {
    this.broadcast({ type: 'resync', data: {} });
  }

  close(): void {
    clearInterval(this.pingTimer);
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.clients.clear();
  }

  private flushReadings(): void {
    this.flushTimer = null;
    const readings = [...this.pendingReadings.values()];
    this.pendingReadings.clear();
    if (readings.length > 0) {
      this.broadcast({
        type: 'readings',
        data: readings.map(({ stationId, readingId, ts, values }) => ({
          stationId,
          readingId,
          ts,
          values: { ...values },
        })),
      });
    }
  }

  private broadcast(event: StreamEvent): void {
    for (const client of this.clients) {
      try {
        client.send(event);
      } catch (error) {
        this.logger.debug({ err: error }, 'dropping stream client');
        this.clients.delete(client);
      }
    }
  }
}
