"use client";

import { EvilLineChart } from "@/registry/charts/recharts-line-chart";
import { type ChartConfig } from "@/registry/ui/recharts-chart";

type ProbeRow = { hour: string; door: number; rear: number; safe?: number; excursion?: number };

const data: ProbeRow[] = [
  { hour: "08:00", door: 4.6, rear: 5.2 },
  { hour: "09:00", door: 5.1, rear: 5.6 },
  { hour: "10:00", door: 6.4, rear: 5.9 },
  { hour: "11:00", door: 8.9, rear: 6.2 },
  { hour: "12:00", door: 10.6, rear: 6.8 },
  { hour: "13:00", door: 9.2, rear: 6.1 },
  { hour: "14:00", door: 6.8, rear: 5.4 },
  { hour: "15:00", door: 5.3, rear: 4.1 },
  { hour: "16:00", door: 4.8, rear: 2.6 },
  { hour: "17:00", door: 4.4, rear: 1.2 },
  { hour: "18:00", door: 4.9, rear: 0.4 },
  { hour: "19:00", door: 5.2, rear: 2.9 },
];

const chartConfig = {
  door: {
    label: "Probe A — door",
    colors: {
      light: ["#1d4ed8"],
      dark: ["#60a5fa"],
    },
  },
  rear: {
    label: "Probe B — rear",
    colors: {
      light: ["#6d28d9"],
      dark: ["#a78bfa"],
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

export function EvilExampleToleranceSeriesLineChart() {
  return (
    <EvilLineChart data={data} config={chartConfig} className="h-full w-full p-4" xDataKey="hour">
      <EvilLineChart.Grid />
      <EvilLineChart.XAxis dataKey="hour" />
      <EvilLineChart.YAxis />
      <EvilLineChart.Legend isClickable />
      <EvilLineChart.Tooltip />
      <EvilLineChart.Tolerance
        min={2}
        max={8}
        dataKey="safe"
        breachKey="excursion"
        label="2 – 8 °C"
      />
      <EvilLineChart.Line dataKey="door" isClickable>
        <EvilLineChart.Dot variant="border" />
      </EvilLineChart.Line>
      <EvilLineChart.Line dataKey="rear" isClickable>
        <EvilLineChart.Dot variant="border" />
      </EvilLineChart.Line>
    </EvilLineChart>
  );
}
