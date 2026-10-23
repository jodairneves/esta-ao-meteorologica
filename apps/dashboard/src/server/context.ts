import type { Database } from '@wx/db';
import type { DashboardConfig } from './config';
import type { Logger } from './logger';
import type { BrokerAdmin } from './services/broker';
import type { EventHub } from './services/events';

/** Everything the HTTP layer needs; built once in main.ts (or by the tests). */
export interface AppDeps {
  config: DashboardConfig;
  db: Database;
  logger: Logger;
  broker: BrokerAdmin;
  hub: EventHub;
  version: string;
  startedAt: Date;
}
