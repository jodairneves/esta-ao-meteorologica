// Approximate resting-voltage curve of an 18650 Li-ion cell (mV → %). Good enough for a gauge.
const LI_ION_CURVE: ReadonlyArray<readonly [mv: number, pct: number]> = [
  [4200, 100],
  [4100, 90],
  [4000, 80],
  [3920, 70],
  [3850, 60],
  [3790, 50],
  [3750, 40],
  [3710, 30],
  [3670, 20],
  [3610, 10],
  [3500, 5],
  [3300, 0],
];

/** Estimated state of charge (0–100) of a Li-ion cell from its voltage. */
export function liIonPercent(mv: number): number {
  const [highest] = LI_ION_CURVE;
  if (!highest || mv >= highest[0]) return 100;

  for (let i = 1; i < LI_ION_CURVE.length; i++) {
    const upper = LI_ION_CURVE[i - 1];
    const lower = LI_ION_CURVE[i];
    if (!upper || !lower) break;
    if (mv >= lower[0]) {
      const ratio = (mv - lower[0]) / (upper[0] - lower[0]);
      return Math.round(lower[1] + ratio * (upper[1] - lower[1]));
    }
  }
  return 0;
}
