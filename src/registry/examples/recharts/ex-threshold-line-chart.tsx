"use client";

import { EvilLineChart } from "@/registry/charts/recharts-line-chart";
import { type ChartConfig } from "@/registry/ui/recharts-chart";

// `breach` carries no values — it is declared so the threshold's color key is a
// key of the row type. The Recharts roots validate that every config entry maps
// to a column (`K extends keyof TData`), which is what catches a mistyped series
// name; a color-only entry has to opt into that contract rather than dodge it.
type LatencyRow = { hour: string; p95: number; breach?: number };

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

export function EvilExampleThresholdLineChart() {
  return (
    <EvilLineChart data={data} config={chartConfig} className="h-full w-full p-4" xDataKey="hour">
      <EvilLineChart.Grid />
      <EvilLineChart.XAxis dataKey="hour" />
      <EvilLineChart.YAxis />
      <EvilLineChart.Tooltip />
      <EvilLineChart.Threshold value={300} dataKey="breach" label="SLO 300ms" />
      <EvilLineChart.Line dataKey="p95" />
    </EvilLineChart>
  );
}
