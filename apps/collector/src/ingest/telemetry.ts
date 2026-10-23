import { CHANNELS, type Executor, notifyStatement, type ReadingValues, readings } from '@wx/db';
import type { TelemetryMessage } from '@wx/shared';
import type { CachedStation } from '../stations/cache';
import {
  lockStationState,
  notifyStationState,
  rainStateOf,
  recordContact,
} from '../store/station-state';
import type { IncomingMessage, IngestContext } from './context';
import { writeThrottledLog } from './logging';
import { type ProcessedReading, processTelemetry, type ReadingIssue } from './process-reading';
import { updateSensorsFromReadings } from './sensors';

function readingValues(reading: ProcessedReading): ReadingValues {
  return {
    temperatureC: reading.temperatureC,
    humidityPct: reading.humidityPct,
    pressureHpa: reading.pressureHpa,
    pressureMslHpa: reading.pressureMslHpa,
    altitudeM: reading.altitudeM,
    dewPointC: reading.dewPointC,
    windSpeedMs: reading.windSpeedMs,
    windGustMs: reading.windGustMs,
    rainMm: reading.rainMm,
  };
}

/**
 * Stores a telemetry batch atomically: readings (deduplicated by station/run/seq), the rain
 * baseline, the station state and sensor statuses. NOTIFYs are only delivered on commit.
 */
export async function handleTelemetry(
  ctx: IngestContext,
  station: CachedStation,
  message: TelemetryMessage,
  incoming: IncomingMessage,
): Promise<void> {
  const outcome = await ctx.db.transaction(async (tx) => {
    const state = await lockStationState(tx, station.id);
    const result = processTelemetry(
      message,
      station,
      rainStateOf(state),
      incoming.receivedAt.getTime(),
    );

    const inserted =
      result.readings.length === 0
        ? []
        : await tx
            .insert(readings)
            .values(
              result.readings.map((reading) => ({
                stationId: station.id,
                run: message.run,
                receivedAt: incoming.receivedAt,
                ...reading,
              })),
            )
            .onConflictDoNothing({ target: [readings.stationId, readings.run, readings.seq] })
            .returning({ id: readings.id, seq: readings.seq });

    const bySeq = new Map(result.readings.map((reading) => [reading.seq, reading]));
    const stored = inserted
      .flatMap((row) => {
        const reading = bySeq.get(row.seq);
        return reading ? [{ id: row.id, reading }] : [];
      })
      .sort((a, b) => a.reading.seq - b.reading.seq);

    const newest = stored.reduce<Date | null>(
      (max, { reading }) => (!max || reading.ts > max ? reading.ts : max),
      state.lastReadingAt,
    );
    const updated = await recordContact(tx, station, state, incoming.receivedAt, {
      lastReadingAt: newest,
      rainRun: result.rainState?.run ?? null,
      rainLastCount: result.rainState?.count ?? null,
      rainLastSeq: result.rainState?.seq ?? null,
    });
    if (updated.connection !== state.connection) await notifyStationState(tx, updated);

    await updateSensorsFromReadings(
      tx,
      station,
      stored.map(({ reading }) => reading),
      updated.powerMode,
      incoming.receivedAt,
    );
    await logIssues(ctx, tx, station, result.issues);

    for (const { id, reading } of stored) {
      await tx.execute(
        notifyStatement(CHANNELS.reading, {
          stationId: station.id,
          readingId: id,
          ts: reading.ts.toISOString(),
          values: readingValues(reading),
        }),
      );
    }

    return { stored: stored.length, duplicates: result.readings.length - stored.length };
  });

  ctx.stats.readingsStored += outcome.stored;
  ctx.stats.duplicates += outcome.duplicates;
}

async function logIssues(
  ctx: IngestContext,
  tx: Executor,
  station: CachedStation,
  issues: readonly ReadingIssue[],
): Promise<void> {
  const logCtx = { ...ctx, db: tx };

  const timestamps = issues.filter((issue) => issue.kind === 'timestamp');
  if (timestamps.length > 0) {
    await writeThrottledLog(logCtx, `ts:${station.id}`, {
      level: 'warn',
      category: 'ingest',
      code: 'READING_TS_OUT_OF_RANGE',
      message: `${timestamps.length} leitura(s) da ${station.label} descartada(s): horário fora da janela aceita (relógio da estação desajustado?)`,
      stationId: station.id,
      details: {
        readings: timestamps.map(({ seq, ts, check }) => ({
          seq,
          ts: new Date(ts * 1000).toISOString(),
          check,
        })),
      },
    });
  }

  const ranges = issues.filter((issue) => issue.kind === 'range');
  if (ranges.length > 0) {
    const values = ranges.flatMap(({ violations }) =>
      violations.map((violation) => `${violation.field}=${violation.value}`),
    );
    await writeThrottledLog(logCtx, `range:${station.id}`, {
      level: 'warn',
      category: 'ingest',
      code: 'VALUE_OUT_OF_RANGE',
      message: `Valores fisicamente impossíveis descartados na ${station.label}: ${values.join(', ')}`,
      stationId: station.id,
      details: { readings: ranges },
    });
  }

  for (const issue of issues) {
    if (issue.kind !== 'rain_anomaly') continue;
    await writeThrottledLog(logCtx, `rain:${station.id}`, {
      level: 'warn',
      category: 'ingest',
      code: 'RAIN_COUNTER_ANOMALY',
      message: `Contador de chuva da ${station.label} voltou de ${issue.previousCount} para ${issue.count} sem reinício; a nova contagem foi usada como base`,
      stationId: station.id,
      details: { ...issue },
    });
  }
}
