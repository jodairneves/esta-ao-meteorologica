import { msToKmh } from './wind';

const celsiusToFahrenheit = (c: number) => (c * 9) / 5 + 32;
const fahrenheitToCelsius = (f: number) => ((f - 32) * 5) / 9;

/** Heat index in °C (NOAA: simple formula, Rothfusz regression above 80 °F, with adjustments). */
export function heatIndex(tempC: number, humidityPct: number): number {
  const t = celsiusToFahrenheit(tempC);
  const rh = humidityPct;
  let hi = 0.5 * (t + 61 + (t - 68) * 1.2 + rh * 0.094);

  if ((hi + t) / 2 >= 80) {
    hi =
      -42.379 +
      2.04901523 * t +
      10.14333127 * rh -
      0.22475541 * t * rh -
      0.00683783 * t * t -
      0.05481717 * rh * rh +
      0.00122874 * t * t * rh +
      0.00085282 * t * rh * rh -
      0.00000199 * t * t * rh * rh;

    if (rh < 13 && t >= 80 && t <= 112) {
      hi -= ((13 - rh) / 4) * Math.sqrt((17 - Math.abs(t - 95)) / 17);
    } else if (rh > 85 && t >= 80 && t <= 87) {
      hi += ((rh - 85) / 10) * ((87 - t) / 5);
    }
  }

  return fahrenheitToCelsius(hi);
}

/** Wind chill in °C (2001 North American formula); meaningful for T ≤ 10 °C and wind > 4.8 km/h. */
export function windChill(tempC: number, windKmh: number): number {
  const v = windKmh ** 0.16;
  return 13.12 + 0.6215 * tempC - 11.37 * v + 0.3965 * tempC * v;
}

/** Apparent temperature: heat index when hot and humid, wind chill when cold and windy. */
export function feelsLike(
  tempC: number,
  humidityPct: number | null,
  windMs: number | null,
): number {
  if (humidityPct !== null && tempC >= 27 && humidityPct >= 40) {
    return heatIndex(tempC, humidityPct);
  }
  if (windMs !== null && tempC <= 10) {
    const windKmh = msToKmh(windMs);
    if (windKmh > 4.8) return windChill(tempC, windKmh);
  }
  return tempC;
}
