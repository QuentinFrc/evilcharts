"use client";

import {
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
  useChartHeight,
  useChartWidth,
  type ScatterShapeProps,
  type XAxisTickContentProps,
  type YAxisTickContentProps,
} from "recharts";
import {
  Children,
  createContext,
  isValidElement,
  use,
  useCallback,
  useId,
  useMemo,
  useState,
  type ComponentProps,
  type FC,
  type ReactNode,
} from "react";
import {
  ChartContainer,
  LoadingIndicator,
  getColorsCount,
  type ChartConfig,
} from "@/registry/ui/recharts-chart";
import {
  ChartTooltip,
  type TooltipRoundness,
  type TooltipVariant,
} from "@/registry/ui/recharts-tooltip";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export type { ChartConfig, TooltipRoundness, TooltipVariant };

const DAY_MS = 86_400_000;
const DAYS_PER_WEEK = 7;
const TRAILING_YEAR_DAYS = 365; // default range — the trailing year, GitHub style

const INTRO_COLUMN_STAGGER = 0.014; // seconds between one week column and the next
const INTRO_CELL_GROW = 0.32; // seconds for a single cell to scale up + fade in
const INTRO_CELL_SCALE_FROM = 0.4; // a cell opens from this fraction of its size
const LOADING_ANIMATION_DURATION = 2000; // shimmer loop, in milliseconds

const DEFAULT_CELL_RADIUS = 2;
const DEFAULT_CELL_GAP = 3;
const MIN_CELL_SIZE = 4; // never fit cells smaller than this
const FALLBACK_CELL_SIZE = 12; // used before the container has a measured size

const DAY_LABEL_WIDTH = 32;
const MONTH_LABEL_HEIGHT = 22;
const EDGE_PADDING = 2; // keeps the outermost cells' hover ring inside the plot
const LABEL_MARGIN = 8; // gap between the month labels' baseline and the grid
const MIN_MONTH_LABEL_COLUMNS = 3; // a month label is dropped when the next one is closer than this

const CELL_DIM_OPACITY = 0.55; // cells outside the current selection — soft, so the ramp still reads
const HOVER_RING_WIDTH = 1; // outline drawn around the hovered cell, in pixels
const SELECTED_RING_WIDTH = 1.5; // outline drawn around the selected cell, in pixels

const LOADING_CELL_FLOOR = 0.07; // cell fill outside the sweep, × foreground alpha
const LOADING_CELL_PEAK = 0.22; // cell fill inside the sweep, × foreground alpha
const LOADING_SHIMMER_BAND = 0.22; // sweep half-width, fraction of chart width

const DEFAULT_DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""]; // Sunday first, like GitHub
const DEFAULT_MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const roundnessMap: Record<TooltipRoundness, string> = {
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
};

const variantMap: Record<TooltipVariant, string> = {
  default: "bg-background",
  "frosted-glass": "bg-background/70 backdrop-blur-sm",
};

export type HeatmapDatum = {
  date: string;
  value: number;
};

export type HeatmapRange = number | string | [string, string];

export type WeekStart = "sunday" | "monday";
export type HeatmapScale = "quantile" | "linear";
export type HeatmapAnimationType = "none" | "default";
export type TooltipPosition = "fixed" | "variable";

export type HeatmapSelection = { date: string; value: number };

type ScatterChartProps = ComponentProps<typeof ScatterChart>;

export interface EvilHeatmapChartProps {
  data: HeatmapDatum[]; // one entry per day that has a value
  config: ChartConfig; // the series key's label + color ramp (one color per intensity level)
  children: ReactNode; // composed parts — <Cell>, <MonthLabel>, <DayLabel>, <Tooltip>, <Legend>
  className?: string; // extra classes for the chart container
  chartProps?: Omit<ScatterChartProps, "data" | "children" | "margin">; // escape hatch for the raw Recharts ScatterChart
  range?: HeatmapRange; // calendar window; defaults to the trailing year
  weekStart?: WeekStart; // which day starts each column
  cellSize?: number; // fixed cell size in pixels; omit to fit the container width
  scale?: HeatmapScale; // how values map onto the color ramp when no thresholds are given
  thresholds?: number[]; // explicit ascending level boundaries; values below the first are level 1
  defaultSelectedDate?: string | null; // cell selected on first render
  onSelectionChange?: (selection: HeatmapSelection | null) => void; // fires when the selected cell changes
  isLoading?: boolean; // shows the animated loading skeleton
  animation?: boolean; // master switch for the intro sweep — false renders instantly
  animationType?: HeatmapAnimationType; // "none" disables the intro sweep
}

export interface CellProps {
  dataKey: string; // config key whose colors form the intensity ramp
  radius?: number; // corner radius of each cell in pixels
  gap?: number; // space between cells in pixels
  isClickable?: boolean; // lets cells be selected by clicking them
}

/**
 * Configures the heatmap cells. A configuration slot — the root reads its props
 * and wires them into the Recharts scatter that paints the grid, so it renders
 * nothing itself. `dataKey` picks the config entry whose color array becomes the
 * intensity ramp: the first color is the lightest level, the last the strongest.
 */
const Cell: FC<CellProps> = () => null;

export interface MonthLabelProps {
  labels?: string[]; // twelve month names, January first
}

/** Presence shows month names above the grid. A configuration slot — renders nothing itself. */
const MonthLabel: FC<MonthLabelProps> = () => null;

export interface DayLabelProps {
  labels?: string[]; // seven day names, Sunday first; an empty string hides that row's label
}

/** Presence shows weekday names beside the grid. A configuration slot — renders nothing itself. */
const DayLabel: FC<DayLabelProps> = () => null;

export interface LegendProps {
  align?: "left" | "right"; // which side of the chart the ramp sits on
  lessLabel?: string; // text before the ramp
  moreLabel?: string; // text after the ramp
}

/** Presence renders the "Less → More" ramp under the grid. A configuration slot — renders nothing itself. */
const Legend: FC<LegendProps> = () => null;

type CellSlot = {
  dataKey: string;
  radius: number;
  gap: number;
  isClickable: boolean;
};
type MonthLabelSlot = { labels: string[] };
type DayLabelSlot = { labels: string[] };
type LegendSlot = {
  align: "left" | "right";
  lessLabel: string;
  moreLabel: string;
};

type CollectedSlots = {
  cell: CellSlot;
  monthLabel: MonthLabelSlot | null;
  dayLabel: DayLabelSlot | null;
  legend: LegendSlot | null;
};

function collectSlots(children: ReactNode): CollectedSlots {
  let cell: CellSlot = {
    dataKey: "",
    radius: DEFAULT_CELL_RADIUS,
    gap: DEFAULT_CELL_GAP,
    isClickable: false,
  };
  let monthLabel: MonthLabelSlot | null = null;
  let dayLabel: DayLabelSlot | null = null;
  let legend: LegendSlot | null = null;

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const type = child.type;

    if (type === Cell) {
      const props = child.props as CellProps;
      cell = {
        dataKey: props.dataKey,
        radius: props.radius ?? DEFAULT_CELL_RADIUS,
        gap: props.gap ?? DEFAULT_CELL_GAP,
        isClickable: props.isClickable ?? false,
      };
    } else if (type === MonthLabel) {
      const props = child.props as MonthLabelProps;
      monthLabel = { labels: props.labels ?? DEFAULT_MONTH_LABELS };
    } else if (type === DayLabel) {
      const props = child.props as DayLabelProps;
      dayLabel = { labels: props.labels ?? DEFAULT_DAY_LABELS };
    } else if (type === Legend) {
      const props = child.props as LegendProps;
      legend = {
        align: props.align ?? "right",
        lessLabel: props.lessLabel ?? "Less",
        moreLabel: props.moreLabel ?? "More",
      };
    }
  });

  return { cell, monthLabel, dayLabel, legend };
}

function defaultDateFormatter(date: string): string {
  const ms = parseIsoDate(date);
  if (Number.isNaN(ms)) return date;
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function defaultValueFormatter(value: number): string {
  return value.toLocaleString();
}

function parseIsoDate(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return Number.NaN;
  return Date.UTC(y, m - 1, d);
}

function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function todayUtc(): number {
  const now = new Date();
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}

type ResolvedRange = { start: number; end: number }; // inclusive UTC midnights

function resolveRange(range: HeatmapRange | undefined, data: HeatmapDatum[]): ResolvedRange {
  if (typeof range === "number") {
    return { start: Date.UTC(range, 0, 1), end: Date.UTC(range, 11, 31) };
  }
  if (typeof range === "string") {
    const [y, m] = range.split("-").map(Number);
    if (y && m) return { start: Date.UTC(y, m - 1, 1), end: Date.UTC(y, m, 0) };
    if (y) return { start: Date.UTC(y, 0, 1), end: Date.UTC(y, 11, 31) };
  }
  if (Array.isArray(range)) {
    const start = parseIsoDate(range[0]);
    const end = parseIsoDate(range[1]);
    if (!Number.isNaN(start) && !Number.isNaN(end) && start <= end) return { start, end };
  }

  let latest = Number.NEGATIVE_INFINITY;
  for (const datum of data) {
    const ms = parseIsoDate(datum.date);
    if (!Number.isNaN(ms) && ms > latest) latest = ms;
  }
  const end = Number.isFinite(latest) ? latest : todayUtc();
  return { start: end - (TRAILING_YEAR_DAYS - 1) * DAY_MS, end };
}

type GridCell = {
  date: string; // ISO calendar date
  value: number; // 0 for days absent from the data
  level: number; // 0 = empty, 1..levels = ramp intensity
  column: number; // week column, 0-based from the range start
  row: number; // weekday row, 0-based from `weekStart`
};

type MonthTick = { column: number; month: number }; // month label anchored at this week column

type GridModel = {
  cells: GridCell[];
  weeks: number; // number of week columns
  levels: number; // number of non-empty intensity levels
  monthTicks: MonthTick[]; // month starts inside the range, thinned so labels never overlap
  range: ResolvedRange;
};

function computeThresholds(values: number[], levels: number, scale: HeatmapScale): number[] {
  const cuts = levels - 1;
  if (cuts <= 0) return [];
  const nonZero = values.filter((value) => value > 0).sort((a, b) => a - b);
  if (nonZero.length === 0) return Array.from({ length: cuts }, (_, i) => i + 1);

  if (scale === "linear") {
    const min = nonZero[0];
    const max = nonZero[nonZero.length - 1];
    if (max === min) return Array.from({ length: cuts }, () => max + 1);
    return Array.from({ length: cuts }, (_, i) => min + ((max - min) * (i + 1)) / levels);
  }

  return Array.from({ length: cuts }, (_, i) => {
    const position = ((i + 1) / levels) * (nonZero.length - 1);
    const lower = Math.floor(position);
    const upper = Math.min(nonZero.length - 1, lower + 1);
    const fraction = position - lower;
    return nonZero[lower] + (nonZero[upper] - nonZero[lower]) * fraction;
  });
}

function levelOf(value: number, thresholds: number[]): number {
  if (value <= 0) return 0;
  let level = 1;
  for (const threshold of thresholds) {
    if (value >= threshold) level += 1;
  }
  return level;
}

function buildGrid(
  data: HeatmapDatum[],
  range: ResolvedRange,
  weekStart: WeekStart,
  levels: number,
  scale: HeatmapScale,
  thresholds: number[] | undefined,
): GridModel {
  const firstDay = weekStart === "monday" ? 1 : 0;
  const valueByDate = new Map<string, number>();
  for (const datum of data) {
    const ms = parseIsoDate(datum.date);
    if (Number.isNaN(ms) || ms < range.start || ms > range.end) continue;
    valueByDate.set(toIsoDate(ms), (valueByDate.get(toIsoDate(ms)) ?? 0) + datum.value);
  }

  const cuts =
    thresholds && thresholds.length > 0
      ? [...thresholds].sort((a, b) => a - b)
      : computeThresholds([...valueByDate.values()], levels, scale);
  const effectiveLevels = cuts.length + 1;

  const startOffset =
    (new Date(range.start).getUTCDay() - firstDay + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  const days = Math.round((range.end - range.start) / DAY_MS) + 1;
  const weeks = Math.floor((days + startOffset + DAYS_PER_WEEK - 1) / DAYS_PER_WEEK);

  const cells: GridCell[] = [];
  const monthStarts: MonthTick[] = [];
  for (let i = 0; i < days; i++) {
    const ms = range.start + i * DAY_MS;
    const day = new Date(ms);
    const date = toIsoDate(ms);
    const value = valueByDate.get(date) ?? 0;
    const column = Math.floor((i + startOffset) / DAYS_PER_WEEK);
    cells.push({
      date,
      value,
      level: Math.min(effectiveLevels, levelOf(value, cuts)),
      column,
      row: (i + startOffset) % DAYS_PER_WEEK,
    });
    // The range's first day names its month too, so a window opening mid-month
    // still starts with a label — GitHub does the same.
    if (i === 0 || day.getUTCDate() === 1) {
      monthStarts.push({ column, month: day.getUTCMonth() });
    }
  }

  // Two labels closer than a few columns would overlap — keep the later one.
  const monthTicks = monthStarts.filter(
    (tick, index) =>
      index === monthStarts.length - 1 ||
      monthStarts[index + 1].column - tick.column >= MIN_MONTH_LABEL_COLUMNS,
  );

  return { cells, weeks, levels: effectiveLevels, monthTicks, range };
}

/** Index into the config's color slots for a non-empty level. */
function rampIndex(level: number, levels: number, colorsCount: number): number {
  if (levels <= 1 || colorsCount <= 1) return colorsCount - 1;
  const index = Math.round(((level - 1) / (levels - 1)) * (colorsCount - 1));
  return Math.max(0, Math.min(colorsCount - 1, index));
}

type Layout = {
  cellSize: number; // pixels per week column and per weekday row
  gridTop: number; // pixel y of the first row's top edge, from the top of the chart
  xDomain: [number, number]; // week columns visible across the plot, in cell units
  yDomain: [number, number]; // weekday rows visible down the plot, in cell units
};

/**
 * Sizes square cells to the plot and expresses the result as axis domains: one
 * domain unit is exactly one cell, so Recharts' linear scales place every cell
 * without any further math. Columns fill from the left; the seven rows sit
 * centered vertically in whatever height is left.
 */
function computeLayout(
  chartWidth: number,
  chartHeight: number,
  weeks: number,
  fixedCellSize: number | undefined,
  hasDayLabels: boolean,
  hasMonthLabels: boolean,
): Layout {
  const plotWidth = Math.max(
    0,
    chartWidth - 2 * EDGE_PADDING - (hasDayLabels ? DAY_LABEL_WIDTH : 0),
  );
  const plotHeight = Math.max(
    0,
    chartHeight - 2 * EDGE_PADDING - (hasMonthLabels ? MONTH_LABEL_HEIGHT : 0),
  );

  let cellSize = fixedCellSize ?? FALLBACK_CELL_SIZE;
  if (fixedCellSize === undefined && plotWidth > 0 && weeks > 0) {
    const fitWidth = Math.floor(plotWidth / weeks);
    const fitHeight =
      plotHeight > 0 ? Math.floor(plotHeight / DAYS_PER_WEEK) : Number.POSITIVE_INFINITY;
    cellSize = Math.max(MIN_CELL_SIZE, Math.min(fitWidth, fitHeight));
  }

  const columnsAcross = plotWidth > 0 ? plotWidth / cellSize : weeks;
  const rowsDown = plotHeight > 0 ? plotHeight / cellSize : DAYS_PER_WEEK;
  const spare = Math.max(0, plotHeight - cellSize * DAYS_PER_WEEK);
  const rowOffset = Math.floor(spare / 2) / cellSize; // whole pixels keep the cells crisp

  return {
    cellSize,
    gridTop: EDGE_PADDING + (hasMonthLabels ? MONTH_LABEL_HEIGHT : 0) + rowOffset * cellSize,
    xDomain: [-0.5, columnsAcross - 0.5],
    yDomain: [-0.5 - rowOffset, rowsDown - 0.5 - rowOffset],
  };
}

/**
 * Shared state for every part of the chart. Lifted into <EvilHeatmapChart /> so
 * the cells, axes, tooltip, and legend can read it without prop drilling.
 */
type HeatmapChartContextValue = {
  config: ChartConfig; // colors + label for the series named by <Cell dataKey>
  cell: CellSlot; // resolved <Cell /> props
  grid: GridModel; // the date window laid out as week columns
  colorsCount: number; // number of color slots the config provides for the ramp
  fixedCellSize: number | undefined; // the root's `cellSize` prop
  hasDayLabels: boolean; // whether <DayLabel /> is composed
  hasMonthLabels: boolean; // whether <MonthLabel /> is composed
  weekStart: WeekStart; // which weekday sits on the top row
  isLoading: boolean; // whether the chart shows its loading skeleton
  revealEnabled: boolean; // whether cells play the intro sweep when they mount
  selectedDate: string | null; // currently selected ISO date, or null when none
  toggleDate: (date: string) => void; // selects a day, or clears it when already selected
};

const HeatmapChartContext = createContext<HeatmapChartContextValue | null>(null);

function useHeatmapChart() {
  const context = use(HeatmapChartContext);

  if (!context) {
    throw new Error(
      "Heatmap chart parts (<Cell />, <Tooltip />, <Legend />, …) must be used within <EvilHeatmapChart />",
    );
  }

  return context;
}

/** The current cell layout, derived from the live chart size. Only valid inside the Recharts tree. */
function useHeatmapLayout(): Layout {
  const width = useChartWidth() ?? 0;
  const height = useChartHeight() ?? 0;
  const { grid, fixedCellSize, hasDayLabels, hasMonthLabels } = useHeatmapChart();

  return useMemo(
    () => computeLayout(width, height, grid.weeks, fixedCellSize, hasDayLabels, hasMonthLabels),
    [width, height, grid.weeks, fixedCellSize, hasDayLabels, hasMonthLabels],
  );
}

/**
 * Calendar heatmap rendered with Recharts — the GitHub contribution graph shape:
 * one square per day, weeks as columns, color intensity from the config's color
 * ramp. The root owns the date window, the value → level mapping, selection
 * state, and the loading skeleton. The visual parts — `<Cell>`, `<MonthLabel>`,
 * `<DayLabel>`, `<Tooltip>`, `<Legend>` — are composed as children. Under the
 * hood the grid is a Recharts scatter on two numeric axes measured in cells, so
 * the cells stay square at any container size.
 */
export function EvilHeatmapChart({
  data,
  config,
  children,
  className,
  chartProps,
  range,
  weekStart = "sunday",
  cellSize,
  scale = "quantile",
  thresholds,
  defaultSelectedDate = null,
  onSelectionChange,
  isLoading = false,
  animation = true,
  animationType = "default",
}: EvilHeatmapChartProps) {
  const chartId = useId().replace(/:/g, ""); // colon-free id keeps CSS/SVG selectors valid
  const shouldReduceMotion = useReducedMotion();
  const [selectedDate, setSelectedDate] = useState<string | null>(defaultSelectedDate);

  const { cell, monthLabel, dayLabel, legend } = useMemo(() => collectSlots(children), [children]);

  const colorsCount = config[cell.dataKey] ? getColorsCount(config[cell.dataKey]) : 1;

  const grid = useMemo(
    () => buildGrid(data, resolveRange(range, data), weekStart, colorsCount, scale, thresholds),
    [data, range, weekStart, colorsCount, scale, thresholds],
  );

  const toggleDate = useCallback(
    (date: string) => {
      const next = selectedDate === date ? null : date;
      setSelectedDate(next);
      if (!onSelectionChange) return;
      if (next === null) {
        onSelectionChange(null);
        return;
      }
      const item = grid.cells.find((candidate) => candidate.date === next);
      onSelectionChange({ date: next, value: item?.value ?? 0 });
    },
    [selectedDate, onSelectionChange, grid.cells],
  );

  // The intro is a mount-time animation on each cell, so it plays once per chart
  // instance and never replays on selection, theme, or resize updates. Leaving
  // the loading state swaps the skeleton cells for real ones, which mounts them
  // afresh and plays the sweep again.
  const revealEnabled = animation && animationType !== "none" && !shouldReduceMotion;

  const contextValue = useMemo<HeatmapChartContextValue>(
    () => ({
      config,
      cell,
      grid,
      colorsCount,
      fixedCellSize: cellSize,
      hasDayLabels: dayLabel !== null,
      hasMonthLabels: monthLabel !== null,
      weekStart,
      isLoading,
      revealEnabled,
      selectedDate,
      toggleDate,
    }),
    [
      config,
      cell,
      grid,
      colorsCount,
      cellSize,
      dayLabel,
      monthLabel,
      weekStart,
      isLoading,
      revealEnabled,
      selectedDate,
      toggleDate,
    ],
  );

  const shimmerId = `${chartId}-heatmap-shimmer`;

  return (
    <HeatmapChartContext value={contextValue}>
      <ChartContainer
        className={className}
        config={config}
        footer={legend && !isLoading && <HeatmapLegend legend={legend} />}
      >
        <LoadingIndicator isLoading={isLoading} />
        <ScatterChart
          id={chartId}
          margin={{
            top: EDGE_PADDING,
            right: EDGE_PADDING,
            bottom: EDGE_PADDING,
            left: EDGE_PADDING,
          }}
          {...chartProps}
        >
          <HeatmapAxes monthLabels={monthLabel?.labels} dayLabels={dayLabel?.labels} />
          {isLoading && <ShimmerGradient id={shimmerId} animated={!shouldReduceMotion} />}
          <Scatter
            data={grid.cells}
            isAnimationActive={false}
            shape={
              isLoading
                ? (props: ScatterShapeProps) => <LoadingCell {...props} gradientId={shimmerId} />
                : (props: ScatterShapeProps) => <HeatmapCell {...props} />
            }
          />
          {children}
        </ScatterChart>
      </ChartContainer>
    </HeatmapChartContext>
  );
}

type HeatmapAxesProps = {
  monthLabels: string[] | undefined; // twelve month names, or undefined to hide the axis
  dayLabels: string[] | undefined; // seven day names, Sunday first, or undefined to hide the axis
};

/**
 * The two numeric axes that position the grid. Their domains are measured in
 * cells, so one unit along either axis is exactly one cell; the axes double as
 * the month labels (top) and weekday labels (left).
 */
function HeatmapAxes({ monthLabels, dayLabels }: HeatmapAxesProps) {
  const { grid, weekStart } = useHeatmapChart();
  const layout = useHeatmapLayout();
  const firstDay = weekStart === "monday" ? 1 : 0;

  const monthByColumn = useMemo(
    () => new Map(grid.monthTicks.map((tick) => [tick.column, tick.month])),
    [grid.monthTicks],
  );
  const monthTicks = useMemo(() => grid.monthTicks.map((tick) => tick.column), [grid.monthTicks]);
  const dayTicks = useMemo(() => Array.from({ length: DAYS_PER_WEEK }, (_, row) => row), []);

  return (
    <>
      <XAxis
        type="number"
        dataKey="column"
        orientation="top"
        domain={layout.xDomain}
        allowDataOverflow
        allowDecimals
        ticks={monthTicks}
        interval={0}
        hide={monthLabels === undefined}
        height={MONTH_LABEL_HEIGHT}
        axisLine={false}
        tickLine={false}
        tickMargin={0}
        tick={(props: XAxisTickContentProps) => {
          const month = monthByColumn.get(Number(props.payload.value));
          if (month === undefined) return null;
          // The rows sit centered in the plot, so the labels follow the grid's
          // top edge instead of the axis line.
          return (
            <text
              x={Number(props.x) - layout.cellSize / 2}
              y={layout.gridTop - LABEL_MARGIN}
              textAnchor="start"
              className="fill-muted-foreground text-[11px]"
            >
              {monthLabels?.[month] ?? DEFAULT_MONTH_LABELS[month]}
            </text>
          );
        }}
      />
      <YAxis
        type="number"
        dataKey="row"
        reversed
        domain={layout.yDomain}
        allowDataOverflow
        allowDecimals
        ticks={dayTicks}
        interval={0}
        hide={dayLabels === undefined}
        width={DAY_LABEL_WIDTH}
        axisLine={false}
        tickLine={false}
        tickMargin={0}
        tick={(props: YAxisTickContentProps) => {
          const row = Number(props.payload.value);
          const label = dayLabels?.[(row + firstDay) % DAYS_PER_WEEK];
          if (!label) return null;
          return (
            <text
              x={Number(props.x)}
              y={Number(props.y)}
              textAnchor="end"
              dominantBaseline="central"
              className="fill-muted-foreground text-[10px]"
            >
              {label}
            </text>
          );
        }}
      />
    </>
  );
}

type HeatmapCellProps = {
  cx?: number; // pixel center of the cell along the columns axis
  cy?: number; // pixel center of the cell along the rows axis
  payload?: GridCell; // the day this cell stands for
};

/**
 * Renders a single day. The root passes one of these per cell, so it reads the
 * shared context for the ramp, selection, and intro sweep rather than props.
 */
function HeatmapCell({ cx, cy, payload }: HeatmapCellProps) {
  const { cell, grid, colorsCount, selectedDate, toggleDate, revealEnabled } = useHeatmapChart();
  const { cellSize } = useHeatmapLayout();

  if (cx === undefined || cy === undefined || !payload) return null;

  const gap = Math.min(cell.gap, cellSize - 1);
  const size = Math.max(1, cellSize - gap);
  const radius = Math.min(cell.radius, size / 2);

  const selected = selectedDate === payload.date;
  const dimmed = selectedDate !== null && !selected;
  const fill =
    payload.level === 0
      ? undefined
      : `var(--color-${cell.dataKey}-${rampIndex(payload.level, grid.levels, colorsCount)})`;

  return (
    <motion.rect
      x={cx - size / 2}
      y={cy - size / 2}
      width={size}
      height={size}
      rx={radius}
      ry={radius}
      className={cn(
        "fill-foreground/[0.08] transition-[fill-opacity,stroke] duration-200",
        selected ? "stroke-foreground/90" : "hover:stroke-foreground/60 stroke-transparent",
        cell.isClickable && "cursor-pointer",
      )}
      style={{ fill, originX: 0.5, originY: 0.5 }}
      fillOpacity={dimmed ? CELL_DIM_OPACITY : 1}
      strokeWidth={selected ? SELECTED_RING_WIDTH : HOVER_RING_WIDTH}
      initial={revealEnabled ? { opacity: 0, scale: INTRO_CELL_SCALE_FROM } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        delay: payload.column * INTRO_COLUMN_STAGGER,
        duration: INTRO_CELL_GROW,
        ease: "easeOut",
      }}
      onClick={cell.isClickable ? () => toggleDate(payload.date) : undefined}
    />
  );
}

type LoadingCellProps = HeatmapCellProps & {
  gradientId: string; // the shimmer gradient shared by every skeleton cell
};

/** A skeleton cell — the same footprint as a real one, painted by the shared shimmer. */
function LoadingCell({ cx, cy, payload, gradientId }: LoadingCellProps) {
  const { cell } = useHeatmapChart();
  const { cellSize } = useHeatmapLayout();

  if (cx === undefined || cy === undefined || !payload) return null;

  const gap = Math.min(cell.gap, cellSize - 1);
  const size = Math.max(1, cellSize - gap);
  const radius = Math.min(cell.radius, size / 2);

  return (
    <rect
      x={cx - size / 2}
      y={cy - size / 2}
      width={size}
      height={size}
      rx={radius}
      ry={radius}
      fill={`url(#${gradientId})`}
      pointerEvents="none"
    />
  );
}

type ShimmerGradientProps = {
  id: string; // gradient id referenced by the skeleton cells
  animated: boolean; // false leaves the band parked in the middle (reduced motion)
};

/**
 * One gradient shared by every skeleton cell, in chart pixel space so a whole
 * column lights up together as the band passes. The sweep is a native SVG
 * animation, so it never touches React while it loops.
 */
function ShimmerGradient({ id, animated }: ShimmerGradientProps) {
  const width = useChartWidth() ?? 0;
  const bandStart = 0.5 - LOADING_SHIMMER_BAND;
  const bandEnd = 0.5 + LOADING_SHIMMER_BAND;

  return (
    <defs>
      <linearGradient
        id={id}
        gradientUnits="userSpaceOnUse"
        x1={0}
        y1={0}
        x2={width}
        y2={0}
        gradientTransform="skewX(-20)"
      >
        <stop offset={0} stopColor="currentColor" stopOpacity={LOADING_CELL_FLOOR} />
        <stop offset={bandStart} stopColor="currentColor" stopOpacity={LOADING_CELL_FLOOR} />
        <stop offset={0.5} stopColor="currentColor" stopOpacity={LOADING_CELL_PEAK} />
        <stop offset={bandEnd} stopColor="currentColor" stopOpacity={LOADING_CELL_FLOOR} />
        <stop offset={1} stopColor="currentColor" stopOpacity={LOADING_CELL_FLOOR} />
        {animated && width > 0 && (
          <animateTransform
            attributeName="gradientTransform"
            type="translate"
            additive="sum"
            from={`${-width} 0`}
            to={`${width} 0`}
            dur={`${LOADING_ANIMATION_DURATION}ms`}
            repeatCount="indefinite"
          />
        )}
      </linearGradient>
    </defs>
  );
}

export interface TooltipProps {
  variant?: TooltipVariant; // visual style of the tooltip surface
  roundness?: TooltipRoundness; // border-radius of the tooltip
  position?: TooltipPosition; // "variable" follows the hovered cell (default); "fixed" pins the tooltip to the top and tracks the cell's X
  dateFormatter?: (date: string) => string; // formats the hovered day for the tooltip title
  valueFormatter?: (value: number) => string; // formats the hovered day's value
}

/**
 * The hover tooltip. Reads the chart's loading state from context and is hidden
 * automatically while the chart shows its skeleton.
 */
function Tooltip({
  variant = "default",
  roundness = "lg",
  position = "variable",
  dateFormatter = defaultDateFormatter,
  valueFormatter = defaultValueFormatter,
}: TooltipProps) {
  const { isLoading } = useHeatmapChart();

  if (isLoading) return null;

  return (
    <ChartTooltip
      cursor={false}
      position={position === "fixed" ? { y: 0 } : undefined}
      content={
        <HeatmapTooltipContent
          variant={variant}
          roundness={roundness}
          dateFormatter={dateFormatter}
          valueFormatter={valueFormatter}
        />
      }
    />
  );
}

type HeatmapTooltipContentProps = {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: unknown }>;
  variant: TooltipVariant;
  roundness: TooltipRoundness;
  dateFormatter: (date: string) => string;
  valueFormatter: (value: number) => string;
};

/**
 * Tooltip body for a hovered day: the formatted date as the title, then the
 * series label and value beside a swatch of that day's ramp color. A scatter's
 * default payload is one entry per axis, so this reads the day off the first
 * entry instead of listing the axes.
 */
function HeatmapTooltipContent({
  active,
  payload,
  variant,
  roundness,
  dateFormatter,
  valueFormatter,
}: HeatmapTooltipContentProps) {
  const { config, cell, grid, colorsCount } = useHeatmapChart();
  const item = payload?.[0]?.payload as GridCell | undefined;

  if (!active || !item) {
    // Empty tooltip — keeps the position from snapping back to 0,0 between hovers
    return <span className="p-4" />;
  }

  const label = config[cell.dataKey]?.label ?? cell.dataKey;
  const swatch =
    item.level === 0
      ? undefined
      : `var(--color-${cell.dataKey}-${rampIndex(item.level, grid.levels, colorsCount)})`;

  return (
    <div
      className={cn(
        "border-border/50 grid min-w-32 items-start gap-1.5 border px-2.5 py-1.5 text-xs shadow-xl",
        roundnessMap[roundness],
        variantMap[variant],
      )}
    >
      <div className="font-medium">{dateFormatter(item.date)}</div>
      <div className="flex w-full items-center gap-2">
        <div
          className="bg-foreground/10 h-2.5 w-2.5 shrink-0 rounded-[2px]"
          style={{ background: swatch }}
        />
        <div className="flex flex-1 items-center justify-between gap-4 leading-none">
          <span className="text-muted-foreground">{label}</span>
          <span className="text-foreground font-mono font-medium tabular-nums">
            {valueFormatter(item.value)}
          </span>
        </div>
      </div>
    </div>
  );
}

/** The "Less → More" ramp under the grid: one swatch per level, plus the empty cell. */
function HeatmapLegend({ legend }: { legend: LegendSlot }) {
  const { cell, colorsCount } = useHeatmapChart();
  const swatchStyle = { borderRadius: Math.min(cell.radius, 5) };

  return (
    <div
      className={cn(
        "text-muted-foreground flex shrink-0 items-center gap-1 pt-2 text-[11px] leading-none",
        legend.align === "left" ? "justify-start" : "justify-end",
      )}
    >
      <span className="mr-0.5">{legend.lessLabel}</span>
      <span className="bg-foreground/[0.08] h-2.5 w-2.5 shrink-0" style={swatchStyle} />
      {Array.from({ length: colorsCount }, (_, index) => (
        <span
          key={index}
          className="h-2.5 w-2.5 shrink-0"
          style={{ ...swatchStyle, background: `var(--color-${cell.dataKey}-${index})` }}
        />
      ))}
      <span className="ml-0.5">{legend.moreLabel}</span>
    </div>
  );
}

EvilHeatmapChart.Cell = Cell;
EvilHeatmapChart.MonthLabel = MonthLabel;
EvilHeatmapChart.DayLabel = DayLabel;
EvilHeatmapChart.Tooltip = Tooltip;
EvilHeatmapChart.Legend = Legend;
