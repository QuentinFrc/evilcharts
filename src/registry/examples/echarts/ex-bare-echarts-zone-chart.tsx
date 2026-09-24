"use client";

import {
  EChartsZoneChart,
  type ChartConfig,
  type ZoneChartRow,
} from "@/registry/charts/echarts-zone-chart";

// Four quartiles of a response-time budget. Nothing is "expected" here — the
// chart is just placing each endpoint on a shared scale.
const ZONES = ["fast", "fine", "slow", "critical"];

const chartConfig = {
  fast: { label: "< 100ms", colors: { light: ["#10b981"], dark: ["#34d399"] } },
  fine: { label: "< 300ms", colors: { light: ["#0ea5e9"], dark: ["#38bdf8"] } },
  slow: { label: "< 700ms", colors: { light: ["#f97316"], dark: ["#fb923c"] } },
  critical: { label: "700ms +", colors: { light: ["#e11d48"], dark: ["#fb7185"] } },
} satisfies ChartConfig;

const chartData: ZoneChartRow[] = [
  { key: "session", label: "POST /session", value: 12, valueLabel: "48ms" },
  { key: "search", label: "GET /search", value: 41, valueLabel: "164ms" },
  { key: "feed", label: "GET /feed", value: 58, valueLabel: "402ms" },
  { key: "export", label: "POST /export", value: 74, valueLabel: "918ms" },
  { key: "report", label: "GET /report", value: 91, valueLabel: "2.4s" },
];

export function EChartsExampleZoneChart() {
  return (
    <EChartsZoneChart
      className="h-full w-full p-4"
      data={chartData}
      config={chartConfig}
      zones={ZONES}
    >
      <EChartsZoneChart.Track />
      <EChartsZoneChart.Marker shape="line" /> {/* [!code highlight] */}
      <EChartsZoneChart.ZoneLabel />
      <EChartsZoneChart.RowLabel width={110} />
      <EChartsZoneChart.ValueLabel />
      <EChartsZoneChart.Tooltip />
    </EChartsZoneChart>
  );
}
