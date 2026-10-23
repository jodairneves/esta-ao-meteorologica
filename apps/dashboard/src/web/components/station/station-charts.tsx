import type { SeriesBucket } from '@wx/shared';
import { ChartNoAxesColumn } from 'lucide-react';
import { useMemo } from 'react';
import type { StationDetail } from '../../../common/api';
import { type Period, periodRange, rainBucket } from '../../api/period';
import { useSeries } from '../../api/queries';
import { formatDateTime, formatDay, formatNumber, localDayOf, msToKmh } from '../../lib/format';
import { BarSeriesChart } from '../charts/bar-series';
import { ChartPanel, type TableView } from '../charts/chart-panel';
import { withGaps } from '../charts/gaps';
import { TimeSeriesChart } from '../charts/time-series';
import { EmptyState, ErrorNotice } from '../ui/misc';

export const BUCKET_CAPTIONS: Record<SeriesBucket, string> = {
  raw: 'Cada ponto é uma leitura da estação.',
  '10m': 'Cada ponto é a média de 10 minutos; a faixa mostra mínima e máxima.',
  '1h': 'Cada ponto é a média de uma hora; a faixa mostra mínima e máxima.',
  '1d': 'Cada ponto é a média do dia; a faixa mostra mínima e máxima.',
};

const BUCKET_MS: Partial<Record<SeriesBucket, number>> = { '1h': 3_600_000, '1d': 86_400_000 };

const kmh = (values: (number | null)[]) =>
  values.map((value) => (value === null ? null : msToKmh(value)));
const cell = (value: number | null | undefined, digits: number) => formatNumber(value, digits);

function ChartSkeleton() {
  return <div className="panel h-[318px] animate-pulse" />;
}

/** Time series of one station for the selected period (one filter row scopes them all). */
export function StationCharts({ station, period }: { station: StationDetail; period: Period }) {
  const { from, to } = periodRange(period);
  const series = useSeries(station.code, from, to);
  const rainSeriesBucket = rainBucket(period);
  const rain = useSeries(station.code, from, to, rainSeriesBucket);
  const timeZone = station.timezone;

  const prepared = useMemo(() => {
    const data = series.data;
    if (!data) return null;
    const usesMsl = data.pressureMsl.avg.some((value) => value !== null);
    const pressure = usesMsl ? data.pressureMsl : data.pressure;
    const aggregated = data.bucket !== 'raw';
    const { t, columns } = withGaps(data.t, {
      temp: data.temperature.avg,
      tempMin: data.temperature.min ?? [],
      tempMax: data.temperature.max ?? [],
      dew: data.dewPoint.avg,
      hum: data.humidity.avg,
      pres: pressure.avg,
      wind: kmh(data.wind.avg),
      gust: kmh(data.gust.avg),
    });
    return {
      t,
      bucket: data.bucket,
      usesMsl,
      empty: data.t.length === 0,
      temperature: [
        {
          name: 'Temperatura',
          color: '--q-temp',
          values: columns.temp,
          band: aggregated
            ? { lower: columns.tempMin, upper: columns.tempMax, label: 'Mínima e máxima' }
            : undefined,
        },
        { name: 'Ponto de orvalho', color: '--q-dew', values: columns.dew },
      ],
      humidity: [{ name: 'Umidade', color: '--q-hum', values: columns.hum }],
      pressure: [
        {
          name: usesMsl ? 'Pressão ao nível do mar' : 'Pressão da estação',
          color: '--q-pres',
          values: columns.pres,
        },
      ],
      wind: [
        {
          name: 'Vento médio',
          color: '--q-wind',
          values: columns.wind,
          band: { lower: columns.wind, upper: columns.gust, label: 'Rajada' },
        },
      ],
    };
  }, [series.data]);

  const rainData = rain.data;
  const rainTotal =
    rainData?.rain.avg.reduce<number>((sum, value) => sum + (value ?? 0), 0) ?? null;

  if (series.isError) return <ErrorNotice error={series.error} />;
  if (!prepared) {
    return (
      <div className="grid gap-6 xl:grid-cols-2">
        <ChartSkeleton />
        <ChartSkeleton />
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
    );
  }
  if (prepared.empty) {
    return (
      <div className="panel">
        <EmptyState icon={ChartNoAxesColumn} title="Sem leituras neste período">
          A estação não enviou dados entre {formatDateTime(from, timeZone)} e{' '}
          {formatDateTime(to, timeZone)}. Escolha outro período ou confira a situação em
          Dispositivos.
        </EmptyState>
      </div>
    );
  }

  const { t } = prepared;
  const refreshing = series.isFetching && series.isPlaceholderData;
  const when = (index: number) => formatDateTime(t[index], timeZone);
  const table =
    (columns: string[], row: (index: number) => (string | number)[]) => (): TableView => ({
      columns,
      rows: t.map((_, index) => row(index)),
    });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-ink-3">{BUCKET_CAPTIONS[prepared.bucket]}</p>
      <div className="grid gap-6 xl:grid-cols-2">
        <ChartPanel
          title="Temperatura e ponto de orvalho"
          unit="°C"
          refreshing={refreshing}
          legend={[
            { name: 'Temperatura', color: '--q-temp' },
            ...(prepared.bucket !== 'raw'
              ? [{ name: 'Mínima e máxima', color: '--q-temp', mark: 'block' as const }]
              : []),
            { name: 'Ponto de orvalho', color: '--q-dew' },
          ]}
          table={table(
            [
              'Data e hora',
              'Temperatura (°C)',
              'Mínima (°C)',
              'Máxima (°C)',
              'Ponto de orvalho (°C)',
            ],
            (i) => [
              when(i),
              cell(prepared.temperature[0]?.values[i], 1),
              cell(prepared.temperature[0]?.band?.lower[i], 1),
              cell(prepared.temperature[0]?.band?.upper[i], 1),
              cell(prepared.temperature[1]?.values[i], 1),
            ],
          )}
        >
          <TimeSeriesChart
            t={t}
            series={prepared.temperature}
            unit="°C"
            digits={1}
            timeZone={timeZone}
            label="Gráfico de temperatura e ponto de orvalho"
          />
        </ChartPanel>

        <ChartPanel
          title="Umidade relativa"
          unit="%"
          refreshing={refreshing}
          table={table(['Data e hora', 'Umidade (%)'], (i) => [
            when(i),
            cell(prepared.humidity[0]?.values[i], 0),
          ])}
        >
          <TimeSeriesChart
            t={t}
            series={prepared.humidity}
            unit="%"
            digits={0}
            timeZone={timeZone}
            yMin={0}
            yMax={100}
            label="Gráfico de umidade relativa"
          />
        </ChartPanel>

        <ChartPanel
          title={prepared.usesMsl ? 'Pressão ao nível do mar' : 'Pressão da estação'}
          unit="hPa"
          refreshing={refreshing}
          table={table(['Data e hora', 'Pressão (hPa)'], (i) => [
            when(i),
            cell(prepared.pressure[0]?.values[i], 1),
          ])}
        >
          <TimeSeriesChart
            t={t}
            series={prepared.pressure}
            unit="hPa"
            digits={1}
            timeZone={timeZone}
            label="Gráfico de pressão atmosférica"
          />
        </ChartPanel>

        <ChartPanel
          title="Vento e rajada"
          unit="km/h"
          refreshing={refreshing}
          legend={[
            { name: 'Vento médio', color: '--q-wind' },
            { name: 'Rajada', color: '--q-wind', mark: 'block' },
          ]}
          table={table(['Data e hora', 'Vento médio (km/h)', 'Rajada (km/h)'], (i) => [
            when(i),
            cell(prepared.wind[0]?.values[i], 0),
            cell(prepared.wind[0]?.band?.upper[i], 0),
          ])}
        >
          <TimeSeriesChart
            t={t}
            series={prepared.wind}
            unit="km/h"
            digits={0}
            timeZone={timeZone}
            yMin={0}
            label="Gráfico de vento médio e rajada"
          />
        </ChartPanel>

        <ChartPanel
          className="xl:col-span-2"
          title={rainSeriesBucket === '1d' ? 'Chuva por dia' : 'Chuva por hora'}
          unit="mm"
          refreshing={rain.isFetching && rain.isPlaceholderData}
          actions={
            rainTotal !== null && (
              <p className="mr-2 text-[13px] text-ink-2">
                Total no período{' '}
                <span className="readout ml-1 text-base text-ink">
                  {formatNumber(rainTotal, 1)} mm
                </span>
              </p>
            )
          }
          table={
            rainData
              ? () => ({
                  columns: [rainSeriesBucket === '1d' ? 'Dia' : 'Hora', 'Chuva (mm)'],
                  rows: rainData.t.map((time, index) => [
                    rainSeriesBucket === '1d'
                      ? formatDay(localDayOf(time, timeZone))
                      : formatDateTime(time, timeZone),
                    cell(rainData.rain.avg[index], 1),
                  ]),
                })
              : undefined
          }
        >
          {rainData ? (
            <BarSeriesChart
              t={rainData.t}
              values={rainData.rain.avg}
              name="Chuva"
              color="--q-rain"
              unit="mm"
              digits={1}
              timeZone={timeZone}
              bucketMs={BUCKET_MS[rainSeriesBucket] ?? 3_600_000}
              label="Gráfico de chuva acumulada por intervalo"
            />
          ) : (
            <div className="h-[220px] animate-pulse rounded-md bg-sunken" />
          )}
        </ChartPanel>
      </div>
    </div>
  );
}
