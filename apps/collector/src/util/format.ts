// Formatting for the Portuguese messages stored in event_logs and alerts.

function format(date: Date, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', { timeZone, ...options }).format(date);
  } catch {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', ...options }).format(date);
  }
}

export const formatDateTime = (date: Date, timeZone: string) =>
  format(date, timeZone, { dateStyle: 'short', timeStyle: 'short' });

export const formatTime = (date: Date, timeZone: string) =>
  format(date, timeZone, { timeStyle: 'short' });

export const formatVolts = (mv: number) => `${(mv / 1000).toFixed(2).replace('.', ',')} V`;

export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Payload preview for logs: at most `max` bytes, decoded leniently. */
export function previewPayload(payload: Buffer, max = 4096): string {
  const text = payload.subarray(0, max).toString('utf8');
  return payload.length > max ? `${text}… (${payload.length} bytes)` : text;
}
