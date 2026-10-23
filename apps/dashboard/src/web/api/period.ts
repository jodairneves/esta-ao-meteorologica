import type { SeriesBucket } from '@wx/shared';

/** Period presets shared by every data screen (one filter row scopes all charts). */
export const PERIOD_PRESETS = ['24h', '7d', '30d', '1y'] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export const PERIOD_LABELS: Record<PeriodPreset | 'custom', string> = {
  '24h': '24 horas',
  '7d': '7 dias',
  '30d': '30 dias',
  '1y': '1 ano',
  custom: 'Personalizado',
};

const SPANS: Record<PeriodPreset, number> = {
  '24h': 86_400_000,
  '7d': 7 * 86_400_000,
  '30d': 30 * 86_400_000,
  '1y': 365 * 86_400_000,
};

/** Custom periods are whole local days, "YYYY-MM-DD" to "YYYY-MM-DD" (both included). */
export type Period = { preset: PeriodPreset } | { preset: 'custom'; from: string; to: string };

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function localMidnight(day: string, addDays = 0): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, (date ?? 1) + addDays);
}

/** Concrete range; presets end "now" (rounded to the minute so query keys stay stable). */
export function periodRange(period: Period): { from: string; to: string } {
  if (period.preset === 'custom') {
    return {
      from: localMidnight(period.from).toISOString(),
      to: localMidnight(period.to, 1).toISOString(),
    };
  }
  const to = Math.ceil(Date.now() / 60_000) * 60_000;
  return {
    from: new Date(to - SPANS[period.preset]).toISOString(),
    to: new Date(to).toISOString(),
  };
}

/** "YYYY-MM-DD" of a date in the browser's time zone (for date inputs). */
export function localDay(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function spanMs(period: Period): number {
  const { from, to } = periodRange(period);
  return new Date(to).getTime() - new Date(from).getTime();
}

/** Rain reads best as totals per hour (short periods) or per day. */
export function rainBucket(period: Period): SeriesBucket {
  return spanMs(period) <= 8 * 86_400_000 ? '1h' : '1d';
}

/** Period from the URL (?periodo=7d or ?de=…&ate=…), defaulting to 24 h. */
export function periodFromSearch(search: URLSearchParams): Period {
  const preset = search.get('periodo');
  const from = search.get('de');
  const to = search.get('ate');
  if (
    preset === 'custom' &&
    from &&
    to &&
    DAY_PATTERN.test(from) &&
    DAY_PATTERN.test(to) &&
    from <= to
  ) {
    return { preset: 'custom', from, to };
  }
  return {
    preset: (PERIOD_PRESETS as readonly string[]).includes(preset ?? '')
      ? (preset as PeriodPreset)
      : '24h',
  };
}

export function periodToSearch(period: Period): Record<string, string> {
  return period.preset === 'custom'
    ? { periodo: 'custom', de: period.from, ate: period.to }
    : { periodo: period.preset };
}
