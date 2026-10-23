import { type Database, type SQL, sql } from '@wx/db';
import type { RetentionSettings } from '@wx/shared';

const BATCH = 5000;
const DAY_MS = 86_400_000;

/** Deletes in small batches so retention never holds long locks on busy tables. */
async function deleteInBatches(db: Database, buildStatement: () => SQL): Promise<number> {
  let total = 0;
  for (;;) {
    const result = await db.execute(buildStatement());
    const deleted = result.rowCount ?? 0;
    total += deleted;
    if (deleted < BATCH) return total;
  }
}

/** Applies the retention policy (design §5.2); returns how many rows were deleted per kind. */
export async function applyRetention(
  db: Database,
  settings: RetentionSettings,
  now = new Date(),
): Promise<Record<string, number>> {
  const before = (days: number) => new Date(now.getTime() - days * DAY_MS);
  const logsBefore = before(settings.logsDays);
  const auditBefore = before(settings.auditDays);
  const healthBefore = before(settings.healthDays);

  const deleted: Record<string, number> = {
    eventLogs: await deleteInBatches(
      db,
      () => sql`delete from event_logs where id in (
        select id from event_logs where category <> 'audit' and ts < ${logsBefore} limit ${BATCH})`,
    ),
    auditLogs: await deleteInBatches(
      db,
      () => sql`delete from event_logs where id in (
        select id from event_logs where category = 'audit' and ts < ${auditBefore} limit ${BATCH})`,
    ),
    deviceHealth: await deleteInBatches(
      db,
      () => sql`delete from device_health where id in (
        select id from device_health where ts < ${healthBefore} limit ${BATCH})`,
    ),
    alerts: await deleteInBatches(
      db,
      () => sql`delete from alerts where id in (
        select id from alerts where status = 'resolved' and resolved_at < ${logsBefore} limit ${BATCH})`,
    ),
    commands: await deleteInBatches(
      db,
      () => sql`delete from commands where id in (
        select id from commands where created_at < ${logsBefore} limit ${BATCH})`,
    ),
  };

  if (settings.readingsDays !== null) {
    const readingsBefore = before(settings.readingsDays);
    deleted.readings = await deleteInBatches(
      db,
      () => sql`delete from readings where id in (
        select id from readings where ts < ${readingsBefore} limit ${BATCH})`,
    );
  }
  return deleted;
}
