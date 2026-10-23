import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { CHANNELS, createDb, createPool, prepareDatabase, sql, startListener } from '@wx/db';
import { buildApp } from './app';
import { ensureFirstAdmin } from './auth/first-admin';
import { loadConfig } from './config';
import { createLogger } from './logger';
import { BrokerAdmin } from './services/broker';
import { EventHub } from './services/events';
import { startMonitor } from './services/monitor';
import { VERSION } from './version';

const config = loadConfig();
const logger = createLogger(config.logLevel);
const startedAt = new Date();

const pool = createPool(config.databaseUrl, {
  max: 10,
  applicationName: 'wx-dashboard',
  statementTimeoutMs: 30_000,
  onError: (error) => logger.warn({ err: error }, 'idle database connection failed'),
});
const db = createDb(pool);

// The database may still be starting (docker compose): wait for it instead of crashing.
for (let attempt = 1; ; attempt++) {
  try {
    await db.execute(sql`select 1`);
    break;
  } catch (error) {
    if (attempt >= 30) throw error;
    logger.warn({ attempt }, 'waiting for the database');
    await delay(2000);
  }
}
await prepareDatabase(pool, config.migrationsFolder);
await ensureFirstAdmin(db, config, logger);

const broker = new BrokerAdmin(config.mqtt, logger);
broker.start();

const hub = new EventHub(logger);
const listener = startListener({
  connectionString: config.databaseUrl,
  channels: [CHANNELS.reading, CHANNELS.station, CHANNELS.alert, CHANNELS.log],
  applicationName: 'wx-dashboard-listen',
  onNotification: (notification) => hub.handle(notification),
  onConnected: () => hub.resync(),
  onError: (error) => logger.warn({ err: error }, 'database listener error'),
});

const app = await buildApp({ config, db, logger, broker, hub, version: VERSION, startedAt });
const stopMonitor = startMonitor({
  db,
  logger,
  hub,
  broker,
  instanceId: randomUUID(),
  version: VERSION,
  startedAt,
});

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'shutting down');
  stopMonitor();
  await app.close();
  hub.close();
  await listener.close();
  await broker.stop();
  await pool.end();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host: config.host, port: config.port });
logger.info({ port: config.port, version: VERSION }, 'dashboard listening');
