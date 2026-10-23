export const TOPIC_ROOT = 'weather/v1';

/** Message kinds under `weather/v1/{code}/{kind}`. */
export const MESSAGE_KINDS = ['telemetry', 'status', 'health', 'event', 'config', 'cmd'] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

/** Kinds published by stations and consumed by the collector. */
export const STATION_PUBLISHED_KINDS = [
  'telemetry',
  'status',
  'health',
  'event',
] as const satisfies readonly MessageKind[];
export type StationPublishedKind = (typeof STATION_PUBLISHED_KINDS)[number];

/** Station code: 3–32 chars, lowercase letters, digits and inner hyphens. Also the MQTT username. */
export const STATION_CODE_PATTERN = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

export function isValidStationCode(code: string): boolean {
  return STATION_CODE_PATTERN.test(code);
}

export function stationTopic(code: string, kind: MessageKind): string {
  if (!isValidStationCode(code)) throw new Error(`Invalid station code: "${code}"`);
  return `${TOPIC_ROOT}/${code}/${kind}`;
}

export function parseStationTopic(topic: string): { code: string; kind: MessageKind } | null {
  const parts = topic.split('/');
  if (parts.length !== 4) return null;
  const [root, version, code, kind] = parts as [string, string, string, string];
  if (`${root}/${version}` !== TOPIC_ROOT) return null;
  if (!isValidStationCode(code)) return null;
  if (!(MESSAGE_KINDS as readonly string[]).includes(kind)) return null;
  return { code, kind: kind as MessageKind };
}

/** MQTT client id a station must use (enforced by the broker). */
export function stationClientId(code: string): string {
  return `st-${code}`;
}

/** Topic filters the collector subscribes to. */
export const COLLECTOR_TOPIC_FILTERS: readonly string[] = STATION_PUBLISHED_KINDS.map(
  (kind) => `${TOPIC_ROOT}/+/${kind}`,
);

/** Suggests a valid station code from a display name (e.g. "Fazenda São João" → "fazenda-sao-joao"). */
export function suggestStationCode(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/g, '');
  if (slug.length >= 3) return slug;
  return slug ? `${slug}-wx` : 'estacao';
}
