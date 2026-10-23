import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { API_PREFIX } from '../../common/api';

/** Coalesces bursts of events (a station flushing its buffer) into one refetch. */
function throttled(run: () => void, waitMs: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      run();
    }, waitMs);
  };
}

function subscribe(client: QueryClient, onConnection: (connected: boolean) => void): () => void {
  const source = new EventSource(`${API_PREFIX}/stream`);
  const invalidate =
    (...prefixes: string[]) =>
    () => {
      for (const prefix of prefixes) client.invalidateQueries({ queryKey: [prefix] });
    };

  // Only mounted queries refetch, so broad invalidation is cheap.
  const onReadings = throttled(
    invalidate('stations', 'latest', 'series', 'compare', 'devices'),
    2000,
  );
  const onStation = throttled(invalidate('stations', 'station', 'devices', 'system'), 1000);
  const onAlert = throttled(invalidate('alerts', 'stations', 'station', 'system'), 1000);
  const onLog = throttled(invalidate('logs'), 2000);

  source.addEventListener('open', () => onConnection(true));
  source.addEventListener('error', () => onConnection(source.readyState === EventSource.OPEN));
  source.addEventListener('readings', onReadings);
  source.addEventListener('station', onStation);
  source.addEventListener('alert', onAlert);
  source.addEventListener('log', onLog);
  // The server lost notifications (database reconnect): refetch whatever is on screen.
  source.addEventListener('resync', () => client.invalidateQueries());

  return () => source.close();
}

/** Keeps the screens live; returns whether the stream is connected. */
export function useLiveStream(enabled: boolean): boolean {
  const client = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    return subscribe(client, setConnected);
  }, [client, enabled]);

  return enabled && connected;
}
