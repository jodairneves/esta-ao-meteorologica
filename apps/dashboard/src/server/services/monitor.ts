import {
  and,
  commands,
  type Database,
  eq,
  lt,
  openAlert,
  resolveAlerts,
  serviceHeartbeats,
} from '@wx/db';
import { DEFAULT_TIMEZONE } from '@wx/shared';
import { deleteExpiredSessions } from '../auth/sessions';
import type { Logger } from '../logger';
import type { BrokerAdmin } from './broker';
import type { EventHub } from './events';
import { COLLECTOR_ONLINE_WITHIN_MS } from './operations';

export interface MonitorDeps {
  db: Database;
  logger: Logger;
  hub: EventHub;
  broker: BrokerAdmin;
  instanceId: string;
  version: string;
  startedAt: Date;
}

const formatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: DEFAULT_TIMEZONE,
  dateStyle: 'short',
  timeStyle: 'short',
});

/** The collector cannot report its own death: the dashboard watches its heartbeat. */
export async function checkCollector(db: Database, now = new Date()): Promise<void> {
  const [beat] = await db
    .select()
    .from(serviceHeartbeats)
    .where(eq(serviceHeartbeats.service, 'collector'));

  if (beat && now.getTime() - beat.lastBeatAt.getTime() < COLLECTOR_ONLINE_WITHIN_MS) {
    await resolveAlerts(db, { stationId: null, type: 'collector_down' });
    return;
  }
  await openAlert(db, {
    stationId: null,
    type: 'collector_down',
    severity: 'critical',
    message: beat
      ? `Coletor (App 1) sem sinal de vida desde ${formatter.format(beat.lastBeatAt)}: as leituras não estão sendo gravadas`
      : 'Coletor (App 1) nunca enviou sinal de vida: as leituras não estão sendo gravadas',
    details: { lastBeatAt: beat?.lastBeatAt.toISOString() ?? null },
  });
}

/** Commands the station never confirmed stop counting as pending. */
export async function expireCommands(db: Database, now = new Date()): Promise<void> {
  await db
    .update(commands)
    .set({ status: 'expired' })
    .where(and(eq(commands.status, 'sent'), lt(commands.expiresAt, now)));
}

export function startMonitor(deps: MonitorDeps): () => void {
  const { db, logger } = deps;
  const run = (name: string, task: () => Promise<unknown>) =>
    task().catch((error) => logger.error({ err: error }, `${name} failed`));

  const heartbeat = () =>
    db
      .insert(serviceHeartbeats)
      .values({
        service: 'dashboard',
        instanceId: deps.instanceId,
        version: deps.version,
        startedAt: deps.startedAt,
        lastBeatAt: new Date(),
        stats: { sseClients: deps.hub.size, mqttConnected: deps.broker.connected },
      })
      .onConflictDoUpdate({
        target: serviceHeartbeats.service,
        set: {
          instanceId: deps.instanceId,
          version: deps.version,
          startedAt: deps.startedAt,
          lastBeatAt: new Date(),
          stats: { sseClients: deps.hub.size, mqttConnected: deps.broker.connected },
        },
      });

  const timers = [
    setInterval(() => {
      run('collector check', () => checkCollector(db));
      run('command expiry', () => expireCommands(db));
    }, 60_000),
    setInterval(() => run('heartbeat', heartbeat), 30_000),
    setInterval(
      () =>
        run('session cleanup', async () => {
          const removed = await deleteExpiredSessions(db);
          if (removed > 0) logger.info({ removed }, 'expired sessions removed');
        }),
      3_600_000,
    ),
  ];
  for (const timer of timers) timer.unref();
  run('heartbeat', heartbeat);

  return () => {
    for (const timer of timers) clearInterval(timer);
  };
}
