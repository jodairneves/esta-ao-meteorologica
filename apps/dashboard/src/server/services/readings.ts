import { and, asc, type Database, desc, deviceHealth, eq, gte, lt, sql } from '@wx/db';
import {
  autoBucket,
  BUCKET_SECONDS,
  beaufort,
  feelsLike,
  pressureTrend,
  type SeriesBucket,
} from '@wx/shared';
import type {
  CompareResponse,
  DailyRow,
  HealthPoint,
  HeatmapResponse,
  LatestResponse,
  Metric,
  SeriesResponse,
  SeriesStat,
} from '../../common/api';
import { badRequest } from '../http';
import { toIso } from './sql-values';
import { round } from './station-views';

const DAY_MS = 86_400_000;
const MAX_SPAN_MS = 400 * DAY_MS;
/** Raw readings are only served for short periods (≈ 20 k points at one per minute). */
const MAX_RAW_SPAN_MS = 14 * DAY_MS;

export interface StationRef {
  id: string;
  timezone: string;
}

export interface Range {
  from: Date;
  to: Date;
}

export function resolveRange(query: { from?: string; to?: string }, defaultSpanMs: number): Range {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from ? new Date(query.from) : new Date(to.getTime() - defaultSpanMs);
  if (!(from < to)) throw badRequest('O início do período precisa ser anterior ao fim');
  if (to.getTime() - from.getTime() > MAX_SPAN_MS) {
    throw badRequest('Período longo demais (máximo de 400 dias)');
  }
  return { from, to };
}

export function chooseBucket(range: Range, requested: 'auto' | SeriesBucket): SeriesBucket {
  if (requested === 'auto') return autoBucket(range.from, range.to);
  if (requested === 'raw' && range.to.getTime() - range.from.getTime() > MAX_RAW_SPAN_MS) {
    throw badRequest('Dados brutos só estão disponíveis para períodos de até 14 dias');
  }
  return requested;
}

const num = (value: number | null | undefined, digits = 2): number | null =>
  value === null || value === undefined ? null : round(value, digits);

/** Time axis of a bucket: date_bin for sub-day buckets, local midnight for days. */
function bucketExpression(bucket: Exclude<SeriesBucket, 'raw'>, timezone: string) {
  if (bucket === '1d') {
    return sql`(date_trunc('day', ts at time zone ${timezone}) at time zone ${timezone})`;
  }
  return sql`date_bin(${`${BUCKET_SECONDS[bucket]} seconds`}::interval, ts, timestamptz '2000-01-01 00:00:00+00')`;
}

interface AggregateRow extends Record<string, unknown> {
  /** Epoch ms. */
  t: number;
  temp_avg: number | null;
  temp_min: number | null;
  temp_max: number | null;
  hum_avg: number | null;
  hum_min: number | null;
  hum_max: number | null;
  pres_avg: number | null;
  pres_min: number | null;
  pres_max: number | null;
  msl_avg: number | null;
  msl_min: number | null;
  msl_max: number | null;
  dew_avg: number | null;
  dew_min: number | null;
  dew_max: number | null;
  wind_avg: number | null;
  wind_max: number | null;
  gust_max: number | null;
  rain_sum: number | null;
}

interface RawRow extends Record<string, unknown> {
  /** Epoch ms. */
  t: number;
  temperature_c: number | null;
  humidity_pct: number | null;
  pressure_hpa: number | null;
  pressure_msl_hpa: number | null;
  dew_point_c: number | null;
  wind_speed_ms: number | null;
  wind_gust_ms: number | null;
  rain_mm: number | null;
}

export async function getSeries(
  db: Database,
  station: StationRef,
  range: Range,
  bucket: SeriesBucket,
): Promise<SeriesResponse> {
  const base = {
    bucket,
    from: range.from.toISOString(),
    to: range.to.toISOString(),
  };

  if (bucket === 'raw') {
    const { rows } = await db.execute<RawRow>(sql`
      select (extract(epoch from ts) * 1000)::float8 as t, temperature_c, humidity_pct, pressure_hpa, pressure_msl_hpa, dew_point_c,
             wind_speed_ms, wind_gust_ms, rain_mm
      from readings
      where station_id = ${station.id} and ts >= ${range.from} and ts < ${range.to}
      order by ts`);
    const column = (pick: (row: RawRow) => number | null, digits = 2): SeriesStat => ({
      avg: rows.map((row) => num(pick(row), digits)),
    });
    return {
      ...base,
      t: rows.map((row) => row.t),
      temperature: column((r) => r.temperature_c),
      humidity: column((r) => r.humidity_pct, 1),
      pressure: column((r) => r.pressure_hpa),
      pressureMsl: column((r) => r.pressure_msl_hpa),
      dewPoint: column((r) => r.dew_point_c),
      wind: column((r) => r.wind_speed_ms),
      gust: column((r) => r.wind_gust_ms),
      rain: column((r) => r.rain_mm, 3),
    };
  }

  const { rows } = await db.execute<AggregateRow>(sql`
    select (extract(epoch from ${bucketExpression(bucket, station.timezone)}) * 1000)::float8 as t,
           avg(temperature_c) as temp_avg, min(temperature_c) as temp_min, max(temperature_c) as temp_max,
           avg(humidity_pct) as hum_avg, min(humidity_pct) as hum_min, max(humidity_pct) as hum_max,
           avg(pressure_hpa) as pres_avg, min(pressure_hpa) as pres_min, max(pressure_hpa) as pres_max,
           avg(pressure_msl_hpa) as msl_avg, min(pressure_msl_hpa) as msl_min, max(pressure_msl_hpa) as msl_max,
           avg(dew_point_c) as dew_avg, min(dew_point_c) as dew_min, max(dew_point_c) as dew_max,
           avg(wind_speed_ms) as wind_avg, max(wind_speed_ms) as wind_max,
           max(wind_gust_ms) as gust_max, sum(rain_mm) as rain_sum
    from readings
    where station_id = ${station.id} and ts >= ${range.from} and ts < ${range.to}
    group by 1
    order by 1`);

  const stat = (
    avg: (row: AggregateRow) => number | null,
    min?: (row: AggregateRow) => number | null,
    max?: (row: AggregateRow) => number | null,
    digits = 2,
  ): SeriesStat => ({
    avg: rows.map((row) => num(avg(row), digits)),
    ...(min ? { min: rows.map((row) => num(min(row), digits)) } : {}),
    ...(max ? { max: rows.map((row) => num(max(row), digits)) } : {}),
  });

  return {
    ...base,
    t: rows.map((row) => row.t),
    temperature: stat(
      (r) => r.temp_avg,
      (r) => r.temp_min,
      (r) => r.temp_max,
    ),
    humidity: stat(
      (r) => r.hum_avg,
      (r) => r.hum_min,
      (r) => r.hum_max,
      1,
    ),
    pressure: stat(
      (r) => r.pres_avg,
      (r) => r.pres_min,
      (r) => r.pres_max,
    ),
    pressureMsl: stat(
      (r) => r.msl_avg,
      (r) => r.msl_min,
      (r) => r.msl_max,
    ),
    dewPoint: stat(
      (r) => r.dew_avg,
      (r) => r.dew_min,
      (r) => r.dew_max,
    ),
    wind: stat(
      (r) => r.wind_avg,
      undefined,
      (r) => r.wind_max,
    ),
    gust: stat((r) => r.gust_max),
    rain: stat((r) => r.rain_sum, undefined, undefined, 3),
  };
}

interface LatestRow extends Record<string, unknown> {
  ts: unknown;
  interval_s: number;
  temperature_c: number | null;
  humidity_pct: number | null;
  pressure_hpa: number | null;
  pressure_msl_hpa: number | null;
  altitude_m: number | null;
  dew_point_c: number | null;
  wind_speed_ms: number | null;
  wind_gust_ms: number | null;
  rain_mm: number | null;
}

interface TotalsRow extends Record<string, unknown> {
  last_hour: number | null;
  today: number | null;
  last_24h: number | null;
  last_7d: number | null;
  month: number | null;
  year: number | null;
  t_min: number | null;
  t_max: number | null;
  gust_max: number | null;
  t_min_at: unknown;
  t_max_at: unknown;
}

/** Latest reading with derived values, today's extremes and rain totals (local calendar). */
export async function getLatest(db: Database, station: StationRef): Promise<LatestResponse> {
  const tz = station.timezone;
  const { rows: latestRows } = await db.execute<LatestRow>(sql`
    select ts, interval_s, temperature_c, humidity_pct, pressure_hpa, pressure_msl_hpa, altitude_m,
           dew_point_c, wind_speed_ms, wind_gust_ms, rain_mm
    from readings where station_id = ${station.id} order by ts desc limit 1`);
  const latest = latestRows[0];

  const { rows: totalRows } = await db.execute<TotalsRow>(sql`
    with bounds as (
      select date_trunc('day', now() at time zone ${tz}) at time zone ${tz} as day_start,
             date_trunc('month', now() at time zone ${tz}) at time zone ${tz} as month_start,
             date_trunc('year', now() at time zone ${tz}) at time zone ${tz} as year_start
    ),
    window_rows as (
      select r.ts, r.rain_mm, r.temperature_c, r.wind_gust_ms, b.day_start, b.month_start, b.year_start
      from readings r, bounds b
      where r.station_id = ${station.id}
        and r.ts >= least(b.year_start, now() - interval '7 days')
    )
    select
      sum(rain_mm) filter (where ts > now() - interval '1 hour') as last_hour,
      sum(rain_mm) filter (where ts >= day_start) as today,
      sum(rain_mm) filter (where ts > now() - interval '24 hours') as last_24h,
      sum(rain_mm) filter (where ts > now() - interval '7 days') as last_7d,
      sum(rain_mm) filter (where ts >= month_start) as month,
      sum(rain_mm) filter (where ts >= year_start) as year,
      min(temperature_c) filter (where ts >= day_start) as t_min,
      max(temperature_c) filter (where ts >= day_start) as t_max,
      max(wind_gust_ms) filter (where ts >= day_start) as gust_max,
      (array_agg(ts order by temperature_c asc) filter (where ts >= day_start and temperature_c is not null))[1] as t_min_at,
      (array_agg(ts order by temperature_c desc) filter (where ts >= day_start and temperature_c is not null))[1] as t_max_at
    from window_rows`);
  const totals = totalRows[0];

  // Pressure tendency over 3 h from the station pressure (differences need no elevation).
  const { rows: trendRows } = await db.execute<{ before: number | null }>(sql`
    select avg(pressure_hpa) as before from readings
    where station_id = ${station.id}
      and ts between now() - interval '3 hours 10 minutes' and now() - interval '2 hours 50 minutes'`);
  const before = trendRows[0]?.before ?? null;
  const change =
    latest?.pressure_hpa != null && before !== null ? round(latest.pressure_hpa - before, 2) : null;

  return {
    reading: latest
      ? {
          ts: toIso(latest.ts) ?? '',
          intervalS: latest.interval_s,
          temperatureC: latest.temperature_c,
          humidityPct: latest.humidity_pct,
          pressureHpa: latest.pressure_hpa,
          pressureMslHpa: latest.pressure_msl_hpa,
          altitudeM: latest.altitude_m,
          dewPointC: latest.dew_point_c,
          windSpeedMs: latest.wind_speed_ms,
          windGustMs: latest.wind_gust_ms,
          rainMm: latest.rain_mm,
        }
      : null,
    derived: {
      feelsLikeC:
        latest?.temperature_c != null
          ? num(feelsLike(latest.temperature_c, latest.humidity_pct, latest.wind_speed_ms), 1)
          : null,
      beaufort: latest?.wind_speed_ms != null ? beaufort(latest.wind_speed_ms) : null,
      pressureChange3hHpa: change,
      pressureTrend: change === null ? null : pressureTrend(change),
      rainRateMmH:
        latest?.rain_mm != null && latest.interval_s > 0
          ? num((latest.rain_mm / latest.interval_s) * 3600, 2)
          : null,
    },
    today: {
      tempMinC: num(totals?.t_min),
      tempMinAt: toIso(totals?.t_min_at),
      tempMaxC: num(totals?.t_max),
      tempMaxAt: toIso(totals?.t_max_at),
      gustMaxMs: num(totals?.gust_max),
    },
    rain: {
      lastHourMm: num(totals?.last_hour),
      todayMm: num(totals?.today),
      last24hMm: num(totals?.last_24h),
      last7dMm: num(totals?.last_7d),
      monthMm: num(totals?.month),
      yearMm: num(totals?.year),
    },
  };
}

interface DailyQueryRow extends Record<string, unknown> {
  day: string;
  tmin: number | null;
  tmax: number | null;
  tavg: number | null;
  havg: number | null;
  pavg: number | null;
  rain: number | null;
  wavg: number | null;
  gmax: number | null;
  n: number;
}

/** One row per local day. */
export async function getDaily(
  db: Database,
  station: StationRef,
  range: Range,
): Promise<DailyRow[]> {
  const tz = station.timezone;
  const { rows } = await db.execute<DailyQueryRow>(sql`
    select to_char(date_trunc('day', ts at time zone ${tz}), 'YYYY-MM-DD') as day,
           min(temperature_c) as tmin, max(temperature_c) as tmax, avg(temperature_c) as tavg,
           avg(humidity_pct) as havg, avg(pressure_msl_hpa) as pavg, sum(rain_mm) as rain,
           avg(wind_speed_ms) as wavg, max(wind_gust_ms) as gmax, count(*)::int as n
    from readings
    where station_id = ${station.id} and ts >= ${range.from} and ts < ${range.to}
    group by 1
    order by 1`);
  return rows.map((row) => ({
    day: row.day,
    tempMin: num(row.tmin),
    tempMax: num(row.tmax),
    tempAvg: num(row.tavg),
    humidityAvg: num(row.havg, 1),
    pressureMslAvg: num(row.pavg),
    rainMm: num(row.rain),
    windAvg: num(row.wavg),
    gustMax: num(row.gmax),
    readings: row.n,
  }));
}

/** Column and aggregate behind each metric. Whitelisted: safe to inline in SQL. */
const METRIC_SQL: Record<Metric, { column: string; aggregate: 'avg' | 'max' | 'sum' }> = {
  temperature: { column: 'temperature_c', aggregate: 'avg' },
  humidity: { column: 'humidity_pct', aggregate: 'avg' },
  pressure: { column: 'pressure_hpa', aggregate: 'avg' },
  pressureMsl: { column: 'pressure_msl_hpa', aggregate: 'avg' },
  dewPoint: { column: 'dew_point_c', aggregate: 'avg' },
  wind: { column: 'wind_speed_ms', aggregate: 'avg' },
  gust: { column: 'wind_gust_ms', aggregate: 'max' },
  rain: { column: 'rain_mm', aggregate: 'sum' },
};

const metricExpression = (metric: Metric) => {
  const { column, aggregate } = METRIC_SQL[metric];
  return sql.raw(`${aggregate}(${column})`);
};

/** Mean by local day × local hour (e.g. when the afternoons are hottest). */
export async function getHeatmap(
  db: Database,
  station: StationRef,
  range: Range,
  metric: Metric,
): Promise<HeatmapResponse> {
  const tz = station.timezone;
  const { rows } = await db.execute<{ day: string; hour: number; v: number | null }>(sql`
    select to_char(ts at time zone ${tz}, 'YYYY-MM-DD') as day,
           extract(hour from ts at time zone ${tz})::int as hour,
           ${metricExpression(metric)} as v
    from readings
    where station_id = ${station.id} and ts >= ${range.from} and ts < ${range.to}
    group by 1, 2
    order by 1, 2`);
  const days = [...new Set(rows.map((row) => row.day))];
  const index = new Map(days.map((day, i) => [day, i]));
  const cells = rows.flatMap((row): [number, number, number][] =>
    row.v === null ? [] : [[index.get(row.day) ?? 0, row.hour, round(row.v, 2)]],
  );
  return { metric, days, cells };
}

/** The same metric for several stations on a common time axis. */
export async function getComparison(
  db: Database,
  stationsToCompare: { id: string; code: string; name: string; timezone: string }[],
  range: Range,
  bucket: SeriesBucket,
  metric: Metric,
): Promise<CompareResponse> {
  const series = [];
  for (const station of stationsToCompare) {
    const timeExpr = bucket === 'raw' ? sql`ts` : bucketExpression(bucket, station.timezone);
    const epochMs = sql`(extract(epoch from ${timeExpr}) * 1000)::float8`;
    const valueExpr =
      bucket === 'raw' ? sql.raw(METRIC_SQL[metric].column) : metricExpression(metric);
    const { rows } = await db.execute<{ t: number; v: number | null }>(sql`
      select ${epochMs} as t, ${valueExpr} as v
      from readings
      where station_id = ${station.id} and ts >= ${range.from} and ts < ${range.to}
      ${bucket === 'raw' ? sql`` : sql`group by 1`}
      order by 1`);
    series.push({
      stationId: station.id,
      code: station.code,
      name: station.name,
      t: rows.map((row) => row.t),
      values: rows.map((row) => num(row.v)),
    });
  }
  return { bucket, metric, series };
}

export async function getHealthSeries(
  db: Database,
  stationId: string,
  range: Range,
): Promise<HealthPoint[]> {
  const rows = await db
    .select()
    .from(deviceHealth)
    .where(
      and(
        eq(deviceHealth.stationId, stationId),
        gte(deviceHealth.ts, range.from),
        lt(deviceHealth.ts, range.to),
      ),
    )
    .orderBy(asc(deviceHealth.ts))
    .limit(5000);
  return rows.map(toHealthPoint);
}

export async function getLastHealth(db: Database, stationId: string): Promise<HealthPoint | null> {
  const [row] = await db
    .select()
    .from(deviceHealth)
    .where(eq(deviceHealth.stationId, stationId))
    .orderBy(desc(deviceHealth.ts))
    .limit(1);
  return row ? toHealthPoint(row) : null;
}

function toHealthPoint(row: typeof deviceHealth.$inferSelect): HealthPoint {
  return {
    ts: row.ts.toISOString(),
    batteryMv: row.batteryMv,
    rssi: row.rssi,
    heapFree: row.heapFree,
    uptimeS: row.uptimeS,
    powerMode: row.powerMode,
    resetReason: row.resetReason,
    buffered: row.buffered,
    dropped: row.dropped,
  };
}
