"use client";

import { EvilAreaChart } from "@/registry/charts/recharts-area-chart";
import { type ChartConfig } from "@/registry/ui/recharts-chart";

type RegionRow = { hour: string; eu: number; us: number; apac: number; headroom?: number };

const data: RegionRow[] = [
  { hour: "00:00", eu: 180, us: 120, apac: 210 },
  { hour: "02:00", eu: 150, us: 96, apac: 260 },
  { hour: "04:00", eu: 190, us: 104, apac: 285 },
  { hour: "06:00", eu: 240, us: 130, apac: 290 },
  { hour: "08:00", eu: 330, us: 170, apac: 265 },
  { hour: "10:00", eu: 390, us: 220, apac: 240 },
  { hour: "12:00", eu: 430, us: 310, apac: 190 },
  { hour: "14:00", eu: 420, us: 380, apac: 180 },
  { hour: "16:00", eu: 410, us: 450, apac: 175 },
  { hour: "18:00", eu: 350, us: 480, apac: 220 },
  { hour: "20:00", eu: 300, us: 430, apac: 255 },
  { hour: "22:00", eu: 260, us: 390, apac: 280 },
];

const chartConfig = {
  eu: {
    label: "EU",
    colors: {
      light: ["#1d4ed8"],
      dark: ["#60a5fa"],
    },
  },
  us: {
    label: "US",
    colors: {
      light: ["#6d28d9"],
      dark: ["#a78bfa"],
    },
  },
  apac: {
    label: "APAC",
    colors: {
      light: ["#0f766e"],
      dark: ["#5eead4"],
    },
  },
  headroom: {
    label: "At or above the commitment",
    colors: {
      light: ["#334155"],
      dark: ["#94a3b8"],
    },
  },
} satisfies ChartConfig;

export function EvilExampleToleranceStackedAreaChart() {
  return (
    <EvilAreaChart
      data={data}
      config={chartConfig}
      className="h-full w-full p-4"
      xDataKey="hour"
      stackType="stacked"
    >
      <EvilAreaChart.Grid />
      <EvilAreaChart.XAxis dataKey="hour" />
      <EvilAreaChart.YAxis />
      <EvilAreaChart.Legend isClickable />
      <EvilAreaChart.Tooltip />
      <EvilAreaChart.Tolerance min={600} dataKey="headroom" label="committed 600 rps" />
      <EvilAreaChart.Area dataKey="eu" variant="gradient" isClickable />
      <EvilAreaChart.Area dataKey="us" variant="gradient" isClickable />
      <EvilAreaChart.Area dataKey="apac" variant="gradient" isClickable />
    </EvilAreaChart>
  );
}
