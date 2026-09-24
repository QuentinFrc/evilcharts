"use client";

import {
  EChartsZoneChart,
  type ChartConfig,
  type ZoneChartRow,
} from "@/registry/charts/echarts-zone-chart";

const ZONES = ["easy", "medium", "hard", "expert"];
const ZONE_WIDTH = 100 / ZONES.length;

const chartConfig = {
  easy: { label: "Easy", colors: { light: ["#10b981"], dark: ["#34d399"] } },
  medium: { label: "Medium", colors: { light: ["#0ea5e9"], dark: ["#38bdf8"] } },
  hard: { label: "Hard", colors: { light: ["#f97316"], dark: ["#fb923c"] } },
  expert: { label: "Expert", colors: { light: ["#e11d48"], dark: ["#fb7185"] } },
  offZone: { label: "Off zone", colors: { light: ["#d97706"], dark: ["#fbbf24"] } },
} satisfies ChartConfig;

// The tolerance rule lives with the DATA, not the chart: half a zone of drift on
// either side of the level an exercise was authored at. A perceived score past
// that is what the row flags.
function exercise(key: string, label: string, zone: string, value: number): ZoneChartRow {
  const start = ZONES.indexOf(zone) * ZONE_WIDTH;
  const tolerance = {
    start: Math.max(0, start - ZONE_WIDTH / 2),
    end: Math.min(100, start + ZONE_WIDTH * 1.5),
  };
  const drifted = value < tolerance.start || value > tolerance.end;
  return {
    key,
    label,
    value,
    valueLabel: String(value),
    zone,
    tolerance,
    tone: drifted ? "alert" : "default",
  };
}

const chartData: ZoneChartRow[] = [
  exercise("ex-01", "Opening moves", "easy", 18),
  exercise("ex-02", "Counting tricks", "easy", 31),
  exercise("ex-03", "Suit contracts", "medium", 44),
  exercise("ex-04", "Defence signals", "medium", 71),
  exercise("ex-05", "Squeeze play", "hard", 66),
  exercise("ex-06", "Endplay drill", "expert", 58),
];

export function EChartsExampleZoneChart() {
  return (
    <EChartsZoneChart
      className="h-full w-full p-4"
      data={chartData}
      config={chartConfig}
      zones={ZONES}
    >
      <EChartsZoneChart.Track height={22} radius={6} gap={4} /> {/* [!code highlight] */}
      <EChartsZoneChart.Marker shape="diamond" size={15} /> {/* [!code highlight] */}
      <EChartsZoneChart.Tolerance />
      <EChartsZoneChart.ZoneLabel />
      <EChartsZoneChart.RowLabel />
      <EChartsZoneChart.ValueLabel />
      <EChartsZoneChart.Alert dataKey="offZone" />
      <EChartsZoneChart.Tooltip />
    </EChartsZoneChart>
  );
}
