export const msToKmh = (ms: number): number => ms * 3.6;
export const kmhToMs = (kmh: number): number => kmh / 3.6;

/** Upper bound (exclusive, m/s) of Beaufort forces 0–11 (WMO). Force 12 is anything above. */
const BEAUFORT_UPPER_MS = [0.3, 1.6, 3.4, 5.5, 8, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7];

/** Traditional Portuguese names of the Beaufort forces 0–12. */
export const BEAUFORT_LABELS = [
  'Calmaria',
  'Bafagem',
  'Aragem',
  'Fraco',
  'Moderado',
  'Fresco',
  'Muito fresco',
  'Forte',
  'Muito forte',
  'Duro',
  'Muito duro',
  'Tempestuoso',
  'Furacão',
] as const;

export function beaufort(windMs: number): { force: number; label: string } {
  const index = BEAUFORT_UPPER_MS.findIndex((upper) => windMs < upper);
  const force = index === -1 ? 12 : index;
  return { force, label: BEAUFORT_LABELS[force] ?? 'Furacão' };
}
