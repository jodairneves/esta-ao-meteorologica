export const SERIES_BUCKETS = ['raw', '10m', '1h', '1d'] as const;
export type SeriesBucket = (typeof SERIES_BUCKETS)[number];

export const BUCKET_SECONDS: Record<Exclude<SeriesBucket, 'raw'>, number> = {
  '10m': 600,
  '1h': 3600,
  '1d': 86_400,
};

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Aggregation chosen for a requested period (design §8.5). */
export function autoBucket(from: Date, to: Date): SeriesBucket {
  const span = to.getTime() - from.getTime();
  if (span <= 48 * HOUR_MS) return 'raw';
  if (span <= 10 * DAY_MS) return '10m';
  if (span <= 62 * DAY_MS) return '1h';
  return '1d';
}
