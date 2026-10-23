import { GUST_WINDOW_S } from './contract/ranges';

/** Per-station calibration applied by the collector (design §6). */
export interface Calibration {
  /** Rain per bucket tip, in mm. */
  rainMmPerTip: number;
  /** Wind speed per pulse frequency, in m/s per Hz. */
  windMsPerHz: number;
  tempOffsetC: number;
  humOffsetPct: number;
  presOffsetHpa: number;
}

export const DEFAULT_CALIBRATION: Calibration = {
  rainMmPerTip: 0.64,
  windMsPerHz: 0.42,
  tempOffsetC: 0,
  humOffsetPct: 0,
  presOffsetHpa: 0,
};

/** Mean wind speed over the interval. */
export function windSpeedMs(
  pulses: number | null,
  durationS: number,
  windMsPerHz: number,
): number | null {
  if (pulses === null || durationS <= 0) return null;
  return (pulses / durationS) * windMsPerHz;
}

/** Gust: highest pulse count in any 3-second window, converted to speed. */
export function windGustMs(gustPulses: number | null, windMsPerHz: number): number | null {
  if (gustPulses === null) return null;
  return (gustPulses / GUST_WINDOW_S) * windMsPerHz;
}

export function rainMm(tips: number | null, rainMmPerTip: number): number | null {
  if (tips === null) return null;
  return tips * rainMmPerTip;
}

export interface BmeValues {
  temp: number | null;
  hum: number | null;
  pres: number | null;
}

/** Applies the BME280 offsets; humidity is clamped to 0–100 %. */
export function applyOffsets(values: BmeValues, calibration: Calibration): BmeValues {
  return {
    temp: values.temp === null ? null : values.temp + calibration.tempOffsetC,
    hum:
      values.hum === null
        ? null
        : Math.min(100, Math.max(0, values.hum + calibration.humOffsetPct)),
    pres: values.pres === null ? null : values.pres + calibration.presOffsetHpa,
  };
}

/** Physical description of a cup anemometer, used to estimate `windMsPerHz`. */
export interface AnemometerGeometry {
  /** Distance from the rotor axis to the cup centre, in mm. */
  radiusMm: number;
  /** Magnets (pulses) per revolution. */
  pulsesPerRevolution: number;
  /** Wind speed / cup speed ratio (typically 2.5–3 for three-cup anemometers). */
  cupFactor: number;
}

/** MakerWorld anemometer used by the project: r = 80 mm, 3 magnets. */
export const DEFAULT_ANEMOMETER_GEOMETRY: AnemometerGeometry = {
  radiusMm: 80,
  pulsesPerRevolution: 3,
  cupFactor: 2.5,
};

/** m/s per Hz = (2π·r / pulses per revolution) × cup factor. */
export function anemometerMsPerHz(geometry: AnemometerGeometry): number {
  const cupSpeedPerHz = (2 * Math.PI * (geometry.radiusMm / 1000)) / geometry.pulsesPerRevolution;
  return cupSpeedPerHz * geometry.cupFactor;
}
