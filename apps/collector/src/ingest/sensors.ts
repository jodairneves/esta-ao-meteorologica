import { type Executor, eq, openAlert, resolveAlerts, stationSensors } from '@wx/db';
import { type PowerMode, SENSOR_LABELS, type Sensor, type SensorStatus } from '@wx/shared';
import type { CachedStation } from '../stations/cache';
import { writeLog } from '../store/event-log';
import { capitalize, formatDateTime } from '../util/format';
import type { ProcessedReading } from './process-reading';

export type SensorRow = typeof stationSensors.$inferSelect;

export async function loadSensors(
  db: Executor,
  stationId: string,
): Promise<Map<Sensor, SensorRow>> {
  const rows = await db
    .select()
    .from(stationSensors)
    .where(eq(stationSensors.stationId, stationId));
  return new Map(rows.map((row) => [row.sensor, row]));
}

export interface SensorUpdate {
  status: SensorStatus;
  lastValueAt?: Date | null;
  detail?: string | null;
}

const latest = (a: Date | null, b: Date | null): Date | null => (!a ? b : !b ? a : a > b ? a : b);

/**
 * Stores a sensor's status and keeps its alerts and log in sync with the transition:
 * error/stale open an alert, recovering resolves it.
 */
export async function applySensorUpdate(
  db: Executor,
  station: CachedStation,
  sensor: Sensor,
  update: SensorUpdate,
  previous: SensorRow | undefined,
  now: Date,
): Promise<void> {
  const statusChanged = previous?.status !== update.status;
  const lastValueAt = latest(previous?.lastValueAt ?? null, update.lastValueAt ?? null);
  const values = {
    status: update.status,
    lastValueAt,
    statusChangedAt: statusChanged ? now : (previous?.statusChangedAt ?? now),
    detail: update.status === 'ok' ? null : (update.detail ?? previous?.detail ?? null),
  };
  await db
    .insert(stationSensors)
    .values({ stationId: station.id, sensor, ...values })
    .onConflictDoUpdate({ target: [stationSensors.stationId, stationSensors.sensor], set: values });

  if (!statusChanged) return;
  const label = SENSOR_LABELS[sensor];

  switch (update.status) {
    case 'error':
      await resolveAlerts(db, { stationId: station.id, type: 'sensor_stale', subject: sensor });
      await openAlert(db, {
        stationId: station.id,
        type: 'sensor_error',
        subject: sensor,
        severity: 'warning',
        message: `Falha no ${label} da ${station.label}`,
        details: { detail: values.detail },
      });
      await writeLog(db, {
        level: 'warn',
        category: 'sensor',
        code: 'SENSOR_ERROR',
        message: `Falha no ${label} da ${station.label}: ${values.detail ?? 'sem detalhes'}`,
        stationId: station.id,
      });
      break;
    case 'stale': {
      const since = lastValueAt ? formatDateTime(lastValueAt, station.timezone) : 'nunca';
      await openAlert(db, {
        stationId: station.id,
        type: 'sensor_stale',
        subject: sensor,
        severity: 'warning',
        message: `Sem dados do ${label} da ${station.label} desde ${since}`,
        details: { lastValueAt: lastValueAt?.toISOString() ?? null },
      });
      await writeLog(db, {
        level: 'warn',
        category: 'sensor',
        code: 'SENSOR_STALE',
        message: `Sem dados do ${label} da ${station.label} desde ${since}`,
        stationId: station.id,
      });
      break;
    }
    default: {
      // ok, disabled, not_measured, unknown: nothing to warn about anymore.
      const resolved = await resolveAlerts(db, {
        stationId: station.id,
        type: ['sensor_stale', 'sensor_error'],
        subject: sensor,
      });
      if (resolved > 0 && update.status === 'ok') {
        await writeLog(db, {
          level: 'info',
          category: 'sensor',
          code: 'SENSOR_RECOVERED',
          message: `${capitalize(label)} da ${station.label} voltou a enviar dados`,
          stationId: station.id,
        });
      }
    }
  }
}

const SENSOR_SOURCES: readonly {
  sensor: Sensor;
  hasValue: (reading: ProcessedReading) => boolean;
  /** Wind and rain are not counted while the station sleeps (survival profile). */
  measuredInSurvival: boolean;
}[] = [
  {
    sensor: 'bme280',
    hasValue: (r) => r.temperatureC !== null || r.humidityPct !== null || r.pressureHpa !== null,
    measuredInSurvival: true,
  },
  { sensor: 'anemometer', hasValue: (r) => r.windPulses !== null, measuredInSurvival: false },
  { sensor: 'rain_gauge', hasValue: (r) => r.rainCount !== null, measuredInSurvival: false },
];

/** Marks sensors that delivered values as ok; in survival mode wind/rain become "not measured". */
export async function updateSensorsFromReadings(
  db: Executor,
  station: CachedStation,
  stored: readonly ProcessedReading[],
  powerMode: PowerMode | null,
  now: Date,
): Promise<void> {
  if (stored.length === 0) return;
  const previous = await loadSensors(db, station.id);

  for (const source of SENSOR_SOURCES) {
    const last = stored.filter(source.hasValue).at(-1);
    if (last) {
      await applySensorUpdate(
        db,
        station,
        source.sensor,
        { status: 'ok', lastValueAt: last.ts },
        previous.get(source.sensor),
        now,
      );
    } else if (!source.measuredInSurvival && powerMode === 'survival') {
      await applySensorUpdate(
        db,
        station,
        source.sensor,
        { status: 'not_measured' },
        previous.get(source.sensor),
        now,
      );
    }
  }
}
