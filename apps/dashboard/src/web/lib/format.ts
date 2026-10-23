// Brazilian formatting. "—" means "not measured"; never print 0 for a missing value.

const LOCALE = 'pt-BR';
export const MISSING = '—';

const numberFormats = new Map<number, Intl.NumberFormat>();
function numberFormat(digits: number): Intl.NumberFormat {
  let format = numberFormats.get(digits);
  if (!format) {
    format = new Intl.NumberFormat(LOCALE, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    numberFormats.set(digits, format);
  }
  return format;
}

export function formatNumber(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? MISSING
    : numberFormat(digits).format(value);
}

const axisFormats = new Map<number, Intl.NumberFormat>();

/** Axis ticks: only the decimals a tick needs (4 / 4,1 / 4,15), up to `maxDigits`. */
export function formatAxisNumber(value: number, maxDigits: number): string {
  let format = axisFormats.get(maxDigits);
  if (!format) {
    format = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: maxDigits });
    axisFormats.set(maxDigits, format);
  }
  return format.format(value);
}

/** Value with its unit ("23,4 °C"), or "—". */
export function withUnit(value: number | null | undefined, unit: string, digits = 1): string {
  const text = formatNumber(value, digits);
  return text === MISSING ? MISSING : `${text} ${unit}`;
}

export const msToKmh = (ms: number) => ms * 3.6;

const dateTimeFormats = new Map<string, Intl.DateTimeFormat>();
function dateTimeFormat(options: Intl.DateTimeFormatOptions, timeZone?: string) {
  const key = JSON.stringify([options, timeZone]);
  let format = dateTimeFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(LOCALE, { ...options, timeZone });
    dateTimeFormats.set(key, format);
  }
  return format;
}

type DateInput = string | number | Date | null | undefined;

const toDate = (value: DateInput): Date | null =>
  value === null || value === undefined ? null : new Date(value);

export function formatDateTime(value: DateInput, timeZone?: string): string {
  const date = toDate(value);
  return date
    ? dateTimeFormat({ dateStyle: 'short', timeStyle: 'short' }, timeZone)
        .format(date)
        .replace(',', '')
    : MISSING;
}

export function formatTime(value: DateInput, timeZone?: string): string {
  const date = toDate(value);
  return date ? dateTimeFormat({ timeStyle: 'short' }, timeZone).format(date) : MISSING;
}

export function formatShortDate(value: DateInput, timeZone?: string): string {
  const date = toDate(value);
  return date
    ? dateTimeFormat({ day: '2-digit', month: '2-digit' }, timeZone).format(date)
    : MISSING;
}

/** Calendar day ("YYYY-MM-DD") of an instant in a time zone. */
export function localDayOf(value: DateInput, timeZone?: string): string {
  const date = toDate(value) ?? new Date(0);
  return dateTimeFormat({ year: 'numeric', month: '2-digit', day: '2-digit' }, timeZone)
    .format(date)
    .split('/')
    .reverse()
    .join('-');
}

/** "YYYY-MM-DD" (a local calendar day from the API) → "qua., 22/10". */
export function formatDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  const utc = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, date ?? 1, 12));
  return dateTimeFormat({ weekday: 'short', day: '2-digit', month: '2-digit' }, 'UTC').format(utc);
}

const relative = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });

/** "agora", "há 12 segundos", "há 3 minutos", "em 10 minutos"… */
export function formatRelative(value: DateInput, now = Date.now()): string {
  const date = toDate(value);
  if (!date) return MISSING;
  const seconds = Math.round((date.getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 10) return 'agora';
  if (abs < 60) return relative.format(seconds, 'second');
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return relative.format(Math.round(seconds / 3600), 'hour');
  return relative.format(Math.round(seconds / 86_400), 'day');
}

export function formatDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined) return MISSING;
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days} d ${hours} h`;
  if (hours > 0) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}

export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${formatNumber(value, unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/** Compact counts for axis ticks: 1.200 → "1,2 mil". */
export function formatCompact(value: number): string {
  return new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
}
