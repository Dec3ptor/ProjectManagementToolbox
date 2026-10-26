import { useEffect, useRef } from 'react';
import type { EChartsCoreOption, ECharts } from 'echarts/core';
import { useMantineColorScheme } from '@mantine/core';
import { echarts } from './echarts';
import { INK, SERIES_DARK, SERIES_LIGHT } from '../theme';

/** A chart that fills its box and follows the colour scheme. */
export function EChart({ option, height = 260 }: { option: EChartsCoreOption; height?: number | string }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<ECharts | null>(null);
  const { colorScheme } = useMantineColorScheme();
  const dark = colorScheme === 'dark';

  useEffect(() => {
    if (!el.current) return;
    const c = echarts.init(el.current, undefined, { renderer: 'canvas' });
    chart.current = c;
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      c.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    const ink = dark ? INK.dark : INK.light;
    chart.current?.setOption(
      {
        color: dark ? SERIES_DARK : SERIES_LIGHT,
        textStyle: { color: ink.secondary, fontFamily: 'system-ui, sans-serif' },
        grid: { left: 8, right: 16, top: 28, bottom: 8, containLabel: true },
        tooltip: { trigger: 'axis', backgroundColor: ink.surface, borderColor: ink.grid, textStyle: { color: ink.primary } },
        ...option,
      },
      { notMerge: true },
    );
  }, [option, dark]);

  return <div ref={el} style={{ width: '100%', height }} />;
}

/** Axis styling that stays out of the way. */
export function axes(dark: boolean) {
  const ink = dark ? INK.dark : INK.light;
  return {
    xAxis: { axisLine: { lineStyle: { color: ink.axis } }, axisTick: { show: false }, axisLabel: { color: ink.secondary } },
    yAxis: { splitLine: { lineStyle: { color: ink.grid } }, axisLabel: { color: ink.secondary } },
  };
}
