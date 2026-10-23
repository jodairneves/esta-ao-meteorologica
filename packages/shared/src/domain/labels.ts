import type { ClimateSensor, ConnectionState, PowerMode, Sensor } from './enums';

// Portuguese labels shown to users (dashboard and log messages).

export const SENSOR_LABELS: Record<Sensor, string> = {
  bme280: 'BME280 (temperatura, umidade e pressão)',
  htu21d: 'HTU21D (temperatura e umidade)',
  anemometer: 'anemômetro',
  rain_gauge: 'pluviômetro',
  battery: 'bateria',
};

/** The two station versions, named by their climate sensor. */
export const CLIMATE_SENSOR_LABELS: Record<ClimateSensor, string> = {
  bme280: 'BME280 (completa: temperatura, umidade e pressão)',
  htu21d: 'HTU21D (temperatura e umidade, sem pressão)',
};

export const POWER_MODE_LABELS: Record<PowerMode, string> = {
  normal: 'Normal',
  economy: 'Economia',
  survival: 'Sobrevivência',
};

/**
 * "Estação <name>" for messages, without repeating the word when the name already starts with
 * it ("Estação Sede" stays as is). Keeps the feminine agreement: "Estação Pivô Norte conectada".
 */
export function stationLabel(name: string): string {
  const trimmed = name.trim();
  const plain = trimmed.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return plain.startsWith('estacao') ? trimmed : `Estação ${trimmed}`;
}

export const CONNECTION_LABELS: Record<ConnectionState, string> = {
  unknown: 'Desconhecido',
  online: 'Online',
  sleeping: 'Dormindo',
  offline: 'Offline',
};
