"use client";

import { EvilAreaChart } from "@/registry/charts/recharts-area-chart";
import { type ChartConfig } from "@/registry/ui/recharts-chart";

type ShiftRow = { slot: string; agents: number; staffed?: number; short?: number };

const data: ShiftRow[] = [
  { slot: "06:00", agents: 4 },
  { slot: "08:00", agents: 7 },
  { slot: "10:00", agents: 9 },
  { slot: "12:00", agents: 11 },
  { slot: "14:00", agents: 10 },
  { slot: "16:00", agents: 8 },
  { slot: "18:00", agents: 6 },
  { slot: "20:00", agents: 5 },
  { slot: "22:00", agents: 3 },
  { slot: "00:00", agents: 3 },
  { slot: "02:00", agents: 2 },
  { slot: "04:00", agents: 3 },
];

const chartConfig = {
  agents: {
    label: "Agents on shift",
    colors: {
      light: ["#334155"],
      dark: ["#94a3b8"],
    },
  },
  staffed: {
    label: "At or above the floor",
    colors: {
      light: ["#0f766e"],
      dark: ["#5eead4"],
    },
  },
  short: {
    label: "Understaffed",
    colors: {
      light: ["#b45309"],
      dark: ["#fbbf24"],
    },
  },
} satisfies ChartConfig;

export function EvilExampleToleranceStepAreaChart() {
  return (
    <EvilAreaChart
      data={data}
      config={chartConfig}
      className="h-full w-full p-4"
      curveType="step"
      xDataKey="slot"
    >
      <EvilAreaChart.Grid />
      <EvilAreaChart.XAxis dataKey="slot" />
      <EvilAreaChart.YAxis domain={["auto", "auto"]} />
      <EvilAreaChart.Tooltip />
      <EvilAreaChart.Tolerance min={6} dataKey="staffed" breachKey="short" label="floor 6 agents" />
      <EvilAreaChart.Area dataKey="agents" variant="lines" />
    </EvilAreaChart>
  );
}
