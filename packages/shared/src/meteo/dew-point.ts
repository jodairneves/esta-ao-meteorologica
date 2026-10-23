// Magnus formula with the Sonntag (1990) constants, valid for -45 °C to 60 °C.
const MAGNUS_B = 17.62;
const MAGNUS_C = 243.12;

/** Dew point in °C. Returns null when humidity is not positive (the logarithm is undefined). */
export function dewPoint(tempC: number, humidityPct: number): number | null {
  if (!(humidityPct > 0)) return null;
  const rh = Math.min(humidityPct, 100);
  const gamma = Math.log(rh / 100) + (MAGNUS_B * tempC) / (MAGNUS_C + tempC);
  return (MAGNUS_C * gamma) / (MAGNUS_B - gamma);
}
