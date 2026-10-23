import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SeriesBucket } from '@wx/shared';
import type {
  AlertDto,
  CommandDto,
  CompareResponse,
  ConnectionEvent,
  DailyRow,
  DeviceOverview,
  HealthPoint,
  HeatmapResponse,
  LatestResponse,
  LogDto,
  Metric,
  Page,
  SeriesResponse,
  SessionUser,
  SettingsDto,
  StationDetail,
  StationSummary,
  SystemStatus,
  UserSummary,
} from '../../common/api';
import { ApiError, api, query } from './client';

/** Query keys: every screen reads through these, and the live stream invalidates them. */
export const keys = {
  session: ['session'] as const,
  stations: ['stations'] as const,
  station: (id: string) => ['station', id] as const,
  latest: (id: string) => ['latest', id] as const,
  series: (id: string, from: string, to: string, bucket: string) =>
    ['series', id, from, to, bucket] as const,
  daily: (id: string, from: string, to: string) => ['daily', id, from, to] as const,
  heatmap: (id: string, metric: Metric, from: string, to: string) =>
    ['heatmap', id, metric, from, to] as const,
  compare: (ids: string[], metric: Metric, from: string, to: string, bucket: string) =>
    ['compare', ids.join(','), metric, from, to, bucket] as const,
  devices: ['devices'] as const,
  health: (id: string, from: string, to: string) => ['health', id, from, to] as const,
  connection: (id: string, from: string, to: string) => ['connection', id, from, to] as const,
  commands: (id: string) => ['commands', id] as const,
  alerts: (status: string) => ['alerts', status] as const,
  logs: (filters: Record<string, string | undefined>) => ['logs', filters] as const,
  system: ['system'] as const,
  settings: ['settings'] as const,
  users: ['users'] as const,
};

export function useSession() {
  return useQuery({
    queryKey: keys.session,
    queryFn: async (): Promise<SessionUser | null> => {
      try {
        return (await api.get<{ user: SessionUser }>('/auth/me')).user;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
}

export const useStations = () =>
  useQuery({ queryKey: keys.stations, queryFn: () => api.get<StationSummary[]>('/stations') });

export const useStation = (id: string, enabled = true) =>
  useQuery({
    queryKey: keys.station(id),
    queryFn: () => api.get<StationDetail>(`/stations/${id}`),
    enabled: enabled && id !== '',
  });

export const useLatest = (id: string) =>
  useQuery({
    queryKey: keys.latest(id),
    queryFn: () => api.get<LatestResponse>(`/stations/${id}/latest`),
  });

export const useSeries = (
  id: string,
  from: string,
  to: string,
  bucket: SeriesBucket | 'auto' = 'auto',
) =>
  useQuery({
    queryKey: keys.series(id, from, to, bucket),
    queryFn: () => api.get<SeriesResponse>(`/stations/${id}/series${query({ from, to, bucket })}`),
    // Refetching keeps the previous chart on screen (no skeleton flash).
    placeholderData: keepPreviousData,
  });

export const useDaily = (id: string, from: string, to: string) =>
  useQuery({
    queryKey: keys.daily(id, from, to),
    queryFn: () => api.get<DailyRow[]>(`/stations/${id}/daily${query({ from, to })}`),
    placeholderData: keepPreviousData,
  });

export const useHeatmap = (id: string, metric: Metric, from: string, to: string) =>
  useQuery({
    queryKey: keys.heatmap(id, metric, from, to),
    queryFn: () =>
      api.get<HeatmapResponse>(`/stations/${id}/heatmap${query({ metric, from, to })}`),
    placeholderData: keepPreviousData,
  });

export const useCompare = (
  ids: string[],
  metric: Metric,
  from: string,
  to: string,
  bucket: SeriesBucket | 'auto' = 'auto',
) =>
  useQuery({
    queryKey: keys.compare(ids, metric, from, to, bucket),
    queryFn: () =>
      api.get<CompareResponse>(
        `/compare${query({ stations: ids.join(','), metric, from, to, bucket })}`,
      ),
    enabled: ids.length > 0,
    placeholderData: keepPreviousData,
  });

export const useDevices = () =>
  useQuery({ queryKey: keys.devices, queryFn: () => api.get<DeviceOverview[]>('/devices') });

export const useHealth = (id: string, from: string, to: string, enabled = true) =>
  useQuery({
    queryKey: keys.health(id, from, to),
    queryFn: () => api.get<HealthPoint[]>(`/stations/${id}/health${query({ from, to })}`),
    enabled,
  });

export const useConnection = (id: string, from: string, to: string, enabled = true) =>
  useQuery({
    queryKey: keys.connection(id, from, to),
    queryFn: () => api.get<ConnectionEvent[]>(`/stations/${id}/connection${query({ from, to })}`),
    enabled,
  });

export const useCommands = (id: string, enabled = true) =>
  useQuery({
    queryKey: keys.commands(id),
    queryFn: () => api.get<CommandDto[]>(`/stations/${id}/commands`),
    enabled,
  });

export const useAlerts = (status: 'active' | 'resolved' | 'all', limit = 100) =>
  useQuery({
    queryKey: keys.alerts(status),
    queryFn: () => api.get<Page<AlertDto>>(`/alerts${query({ status, limit })}`),
  });

export const useSystemStatus = () =>
  useQuery({
    queryKey: keys.system,
    queryFn: () => api.get<SystemStatus>('/system/status'),
    refetchInterval: 30_000,
  });

export const useSettings = () =>
  useQuery({ queryKey: keys.settings, queryFn: () => api.get<SettingsDto>('/settings') });

export const useUsers = () =>
  useQuery({ queryKey: keys.users, queryFn: () => api.get<UserSummary[]>('/users') });

export const fetchLogs = (params: Record<string, string | number | undefined>) =>
  api.get<Page<LogDto>>(`/logs${query(params)}`);

/** Acknowledging is allowed to every signed-in user. */
export function useAcknowledgeAlert() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post<AlertDto>(`/alerts/${id}/ack`),
    onSuccess: () => client.invalidateQueries({ queryKey: ['alerts'] }),
  });
}
