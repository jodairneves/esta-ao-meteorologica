import { type LogEntry, writeLog } from '../store/event-log';
import type { IngestContext } from './context';

/**
 * Writes a log entry at most once per window for the same key; the next entry carries how many
 * were suppressed in between.
 */
export async function writeThrottledLog(
  ctx: Pick<IngestContext, 'db' | 'limiter' | 'logger'>,
  key: string,
  entry: LogEntry,
): Promise<void> {
  const suppressed = ctx.limiter.take(key);
  if (suppressed === null) {
    ctx.logger.debug({ key, code: entry.code }, 'log entry suppressed');
    return;
  }
  await writeLog(
    ctx.db,
    suppressed > 0
      ? { ...entry, details: { ...entry.details, suppressedSinceLast: suppressed } }
      : entry,
  );
}
