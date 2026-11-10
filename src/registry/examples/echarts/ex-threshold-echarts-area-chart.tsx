"use client";

import { EChartsAreaChart, type ChartConfig } from "@/registry/charts/echarts-area-chart";

const data = [
  { hour: "08:00", p95: 196 },
  { hour: "09:00", p95: 212 },
  { hour: "10:00", p95: 241 },
  { hour: "11:00", p95: 268 },
  { hour: "12:00", p95: 324 },
  { hour: "13:00", p95: 341 },
  { hour: "14:00", p95: 286 },
  { hour: "15:00", p95: 231 },
  { hour: "16:00", p95: 208 },
  { hour: "17:00", p95: 247 },
  { hour: "18:00", p95: 311 },
  { hour: "19:00", p95: 274 },
];

// Blue against red, not green against red. A breach sits right next to the
// series it belongs to, so the two have to stay apart for a red-green-blind
// reader — the usual green/red pairing collapses to a ~6 ΔE difference under
// deuteranopia, which is why the threshold also marks breaches with dots.
const chartConfig = {
  p95: {
    label: "p95 latency",
    colors: {
      light: ["#1d4ed8"],
      dark: ["#60a5fa"],
    },
  },
  breach: {
    label: "Over budget",
    colors: {
      light: ["#be123c"],
      dark: ["#f43f5e"],
    },
  },
} satisfies ChartConfig;

export function EChartsExampleThresholdAreaChart() {
  return (
    <EChartsAreaChart
      data={data}
      config={chartConfig}
      className="h-full w-full p-4"
      xDataKey="hour"
    >
      <EChartsAreaChart.Grid />
      <EChartsAreaChart.XAxis dataKey="hour" />
      <EChartsAreaChart.YAxis />
      <EChartsAreaChart.Tooltip />
      <EChartsAreaChart.Threshold value={300} dataKey="breach" label="SLO 300ms" />
      <EChartsAreaChart.Area dataKey="p95" variant="gradient" />
    </EChartsAreaChart>
  );
}
