import { CHANNELS, type Executor, eventLogs, notifyStatement } from '@wx/db';
import type { LogCategory, LogLevel, LogSource } from '@wx/shared';

export interface LogEntry {
  level: Exclude<LogLevel, 'debug'>;
  category: LogCategory;
  code: string;
  /** Portuguese, shown in the dashboard. */
  message: string;
  stationId?: string | null;
  source?: LogSource;
  details?: Record<string, unknown> | null;
}

const NOTIFIED_LEVELS = new Set<LogLevel>(['warn', 'error', 'critical']);

/** Stores an entry in event_logs; warnings and above are also pushed to the dashboard. */
export async function writeLog(db: Executor, entry: LogEntry): Promise<void> {
  const [row] = await db
    .insert(eventLogs)
    .values({
      level: entry.level,
      source: entry.source ?? 'collector',
      category: entry.category,
      code: entry.code,
      message: entry.message,
      stationId: entry.stationId ?? null,
      details: entry.details ?? null,
    })
    .returning({ id: eventLogs.id, ts: eventLogs.ts });

  if (row && NOTIFIED_LEVELS.has(entry.level)) {
    await db.execute(
      notifyStatement(CHANNELS.log, {
        id: row.id,
        level: entry.level,
        ts: row.ts.toISOString(),
        stationId: entry.stationId ?? null,
      }),
    );
  }
}
