"use client";

import {
  EChartsZoneChart,
  type ChartConfig,
  type ZoneChartRow,
} from "@/registry/charts/echarts-zone-chart";

// Declared vs perceived difficulty: every exercise is authored at a level, and
// learners rate it afterwards. The chart shows where each rating actually landed.
const ZONES = ["easy", "medium", "hard", "expert"];
const ZONE_WIDTH = 100 / ZONES.length;

const chartConfig = {
  easy: { label: "Easy", colors: { light: ["#10b981"], dark: ["#34d399"] } },
  medium: { label: "Medium", colors: { light: ["#0ea5e9"], dark: ["#38bdf8"] } },
  hard: { label: "Hard", colors: { light: ["#f97316"], dark: ["#fb923c"] } },
  expert: { label: "Expert", colors: { light: ["#e11d48"], dark: ["#fb7185"] } },
  offZone: { label: "Needs review", colors: { light: ["#d97706"], dark: ["#fbbf24"] } },
} satisfies ChartConfig;

// The tolerance rule is the consumer's, not the chart's: half a zone of drift on
// either side of the declared level before an exercise is worth re-grading.
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
  exercise("d-114", "Opening leads", "easy", 21),
  exercise("d-207", "Counting tricks", "easy", 39),
  exercise("d-318", "Trump management", "medium", 44),
  exercise("d-402", "Defensive signals", "medium", 78),
  exercise("d-556", "Simple squeeze", "hard", 63),
  exercise("d-611", "Dummy reversal", "hard", 82),
  exercise("d-740", "Double endplay", "expert", 51),
];

const FLAGGED = chartData.filter((row) => row.tone === "alert");
const AVERAGE = Math.round(chartData.reduce((sum, row) => sum + row.value, 0) / chartData.length);

export function EChartsDifficultyZoneChart() {
  return (
    <div className="flex h-full w-full flex-col p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-primary text-sm leading-none font-semibold tracking-tight">
            Perceived difficulty
          </span>
          <span className="text-muted-foreground text-[11px]">
            Learner rating against the level each exercise was authored at
          </span>
        </div>
        <div className="flex shrink-0 gap-5">
          <div className="flex flex-col gap-0.5 text-right">
            <span className="text-muted-foreground text-[11px]">Average</span>
            <span className="text-primary text-xl leading-none font-semibold tracking-tight">
              {AVERAGE}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 text-right">
            <span className="text-muted-foreground text-[11px]">Needs review</span>
            <span className="text-primary text-xl leading-none font-semibold tracking-tight">
              {FLAGGED.length}
            </span>
          </div>
        </div>
      </div>

      <EChartsZoneChart
        className="mt-4 min-h-0 w-full flex-1"
        data={chartData}
        config={chartConfig}
        zones={ZONES}
      >
        <EChartsZoneChart.Track />
        <EChartsZoneChart.Marker />
        <EChartsZoneChart.Tolerance />
        <EChartsZoneChart.ZoneLabel />
        <EChartsZoneChart.RowLabel width={120} />
        <EChartsZoneChart.ValueLabel width={40} />
        <EChartsZoneChart.Alert dataKey="offZone" />
        <EChartsZoneChart.Tooltip actualLabel="Rated" expectedLabel="Authored at" />
      </EChartsZoneChart>
    </div>
  );
}
