"use client";

import { EChartsAreaChart, type ChartConfig } from "@/registry/charts/echarts-area-chart";

const data = [
  { week: "W1", cash: -12.4 },
  { week: "W2", cash: -8.1 },
  { week: "W3", cash: -3.6 },
  { week: "W4", cash: 2.8 },
  { week: "W5", cash: 7.4 },
  { week: "W6", cash: 11.2 },
  { week: "W7", cash: 6.5 },
  { week: "W8", cash: -1.9 },
  { week: "W9", cash: -5.2 },
  { week: "W10", cash: 1.4 },
  { week: "W11", cash: 8.9 },
  { week: "W12", cash: 14.3 },
];

const chartConfig = {
  cash: {
    label: "Net cash position",
    colors: {
      light: ["#1d4ed8"],
      dark: ["#60a5fa"],
    },
  },
  overdrawn: {
    label: "Overdrawn",
    colors: {
      light: ["#be123c"],
      dark: ["#f43f5e"],
    },
  },
  black: {
    label: "Back in the black",
    colors: {
      light: ["#0f766e"],
      dark: ["#5eead4"],
    },
  },
} satisfies ChartConfig;

export function EChartsExampleToleranceInvertedAreaChart() {
  return (
    <EChartsAreaChart
      data={data}
      config={chartConfig}
      className="h-full w-full p-4"
      xDataKey="week"
    >
      <EChartsAreaChart.Grid />
      <EChartsAreaChart.XAxis dataKey="week" />
      <EChartsAreaChart.YAxis />
      <EChartsAreaChart.Tooltip />
      <EChartsAreaChart.Tolerance max={0} dataKey="overdrawn" breachKey="black" label="Overdrawn" />
      <EChartsAreaChart.Area dataKey="cash" variant="hatched" strokeVariant="dashed" />
    </EChartsAreaChart>
  );
}
