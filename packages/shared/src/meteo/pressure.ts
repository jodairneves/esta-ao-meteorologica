export const STANDARD_SEA_LEVEL_HPA = 1013.25;

/** Station pressure reduced to mean sea level, using the station temperature (hypsometric form). */
export function seaLevelPressure(stationHpa: number, tempC: number, elevationM: number): number {
  const lapse = 0.0065 * elevationM;
  return stationHpa * (1 - lapse / (tempC + lapse + 273.15)) ** -5.257;
}

/** Altitude in metres for a pressure, using the international standard atmosphere. */
export function barometricAltitude(
  stationHpa: number,
  seaLevelHpa: number = STANDARD_SEA_LEVEL_HPA,
): number {
  return 44330 * (1 - (stationHpa / seaLevelHpa) ** (1 / 5.255));
}

export type PressureTrend =
  | 'steady'
  | 'rising_slowly'
  | 'rising'
  | 'rising_quickly'
  | 'rising_very_rapidly'
  | 'falling_slowly'
  | 'falling'
  | 'falling_quickly'
  | 'falling_very_rapidly';

/** Pressure tendency from the change over the last 3 hours (Met Office categories). */
export function pressureTrend(change3hHpa: number): PressureTrend {
  const magnitude = Math.abs(change3hHpa);
  if (magnitude < 0.1) return 'steady';
  const direction = change3hHpa > 0 ? 'rising' : 'falling';
  if (magnitude <= 1.5) return `${direction}_slowly`;
  if (magnitude <= 3.5) return direction;
  if (magnitude <= 6) return `${direction}_quickly`;
  return `${direction}_very_rapidly`;
}
