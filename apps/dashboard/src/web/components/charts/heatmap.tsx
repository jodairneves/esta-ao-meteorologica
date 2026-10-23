import { useMemo } from 'react';
import { formatDay, formatNumber } from '../../lib/format';
import { useTheme } from '../../lib/theme';
import { type ChartOption, chartTokens, EChart, escapeHtml, tooltipBase } from './echart';

const HOURS = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}h`);

/**
 * Local hour × day grid of one quantity: a sequential one-hue ramp (low recedes into the
 * surface), cells separated by a 2px surface gap, per-cell tooltip.
 */
export function HourDayHeatmap({
  days,
  cells,
  ramp,
  unit,
  digits,
  label,
}: {
  days: string[];
  cells: [number, number, number][];
  /** CSS custom property with the ramp, low → high. */
  ramp: string;
  unit: string;
  digits: number;
  label: string;
}) {
  const { theme } = useTheme();
  const height = Math.max(180, Math.min(days.length, 62) * 14 + 70);

  // biome-ignore lint/correctness/useExhaustiveDependencies: colours come from CSS variables, so the theme must rebuild the option
  const option = useMemo<ChartOption>(() => {
    const tokens = chartTokens();
    const values = cells.map((cell) => cell[2]);
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 1;
    return {
      animation: false,
      textStyle: { fontFamily: tokens.font },
      grid: { left: 4, right: 12, top: 8, bottom: 44, containLabel: true },
      xAxis: {
        type: 'category',
        data: HOURS,
        axisLine: { show: false },
        axisTick: { show: false },
        splitArea: { show: false },
        axisLabel: { color: tokens.ink3, fontSize: 12, interval: 2 },
      },
      yAxis: {
        type: 'category',
        data: days.map(formatDay),
        inverse: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: tokens.ink3,
          fontSize: 12,
          interval: days.length > 31 ? 6 : days.length > 14 ? 1 : 0,
        },
      },
      visualMap: {
        min,
        max,
        calculable: false,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        itemWidth: 10,
        itemHeight: 160,
        text: [`${formatNumber(max, digits)} ${unit}`, `${formatNumber(min, digits)} ${unit}`],
        textStyle: { color: tokens.ink2, fontSize: 12 },
        inRange: { color: tokens.list(ramp) },
      },
      tooltip: {
        ...tooltipBase(tokens),
        trigger: 'item',
        formatter: (params: { value: [number, number, number] }) => {
          const [dayIndex, hour, value] = params.value;
          const day = days[dayIndex];
          return `<div style="opacity:.72">${escapeHtml(day ? formatDay(day) : '')}, ${HOURS[hour]}</div><strong>${escapeHtml(`${formatNumber(value, digits)} ${unit}`)}</strong>`;
        },
      },
      series: [
        {
          type: 'heatmap',
          data: cells.map(([dayIndex, hour, value]) => [hour, dayIndex, value]),
          itemStyle: { borderColor: tokens.surface, borderWidth: 2, borderRadius: 2 },
          emphasis: { itemStyle: { borderColor: tokens.ink, borderWidth: 1 } },
        },
      ],
    };
  }, [days, cells, ramp, unit, digits, theme]);

  return <EChart option={option} height={height} label={label} />;
}

/** Daily totals laid out as a calendar (rain over a year). */
export function CalendarHeatmap({
  rows,
  ramp,
  unit,
  digits,
  label,
  from,
  to,
}: {
  rows: { day: string; value: number | null }[];
  ramp: string;
  unit: string;
  digits: number;
  label: string;
  from: string;
  to: string;
}) {
  const { theme } = useTheme();

  // biome-ignore lint/correctness/useExhaustiveDependencies: colours come from CSS variables, so the theme must rebuild the option
  const option = useMemo<ChartOption>(() => {
    const tokens = chartTokens();
    const values = rows.flatMap((row) => (row.value === null ? [] : [row.value]));
    const max = Math.max(1, ...values);
    return {
      animation: false,
      textStyle: { fontFamily: tokens.font },
      tooltip: {
        ...tooltipBase(tokens),
        trigger: 'item',
        formatter: (params: { value: [string, number] }) =>
          `<div style="opacity:.72">${escapeHtml(formatDay(params.value[0]))}</div><strong>${escapeHtml(`${formatNumber(params.value[1], digits)} ${unit}`)}</strong>`,
      },
      visualMap: {
        min: 0,
        max,
        calculable: false,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        itemWidth: 10,
        itemHeight: 160,
        text: [`${formatNumber(max, digits)} ${unit}`, `0 ${unit}`],
        textStyle: { color: tokens.ink2, fontSize: 12 },
        inRange: { color: tokens.list(ramp) },
      },
      calendar: {
        range: [from, to],
        top: 24,
        left: 36,
        right: 8,
        bottom: 48,
        cellSize: ['auto', 13],
        splitLine: { show: false },
        // Days without a value stay as a faint grid cell, so the calendar shape reads.
        itemStyle: { color: tokens.grid, borderColor: tokens.surface, borderWidth: 2 },
        yearLabel: { show: false },
        dayLabel: {
          firstDay: 0,
          nameMap: ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'],
          color: tokens.ink3,
          fontSize: 11,
        },
        monthLabel: {
          nameMap: [
            'jan',
            'fev',
            'mar',
            'abr',
            'mai',
            'jun',
            'jul',
            'ago',
            'set',
            'out',
            'nov',
            'dez',
          ],
          color: tokens.ink3,
          fontSize: 12,
        },
      },
      series: [
        {
          type: 'heatmap',
          coordinateSystem: 'calendar',
          data: rows.flatMap((row) => (row.value === null ? [] : [[row.day, row.value]])),
          itemStyle: { borderColor: tokens.surface, borderWidth: 2, borderRadius: 2 },
        },
      ],
    };
  }, [rows, ramp, unit, digits, from, to, theme]);

  return <EChart option={option} height={190} label={label} />;
}
