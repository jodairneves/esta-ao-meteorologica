import {
  CHANNELS,
  type Executor,
  eq,
  notifyStatement,
  resolveAlerts,
  type StationStateSnapshot,
  stationState,
} from '@wx/db';
import type { RainCounterState } from '@wx/shared';
import type { CachedStation } from '../stations/cache';
import { writeLog } from './event-log';

export type StationStateRow = typeof stationState.$inferSelect;
export type StationStatePatch = Partial<Omit<typeof stationState.$inferInsert, 'stationId'>>;

/**
 * Returns the station's state row locked for the rest of the transaction (creating it on the
 * first message), so concurrent updates of the same station are serialised.
 */
export async function lockStationState(db: Executor, stationId: string): Promise<StationStateRow> {
  await db.insert(stationState).values({ stationId }).onConflictDoNothing();
  const [row] = await db
    .select()
    .from(stationState)
    .where(eq(stationState.stationId, stationId))
    .for('update');
  if (!row) throw new Error(`station_state row missing for station ${stationId}`);
  return row;
}

export async function updateStationState(
  db: Executor,
  stationId: string,
  patch: StationStatePatch,
): Promise<StationStateRow> {
  const [row] = await db
    .update(stationState)
    .set({ ...patch, updatedAt: patch.updatedAt ?? new Date() })
    .where(eq(stationState.stationId, stationId))
    .returning();
  if (!row) throw new Error(`station_state row missing for station ${stationId}`);
  return row;
}

export function rainStateOf(row: StationStateRow): RainCounterState | null {
  if (row.rainRun === null || row.rainLastCount === null || row.rainLastSeq === null) return null;
  return { run: row.rainRun, count: row.rainLastCount, seq: row.rainLastSeq };
}

const iso = (date: Date | null) => date?.toISOString() ?? null;

export function toSnapshot(row: StationStateRow): StationStateSnapshot {
  return {
    connection: row.connection,
    connectionChangedAt: iso(row.connectionChangedAt),
    nextContactAt: iso(row.nextContactAt),
    lastSeenAt: iso(row.lastSeenAt),
    lastReadingAt: iso(row.lastReadingAt),
    powerMode: row.powerMode,
    batteryMv: row.batteryMv,
    rssi: row.rssi,
    firmwareVersion: row.firmwareVersion,
    ipAddress: row.ipAddress,
  };
}

export async function notifyStationState(db: Executor, row: StationStateRow): Promise<void> {
  await db.execute(
    notifyStatement(CHANNELS.station, { stationId: row.stationId, state: toSnapshot(row) }),
  );
}

/**
 * Records that a station talked to us: refreshes last_seen_at, resolves the "no contact" alert
 * and brings an offline/unknown station back online.
 */
export async function recordContact(
  db: Executor,
  station: CachedStation,
  state: StationStateRow,
  receivedAt: Date,
  patch: StationStatePatch = {},
): Promise<StationStateRow> {
  const revived = state.connection === 'unknown' || state.connection === 'offline';
  const updated = await updateStationState(db, station.id, {
    ...patch,
    lastSeenAt: receivedAt,
    updatedAt: receivedAt,
    ...(revived
      ? { connection: 'online', connectionChangedAt: receivedAt, nextContactAt: null }
      : {}),
  });
  await resolveAlerts(db, { stationId: station.id, type: 'station_offline' });
  if (revived) {
    await writeLog(db, {
      level: 'info',
      category: 'station',
      code: 'STATION_ONLINE',
      message: `${station.label} voltou a se comunicar`,
      stationId: station.id,
    });
  }
  return updated;
}
