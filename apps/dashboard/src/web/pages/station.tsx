import { Box, Download, MapPinOff, Pencil } from 'lucide-react';
import { lazy, Suspense, useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { API_PREFIX, type LatestResponse, type StationDetail } from '../../common/api';
import { ApiError, query } from '../api/client';
import { type Period, periodRange, spanMs } from '../api/period';
import { useLatest, useStation } from '../api/queries';
import { useIsAdmin } from '../app/session';
import { PeriodFilter, usePeriod } from '../components/period-filter';
import { DailyTable, RainCalendar } from '../components/station/daily-section';
import { HeatmapSection } from '../components/station/heatmap-section';
import { LiveReadouts } from '../components/station/live-readouts';
import { SensorStrip } from '../components/station/sensor-strip';
import { StationCharts } from '../components/station/station-charts';
import { contactText } from '../components/station/station-rack';
import { ErrorBoundary } from '../components/ui/error-boundary';
import { EmptyState, ErrorNotice, PageHeader } from '../components/ui/misc';
import { StatusPill } from '../components/ui/status';
import { cssVar } from '../lib/css';
import { formatNumber, formatTime, msToKmh, withUnit } from '../lib/format';
import { useReducedMotion } from '../lib/motion';
import { usePageTitle } from '../lib/page-title';
import { stationStatusLook, type Tone } from '../lib/status';
import { sunPosition } from '../lib/sun';
import { useTheme } from '../lib/theme';
import { useNow } from '../lib/time';

const StationScene = lazy(() => import('../components/station/scene/station-scene'));

/** Centre of Brazil: lights the scene of a station registered without coordinates. */
const FALLBACK_POSITION = { latitude: -15.8, longitude: -47.9 };
const DAY_MS = 86_400_000;

const LED_VAR: Record<Tone, string> = {
  good: '--good',
  warning: '--warning',
  serious: '--serious',
  critical: '--critical',
  neutral: '--ink-3',
};

function SceneSection({
  station,
  latest,
}: {
  station: StationDetail;
  latest: LatestResponse | undefined;
}) {
  const now = useNow(60_000);
  const reducedMotion = useReducedMotion();
  const { theme } = useTheme();
  const latitude = station.latitude ?? FALLBACK_POSITION.latitude;
  const longitude = station.longitude ?? FALLBACK_POSITION.longitude;
  const sun = useMemo(
    () => sunPosition(new Date(now), latitude, longitude),
    [now, latitude, longitude],
  );
  const look = stationStatusLook(station.status, station.statusSeverity);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the token changes with the theme
  const ledColor = useMemo(() => cssVar(LED_VAR[look.tone]), [look.tone, theme]);
  const reading = latest?.reading ?? null;
  const live = station.status === 'online' || station.status === 'sleeping';
  const wind = live ? (reading?.windSpeedMs ?? null) : null;
  const rainRate = live ? (latest?.derived.rainRateMmH ?? null) : null;

  const daylight =
    sun.elevation > 6
      ? 'dia'
      : sun.elevation > -6
        ? sun.azimuth < 180
          ? 'amanhecer'
          : 'entardecer'
        : 'noite';

  return (
    <section
      aria-label="Estação em 3D"
      className="panel relative aspect-[4/3] overflow-hidden bg-sunken sm:aspect-[16/10] xl:aspect-auto xl:min-h-[540px]"
    >
      <ErrorBoundary
        fallback={
          <EmptyState icon={Box} title="Cena 3D indisponível" className="h-full justify-center">
            Este navegador não conseguiu ativar o WebGL. Os valores ao vivo continuam ao lado.
          </EmptyState>
        }
      >
        <Suspense fallback={<div className="absolute inset-0 animate-pulse bg-sunken" />}>
          <StationScene
            sun={sun}
            latitude={latitude}
            windMs={wind}
            windMsPerHz={station.windMsPerHz}
            rainRateMmH={rainRate}
            humidityPct={reading?.humidityPct ?? null}
            ledColor={ledColor}
            ledDim={station.status === 'sleeping' || station.status === 'inactive'}
            animate={!reducedMotion}
            labels={{
              anemometer: `Vento ${withUnit(reading?.windSpeedMs == null ? null : msToKmh(reading.windSpeedMs), 'km/h', 0)}`,
              shield: `${withUnit(reading?.temperatureC, '°C', 1)}, ${withUnit(reading?.humidityPct, '%', 0)}`,
              gauge: `Chuva hoje ${withUnit(latest?.rain.todayMm, 'mm', 1)}`,
            }}
          />
        </Suspense>
      </ErrorBoundary>
      <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap items-end justify-between gap-2">
        <p className="rounded-md bg-panel/80 px-2.5 py-1 text-[13px] text-ink-2 backdrop-blur-sm">
          {formatTime(now, station.timezone)} na estação, {daylight}
          {station.latitude === null && ' (local não informado)'}
        </p>
        <p className="hidden rounded-md bg-panel/80 px-2.5 py-1 text-[13px] text-ink-3 backdrop-blur-sm sm:block">
          Arraste para girar
        </p>
      </div>
    </section>
  );
}

/** Heatmap and daily table need several days: short periods fall back to the last 30. */
function longRange(period: Period): { from: string; to: string; caption: string } {
  if (spanMs(period) >= 7 * DAY_MS)
    return { ...periodRange(period), caption: 'No período selecionado' };
  const to = Math.ceil(Date.now() / 60_000) * 60_000;
  return {
    from: new Date(to - 30 * DAY_MS).toISOString(),
    to: new Date(to).toISOString(),
    caption: 'Últimos 30 dias',
  };
}

export default function StationPage() {
  const { code = '' } = useParams();
  const station = useStation(code);
  const latest = useLatest(code);
  const [period, setPeriod] = usePeriod();
  const isAdmin = useIsAdmin();
  const now = useNow();
  usePageTitle(station.data?.name ?? 'Estação');

  if (station.isError) {
    if (station.error instanceof ApiError && station.error.status === 404) {
      return (
        <EmptyState
          icon={MapPinOff}
          title="Estação não encontrada"
          className="mt-16"
          action={
            <Link to="/" className="text-sm font-medium text-ink underline underline-offset-4">
              Ir para a visão geral
            </Link>
          }
        >
          Não existe estação com o código "{code}". Ela pode ter sido excluída.
        </EmptyState>
      );
    }
    return <ErrorNotice error={station.error} />;
  }
  if (!station.data) {
    return (
      <div className="flex flex-col gap-6">
        <div className="h-16 w-72 animate-pulse rounded-md bg-panel" />
        <div className="panel h-[540px] animate-pulse" />
      </div>
    );
  }

  const data = station.data;
  const look = stationStatusLook(data.status, data.statusSeverity);
  const live = data.status === 'online' || data.status === 'sleeping';
  const range = periodRange(period);
  const long = longRange(period);
  // Hour-rounded so the year-long query is not refetched every minute.
  const yearTo = Math.ceil(now / 3_600_000) * 3_600_000;
  const yearFrom = new Date(yearTo - 364 * DAY_MS).toISOString();
  const exportHref = `${API_PREFIX}/stations/${data.code}/export.csv${query(range)}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={data.name}
        actions={
          <>
            <a
              href={exportHref}
              download
              className="inline-flex h-9 items-center gap-2 rounded-md border border-hairline-strong bg-raised px-3.5 text-sm font-medium text-ink hover:border-ink-3"
            >
              <Download aria-hidden className="size-4" />
              Exportar CSV
            </a>
            {isAdmin && (
              <Link
                to={`/admin/estacoes/${data.code}`}
                className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-ink-2 hover:bg-raised hover:text-ink"
              >
                <Pencil aria-hidden className="size-4" />
                Editar
              </Link>
            )}
          </>
        }
      >
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
          <StatusPill look={look} />
          <span className="text-[13px] text-ink-3">{contactText(data, now)}</span>
          {data.elevationM !== null && (
            <span className="text-[13px] text-ink-3">
              Altitude {formatNumber(data.elevationM, 0)} m
            </span>
          )}
        </div>
        {data.description && (
          <p className="mt-2 max-w-2xl text-sm text-ink-2">{data.description}</p>
        )}
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <SceneSection station={data} latest={latest.data} />
        <section aria-label="Valores ao vivo" className="panel px-5 pt-2 pb-5">
          {latest.isError && <ErrorNotice error={latest.error} className="mt-3" />}
          {!live && data.state.lastReadingAt && (
            <p className="mt-3 text-[13px] text-warning">
              Valores da última leitura recebida; a estação está {look.label.toLowerCase()}.
            </p>
          )}
          <LiveReadouts station={data} latest={latest.data} stale={!live} />
        </section>
      </div>

      <section aria-label="Sensores" className="panel px-5 py-4">
        <h2 className="heading mb-3 text-[15px]">Sensores</h2>
        <SensorStrip sensors={data.sensors} />
      </section>

      <div className="sticky top-14 z-20 -mx-4 bg-canvas/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-8 lg:px-8">
        <PeriodFilter period={period} onChange={setPeriod} />
      </div>

      <StationCharts station={data} period={period} />
      <HeatmapSection code={data.code} from={long.from} to={long.to} caption={long.caption} />
      <RainCalendar
        code={data.code}
        from={yearFrom}
        to={new Date(yearTo).toISOString()}
        timeZone={data.timezone}
      />
      <DailyTable code={data.code} from={long.from} to={long.to} caption={long.caption} />
    </div>
  );
}
