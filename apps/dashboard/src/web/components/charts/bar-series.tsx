import { useMemo } from 'react';
import { formatDateTime, formatDay, formatNumber, formatTime, localDayOf } from '../../lib/format';
import { useTheme } from '../../lib/theme';
import {
  type ChartOption,
  chartTokens,
  EChart,
  escapeHtml,
  tooltipBase,
  tooltipRow,
} from './echart';
import { timeAxisLabel } from './time-series';

/** Totals per bucket (rain): thin columns from a single baseline, rounded data-end. */
export function BarSeriesChart({
  t,
  values,
  name,
  color,
  unit,
  digits,
  timeZone,
  bucketMs,
  height = 220,
  label,
}: {
  t: number[];
  values: (number | null)[];
  name: string;
  color: string;
  unit: string;
  digits: number;
  timeZone: string;
  bucketMs: number;
  height?: number;
  label: string;
}) {
  const { theme } = useTheme();

  // biome-ignore lint/correctness/useExhaustiveDependencies: colours come from CSS variables, so the theme must rebuild the option
  const option = useMemo<ChartOption>(() => {
    const tokens = chartTokens();
    const fill = tokens.color(color);
    // Bars sit in the middle of their bucket; the tooltip names the whole bucket.
    const bucketLabel = (start: number) =>
      bucketMs >= 86_400_000
        ? formatDay(localDayOf(start, timeZone))
        : `${formatDateTime(start, timeZone)} a ${formatTime(start + bucketMs, timeZone)}`;
    const span = (t.at(-1) ?? 0) - (t[0] ?? 0);
    return {
      animation: false,
      textStyle: { fontFamily: tokens.font },
      grid: { left: 4, right: 12, top: 12, bottom: 4, containLabel: true },
      xAxis: {
        type: 'time',
        min: t[0] ?? 0,
        max: (t.at(-1) ?? 0) + bucketMs,
        axisLine: { lineStyle: { color: tokens.axis } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: {
          color: tokens.ink3,
          fontSize: 12,
          hideOverlap: true,
          formatter: timeAxisLabel(span, timeZone),
        },
      },
      yAxis: {
        type: 'value',
        min: 0,
        minInterval: 1,
        splitNumber: 4,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: tokens.grid, width: 1, type: 'solid' } },
        axisLabel: { color: tokens.ink3, fontSize: 12 },
      },
      tooltip: {
        ...tooltipBase(tokens),
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: tokens.grid, opacity: 0.6 } },
        formatter: (params: { dataIndex: number }[]) => {
          const index = params[0]?.dataIndex ?? 0;
          const value = values[index];
          const text =
            value === null || value === undefined ? '—' : `${formatNumber(value, digits)} ${unit}`;
          return `<div style="opacity:.72;margin-bottom:4px">${escapeHtml(bucketLabel(t[index] ?? 0))}</div>${tooltipRow(fill, text, name)}`;
        },
      },
      series: [
        {
          name,
          type: 'bar',
          data: t.map((time, i) => [time + bucketMs / 2, values[i] ?? null]),
          barMaxWidth: 24,
          barMinHeight: 0,
          itemStyle: { color: fill, borderRadius: [4, 4, 0, 0] },
          emphasis: { itemStyle: { color: fill, opacity: 0.85 } },
        },
      ],
    };
  }, [t, values, name, color, unit, digits, timeZone, bucketMs, theme]);

  return <EChart option={option} height={height} label={label} />;
}
