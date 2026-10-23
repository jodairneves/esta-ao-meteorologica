import type { Database } from '@wx/db';
import type { MonitoringSettings } from '@wx/shared';
import type { Logger } from '../logger';
import type { ConsumedMessage } from '../mqtt/consumer';
import type { StationCache } from '../stations/cache';
import type { CollectorStats } from '../stats';
import type { RateLimiter } from '../util/rate-limiter';

export type IncomingMessage = ConsumedMessage;

export interface IngestContext {
  db: Database;
  cache: StationCache;
  logger: Logger;
  stats: CollectorStats;
  /** Throttles repetitive log entries (per station and problem). */
  limiter: RateLimiter;
  monitoringSettings: () => Promise<MonitoringSettings>;
}
