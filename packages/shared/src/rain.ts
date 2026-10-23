/** Last rain counter seen for a station (persisted in `station_state`). */
export interface RainCounterState {
  run: number;
  count: number;
  seq: number;
}

export interface RainTipsResult {
  /** Tips counted in this reading's interval; null when unknown (not measured or out of order). */
  tips: number | null;
  /** State to persist after this reading (unchanged when the reading is ignored). */
  state: RainCounterState | null;
  /** Set when the counter went backwards within the same run. */
  anomaly: 'counter_decreased' | null;
}

/**
 * Rain by difference of the cumulative counter (design §6.1).
 * The counter lives in the station's RTC memory and only restarts when `run` changes.
 */
export function computeRainTips(
  previous: RainCounterState | null,
  run: number,
  seq: number,
  count: number | null,
): RainTipsResult {
  if (count === null) return { tips: null, state: previous, anomaly: null };

  const next: RainCounterState = { run, count, seq };

  // First reading ever: establish the baseline without inventing rain.
  if (previous === null) return { tips: 0, state: next, anomaly: null };

  // Power loss: the counter restarted from zero, so everything counted is new rain.
  if (previous.run !== run) return { tips: count, state: next, anomaly: null };

  // Redelivered or out-of-order reading: unknown, and must not move the baseline.
  if (seq <= previous.seq) return { tips: null, state: previous, anomaly: null };

  const delta = count - previous.count;
  if (delta < 0) return { tips: 0, state: next, anomaly: 'counter_decreased' };
  return { tips: delta, state: next, anomaly: null };
}
