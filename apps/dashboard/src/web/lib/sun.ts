const RAD = Math.PI / 180;

export interface SunPosition {
  /** Degrees above the horizon (negative at night). */
  elevation: number;
  /** Degrees clockwise from north. */
  azimuth: number;
}

/**
 * Solar position (low-precision almanac formulas, good to ~1°): enough to paint the sky of
 * the station scene for its own place and time.
 */
export function sunPosition(date: Date, latitude: number, longitude: number): SunPosition {
  const days = date.getTime() / 86_400_000 + 2440587.5 - 2451545.0;
  const meanLongitude = (280.46 + 0.9856474 * days) % 360;
  const meanAnomaly = ((357.528 + 0.9856003 * days) % 360) * RAD;
  const eclipticLongitude =
    (meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly)) * RAD;
  const obliquity = (23.439 - 0.0000004 * days) * RAD;

  const rightAscension = Math.atan2(
    Math.cos(obliquity) * Math.sin(eclipticLongitude),
    Math.cos(eclipticLongitude),
  );
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude));
  const siderealHours = (18.697374558 + 24.06570982441908 * days) % 24;
  const hourAngle = (siderealHours * 15 + longitude) * RAD - rightAscension;

  const lat = latitude * RAD;
  const elevation = Math.asin(
    Math.sin(lat) * Math.sin(declination) +
      Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle),
  );
  const azimuth = Math.atan2(
    -Math.sin(hourAngle),
    Math.tan(declination) * Math.cos(lat) - Math.sin(lat) * Math.cos(hourAngle),
  );
  return { elevation: elevation / RAD, azimuth: (((azimuth / RAD) % 360) + 360) % 360 };
}

export const sunElevation = (date: Date, latitude: number, longitude: number): number =>
  sunPosition(date, latitude, longitude).elevation;
