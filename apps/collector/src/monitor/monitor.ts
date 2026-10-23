import {
  alerts,
  and,
  type Database,
  eq,
  inArray,
  lt,
  openAlert,
  resolveAlerts,
  stationSensors,
  stationState,
  stations,
} from '@wx/db';
import type { MonitoringSettings } from '@wx/shared';
import { applySensorUpdate } from '../ingest/sensors';
import type { Logger } from '../logger';
import { toCachedStation } from '../stations/cache';
import { writeLog } from '../store/event-log';
import { lockStationState, notifyStationState, updateStationState } from '../store/station-state';
import { formatDateTime } from '../util/format';
import { type ContactInput, evaluateContact, findStaleSensors } from './rules';

export interface MonitorDeps {
  db: Database;
  logger: Logger;
  monitoringSettings: () => Promise<MonitoringSettings>;
}

export interface MonitorReport {
  stations: number;
  overdue: number;
  staleSensors: number;
}

/** Alerts that only signal a past event are closed after a day without recurrence. */
const EVENT_ALERT_TTL_MS = 24 * 3_600_000;

/** One pass over the active stations: overdue contact and sensors that stopped reporting. */
export async function runMonitorTick(deps: MonitorDeps, now = new Date()): Promise<MonitorReport> {
  const settings = await deps.monitoringSettings();
  const rows = await deps.db
    .select({ station: stations, state: stationState })
    .from(stations)
    .leftJoin(stationState, eq(stationState.stationId, stations.id))
    .where(eq(stations.isActive, true));

  const ids = rows.map((row) => row.station.id);
  const sensorRows =
    ids.length === 0
      ? []
      : await deps.db.select().from(stationSensors).where(inArray(stationSensors.stationId, ids));

  const report: MonitorReport = { stations: rows.length, overdue: 0, staleSensors: 0 };

  for (const { station: row, state } of rows) {
    if (!state) continue;
    const station = toCachedStation(row);
    const input: ContactInput = {
      connection: state.connection,
      lastSeenAt: state.lastSeenAt,
      nextContactAt: state.nextContactAt,
      powerMode: state.powerMode,
      intervalS: station.intervalS,
      economyBatchS: station.economyBatchS,
      survivalSleepS: station.survivalSleepS,
    };
    const contact = evaluateContact(input, settings, now);

    if (contact.status === 'overdue') {
      report.overdue++;
      const since = state.lastSeenAt ? formatDateTime(state.lastSeenAt, station.timezone) : '—';
      await deps.db.transaction(async (tx) => {
        await openAlert(tx, {
          stationId: station.id,
          type: 'station_offline',
          severity: contact.severity,
          message: `${station.label} sem contato desde ${since}`,
          details: {
            lastSeenAt: state.lastSeenAt?.toISOString() ?? null,
            deadline: contact.deadline.toISOString(),
          },
        });
        const current = await lockStationState(tx, station.id);
        if (current.connection !== 'offline') {
          const updated = await updateStationState(tx, station.id, {
            connection: 'offline',
            connectionChangedAt: now,
            nextContactAt: null,
          });
          await writeLog(tx, {
            level: 'warn',
            category: 'station',
            code: 'STATION_OVERDUE',
            message: `${station.label} sem contato desde ${since}`,
            stationId: station.id,
          });
          await notifyStationState(tx, updated);
        }
      });
      continue;
    }
    if (contact.status !== 'ok') continue;

    const sensors = sensorRows.filter((sensor) => sensor.stationId === station.id);
    const stale = findStaleSensors(sensors, input, settings, now);
    for (const sensor of stale) {
      report.staleSensors++;
      await deps.db.transaction(async (tx) => {
        const previous = sensors.find((s) => s.sensor === sensor);
        await applySensorUpdate(tx, station, sensor, { status: 'stale' }, previous, now);
      });
    }
  }

  await closeOldEventAlerts(deps.db, now);
  return report;
}

async function closeOldEventAlerts(db: Database, now: Date): Promise<void> {
  const old = await db
    .select({ stationId: alerts.stationId })
    .from(alerts)
    .where(
      and(
        eq(alerts.type, 'data_dropped'),
        eq(alerts.status, 'active'),
        lt(alerts.updatedAt, new Date(now.getTime() - EVENT_ALERT_TTL_MS)),
      ),
    );
  for (const { stationId } of old) {
    await resolveAlerts(db, { stationId, type: 'data_dropped' });
  }
}
