import { Grid3x3 } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import type { Metric } from '../../../common/api';
import { useHeatmap } from '../../api/queries';
import { cssList, cssVar } from '../../lib/css';
import { formatDay, formatNumber } from '../../lib/format';
import { useReducedMotion } from '../../lib/motion';
import { QUANTITIES } from '../../lib/quantities';
import { useTheme } from '../../lib/theme';
import { supportsWebGL2 } from '../../lib/webgl';
import { ChartPanel } from '../charts/chart-panel';
import { HourDayHeatmap } from '../charts/heatmap';
import { ErrorBoundary } from '../ui/error-boundary';
import { EmptyState, ErrorNotice } from '../ui/misc';
import { Segmented } from '../ui/segmented';

const Heatmap3D = lazy(() => import('./scene/heatmap-3d'));

/** Only quantities with a sequential ramp in the palette. */
const HEATMAP_METRICS = [
  { value: 'temperature', label: 'Temperatura', ramp: '--ramp-temp' },
  { value: 'rain', label: 'Chuva', ramp: '--ramp-rain' },
] as const satisfies readonly { value: Metric; label: string; ramp: string }[];

type HeatmapMetric = (typeof HEATMAP_METRICS)[number]['value'];
type View = 'flat' | '3d';

/** Hour of the day × day: when it gets hot, when it rains. Flat by default, 3D on request. */
export function HeatmapSection({
  code,
  from,
  to,
  caption,
}: {
  code: string;
  from: string;
  to: string;
  caption: string;
}) {
  const [metric, setMetric] = useState<HeatmapMetric>('temperature');
  const [view, setView] = useState<View>('flat');
  const webgl = supportsWebGL2();
  const heatmap = useHeatmap(code, metric, from, to);
  const { theme } = useTheme();
  const reducedMotion = useReducedMotion();
  const spec = HEATMAP_METRICS.find((item) => item.value === metric) ?? HEATMAP_METRICS[0];
  const quantity = QUANTITIES[metric];
  const data = heatmap.data;

  return (
    <ChartPanel
      title={`Mapa de calor de ${spec.label.toLowerCase()} por hora`}
      unit={quantity.unit}
      refreshing={heatmap.isFetching && heatmap.isPlaceholderData}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Grandeza do mapa de calor"
            value={metric}
            options={HEATMAP_METRICS}
            onChange={setMetric}
          />
          {/* The 3D version needs WebGL2; without it only the flat heatmap is offered. */}
          {webgl && (
            <Segmented
              label="Visualização"
              value={view}
              options={[
                { value: 'flat', label: 'Plano' },
                { value: '3d', label: '3D' },
              ]}
              onChange={setView}
            />
          )}
        </div>
      }
      table={
        data
          ? () => ({
              columns: ['Dia', 'Hora', `${spec.label} (${quantity.unit})`],
              rows: data.cells.map(([day, hour, value]) => [
                formatDay(data.days[day] ?? ''),
                `${String(hour).padStart(2, '0')}h`,
                formatNumber(value, quantity.digits),
              ]),
            })
          : undefined
      }
    >
      <p className="-mt-1 mb-2 text-[13px] text-ink-3">{caption}</p>
      {heatmap.isError && <ErrorNotice error={heatmap.error} />}
      {!data && heatmap.isPending && (
        <div className="h-[260px] animate-pulse rounded-md bg-sunken" />
      )}
      {data && data.cells.length === 0 && (
        <EmptyState icon={Grid3x3} title="Sem dados para o mapa de calor">
          Não há leituras suficientes neste período.
        </EmptyState>
      )}
      {data && data.cells.length > 0 && (view === 'flat' || !webgl) && (
        <HourDayHeatmap
          days={data.days}
          cells={data.cells}
          ramp={spec.ramp}
          unit={quantity.unit}
          digits={quantity.digits}
          label={`Mapa de calor de ${spec.label.toLowerCase()} por hora do dia e dia`}
        />
      )}
      {data && data.cells.length > 0 && view === '3d' && webgl && (
        <div className="h-[420px] overflow-hidden rounded-md" key={theme}>
          <ErrorBoundary
            fallback={
              <p className="p-6 text-sm text-ink-2">
                Este navegador não conseguiu desenhar a versão 3D.
              </p>
            }
          >
            <Suspense fallback={<div className="h-full animate-pulse bg-sunken" />}>
              <Heatmap3D
                days={data.days}
                cells={data.cells}
                ramp={cssList(spec.ramp)}
                unit={quantity.unit}
                digits={quantity.digits}
                background={cssVar('--panel')}
                ink={cssVar('--ink')}
                animate={!reducedMotion}
              />
            </Suspense>
          </ErrorBoundary>
        </div>
      )}
    </ChartPanel>
  );
}
