"use client";

import { EChartsZoneChart, type ChartConfig } from "@/registry/charts/echarts-zone-chart";

const ZONES = ["easy", "medium", "hard", "expert"];

const chartConfig = {
  easy: { label: "Easy", colors: { light: ["#10b981"], dark: ["#34d399"] } },
  medium: { label: "Medium", colors: { light: ["#0ea5e9"], dark: ["#38bdf8"] } },
  hard: { label: "Hard", colors: { light: ["#f97316"], dark: ["#fb923c"] } },
  expert: { label: "Expert", colors: { light: ["#e11d48"], dark: ["#fb7185"] } },
} satisfies ChartConfig;

export function EChartsExampleZoneChart() {
  return (
    <EChartsZoneChart
      className="h-full w-full p-4"
      data={[]}
      config={chartConfig}
      zones={ZONES}
      isLoading // [!code highlight]
      loadingRows={6} // [!code highlight]
    >
      <EChartsZoneChart.Track />
      <EChartsZoneChart.Marker />
      <EChartsZoneChart.ZoneLabel />
      <EChartsZoneChart.RowLabel />
      <EChartsZoneChart.ValueLabel />
      <EChartsZoneChart.Tooltip />
    </EChartsZoneChart>
  );
}
