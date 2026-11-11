"use client";

import { EvilAreaChart } from "@/registry/charts/recharts-area-chart";
import { type ChartConfig } from "@/registry/ui/recharts-chart";

type LatencyRow = { hour: string; p95: number; safe?: number; excursion?: number };

const data: LatencyRow[] = [
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

const chartConfig = {
  p95: {
    label: "p95 latency",
    colors: {
      light: ["#1d4ed8"],
      dark: ["#60a5fa"],
    },
  },
  safe: {
    label: "Within budget",
    colors: {
      light: ["#0f766e"],
      dark: ["#5eead4"],
    },
  },
  excursion: {
    label: "Over budget",
    colors: {
      light: ["#be123c"],
      dark: ["#f43f5e"],
    },
  },
} satisfies ChartConfig;

export function EvilExampleToleranceCeilingAreaChart() {
  return (
    <EvilAreaChart data={data} config={chartConfig} className="h-full w-full p-4" xDataKey="hour">
      <EvilAreaChart.Grid />
      <EvilAreaChart.XAxis dataKey="hour" />
      <EvilAreaChart.YAxis />
      <EvilAreaChart.Tooltip />
      <EvilAreaChart.Tolerance max={300} dataKey="safe" breachKey="excursion" label="SLO 300ms" />
      <EvilAreaChart.Area dataKey="p95" variant="gradient" />
    </EvilAreaChart>
  );
}
