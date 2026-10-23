import { randomUUID } from 'node:crypto';
import {
  CHANNELS,
  createDb,
  createPool,
  getSettings,
  type Listener,
  prepareDatabase,
  startListener,
} from '@wx/db';
import { COLLECTOR_TOPIC_FILTERS, type MonitoringSettings } from '@wx/shared';
import type { CollectorConfig } from './config';
import { writeHeartbeat } from './heartbeat';
import type { IngestContext } from './ingest/context';
import { routeMessage } from './ingest/router';
import type { Logger } from './logger';
import { type MonitorReport, runMonitorTick } from './monitor/monitor';
import { applyRetention } from './monitor/retention';
import { type ConsumedMessage, type FailureDecision, MqttConsumer } from './mqtt/consumer';
import { StationCache } from './stations/cache';
import { CollectorStats } from './stats';
import { type LogEntry, writeLog } from './store/event-log';
import { previewPayload } from './util/format';
import { RateLimiter } from './util/rate-limiter';
import { sleep } from './util/sleep';
import { VERSION } from './version';

export interface Collector {
  start(): Promise<void>;
  stop(): Promise<void>;
  runMonitorOnce(now?: Date): Promise<MonitorReport>;
  runRetentionOnce(now?: Date): Promise<Record<string, number>>;
  readonly stats: CollectorStats;
}

const SETTINGS_TTL_MS = 60_000;
const LOG_THROTTLE_WINDOW_MS = 10 * 60_000;

export function createCollector(config: CollectorConfig, logger: Logger): Collector {
  const pool = createPool(config.databaseUrl, {
    max: 5,
    applicationName: 'wx-collector',
    statementTimeoutMs: 15_000,
    onError: (error) => logger.warn({ err: error }, 'idle database connection failed'),
  });
  const db = createDb(pool);
  const stats = new CollectorStats();
  const cache = new StationCache(db);
  const instanceId = randomUUID();
  const lifecycle = new AbortController();
  const timers: NodeJS.Timeout[] = [];
  let listener: Listener | null = null;
  let outageStartedAt: number | null = null;

  let cachedSettings: { value: MonitoringSettings; at: number } | null = null;
  const monitoringSettings = async (): Promise<MonitoringSettings> => {
    if (cachedSettings && Date.now() - cachedSettings.at < SETTINGS_TTL_MS) {
      return cachedSettings.value;
    }
    const value = await getSettings(db, 'monitoring');
    cachedSettings = { value, at: Date.now() };
    return value;
  };

  const ctx: IngestContext = {
    db,
    cache,
    logger,
    stats,
    limiter: new RateLimiter(LOG_THROTTLE_WINDOW_MS),
    monitoringSettings,
  };

  /** Best-effort log entry: the database may be the thing that is failing. */
  const log = (entry: LogEntry) =>
    writeLog(db, entry).catch((error) => logger.warn({ err: error }, 'could not write event log'));

  const isDatabaseHealthy = async () => {
    try {
      await pool.query('select 1');
      return true;
    } catch {
      return false;
    }
  };

  const waitForDatabase = async (signal: AbortSignal) => {
    let delay = config.dbRetry.minMs;
    while (!signal.aborted && !(await isDatabaseHealthy())) {
      logger.warn({ retryInMs: delay }, 'database unavailable');
      await sleep(delay, signal);
      delay = Math.min(delay * 2, config.dbRetry.maxMs);
    }
  };

  const onFailure = async (
    error: unknown,
    message: ConsumedMessage,
    attempt: number,
  ): Promise<FailureDecision> => {
    if (!(await isDatabaseHealthy())) {
      if (outageStartedAt === null) {
        outageStartedAt = Date.now();
        stats.dbOutages++;
      }
      logger.error({ err: error }, 'database unavailable: pausing MQTT consumption');
      return 'pause';
    }
    if (attempt < 2) return 'retry';

    // The database works but this message keeps failing: a bug or unexpected data.
    stats.rejected++;
    logger.error({ err: error, topic: message.topic }, 'dropping message after repeated failure');
    await log({
      level: 'error',
      category: 'ingest',
      code: 'PROCESSING_FAILED',
      message: `Falha ao processar mensagem de ${message.topic}; mensagem descartada`,
      details: { error: String(error), payload: previewPayload(message.payload) },
    });
    return 'drop';
  };

  const consumer = new MqttConsumer({
    ...config.mqtt,
    topics: COLLECTOR_TOPIC_FILTERS,
    handle: (message) => routeMessage(ctx, message),
    onFailure,
    waitUntilReady: async (signal) => {
      await waitForDatabase(signal);
      if (outageStartedAt === null || signal.aborted) return;
      const seconds = Math.round((Date.now() - outageStartedAt) / 1000);
      outageStartedAt = null;
      await log({
        level: 'error',
        category: 'system',
        code: 'DB_ERROR',
        message: `Banco de dados ficou indisponível por ~${seconds} s; a coleta foi pausada e retomada sem perda (mensagens retidas no broker)`,
        details: { outageSeconds: seconds },
      });
    },
    onConnectionChange: (connected) => {
      if (connected === stats.mqttConnected) return;
      stats.mqttConnected = connected;
      if (stats.paused || lifecycle.signal.aborted) return;
      void log(
        connected
          ? {
              level: 'info',
              category: 'mqtt',
              code: 'MQTT_CONNECTED',
              message: 'Coletor conectado ao broker MQTT',
            }
          : {
              level: 'warn',
              category: 'mqtt',
              code: 'MQTT_DISCONNECTED',
              message: 'Coletor perdeu a conexão com o broker MQTT; reconectando',
            },
      );
    },
    onPauseChange: (paused) => {
      stats.paused = paused;
    },
    logger,
  });

  const heartbeat = () =>
    writeHeartbeat(db, {
      instanceId,
      version: VERSION,
      startedAt: stats.startedAt,
      stats: stats.toJSON(),
    }).catch((error) => logger.warn({ err: error }, 'heartbeat failed'));

  const runMonitorOnce = (now?: Date) => runMonitorTick({ db, logger, monitoringSettings }, now);

  const runRetentionOnce = async (now?: Date) =>
    applyRetention(db, await getSettings(db, 'retention'), now);

  const every = (intervalMs: number, task: () => Promise<unknown>, name: string) => {
    if (intervalMs <= 0) return;
    const timer = setInterval(() => {
      task().catch((error) => logger.error({ err: error }, `${name} failed`));
    }, intervalMs);
    timer.unref();
    timers.push(timer);
  };

  return {
    stats,
    runMonitorOnce,
    runRetentionOnce,

    async start() {
      logger.info({ version: VERSION }, 'starting collector');
      await waitForDatabase(lifecycle.signal);
      await prepareDatabase(pool, config.migrationsFolder);
      await cache.loadAll();

      listener = startListener({
        connectionString: config.databaseUrl,
        channels: [CHANNELS.stationChanged],
        applicationName: 'wx-collector-listen',
        onNotification: (notification) => {
          if (notification.channel !== CHANNELS.stationChanged) return;
          cache.refresh(notification.payload.stationId).catch((error) => {
            logger.warn({ err: error }, 'station cache refresh failed');
          });
        },
        // Notifications may have been missed while disconnected: reload everything.
        onConnected: () => {
          cache
            .loadAll()
            .catch((error) => logger.warn({ err: error }, 'station cache reload failed'));
        },
        onError: (error) => logger.warn({ err: error }, 'database listener error'),
      });

      consumer.start();
      every(config.monitorIntervalMs, runMonitorOnce, 'monitor');
      every(config.heartbeatIntervalMs, heartbeat, 'heartbeat');
      every(
        config.retentionIntervalMs,
        async () => logger.info({ deleted: await runRetentionOnce() }, 'retention applied'),
        'retention',
      );

      await heartbeat();
      await log({
        level: 'info',
        category: 'system',
        code: 'COLLECTOR_STARTED',
        message: `Coletor iniciado (versão ${VERSION}, ${cache.size} estação(ões) cadastrada(s))`,
      });
      logger.info({ stations: cache.size }, 'collector started');
    },

    async stop() {
      lifecycle.abort();
      for (const timer of timers) clearInterval(timer);
      await consumer.stop();
      await listener?.close();
      await heartbeat();
      await log({
        level: 'info',
        category: 'system',
        code: 'COLLECTOR_STOPPED',
        message: 'Coletor encerrado',
      });
      await pool.end();
      logger.info('collector stopped');
    },
  };
}
