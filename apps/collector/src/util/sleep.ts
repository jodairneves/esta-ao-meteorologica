import { setTimeout as delay } from 'node:timers/promises';

/** Waits `ms`; resolves early (without throwing) when the signal aborts. */
export async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  try {
    await delay(ms, undefined, { signal });
  } catch (error) {
    if ((error as Error).name !== 'AbortError') throw error;
  }
}
