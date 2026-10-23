import { msToKmh } from '@wx/shared';
import type { FastifyInstance } from 'fastify';
import {
  compareQuerySchema,
  heatmapQuerySchema,
  rangeQuerySchema,
  seriesQuerySchema,
} from '../../common/api';
import type { AppDeps } from '../context';
import { parseInput } from '../http';
import { toCsv } from '../services/csv';
import {
  chooseBucket,
  getComparison,
  getDaily,
  getHeatmap,
  getLatest,
  getSeries,
  resolveRange,
} from '../services/readings';
import { findStation } from '../services/station-views';
import { stationParams } from './stations';

const DAY_MS = 86_400_000;

function localDateTime(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone, dateStyle: 'short', timeStyle: 'short' })
    .format(ms)
    .replace(',', '');
}

export async function dataRoutes(app: FastifyInstance, { db }: AppDeps): Promise<void> {
  app.get('/stations/:id/latest', async (request) => {
    const { id } = parseInput(stationParams, request.params);
    return getLatest(db, await findStation(db, id));
  });

  app.get('/stations/:id/series', async (request) => {
    const { id } = parseInput(stationParams, request.params);
    const query = parseInput(seriesQuerySchema, request.query);
    const station = await findStation(db, id);
    const range = resolveRange(query, DAY_MS);
    return getSeries(db, station, range, chooseBucket(range, query.bucket));
  });

  app.get('/stations/:id/daily', async (request) => {
    const { id } = parseInput(stationParams, request.params);
    const query = parseInput(rangeQuerySchema, request.query);
    const station = await findStation(db, id);
    return getDaily(db, station, resolveRange(query, 30 * DAY_MS));
  });

  app.get('/stations/:id/heatmap', async (request) => {
    const { id } = parseInput(stationParams, request.params);
    const query = parseInput(heatmapQuerySchema, request.query);
    const station = await findStation(db, id);
    return getHeatmap(db, station, resolveRange(query, 30 * DAY_MS), query.metric);
  });

  app.get('/stations/:id/export.csv', async (request, reply) => {
    const { id } = parseInput(stationParams, request.params);
    const query = parseInput(seriesQuerySchema, request.query);
    const station = await findStation(db, id);
    const range = resolveRange(query, 7 * DAY_MS);
    const series = await getSeries(db, station, range, chooseBucket(range, query.bucket));

    const kmh = (value: number | null | undefined) =>
      value === null || value === undefined ? null : msToKmh(value);
    const rows = series.t.map((t, i) => [
      localDateTime(t, station.timezone),
      series.temperature.avg[i] ?? null,
      series.temperature.min?.[i] ?? null,
      series.temperature.max?.[i] ?? null,
      series.humidity.avg[i] ?? null,
      series.pressure.avg[i] ?? null,
      series.pressureMsl.avg[i] ?? null,
      series.dewPoint.avg[i] ?? null,
      kmh(series.wind.avg[i]),
      kmh(series.gust.avg[i]),
      series.rain.avg[i] ?? null,
    ]);
    const csv = toCsv(
      [
        'Data/hora',
        'Temperatura média (°C)',
        'Temperatura mínima (°C)',
        'Temperatura máxima (°C)',
        'Umidade (%)',
        'Pressão da estação (hPa)',
        'Pressão ao nível do mar (hPa)',
        'Ponto de orvalho (°C)',
        'Vento médio (km/h)',
        'Rajada (km/h)',
        'Chuva (mm)',
      ],
      rows,
    );
    const day = (date: Date) => date.toISOString().slice(0, 10);
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header(
        'content-disposition',
        `attachment; filename="${station.code}_${day(range.from)}_${day(range.to)}.csv"`,
      )
      .send(csv);
  });

  app.get('/compare', async (request) => {
    const query = parseInput(compareQuerySchema, request.query);
    const range = resolveRange(query, DAY_MS);
    const stationsToCompare = await Promise.all(query.stations.map((id) => findStation(db, id)));
    return getComparison(
      db,
      stationsToCompare,
      range,
      chooseBucket(range, query.bucket),
      query.metric,
    );
  });
}
