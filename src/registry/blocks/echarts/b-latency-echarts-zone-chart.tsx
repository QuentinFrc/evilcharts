"use client";

import {
  EChartsZoneChart,
  type ChartConfig,
  type ZoneChartRow,
} from "@/registry/charts/echarts-zone-chart";

// A latency budget read as zones: each endpoint has a target band it is supposed
// to answer in, and a band of slack around it before the budget is breached.
const ZONES = ["instant", "fast", "slow", "breached"];
const ZONE_WIDTH = 100 / ZONES.length;

const chartConfig = {
  instant: { label: "< 100ms", colors: { light: ["#14b8a6"], dark: ["#2dd4bf"] } },
  fast: { label: "< 300ms", colors: { light: ["#6366f1"], dark: ["#818cf8"] } },
  slow: { label: "< 700ms", colors: { light: ["#f59e0b"], dark: ["#fbbf24"] } },
  breached: { label: "700ms +", colors: { light: ["#e11d48"], dark: ["#fb7185"] } },
  offZone: { label: "Over budget", colors: { light: ["#dc2626"], dark: ["#f87171"] } },
} satisfies ChartConfig;

// p95 in milliseconds, mapped onto a 0-100 scale whose quarters are the bands.
const SCALE = [100, 300, 700, 2000];

function toScale(ms: number): number {
  const index = SCALE.findIndex((ceiling) => ms < ceiling);
  const band = index === -1 ? SCALE.length - 1 : index;
  const floor = band === 0 ? 0 : SCALE[band - 1];
  const share = Math.min(1, (ms - floor) / (SCALE[band] - floor));
  return Math.min(100, band * ZONE_WIDTH + share * ZONE_WIDTH);
}

function endpoint(key: string, label: string, zone: string, ms: number): ZoneChartRow {
  const start = ZONES.indexOf(zone) * ZONE_WIDTH;
  const tolerance = { start, end: Math.min(100, start + ZONE_WIDTH * 1.5) };
  const value = toScale(ms);
  return {
    key,
    label,
    value,
    valueLabel: ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`,
    zone,
    tolerance,
    tone: value > tolerance.end ? "alert" : "default",
  };
}

const chartData: ZoneChartRow[] = [
  endpoint("session", "POST /session", "instant", 62),
  endpoint("profile", "GET /profile", "instant", 148),
  endpoint("search", "GET /search", "fast", 212),
  endpoint("feed", "GET /feed", "fast", 486),
  endpoint("export", "POST /export", "slow", 640),
  endpoint("report", "GET /report", "slow", 1740),
];

const OVER = chartData.filter((row) => row.tone === "alert").length;

export function EChartsLatencyZoneChart() {
  return (
    <div className="flex h-full w-full flex-col p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-primary text-sm leading-none font-semibold tracking-tight">
            Latency budget
          </span>
          <span className="text-muted-foreground text-[11px]">
            p95 over the last 24h against each endpoint&apos;s target band
          </span>
        </div>
        <div className="flex flex-col gap-0.5 text-right">
          <span className="text-muted-foreground text-[11px]">Over budget</span>
          <span className="text-primary text-xl leading-none font-semibold tracking-tight">
            {OVER}/{chartData.length}
          </span>
        </div>
      </div>

      <EChartsZoneChart
        className="mt-4 min-h-0 w-full flex-1"
        data={chartData}
        config={chartConfig}
        zones={ZONES}
      >
        <EChartsZoneChart.Track variant="gradient" radius={6} />
        <EChartsZoneChart.Marker size={14} />
        <EChartsZoneChart.Tolerance />
        <EChartsZoneChart.ZoneLabel />
        <EChartsZoneChart.RowLabel width={120} />
        <EChartsZoneChart.ValueLabel width={52} />
        <EChartsZoneChart.Alert dataKey="offZone" />
        <EChartsZoneChart.Tooltip actualLabel="p95" expectedLabel="Target" />
      </EChartsZoneChart>
    </div>
  );
}
