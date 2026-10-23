import { resolveAlerts } from '@wx/db';
import type { ConnectionState, StatusMessage } from '@wx/shared';
import type { CachedStation } from '../stations/cache';
import { type LogEntry, writeLog } from '../store/event-log';
import {
  lockStationState,
  notifyStationState,
  type StationStatePatch,
  type StationStateRow,
  updateStationState,
} from '../store/station-state';
import { formatTime } from '../util/format';
import type { IncomingMessage, IngestContext } from './context';

/** Connection state reported by the station (or by the broker, for the LWT). */
export async function handleStatus(
  ctx: IngestContext,
  station: CachedStation,
  message: StatusMessage,
  incoming: IncomingMessage,
): Promise<void> {
  await ctx.db.transaction(async (tx) => {
    const state = await lockStationState(tx, station.id);

    // Retained replays arrive whenever we subscribe; for a known station they are old news.
    if (incoming.retain && state.connectionChangedAt !== null) return;

    // The LWT is published by the broker and replays are not live: neither is contact.
    const isContact = !incoming.retain && message.state !== 'offline';
    const changed = state.connection !== message.state;

    const patch: StationStatePatch = {
      connection: message.state,
      nextContactAt:
        message.state === 'sleeping' && message.next !== null
          ? new Date(message.next * 1000)
          : null,
      updatedAt: incoming.receivedAt,
    };
    if (message.mode !== null) patch.powerMode = message.mode;
    if (message.fw !== null) patch.firmwareVersion = message.fw;
    if (changed) patch.connectionChangedAt = incoming.receivedAt;
    if (isContact) patch.lastSeenAt = incoming.receivedAt;

    const updated = await updateStationState(tx, station.id, patch);
    if (isContact) await resolveAlerts(tx, { stationId: station.id, type: 'station_offline' });

    if (changed) {
      const entry = connectionLogEntry(station, state.connection, updated);
      if (entry) await writeLog(tx, entry);
      else ctx.logger.debug({ station: station.code, state: message.state }, 'connection state');
      await notifyStationState(tx, updated);
    }
  });
}

/**
 * Only transitions involving offline/unknown go to event_logs; the online ↔ sleeping cycle of
 * the economy profile happens every few minutes and would flood the log.
 */
function connectionLogEntry(
  station: CachedStation,
  previous: ConnectionState,
  updated: StationStateRow,
): LogEntry | null {
  const wasAway = previous === 'unknown' || previous === 'offline';
  const base = { category: 'station' as const, stationId: station.id };

  switch (updated.connection) {
    case 'offline':
      return {
        ...base,
        level: 'warn',
        code: 'STATION_OFFLINE',
        message: `${station.label} desconectou sem aviso`,
      };
    case 'online':
      return wasAway
        ? {
            ...base,
            level: 'info',
            code: 'STATION_ONLINE',
            message: `${station.label} conectada`,
          }
        : null;
    case 'sleeping': {
      if (!wasAway) return null;
      const next = updated.nextContactAt
        ? `às ${formatTime(updated.nextContactAt, station.timezone)}`
        : 'em horário não informado';
      return {
        ...base,
        level: 'info',
        code: 'STATION_SLEEPING',
        message: `${station.label} em espera; próximo contato ${next}`,
      };
    }
    default:
      return null;
  }
}
