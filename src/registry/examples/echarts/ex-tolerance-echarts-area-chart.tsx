"use client";

import { EChartsAreaChart, type ChartConfig } from "@/registry/charts/echarts-area-chart";

const data = [
  { hour: "08:00", degrees: 4.6 },
  { hour: "09:00", degrees: 5.2 },
  { hour: "10:00", degrees: 6.1 },
  { hour: "11:00", degrees: 7.4 },
  { hour: "12:00", degrees: 9.2 },
  { hour: "13:00", degrees: 12.4 },
  { hour: "14:00", degrees: 9.8 },
  { hour: "15:00", degrees: 6.9 },
  { hour: "16:00", degrees: 5.1 },
  { hour: "17:00", degrees: 3.2 },
  { hour: "18:00", degrees: 0.6 },
  { hour: "19:00", degrees: 3.4 },
];

const chartConfig = {
  degrees: {
    label: "Cabinet temperature",
    colors: {
      light: ["#1d4ed8"],
      dark: ["#60a5fa"],
    },
  },
  safe: {
    label: "In range",
    colors: {
      light: ["#0f766e"],
      dark: ["#5eead4"],
    },
  },
  excursion: {
    label: "Out of range",
    colors: {
      light: ["#be123c"],
      dark: ["#f43f5e"],
    },
  },
} satisfies ChartConfig;

export function EChartsExampleToleranceAreaChart() {
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
      <EChartsAreaChart.Tolerance
        min={2}
        max={8}
        dataKey="safe"
        breachKey="excursion"
        label="2 – 8 °C"
      />
      <EChartsAreaChart.Area dataKey="degrees" variant="gradient" />
    </EChartsAreaChart>
  );
}
