import { measuresPressure, type SeriesBucket } from '@wx/shared';
import { ChartSpline, Check } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { Metric } from '../../common/api';
import { periodRange, spanMs } from '../api/period';
import { useCompare, useStations } from '../api/queries';
import { ChartPanel } from '../components/charts/chart-panel';
import { withGaps } from '../components/charts/gaps';
import { type LineSeries, TimeSeriesChart } from '../components/charts/time-series';
import { PeriodFilter, usePeriod } from '../components/period-filter';
import { EmptyState, ErrorNotice, PageHeader } from '../components/ui/misc';
import { Segmented } from '../components/ui/segmented';
import { cn } from '../lib/css';
import { formatDateTime, formatNumber } from '../lib/format';
import { usePageTitle } from '../lib/page-title';
import { QUANTITIES } from '../lib/quantities';
import { colorSlots, SERIES_SLOTS } from '../lib/series-colors';

const MAX_STATIONS = SERIES_SLOTS;

const METRIC_OPTIONS: { value: Metric; label: string }[] = [
  { value: 'temperature', label: 'Temperatura' },
  { value: 'humidity', label: 'Umidade' },
  { value: 'pressureMsl', label: 'Pressão' },
  { value: 'dewPoint', label: 'Orvalho' },
  { value: 'wind', label: 'Vento' },
  { value: 'gust', label: 'Rajada' },
  { value: 'rain', label: 'Chuva' },
];

/** Same quantity, several stations: lines on one axis (rain as the running total). */
export default function ComparePage() {
  usePageTitle('Comparar estações');
  const stations = useStations();
  const [period, setPeriod] = usePeriod();
  const [search, setSearch] = useSearchParams();
  const [metric, setMetric] = useState<Metric>(() => {
    const value = search.get('grandeza');
    return METRIC_OPTIONS.some((option) => option.value === value)
      ? (value as Metric)
      : 'temperature';
  });

  const active = (stations.data ?? []).filter((station) => station.isActive);
  const fromUrl = search.get('estacoes')?.split(',').filter(Boolean);
  const selected = (fromUrl ?? active.slice(0, MAX_STATIONS).map((station) => station.code))
    .map((code) => active.find((station) => station.code === code)?.id)
    .filter((id): id is string => Boolean(id));

  const setSelected = (ids: string[]) =>
    setSearch(
      (current) => {
        const params = new URLSearchParams(current);
        params.set(
          'estacoes',
          active
            .filter((station) => ids.includes(station.id))
            .map((s) => s.code)
            .join(','),
        );
        return params;
      },
      { replace: true, preventScrollReset: true },
    );

  const chooseMetric = (value: Metric) => {
    setMetric(value);
    setSearch(
      (current) => {
        const params = new URLSearchParams(current);
        params.set('grandeza', value);
        return params;
      },
      { replace: true, preventScrollReset: true },
    );
  };

  const { from, to } = periodRange(period);
  // Readings of different stations never share timestamps; 10-minute means line them up.
  const bucket: SeriesBucket | 'auto' = spanMs(period) <= 48 * 3_600_000 ? '10m' : 'auto';
  // Pressure only exists on the full version; HTU21D stations are left out and named below.
  const withoutBarometer =
    metric === 'pressure' || metric === 'pressureMsl'
      ? active.filter(
          (station) => selected.includes(station.id) && !measuresPressure(station.climateSensor),
        )
      : [];
  const requested = selected.filter((id) => !withoutBarometer.some((station) => station.id === id));
  const compare = useCompare(requested, metric, from, to, bucket);
  const quantity = QUANTITIES[metric];
  const isRain = metric === 'rain';
  const firstStation = active.find((station) => station.id === selected[0]);
  const timeZone = firstStation?.timezone ?? 'America/Sao_Paulo';

  const chart = useMemo(() => {
    const data = compare.data;
    if (!data) return null;
    // Slots follow the order of registration (ids are UUIDv7, time-ordered), so a new station
    // never shifts the colours of the existing ones.
    const everyActive = (stations.data ?? [])
      .filter((station) => station.isActive)
      .sort((a, b) => a.id.localeCompare(b.id));
    const slots = colorSlots(
      everyActive.map((station) => station.id),
      data.series.map((series) => series.stationId),
    );
    const union = [...new Set(data.series.flatMap((series) => series.t))].sort((a, b) => a - b);
    const lines: LineSeries[] = [];
    const byTime: Map<number, number | null>[] = [];
    for (const series of data.series) {
      let running = 0;
      const shown = series.values.map((value) => {
        const display = value === null ? null : quantity.toDisplay(value);
        if (!isRain) return display;
        running += display ?? 0;
        return running;
      });
      // Each station keeps its own time axis: a station in power saving reports sparsely,
      // and its line must break only on its own long silences.
      const gapped = withGaps(series.t, { values: shown });
      lines.push({
        name: series.name,
        color: slots.get(series.stationId) ?? '--series-1',
        t: gapped.t,
        values: gapped.columns.values,
      });
      byTime.push(new Map(series.t.map((time, index) => [time, shown[index] ?? null])));
    }
    const stats = data.series.map((series) => {
      const values = series.values.flatMap((value) =>
        value === null ? [] : [quantity.toDisplay(value)],
      );
      return {
        id: series.stationId,
        name: series.name,
        color: slots.get(series.stationId) ?? '--series-1',
        min: values.length ? Math.min(...values) : null,
        max: values.length ? Math.max(...values) : null,
        mean: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
        total: values.reduce((sum, value) => sum + value, 0),
      };
    });
    return { t: union, lines, byTime, stats };
  }, [compare.data, quantity, isRain, stations.data]);

  const toggle = (id: string) => {
    if (selected.includes(id)) setSelected(selected.filter((value) => value !== id));
    else if (selected.length < MAX_STATIONS) setSelected([...selected, id]);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Comparar estações"
        description="A mesma grandeza de várias estações no mesmo gráfico."
      />

      {stations.isError && <ErrorNotice error={stations.error} />}

      <div className="flex flex-col gap-4">
        <fieldset>
          <legend className="mb-2 text-[13px] text-ink-2">
            Estações ({selected.length} de no máximo {MAX_STATIONS})
          </legend>
          <div className="flex flex-wrap gap-2">
            {active.map((station) => {
              const on = selected.includes(station.id);
              return (
                <button
                  key={station.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(station.id)}
                  disabled={!on && selected.length >= MAX_STATIONS}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors disabled:opacity-40',
                    on
                      ? 'border-hairline-strong bg-raised text-ink'
                      : 'border-hairline text-ink-2 hover:border-hairline-strong hover:text-ink',
                  )}
                >
                  {on && <Check aria-hidden className="size-3.5" />}
                  {station.name}
                </button>
              );
            })}
          </div>
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          <div className="max-w-full overflow-x-auto">
            <Segmented
              label="Grandeza"
              value={metric}
              options={METRIC_OPTIONS}
              onChange={chooseMetric}
            />
          </div>
        </div>
        <PeriodFilter period={period} onChange={setPeriod} />
      </div>

      {withoutBarometer.length > 0 && (
        <p className="-mt-2 text-[13px] text-ink-3">
          {withoutBarometer.map((station) => station.name).join(', ')}{' '}
          {withoutBarometer.length === 1 ? 'fica' : 'ficam'} de fora: a versão HTU21D não mede
          pressão.
        </p>
      )}
      {requested.length === 0 ? (
        <section className="panel">
          <EmptyState
            icon={ChartSpline}
            title={
              selected.length === 0
                ? 'Escolha ao menos uma estação'
                : 'Nenhuma das estações escolhidas mede pressão'
            }
          >
            {selected.length === 0
              ? 'Marque as estações acima para ver as linhas lado a lado.'
              : 'Escolha outra grandeza ou inclua uma estação da versão completa (BME280).'}
          </EmptyState>
        </section>
      ) : (
        <>
          {compare.isError && <ErrorNotice error={compare.error} />}
          <ChartPanel
            title={isRain ? 'Chuva acumulada no período' : quantity.label}
            unit={quantity.unit}
            refreshing={compare.isFetching && compare.isPlaceholderData}
            legend={chart?.lines.map((line) => ({ name: line.name, color: line.color }))}
            table={
              chart
                ? () => ({
                    columns: [
                      'Data e hora',
                      ...chart.lines.map((line) => `${line.name} (${quantity.unit})`),
                    ],
                    rows: chart.t.map((time) => [
                      formatDateTime(time, timeZone),
                      ...chart.byTime.map((values) =>
                        formatNumber(values.get(time), quantity.digits),
                      ),
                    ]),
                  })
                : undefined
            }
          >
            {chart ? (
              <TimeSeriesChart
                t={chart.t}
                series={chart.lines}
                unit={quantity.unit}
                digits={quantity.digits}
                timeZone={timeZone}
                height={340}
                yMin={
                  metric === 'humidity'
                    ? 0
                    : isRain || metric === 'wind' || metric === 'gust'
                      ? 0
                      : undefined
                }
                yMax={metric === 'humidity' ? 100 : undefined}
                endLabels={chart.lines.length <= 4}
                label={`Comparação de ${quantity.label.toLowerCase()} entre estações`}
              />
            ) : (
              <div className="h-[340px] animate-pulse rounded-md bg-sunken" />
            )}
          </ChartPanel>

          {chart && (
            <section aria-label="Resumo por estação" className="panel overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[13px] text-ink-2">
                  <tr className="border-b border-hairline">
                    <th scope="col" className="px-4 py-2.5 text-left font-medium">
                      Estação
                    </th>
                    {isRain ? (
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">
                        Total ({quantity.unit})
                      </th>
                    ) : (
                      <>
                        <th scope="col" className="px-4 py-2.5 text-right font-medium">
                          Menor ({quantity.unit})
                        </th>
                        <th scope="col" className="px-4 py-2.5 text-right font-medium">
                          Média ({quantity.unit})
                        </th>
                        <th scope="col" className="px-4 py-2.5 text-right font-medium">
                          Maior ({quantity.unit})
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {chart.stats.map((row) => (
                    <tr key={row.id} className="border-b border-hairline last:border-0">
                      <th scope="row" className="px-4 py-2.5 text-left font-normal text-ink">
                        <span className="inline-flex items-center gap-2">
                          <span
                            aria-hidden
                            className="h-0.5 w-3.5 rounded-full"
                            style={{ background: `var(${row.color})` }}
                          />
                          {row.name}
                        </span>
                      </th>
                      {isRain ? (
                        <td className="px-4 py-2.5 text-right text-ink">
                          {formatNumber(row.total, 1)}
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-2.5 text-right text-ink">
                            {formatNumber(row.min, quantity.digits)}
                          </td>
                          <td className="px-4 py-2.5 text-right text-ink">
                            {formatNumber(row.mean, quantity.digits)}
                          </td>
                          <td className="px-4 py-2.5 text-right text-ink">
                            {formatNumber(row.max, quantity.digits)}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-hairline px-4 py-2 text-[13px] text-ink-3">
                Calculado sobre as médias de cada intervalo do gráfico.
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
