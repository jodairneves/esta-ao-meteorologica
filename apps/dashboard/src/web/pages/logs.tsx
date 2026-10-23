import { useInfiniteQuery } from '@tanstack/react-query';
import { LOG_CATEGORIES, type LogCategory, type LogLevel, type LogSource } from '@wx/shared';
import {
  ChevronRight,
  CircleX,
  Info,
  OctagonAlert,
  ScrollText,
  Search,
  TriangleAlert,
} from 'lucide-react';
import { Fragment, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { LogDto } from '../../common/api';
import { PERIOD_PRESETS, type PeriodPreset, periodRange } from '../api/period';
import { fetchLogs, useStations } from '../api/queries';
import { Button } from '../components/ui/button';
import { Input, Select } from '../components/ui/field';
import { EmptyState, ErrorNotice, PageHeader } from '../components/ui/misc';
import { StatusPill } from '../components/ui/status';
import { cn } from '../lib/css';
import { formatDateTime } from '../lib/format';
import { usePageTitle } from '../lib/page-title';
import type { StatusLook } from '../lib/status';

const LEVEL_LOOK: Record<LogLevel, StatusLook> = {
  debug: { label: 'Depuração', icon: Info, tone: 'neutral' },
  info: { label: 'Informação', icon: Info, tone: 'neutral' },
  warn: { label: 'Aviso', icon: TriangleAlert, tone: 'warning' },
  error: { label: 'Erro', icon: CircleX, tone: 'serious' },
  critical: { label: 'Crítico', icon: OctagonAlert, tone: 'critical' },
};

const SOURCE_LABELS: Record<LogSource, string> = {
  collector: 'Coletor',
  dashboard: 'Painel',
  device: 'Dispositivo',
};

const CATEGORY_LABELS: Record<LogCategory, string> = {
  ingest: 'Ingestão de dados',
  mqtt: 'MQTT',
  station: 'Estação',
  sensor: 'Sensor',
  power: 'Energia',
  command: 'Comando',
  config: 'Configuração',
  auth: 'Acesso',
  audit: 'Auditoria',
  system: 'Sistema',
};

const RANGE_LABELS: Record<PeriodPreset, string> = {
  '24h': 'Últimas 24 horas',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  '1y': 'Últimos 12 meses',
};

const FILTER_KEYS = ['nivel', 'origem', 'categoria', 'estacao', 'periodo', 'busca'] as const;

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function LogRow({ log }: { log: LogDto }) {
  const [open, setOpen] = useState(false);
  const look = LEVEL_LOOK[log.level];
  return (
    <Fragment>
      <tr className="border-t border-hairline align-top">
        <td className="px-3 py-2">
          <button
            type="button"
            aria-expanded={open}
            aria-label={open ? 'Ocultar detalhes' : 'Mostrar detalhes'}
            onClick={() => setOpen((value) => !value)}
            className="rounded p-0.5 text-ink-3 hover:bg-raised hover:text-ink"
          >
            <ChevronRight
              aria-hidden
              className={cn('size-4 transition-transform', open && 'rotate-90')}
            />
          </button>
        </td>
        <td className="px-3 py-2 whitespace-nowrap text-ink-2">
          <time dateTime={log.ts}>{formatDateTime(log.ts)}</time>
        </td>
        <td className="px-3 py-2 whitespace-nowrap">
          <StatusPill look={look} />
        </td>
        <td className="px-3 py-2 whitespace-nowrap text-ink-2">{SOURCE_LABELS[log.source]}</td>
        <td className="px-3 py-2 whitespace-nowrap text-ink-2">
          {CATEGORY_LABELS[log.category] ?? log.category}
        </td>
        <td className="px-3 py-2 whitespace-nowrap text-ink-2">{log.stationName ?? ''}</td>
        <td className="px-3 py-2 text-ink">{log.message}</td>
      </tr>
      {open && (
        <tr className="bg-sunken/60">
          <td />
          <td colSpan={6} className="px-3 pt-1 pb-3">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
              <dt className="text-ink-3">Código</dt>
              <dd className="text-ink">{log.code}</dd>
              {log.userEmail && (
                <>
                  <dt className="text-ink-3">Usuário</dt>
                  <dd className="text-ink">{log.userEmail}</dd>
                </>
              )}
            </dl>
            {log.details && (
              <pre className="dense mt-2 max-h-72 overflow-auto rounded-md border border-hairline bg-sunken p-3 text-xs leading-relaxed text-ink-2">
                {JSON.stringify(log.details, null, 2)}
              </pre>
            )}
          </td>
        </tr>
      )}
    </Fragment>
  );
}

/** Everything the system recorded about itself, newest first; new entries arrive live. */
export default function LogsPage() {
  usePageTitle('Logs');
  const stations = useStations();
  const [search, setSearch] = useSearchParams();
  const [text, setText] = useState(search.get('busca') ?? '');
  const q = useDebounced(text.trim(), 400);

  const preset = (PERIOD_PRESETS as readonly string[]).includes(search.get('periodo') ?? '')
    ? (search.get('periodo') as PeriodPreset)
    : '7d';
  const filters = {
    level: search.get('nivel') ?? undefined,
    source: search.get('origem') ?? undefined,
    category: search.get('categoria') ?? undefined,
    stationId: search.get('estacao') ?? undefined,
    q: q || undefined,
    preset,
  };

  const setFilter = (key: (typeof FILTER_KEYS)[number], value: string) =>
    setSearch(
      (current) => {
        const params = new URLSearchParams(current);
        if (value) params.set(key, value);
        else params.delete(key);
        return params;
      },
      { replace: true },
    );

  // The debounced text goes to the URL once per change (not on every navigation).
  const syncedQuery = useRef(q);
  useEffect(() => {
    if (syncedQuery.current === q) return;
    syncedQuery.current = q;
    setFilter('busca', q);
  });

  const pages = useInfiniteQuery({
    queryKey: ['logs', filters],
    queryFn: ({ pageParam }) => {
      const { from } = periodRange({ preset: filters.preset });
      return fetchLogs({
        level: filters.level,
        source: filters.source,
        category: filters.category,
        stationId: filters.stationId,
        q: filters.q,
        from,
        limit: 100,
        cursor: pageParam ?? undefined,
      });
    },
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const logs = pages.data?.pages.flatMap((page) => page.items) ?? [];
  const filtered = FILTER_KEYS.some((key) => key !== 'periodo' && search.get(key));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Logs"
        description="Registro de tudo o que o coletor, o painel e as estações informaram."
      />

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-56 flex-1 flex-col gap-1.5 text-[13px] text-ink-2">
          Buscar na mensagem
          <span className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-2.5 left-3 size-4 text-ink-3"
            />
            <Input
              type="search"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Ex.: bateria, offline, pivo-norte"
              className="pl-9"
            />
          </span>
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] text-ink-2">
          Nível
          <Select
            value={filters.level ?? ''}
            onChange={(event) => setFilter('nivel', event.target.value)}
          >
            <option value="">Todos</option>
            <option value="info">Informação ou mais grave</option>
            <option value="warn">Aviso ou mais grave</option>
            <option value="error">Erro ou mais grave</option>
            <option value="critical">Somente críticos</option>
          </Select>
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] text-ink-2">
          Origem
          <Select
            value={filters.source ?? ''}
            onChange={(event) => setFilter('origem', event.target.value)}
          >
            <option value="">Todas</option>
            {Object.entries(SOURCE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] text-ink-2">
          Categoria
          <Select
            value={filters.category ?? ''}
            onChange={(event) => setFilter('categoria', event.target.value)}
          >
            <option value="">Todas</option>
            {LOG_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {CATEGORY_LABELS[category]}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] text-ink-2">
          Estação
          <Select
            value={filters.stationId ?? ''}
            onChange={(event) => setFilter('estacao', event.target.value)}
          >
            <option value="">Todas</option>
            {(stations.data ?? []).map((station) => (
              <option key={station.id} value={station.id}>
                {station.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] text-ink-2">
          Período
          <Select value={preset} onChange={(event) => setFilter('periodo', event.target.value)}>
            {PERIOD_PRESETS.map((value) => (
              <option key={value} value={value}>
                {RANGE_LABELS[value]}
              </option>
            ))}
          </Select>
        </label>
        {filtered && (
          <Button
            variant="ghost"
            onClick={() => {
              setText('');
              setSearch({}, { replace: true });
            }}
          >
            Limpar filtros
          </Button>
        )}
      </div>

      {pages.isError && <ErrorNotice error={pages.error} />}
      <section aria-label="Registros" className="panel overflow-x-auto">
        <table className="w-full min-w-[880px] text-sm">
          <thead className="text-left text-[13px] text-ink-2">
            <tr>
              <th scope="col" className="w-8 px-3 py-2.5">
                <span className="sr-only">Detalhes</span>
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                Data e hora
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                Nível
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                Origem
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                Categoria
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                Estação
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                Mensagem
              </th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <LogRow key={log.id} log={log} />
            ))}
          </tbody>
        </table>
        {pages.isPending && <div className="h-40 animate-pulse" />}
        {pages.isSuccess && logs.length === 0 && (
          <EmptyState icon={ScrollText} title="Nenhum registro encontrado">
            {filtered
              ? 'Nenhum registro combina com os filtros escolhidos.'
              : 'Ainda não há registros neste período.'}
          </EmptyState>
        )}
      </section>
      {pages.hasNextPage && (
        <Button
          className="self-center"
          loading={pages.isFetchingNextPage}
          onClick={() => pages.fetchNextPage()}
        >
          Carregar mais
        </Button>
      )}
    </div>
  );
}
