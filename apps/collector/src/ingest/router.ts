import {
  decodeStationMessage,
  isStationPublishedKind,
  parseStationTopic,
  type StationMessage,
  type StationMessageKind,
} from '@wx/shared';
import type { CachedStation } from '../stations/cache';
import { previewPayload } from '../util/format';
import type { IncomingMessage, IngestContext } from './context';
import { handleDeviceEvent } from './event';
import { handleHealth } from './health';
import { writeThrottledLog } from './logging';
import { handleStatus } from './status';
import { handleTelemetry } from './telemetry';

type Handler<K extends StationMessageKind> = (
  ctx: IngestContext,
  station: CachedStation,
  message: StationMessage<K>,
  incoming: IncomingMessage,
) => Promise<void>;

const HANDLERS: { [K in StationMessageKind]: Handler<K> } = {
  telemetry: handleTelemetry,
  status: handleStatus,
  health: handleHealth,
  event: handleDeviceEvent,
};

/** Entry point for every MQTT message. Throws only when the database is unavailable. */
export async function routeMessage(ctx: IngestContext, incoming: IncomingMessage): Promise<void> {
  // An empty retained payload is the broker clearing a retained message (station deleted).
  if (incoming.payload.length === 0) return;

  const route = parseStationTopic(incoming.topic);
  if (!route || !isStationPublishedKind(route.kind)) return;
  ctx.stats.recordReceived(route.kind, incoming.receivedAt);

  const station = await ctx.cache.get(route.code);
  // Retained replays (sent whenever we subscribe) are not news: ignore them for stations we
  // do not process, otherwise every restart would log one entry per old retained status.
  if (!station?.isActive && incoming.retain) return;
  if (!station) {
    ctx.stats.rejected++;
    await writeThrottledLog(ctx, `unknown:${route.code}`, {
      level: 'warn',
      category: 'mqtt',
      code: 'UNKNOWN_STATION',
      message: `Mensagem de estação não cadastrada: ${route.code}`,
      details: { code: route.code, topic: incoming.topic },
    });
    return;
  }
  if (!station.isActive) {
    await writeThrottledLog(ctx, `inactive:${station.id}`, {
      level: 'info',
      category: 'station',
      code: 'STATION_INACTIVE',
      message: `Mensagens da ${station.label} ignoradas: a estação está desativada`,
      stationId: station.id,
    });
    return;
  }

  await dispatch(route.kind, ctx, station, incoming);
}

async function dispatch<K extends StationMessageKind>(
  kind: K,
  ctx: IngestContext,
  station: CachedStation,
  incoming: IncomingMessage,
): Promise<void> {
  const decoded = decodeStationMessage(kind, incoming.payload);
  if (!decoded.ok) {
    ctx.stats.rejected++;
    await writeThrottledLog(ctx, `invalid:${station.id}:${kind}`, {
      level: 'warn',
      category: 'ingest',
      code: 'PAYLOAD_INVALID',
      message: `Mensagem inválida da ${station.label} (${kind}): ${decoded.error.split('\n')[0]}`,
      stationId: station.id,
      details: {
        topic: incoming.topic,
        error: decoded.error,
        payload: previewPayload(incoming.payload),
      },
    });
    return;
  }
  await HANDLERS[kind](ctx, station, decoded.message, incoming);
}
