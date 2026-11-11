"use client";

import { EChartsAreaChart, type ChartConfig } from "@/registry/charts/echarts-area-chart";

const data = [
  { hour: "08:00", hits: 96.4 },
  { hour: "09:00", hits: 96.1 },
  { hour: "10:00", hits: 95.8 },
  { hour: "11:00", hits: 95.2 },
  { hour: "12:00", hits: 94.1 },
  { hour: "13:00", hits: 92.6 },
  { hour: "14:00", hits: 90.8 },
  { hour: "15:00", hits: 91.6 },
  { hour: "16:00", hits: 93.4 },
  { hour: "17:00", hits: 94.8 },
  { hour: "18:00", hits: 95.7 },
  { hour: "19:00", hits: 96.1 },
];

const chartConfig = {
  hits: {
    label: "Cache hit ratio",
    colors: {
      light: ["#1d4ed8"],
      dark: ["#60a5fa"],
    },
  },
  safe: {
    label: "At or above floor",
    colors: {
      light: ["#0f766e"],
      dark: ["#5eead4"],
    },
  },
  excursion: {
    label: "Under floor",
    colors: {
      light: ["#be123c"],
      dark: ["#f43f5e"],
    },
  },
} satisfies ChartConfig;

export function EChartsExampleToleranceFloorAreaChart() {
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
      <EChartsAreaChart.Tolerance min={92} dataKey="safe" breachKey="excursion" label="floor 92%" />
      <EChartsAreaChart.Area dataKey="hits" variant="gradient" />
    </EChartsAreaChart>
  );
}
