"use client";

import { EvilLineChart } from "@/registry/charts/recharts-line-chart";
import { type ChartConfig } from "@/registry/ui/recharts-chart";

type StoreRow = {
  hour: string;
  chilled: number;
  ambient: number;
  cold?: number;
  room?: number;
  coldBreach?: number;
  roomBreach?: number;
};

const data: StoreRow[] = [
  { hour: "08:00", chilled: 4.6, ambient: 19.2 },
  { hour: "09:00", chilled: 5.1, ambient: 19.8 },
  { hour: "10:00", chilled: 6.4, ambient: 20.6 },
  { hour: "11:00", chilled: 8.9, ambient: 21.4 },
  { hour: "12:00", chilled: 10.6, ambient: 23.1 },
  { hour: "13:00", chilled: 9.2, ambient: 24.6 },
  { hour: "14:00", chilled: 6.8, ambient: 23.8 },
  { hour: "15:00", chilled: 5.3, ambient: 22.2 },
  { hour: "16:00", chilled: 4.8, ambient: 20.9 },
  { hour: "17:00", chilled: 4.4, ambient: 19.6 },
  { hour: "18:00", chilled: 4.9, ambient: 18.4 },
  { hour: "19:00", chilled: 5.2, ambient: 17.1 },
];

const chartConfig = {
  chilled: {
    label: "Chilled cabinet",
    colors: {
      light: ["#1d4ed8"],
      dark: ["#60a5fa"],
    },
  },
  ambient: {
    label: "Ambient store",
    colors: {
      light: ["#b45309"],
      dark: ["#fbbf24"],
    },
  },
  cold: {
    label: "Cold chain 2 – 8 °C",
    colors: {
      light: ["#0f766e"],
      dark: ["#5eead4"],
    },
  },
  room: {
    label: "Comfort 18 – 22 °C",
    colors: {
      light: ["#6d28d9"],
      dark: ["#a78bfa"],
    },
  },
  coldBreach: {
    label: "Cold chain broken",
    colors: {
      light: ["#be123c"],
      dark: ["#f43f5e"],
    },
  },
  roomBreach: {
    label: "Out of comfort",
    colors: {
      light: ["#c2410c"],
      dark: ["#fb923c"],
    },
  },
} satisfies ChartConfig;

export function EvilExampleToleranceSubjectsLineChart() {
  return (
    <EvilLineChart data={data} config={chartConfig} className="h-full w-full p-4" xDataKey="hour">
      <EvilLineChart.Grid />
      <EvilLineChart.XAxis dataKey="hour" />
      <EvilLineChart.YAxis />
      <EvilLineChart.Legend isClickable />
      <EvilLineChart.Tooltip />
      <EvilLineChart.Tolerance
        for="chilled"
        min={2}
        max={8}
        dataKey="cold"
        breachKey="coldBreach"
        label="cold chain 2 – 8 °C"
      />
      <EvilLineChart.Tolerance
        for="ambient"
        min={18}
        max={22}
        dataKey="room"
        breachKey="roomBreach"
        label="comfort 18 – 22 °C"
      />
      <EvilLineChart.Line dataKey="chilled" isClickable />
      <EvilLineChart.Line dataKey="ambient" isClickable />
    </EvilLineChart>
  );
}
