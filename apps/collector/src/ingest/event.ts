import { and, commands, type Executor, eq } from '@wx/db';
import {
  cmdAckDataSchema,
  configAppliedDataSchema,
  type DeviceEventMessage,
  isClimateSensor,
  type LogCategory,
  modeChangedDataSchema,
  SENSOR_BY_DEVICE_KEY,
  sensorEventDataSchema,
} from '@wx/shared';
import type { Logger } from '../logger';
import type { CachedStation } from '../stations/cache';
import { writeLog } from '../store/event-log';
import {
  lockStationState,
  notifyStationState,
  recordContact,
  updateStationState,
} from '../store/station-state';
import type { IncomingMessage, IngestContext } from './context';
import { applySensorUpdate, loadSensors } from './sensors';

const CATEGORY_BY_CODE: Readonly<Record<string, LogCategory>> = {
  BOOT: 'station',
  MODE_CHANGED: 'power',
  SENSOR_FAILED: 'sensor',
  SENSOR_RECOVERED: 'sensor',
  BUFFER_OVERFLOW: 'station',
  NTP_FAILED: 'station',
  CONFIG_APPLIED: 'config',
  CONFIG_REJECTED: 'config',
  CMD_ACK: 'command',
};

/** Device events go to event_logs; a few of them also update commands, config or sensors. */
export async function handleDeviceEvent(
  ctx: IngestContext,
  station: CachedStation,
  message: DeviceEventMessage,
  incoming: IncomingMessage,
): Promise<void> {
  const now = incoming.receivedAt;

  await ctx.db.transaction(async (tx) => {
    const state = await lockStationState(tx, station.id);
    let updated = await recordContact(tx, station, state, now);

    if (message.level === 'debug') {
      ctx.logger.debug({ station: station.code, event: message }, 'device debug event');
    } else {
      await writeLog(tx, {
        source: 'device',
        level: message.level,
        category: CATEGORY_BY_CODE[message.code] ?? 'station',
        code: message.code,
        message: message.msg || message.code,
        stationId: station.id,
        details: {
          deviceTs: message.ts ? new Date(message.ts * 1000).toISOString() : null,
          data: message.data,
        },
      });
    }

    switch (message.code) {
      case 'CMD_ACK':
        await acknowledgeCommand(tx, station, message.data, now, ctx.logger);
        break;
      case 'CONFIG_APPLIED': {
        const data = configAppliedDataSchema.safeParse(message.data);
        if (data.success) {
          updated = await updateStationState(tx, station.id, { configAppliedRev: data.data.rev });
        }
        break;
      }
      case 'SENSOR_FAILED':
      case 'SENSOR_RECOVERED': {
        const data = sensorEventDataSchema.safeParse(message.data);
        if (!data.success) break;
        const sensor = SENSOR_BY_DEVICE_KEY[data.data.sensor];
        // The other version's climate sensor is a wiring/registration mismatch, reported by health.
        if (isClimateSensor(sensor) && sensor !== station.climateSensor) break;
        const current = (await loadSensors(tx, station.id)).get(sensor);
        const update =
          message.code === 'SENSOR_FAILED'
            ? {
                status: 'error' as const,
                detail: data.data.detail ?? 'Falha informada pela estação',
              }
            : { status: 'ok' as const };
        await applySensorUpdate(tx, station, sensor, update, current, now);
        break;
      }
      case 'MODE_CHANGED': {
        const data = modeChangedDataSchema.safeParse(message.data);
        if (data.success) {
          updated = await updateStationState(tx, station.id, {
            powerMode: data.data.to,
            ...(data.data.bat_mv !== undefined ? { batteryMv: data.data.bat_mv } : {}),
          });
        }
        break;
      }
    }

    if (
      updated.connection !== state.connection ||
      updated.powerMode !== state.powerMode ||
      updated.configAppliedRev !== state.configAppliedRev
    ) {
      await notifyStationState(tx, updated);
    }
  });
}

async function acknowledgeCommand(
  tx: Executor,
  station: CachedStation,
  data: unknown,
  at: Date,
  logger: Logger,
): Promise<void> {
  const parsed = cmdAckDataSchema.safeParse(data);
  if (!parsed.success) {
    logger.warn({ station: station.code, data }, 'CMD_ACK without a valid command id');
    return;
  }
  const { id, ok, detail } = parsed.data;
  const status = ok ? 'acked' : detail === 'expired' ? 'expired' : 'failed';
  await tx
    .update(commands)
    .set({ status, ackedAt: at, result: { ok, detail: detail ?? null } })
    .where(and(eq(commands.id, id), eq(commands.stationId, station.id)));
}
