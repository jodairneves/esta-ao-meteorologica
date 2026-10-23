import { type EventLogEntry, type Executor, writeEventLog } from '@wx/db';

export type LogEntry = Omit<EventLogEntry, 'source' | 'userId'> & {
  source?: EventLogEntry['source'];
};

/** event_logs entry written by the collector (or on behalf of a device). */
export function writeLog(db: Executor, entry: LogEntry): Promise<void> {
  return writeEventLog(db, { source: 'collector', ...entry });
}
