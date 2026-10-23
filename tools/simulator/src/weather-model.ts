import type { ClimateProfile } from './demo-stations';
import { clamp, createRng, gaussian, type Rng } from './rng';

const DAY_S = 86_400;
const MAGNUS_B = 17.62;
const MAGNUS_C = 243.12;

export interface WeatherSample {
  tempC: number;
  humidityPct: number;
  /** Station (absolute) pressure, as a BME280 would read it. */
  pressureHpa: number;
  windMeanMs: number;
  windGustMs: number;
  /** Rain fallen during the interval. */
  rainMm: number;
  raining: boolean;
}

export interface Site {
  longitude: number;
  elevationM: number;
}

/** Relative humidity from temperature and dew point (Magnus). */
export function relativeHumidity(tempC: number, dewPointC: number): number {
  return (
    100 *
    Math.exp(
      (MAGNUS_B * dewPointC) / (MAGNUS_C + dewPointC) - (MAGNUS_B * tempC) / (MAGNUS_C + tempC),
    )
  );
}

/** Station pressure from the sea-level pressure (inverse of `seaLevelPressure` in @wx/shared). */
export function stationPressure(mslHpa: number, tempC: number, elevationM: number): number {
  const lapse = 0.0065 * elevationM;
  return mslHpa * (1 - lapse / (tempC + lapse + 273.15)) ** 5.257;
}

/** Slow, smooth variation in [-1, 1] built from sinusoids with periods of days (weather fronts). */
class SlowWave {
  private readonly components: { periodS: number; phase: number; weight: number }[];
  private readonly totalWeight: number;

  constructor(rng: Rng, periodsDays: readonly number[]) {
    this.components = periodsDays.map((days, index) => ({
      periodS: days * DAY_S,
      phase: rng() * 2 * Math.PI,
      weight: 1 / (index + 1),
    }));
    this.totalWeight = this.components.reduce((sum, c) => sum + c.weight, 0);
  }

  at(seconds: number): number {
    const sum = this.components.reduce(
      (acc, c) => acc + c.weight * Math.sin((2 * Math.PI * seconds) / c.periodS + c.phase),
      0,
    );
    return sum / this.totalWeight;
  }
}

/**
 * Plausible weather for a site: diurnal temperature cycle, humidity from a slowly varying dew
 * point, pressure fronts plus the semidiurnal tide, wind stronger in the afternoon, and rain
 * events (Markov chain) that are more likely with low pressure and in the afternoon.
 * Deterministic for a given seed and call sequence.
 */
export class WeatherModel {
  private readonly rng: Rng;
  private readonly thermal: SlowWave;
  private readonly moisture: SlowWave;
  private readonly fronts: SlowWave;
  private readonly windiness: SlowWave;
  private raining = false;
  private rainRateMmH = 0;

  constructor(
    private readonly climate: ClimateProfile,
    private readonly site: Site,
    seed: number,
  ) {
    this.rng = createRng(seed);
    this.thermal = new SlowWave(this.rng, [6.1, 2.9]);
    this.moisture = new SlowWave(this.rng, [4.3, 1.7]);
    this.fronts = new SlowWave(this.rng, [5.3, 2.3]);
    this.windiness = new SlowWave(this.rng, [3.7, 1.3]);
  }

  /** Conditions over the `durationS` seconds ending at `endMs`. */
  sample(endMs: number, durationS: number): WeatherSample {
    const t = endMs / 1000;
    const solarHour = (((t / 3600 + this.site.longitude / 15) % 24) + 24) % 24;
    const diurnal = Math.sin((2 * Math.PI * (solarHour - 9)) / 24); // +1 at 15 h, -1 at 3 h
    const daylight = Math.max(0, Math.sin((Math.PI * (solarHour - 6)) / 12));
    const front = this.fronts.at(t);

    this.updateRain(durationS, front, solarHour);

    const rainCooling = this.raining ? 2 + Math.min(4, this.rainRateMmH / 5) : 0;
    const tempC =
      this.climate.meanTempC +
      this.climate.dailyAmplitudeC * diurnal +
      3 * this.thermal.at(t) -
      rainCooling +
      0.15 * gaussian(this.rng);

    const dewPointC = this.raining
      ? tempC - 0.3 - 0.4 * this.rng()
      : Math.min(
          tempC - 0.5,
          this.climate.meanTempC - 7 + 4 * this.moisture.at(t) + 0.2 * gaussian(this.rng),
        );
    const humidityPct = clamp(relativeHumidity(tempC, dewPointC), 12, 100);

    const mslHpa =
      this.climate.meanPressureMslHpa +
      6 * front +
      1.1 * Math.cos((4 * Math.PI * (solarHour - 10)) / 24) -
      (this.raining ? 1 : 0) +
      0.05 * gaussian(this.rng);

    let windMeanMs =
      this.climate.windMeanMs *
        (0.35 + 0.9 * daylight) *
        (1 + 0.45 * this.windiness.at(t)) *
        (this.raining ? 1.4 : 1) +
      0.25 * Math.abs(gaussian(this.rng));
    if (daylight === 0 && this.rng() < 0.25) windMeanMs *= 0.2; // calm nights
    windMeanMs = Math.max(0, windMeanMs);
    const windGustMs =
      windMeanMs < 0.3 ? windMeanMs : windMeanMs * (1.3 + 0.4 * this.rng()) + 0.6 * this.rng();

    return {
      tempC,
      humidityPct,
      pressureHpa: stationPressure(mslHpa, tempC, this.site.elevationM),
      windMeanMs,
      windGustMs,
      rainMm: this.raining ? (this.rainRateMmH * durationS) / 3600 : 0,
      raining: this.raining,
    };
  }

  private updateRain(durationS: number, front: number, solarHour: number): void {
    if (this.raining) {
      const meanEventS = 1.5 * 3600;
      if (this.rng() < durationS / meanEventS) {
        this.raining = false;
        this.rainRateMmH = 0;
      } else {
        this.rainRateMmH = clamp(this.rainRateMmH * Math.exp(0.25 * gaussian(this.rng)), 0.2, 90);
      }
      return;
    }
    const lowPressureBoost = 1 + 1.5 * Math.max(0, -front);
    const afternoonBoost = solarHour >= 13 && solarHour <= 19 ? 2 : 0.7;
    const chance =
      ((this.climate.rainEventsPerDay * durationS) / DAY_S) * lowPressureBoost * afternoonBoost;
    if (this.rng() < chance) {
      this.raining = true;
      this.rainRateMmH = clamp(3 * Math.exp(0.9 * gaussian(this.rng)), 0.3, 80);
    }
  }
}
