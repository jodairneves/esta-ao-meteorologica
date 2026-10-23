/**
 * Inserts a null point wherever the station went quiet (a gap of more than three typical
 * steps), so lines break instead of drawing a straight bridge across missing data.
 */
export function withGaps<T extends Record<string, (number | null)[]>>(
  t: number[],
  columns: T,
): { t: number[]; columns: T } {
  if (t.length < 3) return { t, columns };
  const steps = t
    .slice(1)
    .map((time, index) => time - (t[index] ?? time))
    .sort((a, b) => a - b);
  const typical = steps[Math.floor(steps.length / 2)] ?? 0;
  if (typical <= 0) return { t, columns };

  const outT: number[] = [];
  const out = Object.fromEntries(
    Object.keys(columns).map((key) => [key, [] as (number | null)[]]),
  ) as T;
  for (let i = 0; i < t.length; i++) {
    const time = t[i] as number;
    const previous = t[i - 1];
    if (previous !== undefined && time - previous > typical * 3) {
      outT.push(previous + typical);
      for (const key of Object.keys(columns)) out[key]?.push(null);
    }
    outT.push(time);
    for (const key of Object.keys(columns)) out[key]?.push(columns[key]?.[i] ?? null);
  }
  return { t: outT, columns: out };
}
