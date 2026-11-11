"use client";

import { EChartsAreaChart, type ChartConfig } from "@/registry/charts/echarts-area-chart";

const data = [
  { day: "Day 1", queued: 180 },
  { day: "Day 2", queued: 210 },
  { day: "Day 3", queued: 165 },
  { day: "Day 4", queued: 240 },
  { day: "Day 5", queued: 310 },
  { day: "Day 6", queued: 480 },
  { day: "Day 7", queued: 620 },
  { day: "Day 8", queued: 540 },
  { day: "Day 9", queued: 390 },
  { day: "Day 10", queued: 260 },
  { day: "Day 11", queued: 195 },
  { day: "Day 12", queued: 150 },
  { day: "Day 13", queued: 230 },
  { day: "Day 14", queued: 420 },
  { day: "Day 15", queued: 610 },
  { day: "Day 16", queued: 780 },
  { day: "Day 17", queued: 690 },
  { day: "Day 18", queued: 520 },
  { day: "Day 19", queued: 340 },
  { day: "Day 20", queued: 210 },
  { day: "Day 21", queued: 175 },
  { day: "Day 22", queued: 260 },
  { day: "Day 23", queued: 450 },
  { day: "Day 24", queued: 700 },
  { day: "Day 25", queued: 880 },
  { day: "Day 26", queued: 760 },
  { day: "Day 27", queued: 580 },
  { day: "Day 28", queued: 410 },
  { day: "Day 29", queued: 250 },
  { day: "Day 30", queued: 190 },
];

const chartConfig = {
  queued: {
    label: "Jobs waiting",
    colors: {
      light: ["#1d4ed8"],
      dark: ["#60a5fa"],
    },
  },
  drained: {
    label: "Under the alert",
    colors: {
      light: ["#0f766e"],
      dark: ["#5eead4"],
    },
  },
  backlog: {
    label: "Over the alert",
    colors: {
      light: ["#be123c"],
      dark: ["#f43f5e"],
    },
  },
} satisfies ChartConfig;

export function EChartsExampleToleranceBrushAreaChart() {
  return (
    <EChartsAreaChart data={data} config={chartConfig} className="h-full w-full p-4" xDataKey="day">
      <EChartsAreaChart.Grid />
      <EChartsAreaChart.XAxis dataKey="day" tickFormatter={(value) => value.split(" ")[1]} />
      <EChartsAreaChart.YAxis />
      <EChartsAreaChart.Brush height={56} formatLabel={(value) => String(value)} />
      <EChartsAreaChart.Tooltip />
      <EChartsAreaChart.Tolerance
        max={500}
        dataKey="drained"
        breachKey="backlog"
        label="alert at 500"
      />
      <EChartsAreaChart.Area dataKey="queued" variant="gradient-reverse" />
    </EChartsAreaChart>
  );
}
