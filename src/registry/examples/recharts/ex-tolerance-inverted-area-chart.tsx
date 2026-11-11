"use client";

import { EvilAreaChart } from "@/registry/charts/recharts-area-chart";
import { type ChartConfig } from "@/registry/ui/recharts-chart";

type CashRow = { week: string; cash: number; overdrawn?: number; black?: number };

const data: CashRow[] = [
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

export function EvilExampleToleranceInvertedAreaChart() {
  return (
    <EvilAreaChart data={data} config={chartConfig} className="h-full w-full p-4" xDataKey="week">
      <EvilAreaChart.Grid />
      <EvilAreaChart.XAxis dataKey="week" />
      <EvilAreaChart.YAxis domain={["auto", "auto"]} />
      <EvilAreaChart.Tooltip />
      <EvilAreaChart.Tolerance max={0} dataKey="overdrawn" breachKey="black" label="Overdrawn" />
      <EvilAreaChart.Area dataKey="cash" variant="hatched" strokeVariant="dashed" />
    </EvilAreaChart>
  );
}
