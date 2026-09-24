"use client";

import {
  EChartsZoneChart,
  type ChartConfig,
  type ZoneChartRow,
} from "@/registry/charts/echarts-zone-chart";

// A single reading against its target band — the zone chart with one row and a
// track tall enough to read on its own, the way a linear gauge does.
const ZONES = ["critical", "risk", "healthy", "excellent"];
const ZONE_WIDTH = 100 / ZONES.length;

const chartConfig = {
  critical: { label: "Critical", colors: { light: ["#e11d48"], dark: ["#fb7185"] } },
  risk: { label: "At risk", colors: { light: ["#f97316"], dark: ["#fb923c"] } },
  healthy: { label: "Healthy", colors: { light: ["#0ea5e9"], dark: ["#38bdf8"] } },
  excellent: { label: "Excellent", colors: { light: ["#10b981"], dark: ["#34d399"] } },
  offZone: { label: "Off target", colors: { light: ["#d97706"], dark: ["#fbbf24"] } },
} satisfies ChartConfig;

const SCORE = 34;
const TARGET = "healthy";
const PREVIOUS = 51;

// Half a zone of slack on either side of the target band before the score is
// worth acting on — the same shape of rule the multi-row blocks use.
const TARGET_START = ZONES.indexOf(TARGET) * ZONE_WIDTH;
const TOLERANCE = {
  start: Math.max(0, TARGET_START - ZONE_WIDTH / 2),
  end: Math.min(100, TARGET_START + ZONE_WIDTH * 1.5),
};
const OFF_TARGET = SCORE < TOLERANCE.start || SCORE > TOLERANCE.end;

const chartData: ZoneChartRow[] = [
  {
    key: "health",
    label: "Health score",
    value: SCORE,
    zone: TARGET,
    tolerance: TOLERANCE,
    tone: OFF_TARGET ? "alert" : "default",
  },
];

export function EChartsScoreZoneChart() {
  return (
    <div className="flex h-full w-full flex-col justify-center p-4">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[11px]">Customer health score</span>
          <div className="flex items-baseline gap-2">
            <span className="text-primary text-4xl leading-none font-semibold tracking-tight">
              {SCORE}
            </span>
            <span className="text-muted-foreground text-[11px]">
              {SCORE - PREVIOUS} vs last month
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-1 text-right">
          <span className="text-muted-foreground text-[11px]">Target band</span>
          <span className="text-primary text-sm leading-none font-medium">
            {chartConfig[TARGET].label}
          </span>
        </div>
      </div>

      <EChartsZoneChart
        className="mt-5 h-28 w-full shrink-0"
        data={chartData}
        config={chartConfig}
        zones={ZONES}
      >
        <EChartsZoneChart.Track height={48} radius={10} gap={3} />
        <EChartsZoneChart.Marker size={22} />
        <EChartsZoneChart.Tolerance />
        <EChartsZoneChart.ZoneLabel />
        <EChartsZoneChart.Alert dataKey="offZone" />
        <EChartsZoneChart.Tooltip actualLabel="Scored" expectedLabel="Target" />
      </EChartsZoneChart>

      <p className="text-muted-foreground mt-1 text-[11px]">
        {OFF_TARGET
          ? `Below the tolerated range for a ${chartConfig[TARGET].label.toLowerCase()} account.`
          : `Within the tolerated range for a ${chartConfig[TARGET].label.toLowerCase()} account.`}
      </p>
    </div>
  );
}
