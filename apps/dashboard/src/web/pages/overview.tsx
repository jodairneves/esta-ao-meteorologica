import { BellOff, Plus, RadioTower } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { StationStatus, StationSummary } from '../../common/api';
import { useAlerts, useStations } from '../api/queries';
import { useIsAdmin } from '../app/session';
import { AlertList } from '../components/alert-list';
import { MAP_METRICS, type MapMetric } from '../components/map/map-metrics';
import { StationRack } from '../components/station/station-rack';
import { SystemPanel } from '../components/system-panel';
import { ErrorBoundary } from '../components/ui/error-boundary';
import { EmptyState, ErrorNotice, PageHeader } from '../components/ui/misc';
import { Segmented } from '../components/ui/segmented';
import { cn } from '../lib/css';
import { usePageTitle } from '../lib/page-title';
import { supportsWebGL2 } from '../lib/webgl';

const StationsMap = lazy(() => import('../components/map/stations-map'));

const MAP_METRIC_KEY = 'wx-map-metric';
const METRIC_OPTIONS = (Object.keys(MAP_METRICS) as MapMetric[]).map((value) => ({
  value,
  label: MAP_METRICS[value].label,
}));

function storedMetric(): MapMetric {
  try {
    const value = localStorage.getItem(MAP_METRIC_KEY);
    return value && value in MAP_METRICS ? (value as MapMetric) : 'temperature';
  } catch {
    return 'temperature';
  }
}

const STATUS_WORDS: [StationStatus, string, string][] = [
  ['online', 'online', 'online'],
  ['sleeping', 'dormindo', 'dormindo'],
  ['no_contact', 'sem contato', 'sem contato'],
  ['offline', 'offline', 'offline'],
  ['unknown', 'nunca conectou', 'nunca conectaram'],
];

/** "3 estações: 2 online e 1 sem contato", "3 estações, todas online", "1 estação online". */
function summary(stations: StationSummary[]): string {
  const total = `${stations.length} ${stations.length === 1 ? 'estação' : 'estações'}`;
  const groups = STATUS_WORDS.flatMap(([status, one, many]) => {
    const count = stations.filter((station) => station.status === status).length;
    return count ? [{ count, word: count === 1 ? one : many }] : [];
  });
  const [first] = groups;
  if (!first) return total;
  if (groups.length === 1)
    return stations.length === 1 ? `${total} ${first.word}` : `${total}, todas ${first.word}`;
  const parts = groups.map((group) => `${group.count} ${group.word}`);
  return `${total}: ${parts.slice(0, -1).join(', ')} e ${parts.at(-1)}`;
}

function ActiveAlerts() {
  const alerts = useAlerts('active', 5);
  const items = alerts.data?.items ?? [];
  return (
    <section className="panel px-4 pt-3.5 pb-1">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="heading text-[15px]">Alertas ativos</h2>
        <Link
          to="/alertas"
          className="text-[13px] text-ink-2 underline-offset-4 hover:text-ink hover:underline"
        >
          Ver todos
        </Link>
      </div>
      {alerts.isError && <ErrorNotice error={alerts.error} className="my-3" />}
      {alerts.isSuccess && items.length === 0 && (
        <p className="flex items-center gap-2 py-4 text-sm text-ink-2">
          <BellOff aria-hidden className="size-4 text-ink-3" />
          Nenhum alerta ativo. Todas as estações estão dentro do esperado.
        </p>
      )}
      {items.length > 0 && <AlertList alerts={items} compact />}
    </section>
  );
}

export default function OverviewPage() {
  usePageTitle('Visão geral');
  const stations = useStations();
  const isAdmin = useIsAdmin();
  const navigate = useNavigate();
  const [metric, setMetric] = useState<MapMetric>(storedMetric);
  const webgl = supportsWebGL2();

  const chooseMetric = (value: MapMetric) => {
    setMetric(value);
    try {
      localStorage.setItem(MAP_METRIC_KEY, value);
    } catch {
      // Remembering the choice is a convenience only.
    }
  };

  const active = (stations.data ?? []).filter((station) => station.isActive);
  const inactive = (stations.data?.length ?? 0) - active.length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Visão geral"
        description={
          stations.data
            ? `${summary(active)}${inactive ? `. ${inactive} ${inactive === 1 ? 'desativada' : 'desativadas'}` : ''}`
            : undefined
        }
        actions={
          isAdmin && (
            <Link
              to="/admin/estacoes/nova"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-hairline-strong bg-raised px-3.5 text-sm font-medium text-ink hover:border-ink-3"
            >
              <Plus aria-hidden className="size-4" />
              Nova estação
            </Link>
          )
        }
      />

      {stations.isError && <ErrorNotice error={stations.error} />}

      {stations.isSuccess && active.length === 0 ? (
        <section className="panel">
          <EmptyState
            icon={RadioTower}
            title="Nenhuma estação ativa"
            action={
              isAdmin && (
                <Link
                  to="/admin/estacoes/nova"
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-ink px-3.5 text-sm font-medium text-canvas"
                >
                  <Plus aria-hidden className="size-4" />
                  Cadastrar a primeira estação
                </Link>
              )
            }
          >
            {isAdmin
              ? 'Cadastre uma estação para receber as leituras do D1 mini e acompanhar tudo por aqui.'
              : 'Assim que um administrador cadastrar uma estação, as leituras aparecem aqui.'}
          </EmptyState>
        </section>
      ) : (
        <>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
            <section
              aria-label="Mapa das estações"
              className={cn('panel relative p-px', webgl && 'h-[380px] sm:h-[460px]')}
            >
              {/* Without WebGL2 there is no map to drive, only the notice. */}
              {webgl && (
                <div className="absolute top-3 left-3 z-10 max-w-[calc(100%-4.5rem)] overflow-x-auto">
                  <Segmented
                    label="Altura das colunas"
                    value={metric}
                    options={METRIC_OPTIONS}
                    onChange={chooseMetric}
                    className="bg-panel/90 backdrop-blur-sm"
                  />
                </div>
              )}
              {/* A broken map must never take the station list down with it. */}
              <ErrorBoundary
                fallback={
                  <p className="grid h-full place-items-center p-6 text-center text-sm text-ink-2">
                    Não foi possível mostrar o mapa. Os dados das estações continuam na lista
                    abaixo.
                  </p>
                }
              >
                <Suspense
                  fallback={<div className="h-full animate-pulse rounded-[9px] bg-sunken" />}
                >
                  {stations.data && (
                    <StationsMap
                      stations={active}
                      metric={metric}
                      onSelect={(code) => navigate(`/estacoes/${code}`)}
                    />
                  )}
                </Suspense>
              </ErrorBoundary>
            </section>
            <div className="flex flex-col gap-6">
              <ActiveAlerts />
              <SystemPanel />
            </div>
          </div>

          {stations.isPending ? (
            <div className="panel h-64 animate-pulse" />
          ) : (
            <StationRack stations={active} />
          )}
        </>
      )}
    </div>
  );
}
