import { and, desc, deviceHealth, type Executor, eq, lt, openAlert, resolveAlerts } from '@wx/db';
import {
  checkReadingTimestamp,
  DEVICE_SENSOR_KEYS,
  type HealthMessage,
  isClimateSensor,
  type MonitoringSettings,
  POWER_MODE_LABELS,
  SENSOR_BY_DEVICE_KEY,
} from '@wx/shared';
import type { CachedStation } from '../stations/cache';
import { lockStationState, notifyStationState, recordContact } from '../store/station-state';
import { formatVolts } from '../util/format';
import { CLIMATE_SENSOR_NAMES, installedClimateSensor } from './climate-sensor';
import type { IncomingMessage, IngestContext } from './context';
import { writeThrottledLog } from './logging';
import { applySensorUpdate, loadSensors } from './sensors';

/** Device diagnostics: history row, live state, sensor statuses and battery/buffer alerts. */
export async function handleHealth(
  ctx: IngestContext,
  station: CachedStation,
  message: HealthMessage,
  incoming: IncomingMessage,
): Promise<void> {
  const settings = await ctx.monitoringSettings();
  const now = incoming.receivedAt;
  let fresh = false;

  await ctx.db.transaction(async (tx) => {
    const state = await lockStationState(tx, station.id);
    const nowSeconds = Math.floor(now.getTime() / 1000);
    const ts =
      checkReadingTimestamp(message.ts, nowSeconds) === 'ok' ? new Date(message.ts * 1000) : now;

    const [previous] = await tx
      .select({ dropped: deviceHealth.dropped, uptimeS: deviceHealth.uptimeS })
      .from(deviceHealth)
      .where(and(eq(deviceHealth.stationId, station.id), lt(deviceHealth.ts, ts)))
      .orderBy(desc(deviceHealth.ts))
      .limit(1);

    const [inserted] = await tx
      .insert(deviceHealth)
      .values({
        stationId: station.id,
        ts,
        receivedAt: now,
        firmwareVersion: message.fw,
        powerMode: message.mode,
        resetReason: message.reset,
        batteryMv: message.bat_mv,
        rssi: message.rssi,
        heapFree: message.heap,
        heapFrag: message.heap_frag,
        wifiReconnects: message.wifi_reconn,
        mqttReconnects: message.mqtt_reconn,
        buffered: message.buf,
        dropped: message.dropped,
        uptimeS: message.uptime,
        sensors: message.sensors,
      })
      .onConflictDoNothing({ target: [deviceHealth.stationId, deviceHealth.ts] })
      .returning({ id: deviceHealth.id });

    const updated = await recordContact(tx, station, state, now, {
      lastHealthAt: now,
      powerMode: message.mode,
      batteryMv: message.bat_mv,
      rssi: message.rssi,
      firmwareVersion: message.fw,
      ...(message.cfg_rev !== null ? { configAppliedRev: message.cfg_rev } : {}),
      // Older firmware does not report it: the last known address stays.
      ...(message.ip !== null ? { ipAddress: message.ip } : {}),
    });

    // A redelivered message refreshes the state but must not repeat the side effects.
    if (inserted) {
      fresh = true;
      await applyReportedSensors(tx, station, message, now);
      await syncBatteryAlerts(tx, station, message, settings);
      await checkDroppedReadings(tx, station, message, previous);
    }
    await notifyStationState(tx, updated);
  });

  const installed = installedClimateSensor(message);
  if (fresh && installed && installed !== station.climateSensor) {
    await writeThrottledLog(ctx, `${station.id}:CLIMATE_SENSOR_MISMATCH`, {
      level: 'warn',
      category: 'sensor',
      code: 'CLIMATE_SENSOR_MISMATCH',
      message: `${station.label} está com um ${CLIMATE_SENSOR_NAMES[installed]}, mas foi cadastrada como versão ${CLIMATE_SENSOR_NAMES[station.climateSensor]}. Corrija o cadastro ou o sensor.`,
      stationId: station.id,
      details: { registered: station.climateSensor, reported: installed },
    });
  }
}

async function applyReportedSensors(
  tx: Executor,
  station: CachedStation,
  message: HealthMessage,
  now: Date,
): Promise<void> {
  const sensors = await loadSensors(tx, station.id);

  for (const key of DEVICE_SENSOR_KEYS) {
    const reported = message.sensors[key];
    if (!reported) continue;
    const sensor = SENSOR_BY_DEVICE_KEY[key];
    // A station only carries the climate sensor of its version; the other one is ignored here
    // and reported as a mismatch when it is the one actually present.
    if (isClimateSensor(sensor) && sensor !== station.climateSensor) continue;
    const current = sensors.get(sensor);

    if (reported === 'ok') {
      // "ok" clears a reported failure; data freshness is judged from the readings.
      if (current?.status === 'error' || current?.status === 'disabled') {
        await applySensorUpdate(tx, station, sensor, { status: 'ok' }, current, now);
      }
    } else if (reported === 'disabled') {
      if (current?.status !== 'disabled') {
        await applySensorUpdate(tx, station, sensor, { status: 'disabled' }, current, now);
      }
    } else if (current?.status !== 'error') {
      const detail =
        reported === 'absent'
          ? 'Sensor não detectado pela estação'
          : 'Falha informada pela estação';
      await applySensorUpdate(tx, station, sensor, { status: 'error', detail }, current, now);
    }
  }

  const battery = sensors.get('battery');
  if (message.bat_mv !== null) {
    await applySensorUpdate(
      tx,
      station,
      'battery',
      { status: 'ok', lastValueAt: now },
      battery,
      now,
    );
  } else if (battery?.status !== 'disabled') {
    await applySensorUpdate(tx, station, 'battery', { status: 'disabled' }, battery, now);
  }
}

async function syncBatteryAlerts(
  tx: Executor,
  station: CachedStation,
  message: HealthMessage,
  settings: MonitoringSettings,
): Promise<void> {
  const mv = message.bat_mv;
  const critical = message.mode === 'survival' || (mv !== null && mv < settings.batteryCriticalMv);
  const low =
    !critical && (message.mode === 'economy' || (mv !== null && mv < settings.batteryLowMv));
  const voltage = mv !== null ? formatVolts(mv) : 'tensão não medida';
  const profile = POWER_MODE_LABELS[message.mode];

  if (critical) {
    await resolveAlerts(tx, { stationId: station.id, type: 'battery_low' });
    await openAlert(tx, {
      stationId: station.id,
      type: 'battery_critical',
      severity: 'critical',
      message: `Bateria crítica na ${station.label} (${voltage}, perfil ${profile})`,
      details: { batteryMv: mv, powerMode: message.mode },
    });
  } else if (low) {
    await resolveAlerts(tx, { stationId: station.id, type: 'battery_critical' });
    await openAlert(tx, {
      stationId: station.id,
      type: 'battery_low',
      severity: 'warning',
      message: `Bateria baixa na ${station.label} (${voltage}, perfil ${profile})`,
      details: { batteryMv: mv, powerMode: message.mode },
    });
  } else {
    await resolveAlerts(tx, { stationId: station.id, type: ['battery_low', 'battery_critical'] });
  }
}

async function checkDroppedReadings(
  tx: Executor,
  station: CachedStation,
  message: HealthMessage,
  previous: { dropped: number | null; uptimeS: number | null } | undefined,
): Promise<void> {
  if (!message.dropped) return;
  // `dropped` counts since boot: compare only within the same boot (uptime kept growing).
  const sameBoot =
    previous?.uptimeS != null && message.uptime !== null && message.uptime >= previous.uptimeS;
  const newDrops = sameBoot ? message.dropped - (previous?.dropped ?? 0) : message.dropped;
  if (newDrops <= 0) return;

  await openAlert(tx, {
    stationId: station.id,
    type: 'data_dropped',
    severity: 'warning',
    message: `${station.label} descartou ${newDrops} leitura(s) por falta de espaço no buffer (sem conexão por muito tempo)`,
    details: { dropped: message.dropped, newDrops },
  });
}
