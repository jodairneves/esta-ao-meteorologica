/** Fixed categorical slots (`--series-1` … `--series-6` in styles.css); never cycled. */
export const SERIES_SLOTS = 6;

/**
 * Colour follows the station, never its position in the selection: each station keeps the
 * slot of its place in the full list, and only a clash moves the later one to a free slot.
 * `all` is the complete, stably ordered list of ids; returns id → CSS custom property.
 */
export function colorSlots(all: string[], selected: string[]): Map<string, string> {
  const slots = new Map<string, string>();
  const used = new Set<number>();
  for (const id of all.filter((item) => selected.includes(item)).slice(0, SERIES_SLOTS)) {
    let slot = all.indexOf(id) % SERIES_SLOTS;
    while (used.has(slot)) slot = (slot + 1) % SERIES_SLOTS;
    used.add(slot);
    slots.set(id, `--series-${slot + 1}`);
  }
  return slots;
}
