import { type Database, serviceHeartbeats } from '@wx/db';

export interface HeartbeatInfo {
  instanceId: string;
  version: string;
  startedAt: Date;
  stats: Record<string, unknown>;
}

/** Proof of life read by the dashboard (collector_down alert, system page). */
export async function writeHeartbeat(db: Database, info: HeartbeatInfo): Promise<void> {
  const values = {
    instanceId: info.instanceId,
    version: info.version,
    startedAt: info.startedAt,
    lastBeatAt: new Date(),
    stats: info.stats,
  };
  await db
    .insert(serviceHeartbeats)
    .values({ service: 'collector', ...values })
    .onConflictDoUpdate({ target: serviceHeartbeats.service, set: values });
}
