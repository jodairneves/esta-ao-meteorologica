import { type Executor, writeEventLog } from '@wx/db';
import type { LogCategory } from '@wx/shared';

export interface AuditEntry {
  userId: string | null;
  code: string;
  /** Portuguese, shown in the dashboard logs. */
  message: string;
  category?: Extract<LogCategory, 'audit' | 'auth'>;
  level?: 'info' | 'warn';
  stationId?: string | null;
  details?: Record<string, unknown>;
}

/** Records an action taken through the dashboard (who did what). */
export function audit(db: Executor, entry: AuditEntry): Promise<void> {
  return writeEventLog(db, {
    source: 'dashboard',
    level: entry.level ?? 'info',
    category: entry.category ?? 'audit',
    code: entry.code,
    message: entry.message,
    userId: entry.userId,
    stationId: entry.stationId ?? null,
    details: entry.details ?? null,
  });
}
