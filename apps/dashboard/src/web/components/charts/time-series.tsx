import { useMemo } from 'react';
import {
  formatAxisNumber,
  formatDateTime,
  formatNumber,
  formatShortDate,
  formatTime,
} from '../../lib/format';
import { useTheme } from '../../lib/theme';
import {
  type ChartOption,
  chartTokens,
  EChart,
  escapeHtml,
  tooltipBase,
  tooltipRow,
} from './echart';

export interface LineSeries {
  name: string;
  /** CSS custom property of the series hue. */
  color: string;
  values: (number | null)[];
  /** Own time axis (a sparse station in a comparison); defaults to the chart's `t`. */
  t?: number[];
  /** Optional min–max band drawn as a ~12% wash of the same hue. */
  band?: { lower: (number | null)[]; upper: (number | null)[]; label: string };
}

export interface TimeSeriesProps {
  t: number[];
  series: LineSeries[];
  unit: string;
  digits: number;
  timeZone: string;
  height?: number;
  label: string;
  /** Fixed axis range (e.g. humidity 0–100). */
  yMin?: number;
  yMax?: number;
  /** Name at the end of each line (direct labels; use for up to four series). */
  endLabels?: boolean;
  /** Reference levels drawn as dashed lines (e.g. battery thresholds). */
  thresholds?: { value: number; label: string }[];
}

const DAY_MS = 86_400_000;

interface AxisParam {
  seriesIndex: number;
  dataIndex: number;
  axisValue?: number;
}

/** Time axis labels in the station's time zone: hours for a day, dates beyond. */
export function timeAxisLabel(spanMs: number, timeZone: string) {
  return (value: number) =>
    spanMs <= 2 * DAY_MS ? formatTime(value, timeZone) : formatShortDate(value, timeZone);
}

export function TimeSeriesChart({
  t,
  series,
  unit,
  digits,
  timeZone,
  height = 260,
  label,
  yMin,
  yMax,
  endLabels = false,
  thresholds,
}: TimeSeriesProps) {
  const { theme } = useTheme();

  // biome-ignore lint/correctness/useExhaustiveDependencies: colours come from CSS variables, so the theme must rebuild the option
  const option = useMemo<ChartOption>(() => {
    const tokens = chartTokens();
    const span = (t.at(-1) ?? 0) - (t[0] ?? 0);
    const format = (value: number | null | undefined) =>
      value === null || value === undefined ? '—' : `${formatNumber(value, digits)} ${unit}`;

    const chartSeries: object[] = [];
    // Position of each line's main series among the chart series (bands come before it).
    const mainIndex: number[] = [];
    for (const [index, line] of series.entries()) {
      const color = tokens.color(line.color);
      const times = line.t ?? t;
      if (line.band) {
        const stack = `band-${index}`;
        // Stacked pair: an invisible lower edge plus the (upper − lower) thickness as a wash.
        chartSeries.push(
          {
            type: 'line',
            stack,
            data: times.map((time, i) => [time, line.band?.lower[i] ?? null]),
            lineStyle: { opacity: 0 },
            showSymbol: false,
            silent: true,
            tooltip: { show: false },
          },
          {
            type: 'line',
            stack,
            data: times.map((time, i) => {
              const lower = line.band?.lower[i];
              const upper = line.band?.upper[i];
              return [time, lower == null || upper == null ? null : upper - lower];
            }),
            lineStyle: { opacity: 0 },
            areaStyle: { color, opacity: 0.12 },
            showSymbol: false,
            silent: true,
          },
        );
      }
      mainIndex.push(chartSeries.length);
      chartSeries.push({
        name: line.name,
        type: 'line',
        data: times.map((time, i) => [time, line.values[i] ?? null]),
        showSymbol: false,
        symbolSize: 8,
        lineStyle: { width: 2, color, cap: 'round', join: 'round' },
        itemStyle: { color, borderColor: tokens.surface, borderWidth: 2 },
        emphasis: { disabled: true },
        connectNulls: false,
        endLabel: endLabels
          ? {
              show: true,
              formatter: line.name,
              color: tokens.ink2,
              fontSize: 12,
              distance: 6,
              padding: [3, 0],
            }
          : undefined,
        // Lines ending at similar values push their names apart instead of overprinting.
        labelLayout: endLabels ? { moveOverlap: 'shiftY' } : undefined,
        markLine:
          index === 0 && thresholds?.length
            ? {
                silent: true,
                symbol: 'none',
                lineStyle: { color: tokens.ink3, type: [4, 4], width: 1 },
                label: {
                  formatter: '{b}',
                  position: 'insideEndTop',
                  color: tokens.ink3,
                  fontSize: 12,
                },
                data: thresholds.map((threshold) => ({
                  yAxis: threshold.value,
                  name: threshold.label,
                })),
              }
            : undefined,
      });
    }

    return {
      animation: false,
      textStyle: { fontFamily: tokens.font },
      grid: { left: 4, right: endLabels ? 96 : 12, top: 12, bottom: 4, containLabel: true },
      xAxis: {
        type: 'time',
        min: t[0],
        max: t.at(-1),
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
        scale: yMin === undefined,
        min: yMin,
        max: yMax,
        splitNumber: 4,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: tokens.grid, width: 1, type: 'solid' } },
        axisLabel: {
          color: tokens.ink3,
          fontSize: 12,
          formatter: (v: number) => formatAxisNumber(v, digits),
        },
      },
      tooltip: {
        ...tooltipBase(tokens),
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: tokens.ink3, width: 1 } },
        formatter: (raw: AxisParam | AxisParam[]) => {
          const params = Array.isArray(raw) ? raw : [raw];
          const at = params[0]?.axisValue ?? t[params[0]?.dataIndex ?? 0];
          const rows = series.flatMap((line, lineIndex) => {
            // Each line reports its own nearest point (lines may have their own time axis).
            const param = params.find((item) => item.seriesIndex === mainIndex[lineIndex]);
            if (!param) return [];
            const index = param.dataIndex;
            const color = tokens.color(line.color);
            const main = tooltipRow(color, format(line.values[index]), line.name);
            if (!line.band) return [main];
            const lower = line.band.lower[index];
            const upper = line.band.upper[index];
            const range =
              lower == null || upper == null
                ? '—'
                : `${formatNumber(lower, digits)} a ${formatNumber(upper, digits)} ${unit}`;
            return [main, tooltipRow(color, range, line.band.label)];
          });
          return `<div style="opacity:.72;margin-bottom:4px">${escapeHtml(formatDateTime(at, timeZone))}</div>${rows.join('')}`;
        },
      },
      dataZoom: [{ type: 'inside', zoomOnMouseWheel: 'ctrl', moveOnMouseWheel: false }],
      series: chartSeries,
    };
  }, [t, series, unit, digits, timeZone, yMin, yMax, endLabels, thresholds, theme]);

  return <EChart option={option} height={height} label={label} />;
}
