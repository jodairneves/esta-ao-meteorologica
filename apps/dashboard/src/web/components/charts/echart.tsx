import { BarChart, HeatmapChart, LineChart } from 'echarts/charts';
import {
  CalendarComponent,
  DataZoomComponent,
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { useEffect, useRef } from 'react';
import { cssList, cssVar } from '../../lib/css';

echarts.use([
  LineChart,
  BarChart,
  HeatmapChart,
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  VisualMapComponent,
  CalendarComponent,
  MarkLineComponent,
  CanvasRenderer,
]);

export type ChartOption = echarts.EChartsCoreOption;

/** Thin wrapper: one ECharts instance per element, resized with its container. */
export function EChart({
  option,
  height,
  label,
}: {
  option: ChartOption;
  height: number;
  label: string;
}) {
  const element = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!element.current) return;
    const instance = echarts.init(element.current, undefined, { renderer: 'canvas' });
    chart.current = instance;
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(element.current);
    return () => {
      observer.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true });
  }, [option]);

  return <div ref={element} role="img" aria-label={label} style={{ height }} className="w-full" />;
}

/** Chart chrome from the theme tokens (re-read whenever the theme changes). */
export function chartTokens() {
  return {
    surface: cssVar('--panel'),
    raised: cssVar('--raised'),
    ink: cssVar('--ink'),
    ink2: cssVar('--ink-2'),
    ink3: cssVar('--ink-3'),
    grid: cssVar('--grid'),
    axis: cssVar('--axis'),
    hairline: cssVar('--hairline'),
    font: cssVar('--font-sans') || 'Archivo Variable, system-ui, sans-serif',
    color: (name: string) => cssVar(name),
    list: (name: string) => cssList(name),
  };
}

export type ChartTokens = ReturnType<typeof chartTokens>;

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/** Shared tooltip look: raised surface, hairline border, ink text. */
export function tooltipBase(tokens: ChartTokens) {
  return {
    backgroundColor: tokens.raised,
    borderColor: tokens.hairline,
    borderWidth: 1,
    padding: [8, 10],
    textStyle: { color: tokens.ink, fontFamily: tokens.font, fontSize: 13 },
    extraCssText: 'border-radius:8px;box-shadow:none;',
  };
}

/** Tooltip row: short line key in the series colour, value first (strong), name after. */
export function tooltipRow(color: string, value: string, name: string): string {
  return `<div style="display:flex;align-items:center;gap:8px;line-height:1.6">
    <span style="display:inline-block;width:12px;height:2px;border-radius:1px;background:${color}"></span>
    <strong style="font-weight:600">${escapeHtml(value)}</strong>
    <span style="opacity:.72">${escapeHtml(name)}</span>
  </div>`;
}
