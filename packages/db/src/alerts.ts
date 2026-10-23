import type { AlertSeverity, AlertType } from '@wx/shared';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Executor } from './client';
import { CHANNELS, notifyStatement } from './notify';
import { alerts } from './schema';

type AlertRow = typeof alerts.$inferSelect;

export interface AlertSpec {
  /** null for system alerts. */
  stationId: string | null;
  type: AlertType;
  /** Distinguishes alerts of the same type, e.g. the sensor. */
  subject?: string;
  severity: AlertSeverity;
  /** Portuguese, shown in the dashboard. */
  message: string;
  details?: Record<string, unknown> | null;
}

const stationCondition = (stationId: string | null) =>
  stationId === null ? isNull(alerts.stationId) : eq(alerts.stationId, stationId);

async function notifyAlert(db: Executor, row: AlertRow): Promise<void> {
  await db.execute(
    notifyStatement(CHANNELS.alert, {
      alertId: row.id,
      stationId: row.stationId,
      type: row.type,
      status: row.status,
      severity: row.severity,
    }),
  );
}

/**
 * Opens an alert, or refreshes the active one for the same condition (station, type, subject).
 * The dashboard is notified when an alert opens or changes severity.
 */
export async function openAlert(db: Executor, spec: AlertSpec): Promise<{ created: boolean }> {
  const subject = spec.subject ?? '';
  const [existing] = await db
    .select()
    .from(alerts)
    .where(
      and(
        stationCondition(spec.stationId),
        eq(alerts.type, spec.type),
        eq(alerts.subject, subject),
        eq(alerts.status, 'active'),
      ),
    )
    .for('update');

  if (existing) {
    const [updated] = await db
      .update(alerts)
      .set({
        severity: spec.severity,
        message: spec.message,
        details: spec.details ?? existing.details,
        updatedAt: new Date(),
      })
      .where(eq(alerts.id, existing.id))
      .returning();
    if (updated && updated.severity !== existing.severity) await notifyAlert(db, updated);
    return { created: false };
  }

  const [created] = await db
    .insert(alerts)
    .values({
      stationId: spec.stationId,
      type: spec.type,
      subject,
      severity: spec.severity,
      message: spec.message,
      details: spec.details ?? null,
    })
    // A concurrent open of the same condition wins the partial unique index; nothing to do.
    .onConflictDoNothing()
    .returning();
  if (created) await notifyAlert(db, created);
  return { created: Boolean(created) };
}

export interface ResolveFilter {
  stationId: string | null;
  type: AlertType | readonly AlertType[];
  subject?: string;
}

/** Resolves the matching active alerts; returns how many were resolved. */
export async function resolveAlerts(db: Executor, filter: ResolveFilter): Promise<number> {
  const types = typeof filter.type === 'string' ? [filter.type] : [...filter.type];
  const now = new Date();
  const resolved = await db
    .update(alerts)
    .set({ status: 'resolved', resolvedAt: now, updatedAt: now })
    .where(
      and(
        stationCondition(filter.stationId),
        inArray(alerts.type, types),
        filter.subject === undefined ? undefined : eq(alerts.subject, filter.subject),
        eq(alerts.status, 'active'),
      ),
    )
    .returning();
  for (const row of resolved) await notifyAlert(db, row);
  return resolved.length;
}
