"use client";

import {
  DEFAULT_ECHARTS_RENDERER,
  buildChartCss,
  getColorsCount,
  resolveColors,
  withAlpha,
  type ChartConfig,
  type EChartsRenderer,
  type ResolvedColors,
} from "@/registry/ui/echarts-chart";
import {
  resolveTooltipPosition,
  tooltipIndicatorHtml,
  tooltipRow,
  tooltipShell,
  type TooltipPosition,
  type TooltipRoundness,
  type TooltipVariant,
} from "@/registry/ui/echarts-tooltip";
import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FC,
  type ReactNode,
} from "react";
import {
  GridComponent,
  TooltipComponent,
  type GridComponentOption,
  type TooltipComponentOption,
} from "echarts/components";
import { LegendOverlay, type LegendVariant } from "@/registry/ui/echarts-legend";
import { CustomChart, type CustomSeriesOption } from "echarts/charts";
import { motion, useReducedMotion } from "motion/react";
import type { ComposeOption } from "echarts/core";
import * as echarts from "echarts/core";

// Re-export the shared types so consumers/examples import everything they need
// from the chart module, like every other EvilCharts chart.
export type {
  ChartConfig,
  EChartsRenderer,
  LegendVariant,
  TooltipPosition,
  TooltipRoundness,
  TooltipVariant,
};

// Modular registration keeps the bundle lean — only the pieces this chart needs.
// A cartesian grid does the row/scale math (a value x-axis for the scale, a
// category y-axis for the rows) and a custom series paints each row: the zone
// bands, the expected zone, the hatched or outlined tolerance, and the marker.
// None of the built-in series can draw that combination. The tooltip is the one
// extra component.
echarts.use([CustomChart, GridComponent, TooltipComponent]);

type EChartsInstance = ReturnType<typeof echarts.init>;

// The exact option surface this chart uses. Narrower than echarts' full
// EChartsOption, so a misspelled key fails the compile instead of silently
// reaching setOption.
type EChartsOption = ComposeOption<
  CustomSeriesOption | GridComponentOption | TooltipComponentOption
>;

// Single-entry views of the composed option's array-or-single fields — the
// modular entry points don't export the axis option types directly.
type ArrayItem<T> = T extends readonly (infer U)[] ? U : T;
type XAxisOption = ArrayItem<NonNullable<EChartsOption["xAxis"]>>;
type YAxisOption = ArrayItem<NonNullable<EChartsOption["yAxis"]>>;

// The modular entry points don't export the renderItem types directly — derive
// them from the series option so the row painter stays fully type-checked.
type RenderItem = NonNullable<CustomSeriesOption["renderItem"]>;
type RenderItemParams = Parameters<RenderItem>[0];
type RenderItemApi = Parameters<RenderItem>[1];
type RenderItemReturn = ReturnType<RenderItem>;
// A renderItem group's children — each entry is one graphic element.
type RenderItemChild = NonNullable<
  Extract<RenderItemReturn, { type?: "group" }>["children"]
>[number];

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_MAX = 100;
const DEFAULT_LOADING_ROWS = 5;

const DEFAULT_TRACK_RADIUS = 3;
const DEFAULT_ZONE_GAP = 2; // space between two neighboring zone bands, in pixels
// The gradient variant paints a translucent tolerance band ON the track, so it
// needs a little more room than the default one, where the tolerance is hatched
// in place.
const DEFAULT_TRACK_HEIGHT = 16;
const GRADIENT_TRACK_HEIGHT = 20; // room for the outlined tolerance band
const SPECTRUM_TRACK_HEIGHT = 7; // the expected-zone pill, not a track
const DEFAULT_MARKER_SIZE = 13;

const LABEL_MARGIN = 8; // gap between a label column and the track
const DEFAULT_ROW_LABEL_WIDTH = 132;
const DEFAULT_VALUE_LABEL_WIDTH = 56;
const ZONE_LABEL_HEIGHT = 20; // headroom reserved above the tracks for zone names
const ALERT_GUTTER = 20; // leading column that carries the alert glyph
const EDGE_PADDING = 4;

const GRAY = "rgba(120, 120, 120, 1)"; // fallback when a config key resolves to nothing

// Hatching — 45° stripes drawn as individual line segments, so they paint
// identically under the Canvas and the SVG renderer.
const HATCH_STRIPE_WIDTH = 2;
const HATCH_STRIPE_SPACING = 5; // perpendicular distance between two stripes

// ─────────────────────────────────────────────────────────────────────────────
// Theme knobs — every opacity in the chart draws from these. Base colors come
// from the consumer's CSS tokens (resolved from the live DOM), so only the
// opacity factors live here. `withAlpha` MULTIPLIES a token's own alpha.
// ─────────────────────────────────────────────────────────────────────────────

// variant="default" on the rows layout — discrete bands, the expected one filled,
// the tolerance hatched.
const ZONE_FAINT_OPACITY = 0.1; // a zone band at rest
const ZONE_EXPECTED_OPACITY = 0.4; // the row's expected zone, painted solid
const ZONE_HATCH_OPACITY = 0.45; // the stripes in the tolerance margins

// variant="gradient" on the rows layout — one continuous ramp per track, the
// tolerance an outlined band rather than hatched margins.
const GRADIENT_TRACK_OPACITY = 0.38; // the gradient across the whole track
const GRADIENT_BAND_OPACITY = 0.1; // the tolerance band's fill — light, so the ramp still shows through
const GRADIENT_BAND_STROKE_OPACITY = 0.8; // the tolerance band's outline — what actually delimits it
const GRADIENT_EXPECTED_OPACITY = 0.34; // the expected zone, a shade stronger inside the band
const GRADIENT_BAND_STROKE_WIDTH = 1.25;

// layout="spectrum" — the zones painted once, behind rules rather than per-row tracks.
const SPECTRUM_BAND_OPACITY = 0.13; // the full-height zone columns
const SPECTRUM_RULE_OPACITY = 0.4; // the dotted rule that traces a row across them
const SPECTRUM_RULE_WIDTH = 1.5;
const SPECTRUM_RULE_DASH: [number, number] = [2, 4];
const SPECTRUM_TOLERANCE_OPACITY = 0.6; // the tolerated drift, dashed in the zone's color
const SPECTRUM_TOLERANCE_WIDTH = 3;
const SPECTRUM_TOLERANCE_DASH: [number, number] = [5, 4];
const SPECTRUM_EXPECTED_OPACITY = 0.75; // the expected zone, a solid pill on the rule

// The expected zone is the one element every skin draws — same rect, three
// weights, picked from BOTH axes. On the spectrum it is a pill riding a faint
// backdrop, so it carries far more weight than a band filling a solid track.
function expectedOpacity(layout: ZoneChartLayout, variant: ZoneChartVariant): number {
  if (layout === "spectrum") return SPECTRUM_EXPECTED_OPACITY;
  return variant === "gradient" ? GRADIENT_EXPECTED_OPACITY : ZONE_EXPECTED_OPACITY;
}

// Track thickness by skin: the gradient rows need room for their outlined
// tolerance band, and the spectrum's "track" is only the expected-zone pill.
function defaultTrackHeight(layout: ZoneChartLayout, variant: ZoneChartVariant): number {
  if (layout === "spectrum") return SPECTRUM_TRACK_HEIGHT;
  return variant === "gradient" ? GRADIENT_TRACK_HEIGHT : DEFAULT_TRACK_HEIGHT;
}

const MARKER_RING_WIDTH = 2; // the background-colored ring that lifts the marker off the track
const ALERT_HALO_OPACITY = 0.35; // ring around an alerting row's marker
const ROW_DIM_OPACITY = 0.4; // rows outside the current selection

const ALERT_GLYPH_SIZE = 13;
const ALERT_GLYPH_FILL_OPACITY = 0.16;
const ALERT_GLYPH_STROKE_WIDTH = 1.25;

// Intro reveal — rows fade in top to bottom, their markers popping last.
const INTRO_ROW_STAGGER = 45; // delay between one row and the next, in milliseconds
const INTRO_DURATION = 380;
const INTRO_MARKER_SCALE_FROM = 0.2;
const UPDATE_DURATION = 200; // selection/theme/resize transitions

const LOADING_ANIMATION_DURATION = 2000; // shimmer loop, in milliseconds
const LOADING_CELL_FLOOR = 0.07; // skeleton fill outside the sweep, × foreground alpha
const LOADING_CELL_PEAK = 0.22; // skeleton fill inside the sweep, × foreground alpha
const LOADING_SHIMMER_BAND = 0.22; // sweep half-width, fraction of chart width
const LOADING_SHIMMER_FEATHER = 0.22; // eased edge softening of the sweep
const LOADING_LABEL_FILL = 0.7; // skeleton pill width, fraction of its label column

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/**
/**
 * WHERE the zones live.
 *
 * - `"rows"` — one track per row, each carrying its own copy of the zones.
 * - `"spectrum"` — the zones are painted ONCE as a full-height backdrop behind
 *   every row, so the chart reads as one uninterrupted scale. A row is then a
 *   dotted rule across that spectrum carrying its marker, its tolerance as a
 *   dashed segment and its expected zone as a solid pill. Use it when the rows
 *   share one scale and repeating the same bands on each of them is just noise.
 */
export type ZoneChartLayout = "rows" | "spectrum";

/**
 * HOW the zones are painted — the same vocabulary as every other EvilCharts
 * fill variant.
 *
 * - `"default"` — discrete bands, one per config key, meeting at hard edges.
 * - `"gradient"` — one ramp across the zone colors, each holding its own color
 *   at the center of its band so the scale reads as progressive. On the rows
 *   layout it also switches the tolerance to an outlined band (there are no band
 *   edges left to hatch against) and colors the marker by the zone it lands in.
 */
export type ZoneChartVariant = "default" | "gradient";

/** `"alert"` marks a row whose value missed its expected zone. */
export type ZoneChartTone = "default" | "alert";

/** An inclusive span on the scale — the drift a row is allowed before it alerts. */
export type ZoneChartTolerance = { start: number; end: number };

export type ZoneChartRow = {
  /** Stable identity for the row — also what `onSelectionChange` reports. */
  key: string;
  /** Text shown in the row label column. */
  label: string;
  /** Position of the marker on the scale, clamped to `[0, max]`. */
  value: number;
  /** Text shown in the value column; the raw value by default. */
  valueLabel?: string;
  /** Config key of this row's expected zone. Omit it to leave the track plain. */
  zone?: string | null;
  /** The tolerated span around `zone`. Rendered by `<Tolerance />`. */
  tolerance?: ZoneChartTolerance | null;
  /** `"alert"` colors the marker and value with the alert key and shows its glyph. */
  tone?: ZoneChartTone;
};

export type ZoneChartSelection = {
  key: string;
  value: number;
  /** The config key of the zone the value lands in. */
  zone: string | null;
};

// A zone chart's entrance runs down the rows: "default" plays it, "none" turns
// it off. Kept as a small union for parity with the other EvilCharts switches.
export type ZoneChartAnimationType = "none" | "default";

export interface EChartsZoneChartProps {
  data: ZoneChartRow[]; // one entry per track, rendered top to bottom in order
  config: ChartConfig; // each zone key's label + colors, plus the alert key if you use one
  zones: string[]; // ordered config keys — equal-width bands across the scale
  children: ReactNode; // composed parts — <Track>, <Marker>, <Tolerance>, <ZoneLabel>, …
  className?: string; // extra classes for the chart container
  renderer?: EChartsRenderer; // rendering engine — canvas by default, or SVG
  max?: number; // top of the scale; the bottom is always 0
  defaultSelectedKey?: string | null; // row selected on first render
  onSelectionChange?: (selection: ZoneChartSelection | null) => void; // fires when the selected row changes
  isLoading?: boolean; // shows the animated loading skeleton
  loadingRows?: number; // skeleton rows drawn when `data` is empty
  animation?: boolean; // master switch for the intro reveal — false renders instantly
  animationType?: ZoneChartAnimationType; // "none" disables the intro reveal
  chartOptions?: Record<string, unknown>; // escape hatch merged over the built ECharts option
}

// ─────────────────────────────────────────────────────────────────────────────
// Composible parts — DECLARATIVE CONFIG. Every part renders `null`; the root
// walks `children` by reference (child.type === Track, …) to collect its props.
// The track and the marker are intrinsic to the reading, so they always render
// and only CONFIGURE the row. The rest follow presence semantics: omit one and
// it does not render.
// ─────────────────────────────────────────────────────────────────────────────

export interface TrackProps {
  layout?: ZoneChartLayout; // where the zones live — one track per row, or one shared spectrum
  variant?: ZoneChartVariant; // how they are painted — discrete bands, or one ramp
  height?: number; // thickness of the track in pixels
  radius?: number; // corner radius of the bands in pixels
  gap?: number; // space between two zone bands in pixels — the "default" variant only
  isClickable?: boolean; // lets rows be selected by clicking them
}

/**
 * Configures the row track. A configuration slot — the root reads its props and
 * wires them into the ECharts custom series, so it renders nothing itself.
 */
const Track: FC<TrackProps> = () => null;

export interface MarkerProps {
  size?: number; // diameter of the marker in pixels
  shape?: "circle" | "diamond" | "line"; // how the value is drawn on the track
}

/** Configures the value marker. Always renders — the marker IS the reading. */
const Marker: FC<MarkerProps> = () => null;

/**
 * Presence draws each row's tolerance span — the drift it is allowed before it
 * is wrong. HOW it is drawn follows `<Track>`: hatched margins around the
 * expected zone on the `"default"` variant, an outlined band on `"gradient"`,
 * a dashed segment of the rule on the `"spectrum"` layout. Renders nothing.
 */
const Tolerance: FC = () => null;

export interface ZoneLabelProps {
  formatter?: (label: string, key: string, index: number) => string; // rewrites a zone name
}

/** Presence shows the zone names above the tracks. Renders nothing. */
const ZoneLabel: FC<ZoneLabelProps> = () => null;

export interface RowLabelProps {
  width?: number; // width of the label column in pixels
  formatter?: (label: string, index: number) => string; // rewrites a row name
}

/** Presence shows the row names to the left of the tracks. Renders nothing. */
const RowLabel: FC<RowLabelProps> = () => null;

export interface ValueLabelProps {
  width?: number; // width of the value column in pixels
  formatter?: (row: ZoneChartRow, index: number) => string; // rewrites a row's value text
}

/** Presence shows each row's value to the right of its track. Renders nothing. */
const ValueLabel: FC<ValueLabelProps> = () => null;

export interface AlertProps {
  dataKey?: string; // config key whose color paints the alert glyph, marker and value
}

/**
 * Presence marks rows whose `tone` is `"alert"`: a warning glyph opens the row
 * and the marker and value take the alert color. `dataKey` names the config
 * entry that supplies that color, so nothing here is hard-coded. Renders nothing.
 */
const Alert: FC<AlertProps> = () => null;

export interface LegendProps {
  variant?: LegendVariant; // visual style of the legend indicators
  align?: "left" | "center" | "right"; // horizontal placement
  verticalAlign?: "top" | "bottom"; // above the tracks or below them
}

/**
 * Presence renders the zone color key. Unlike `<ZoneLabel>`, which names the
 * bands in place, this pairs each zone with its swatch — the reading the
 * `"gradient"` variant needs, since a ramp has no band edges to match a name to.
 * Renders nothing.
 */
const Legend: FC<LegendProps> = () => null;

export interface TooltipProps {
  variant?: TooltipVariant; // visual style of the tooltip surface
  roundness?: TooltipRoundness; // border-radius of the tooltip
  position?: TooltipPosition; // "variable" follows the pointer (default); "fixed" pins the tooltip near the top
  actualLabel?: string; // row title for the zone the value landed in
  expectedLabel?: string; // row title for the expected zone
  valueFormatter?: (value: number, row: ZoneChartRow) => string; // formats the hovered row's value
}

/** Presence enables the hover tooltip. Renders nothing. */
const Tooltip: FC<TooltipProps> = () => null;

// ─────────────────────────────────────────────────────────────────────────────
// Children collection — walk the declarative config into plain objects the
// option builder consumes.
// ─────────────────────────────────────────────────────────────────────────────

type TrackSlot = {
  layout: ZoneChartLayout;
  variant: ZoneChartVariant;
  height: number | null; // null → the variant's default
  radius: number;
  gap: number;
  isClickable: boolean;
};
type MarkerSlot = { size: number; shape: NonNullable<MarkerProps["shape"]> };
type ZoneLabelSlot = { formatter: ZoneLabelProps["formatter"] };
type RowLabelSlot = { width: number; formatter: RowLabelProps["formatter"] };
type ValueLabelSlot = { width: number; formatter: ValueLabelProps["formatter"] };
type AlertSlot = { dataKey: string | null };
type LegendSlot = {
  variant: LegendVariant;
  align: "left" | "center" | "right";
  verticalAlign: "top" | "bottom";
};
type TooltipSlot = {
  present: boolean;
  variant: TooltipVariant;
  roundness: TooltipRoundness;
  position: TooltipPosition;
  actualLabel: string;
  expectedLabel: string;
  valueFormatter: (value: number, row: ZoneChartRow) => string;
};

type CollectedConfig = {
  track: TrackSlot;
  marker: MarkerSlot;
  showTolerance: boolean;
  zoneLabel: ZoneLabelSlot | null;
  rowLabel: RowLabelSlot | null;
  valueLabel: ValueLabelSlot | null;
  alert: AlertSlot | null;
  legend: LegendSlot | null;
  tooltip: TooltipSlot;
};

function defaultValueFormatter(value: number): string {
  return value.toLocaleString();
}

function collectConfig(children: ReactNode): CollectedConfig {
  let track: TrackSlot = {
    layout: "rows",
    variant: "default",
    height: null,
    radius: DEFAULT_TRACK_RADIUS,
    gap: DEFAULT_ZONE_GAP,
    isClickable: false,
  };
  let marker: MarkerSlot = { size: DEFAULT_MARKER_SIZE, shape: "circle" };
  let showTolerance = false;
  let zoneLabel: ZoneLabelSlot | null = null;
  let rowLabel: RowLabelSlot | null = null;
  let valueLabel: ValueLabelSlot | null = null;
  let alert: AlertSlot | null = null;
  let legend: LegendSlot | null = null;
  let tooltip: TooltipSlot = {
    present: false,
    variant: "default",
    roundness: "lg",
    position: "variable",
    actualLabel: "Actual",
    expectedLabel: "Expected",
    valueFormatter: defaultValueFormatter,
  };

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const type = child.type;

    if (type === Track) {
      const props = child.props as TrackProps;
      track = {
        layout: props.layout ?? "rows",
        variant: props.variant ?? "default",
        height: props.height ?? null,
        radius: props.radius ?? DEFAULT_TRACK_RADIUS,
        gap: props.gap ?? DEFAULT_ZONE_GAP,
        isClickable: props.isClickable ?? false,
      };
    } else if (type === Marker) {
      const props = child.props as MarkerProps;
      marker = { size: props.size ?? DEFAULT_MARKER_SIZE, shape: props.shape ?? "circle" };
    } else if (type === Tolerance) {
      showTolerance = true;
    } else if (type === ZoneLabel) {
      const props = child.props as ZoneLabelProps;
      zoneLabel = { formatter: props.formatter };
    } else if (type === RowLabel) {
      const props = child.props as RowLabelProps;
      rowLabel = { width: props.width ?? DEFAULT_ROW_LABEL_WIDTH, formatter: props.formatter };
    } else if (type === ValueLabel) {
      const props = child.props as ValueLabelProps;
      valueLabel = { width: props.width ?? DEFAULT_VALUE_LABEL_WIDTH, formatter: props.formatter };
    } else if (type === Alert) {
      const props = child.props as AlertProps;
      alert = { dataKey: props.dataKey ?? null };
    } else if (type === Legend) {
      const props = child.props as LegendProps;
      legend = {
        variant: props.variant ?? "rounded-square",
        align: props.align ?? "right",
        verticalAlign: props.verticalAlign ?? "bottom",
      };
    } else if (type === Tooltip) {
      const props = child.props as TooltipProps;
      tooltip = {
        present: true,
        variant: props.variant ?? "default",
        roundness: props.roundness ?? "lg",
        position: props.position ?? "variable",
        actualLabel: props.actualLabel ?? "Actual",
        expectedLabel: props.expectedLabel ?? "Expected",
        valueFormatter: props.valueFormatter ?? ((value) => defaultValueFormatter(value)),
      };
    }
  });

  return {
    track,
    marker,
    showTolerance,
    zoneLabel,
    rowLabel,
    valueLabel,
    alert,
    legend,
    tooltip,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scale model — the zones divide `[0, max]` into equal bands, in the order the
// `zones` prop lists them. Everything downstream asks this model, never the
// config's own key order.
// ─────────────────────────────────────────────────────────────────────────────

type Span = { start: number; end: number };

function clampToScale(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(0, value));
}

/** The span a zone key occupies, or `null` when the key is not one of the zones. */
function zoneSpan(zones: string[], key: string | null | undefined, max: number): Span | null {
  if (!key) return null;
  const index = zones.indexOf(key);
  if (index === -1) return null;
  const width = max / zones.length;
  return { start: index * width, end: (index + 1) * width };
}

/** The zone a value lands in. Values on a boundary count in the upper zone. */
function zoneAt(zones: string[], value: number, max: number): string | null {
  if (zones.length === 0) return null;
  const width = max / zones.length;
  const index = Math.min(
    zones.length - 1,
    Math.max(0, Math.floor(clampToScale(value, max) / width)),
  );
  return zones[index];
}

/**
 * The hatched margins: the tolerance minus the expected zone. A tolerance that
 * fits inside its zone leaves nothing to hatch, which is exactly right — the
 * row has no drift to show.
 */
function marginsOf(tolerance: Span, zone: Span): Span[] {
  return [
    { start: tolerance.start, end: Math.min(zone.start, tolerance.end) },
    { start: Math.max(zone.end, tolerance.start), end: tolerance.end },
  ].filter((margin) => margin.end > margin.start);
}

/** The color slot a zone key paints with — the last of its ramp, so a multi-color key still reads. */
function zoneColor(resolved: ResolvedColors, key: string | null | undefined): string {
  if (!key) return GRAY;
  const slots = resolved.series[key];
  if (!slots || slots.length === 0) return GRAY;
  return slots[slots.length - 1];
}

// ─────────────────────────────────────────────────────────────────────────────
// Hatching — 45° stripes clipped to a rect, analytically. A stripe is the line
// `x + y = c`; intersecting it with the rect is two clamps, so no clip path and
// no canvas pattern is needed and both renderers paint the same picture.
// ─────────────────────────────────────────────────────────────────────────────

function hatchLines(
  rect: { x: number; y: number; width: number; height: number },
  color: string,
): RenderItemChild[] {
  const lines: RenderItemChild[] = [];
  if (rect.width <= 0 || rect.height <= 0) return lines;

  const step = HATCH_STRIPE_SPACING * Math.SQRT2; // perpendicular spacing → spacing along c
  const first = Math.ceil((rect.x + rect.y) / step) * step;
  const last = rect.x + rect.width + rect.y + rect.height;

  for (let c = first; c <= last; c += step) {
    const lo = Math.max(rect.x, c - (rect.y + rect.height));
    const hi = Math.min(rect.x + rect.width, c - rect.y);
    if (hi <= lo) continue;
    lines.push({
      type: "line",
      shape: { x1: lo, y1: c - lo, x2: hi, y2: c - hi },
      style: { stroke: color, lineWidth: HATCH_STRIPE_WIDTH },
      silent: true,
    });
  }

  return lines;
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading skeleton helper — a hard clip window swept across the rows. `floor`
// keeps the skeleton faintly visible between sweeps; `peak` is the bright band.
// `center` may run outside [0, 1] so the window fully enters and exits.
// ─────────────────────────────────────────────────────────────────────────────

function shimmerWindowStops(center: number, color: string, floor: number, peak: number) {
  const half = LOADING_SHIMMER_BAND;
  const feather = LOADING_SHIMMER_FEATHER;

  const alphaAt = (x: number) => {
    const dist = Math.abs(x - center);
    if (dist <= half - feather) return peak;
    if (dist >= half) return floor;
    // Sine-eased falloff — a linear ramp still reads as a hard cut.
    const eased = Math.sin(((1 - (dist - (half - feather)) / feather) * Math.PI) / 2);
    return floor + (peak - floor) * eased;
  };

  const offsets = [
    0,
    center - half,
    center - half + feather,
    center,
    center + half - feather,
    center + half,
    1,
  ]
    .filter((x) => x >= 0 && x <= 1)
    .sort((a, b) => a - b);

  const stops: { offset: number; color: string }[] = [];
  for (const offset of offsets) {
    if (stops.length === 0 || offset - stops[stops.length - 1].offset > 1e-4) {
      stops.push({ offset, color: withAlpha(color, alphaAt(offset)) });
    }
  }
  return stops;
}

// ─────────────────────────────────────────────────────────────────────────────
// Option builders — pure functions from a snapshot context to ECharts option
// fragments. The component reads its refs ONCE per build into this context;
// nothing below touches React state or the chart instance.
// ─────────────────────────────────────────────────────────────────────────────

type OptionBuildContext = {
  config: ChartConfig;
  zones: string[];
  data: ZoneChartRow[];
  max: number;
  layout: ZoneChartLayout;
  variant: ZoneChartVariant;
  track: TrackSlot;
  trackHeight: number;
  marker: MarkerSlot;
  showTolerance: boolean;
  zoneLabel: ZoneLabelSlot | null;
  rowLabel: RowLabelSlot | null;
  valueLabel: ValueLabelSlot | null;
  alert: AlertSlot | null;
  tooltipSlot: TooltipSlot;
  selectedKey: string | null;
  isLoading: boolean;
  revealEnabled: boolean; // play the intro reveal on this push
  resolved: ResolvedColors;
};

/** Pixel offsets of the grid rect — the label columns live outside it. */
function gridOf(ctx: OptionBuildContext): GridComponentOption {
  const leading = ctx.alert ? ALERT_GUTTER : 0;
  const left = EDGE_PADDING + leading + (ctx.rowLabel ? ctx.rowLabel.width + LABEL_MARGIN : 0);
  const right = EDGE_PADDING + (ctx.valueLabel ? ctx.valueLabel.width + LABEL_MARGIN : 0);

  return {
    id: "__grid",
    left,
    right,
    top: EDGE_PADDING + (ctx.zoneLabel ? ZONE_LABEL_HEIGHT : 0),
    bottom: EDGE_PADDING,
    containLabel: false,
  };
}

/**
 * The scale axis. Nothing is drawn on it — it only carries the zone names above
 * the tracks, pinned to each band's center with `customValues`.
 */
function buildXAxis(ctx: OptionBuildContext): XAxisOption {
  const { zones, max, zoneLabel, config, resolved, isLoading } = ctx;
  const width = max / zones.length;
  const centers = zones.map((_, index) => index * width + width / 2);
  const labelOf = (index: number) => {
    const key = zones[index];
    const raw = config[key]?.label;
    const text = typeof raw === "string" ? raw : key;
    return zoneLabel?.formatter ? zoneLabel.formatter(text, key, index) : text;
  };

  return {
    type: "value",
    min: 0,
    max,
    position: "top",
    show: zoneLabel !== null && !isLoading,
    boundaryGap: [0, 0],
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { show: false },
    axisLabel: {
      // One label per zone, centered over its band, rather than ECharts' own
      // evenly spaced numeric ticks.
      customValues: centers,
      formatter: (value: number) => {
        const index = centers.findIndex((center) => Math.abs(center - value) < 1e-6);
        return index === -1 ? "" : labelOf(index);
      },
      margin: LABEL_MARGIN,
      color: resolved.tokens.mutedForeground,
      fontSize: 11,
      hideOverlap: true,
    },
  };
}

/**
 * The row axes. Index 0 carries the row names on the left; index 1 mirrors the
 * same categories on the right to carry each row's value, tinted per row so an
 * alerting row's value reads in the alert color.
 */
function buildYAxes(ctx: OptionBuildContext): YAxisOption[] {
  const { data, rowLabel, valueLabel, tooltipSlot, resolved, isLoading, alert } = ctx;
  const categories = data.map((row) => row.key);
  const alertColor = alert?.dataKey
    ? zoneColor(resolved, alert.dataKey)
    : resolved.tokens.foreground;

  const base = {
    type: "category" as const,
    data: categories,
    // Rows read top to bottom, the opposite of ECharts' bottom-up default.
    inverse: true,
    boundaryGap: true,
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { show: false },
  };

  const labels: YAxisOption = {
    ...base,
    id: "__rows",
    show: rowLabel !== null && !isLoading,
    axisLabel: {
      width: rowLabel?.width ?? DEFAULT_ROW_LABEL_WIDTH,
      overflow: "truncate",
      align: "right",
      margin: LABEL_MARGIN,
      color: resolved.tokens.mutedForeground,
      fontSize: 11,
      formatter: (_value?: string | number, index?: number) => {
        const row = data[index ?? -1];
        if (!row) return "";
        return rowLabel?.formatter ? rowLabel.formatter(row.label, index ?? 0) : row.label;
      },
    },
  };

  const values: YAxisOption = {
    ...base,
    id: "__values",
    position: "right",
    show: valueLabel !== null && !isLoading,
    axisLabel: {
      width: valueLabel?.width ?? DEFAULT_VALUE_LABEL_WIDTH,
      overflow: "truncate",
      align: "left",
      margin: LABEL_MARGIN,
      // A per-row color: alerting rows take the alert key's color, the rest the
      // muted foreground. ECharts resolves this callback once per label.
      color: (_value?: string | number, index?: number) =>
        data[index ?? -1]?.tone === "alert" && alert ? alertColor : resolved.tokens.mutedForeground,
      fontSize: 11,
      fontWeight: "bold" as const,
      formatter: (_value?: string | number, index?: number) => {
        const row = data[index ?? -1];
        if (!row) return "";
        if (valueLabel?.formatter) return valueLabel.formatter(row, index ?? 0);
        return row.valueLabel ?? tooltipSlot.valueFormatter(row.value, row);
      },
    },
  };

  return [labels, values];
}

/** The alert glyph: a warning triangle with a bang, drawn in the leading gutter. */
function alertGlyph(cx: number, cy: number, color: string): RenderItemChild[] {
  const half = ALERT_GLYPH_SIZE / 2;
  const top = cy - half;
  const bottom = cy + half * 0.82;

  return [
    {
      type: "polygon",
      shape: {
        points: [
          [cx, top],
          [cx + half, bottom],
          [cx - half, bottom],
        ],
      },
      style: {
        fill: withAlpha(color, ALERT_GLYPH_FILL_OPACITY),
        stroke: color,
        lineWidth: ALERT_GLYPH_STROKE_WIDTH,
        lineJoin: "round",
      },
      silent: true,
    },
    {
      type: "line",
      shape: { x1: cx, y1: cy - half * 0.18, x2: cx, y2: cy + half * 0.3 },
      style: { stroke: color, lineWidth: ALERT_GLYPH_STROKE_WIDTH, lineCap: "round" },
      silent: true,
    },
    {
      type: "circle",
      shape: { cx, cy: cy + half * 0.58, r: ALERT_GLYPH_STROKE_WIDTH * 0.55 },
      style: { fill: color },
      silent: true,
    },
  ];
}

/** The marker sitting at a row's value — the whole point of the chart. */
function markerElement(
  cx: number,
  cy: number,
  ctx: OptionBuildContext,
  fill: string,
  halo: string | null,
): RenderItemChild[] {
  const { marker, resolved, trackHeight } = ctx;
  const size = marker.size;
  const ring = resolved.tokens.background;
  const elements: RenderItemChild[] = [];

  if (halo) {
    elements.push({
      type: "circle",
      shape: { cx, cy, r: size / 2 + MARKER_RING_WIDTH * 1.6 },
      style: { fill: halo },
      silent: true,
      name: "halo",
    });
  }

  const style = { fill, stroke: ring, lineWidth: MARKER_RING_WIDTH };

  if (marker.shape === "line") {
    const half = trackHeight / 2 + 2;
    elements.push({
      type: "rect",
      shape: { x: cx - size / 6, y: cy - half, width: size / 3, height: half * 2, r: size / 6 },
      style,
      name: "marker",
    });
  } else if (marker.shape === "diamond") {
    const half = size / 2;
    elements.push({
      type: "polygon",
      shape: {
        points: [
          [cx, cy - half],
          [cx + half, cy],
          [cx, cy + half],
          [cx - half, cy],
        ],
      },
      style: { ...style, lineJoin: "round" },
      name: "marker",
    });
  } else {
    elements.push({
      type: "circle",
      shape: { cx, cy, r: size / 2 },
      style,
      name: "marker",
    });
  }

  return elements;
}

/**
 * Gradient stops that hold each zone's own color at the CENTER of its band and
 * blend across the boundaries between them — zones that read as progressive
 * rather than stepped. The ends are pinned to the first and last color so the
 * ramp stays true to its zone right up to the edge of the scale.
 *
 * Shared by both layouts, so `variant="gradient"` paints the same ramp whether
 * it lands on a per-row track or on the spectrum backdrop.
 */
function zoneGradientStops(zones: string[], resolved: ResolvedColors, alpha: number) {
  const paint = (key: string) => withAlpha(zoneColor(resolved, key), alpha);
  if (zones.length === 0) {
    return [
      { offset: 0, color: GRAY },
      { offset: 1, color: GRAY },
    ];
  }
  const first = paint(zones[0]);
  const last = paint(zones[zones.length - 1]);
  return [
    { offset: 0, color: first },
    ...zones.map((key, index) => ({ offset: (index + 0.5) / zones.length, color: paint(key) })),
    { offset: 1, color: last },
  ];
}

/**
 * The `"spectrum"` skin's backdrop: the zones painted ONCE as full-height columns
 * spanning the plot, so the rows read against one uninterrupted scale instead of
 * repeating the same bands each. Drawn under the rows.
 */
function buildSpectrumSeries(ctx: OptionBuildContext): CustomSeriesOption {
  const { zones, data, variant, track, resolved } = ctx;

  const renderItem = (params: RenderItemParams): RenderItemReturn => {
    // The plot rect is the whole extent — no api.coord needed, since the columns
    // span every row rather than sitting on one.
    const coordSys = params.coordSys as { x?: number; y?: number; width?: number; height?: number };
    const left = coordSys.x ?? 0;
    const top = coordSys.y ?? 0;
    const width = coordSys.width ?? 0;
    const height = coordSys.height ?? 0;
    if (width <= 0 || height <= 0) return undefined;

    if (variant === "gradient") {
      // One ramp across the whole plot: the zones still sit where they sit, but
      // they bleed into each other instead of meeting at an edge.
      return {
        type: "group",
        children: [
          {
            type: "rect",
            shape: { x: left, y: top, width, height, r: track.radius },
            style: {
              fill: new echarts.graphic.LinearGradient(
                left,
                top,
                left + width,
                top,
                zoneGradientStops(zones, resolved, SPECTRUM_BAND_OPACITY),
                true,
              ),
            },
            silent: true,
            name: "spectrum",
            transition: ["shape", "style"] as const,
          },
        ],
      };
    }

    const column = width / zones.length;
    const gap = Math.min(track.gap, Math.max(0, column - 1));
    // With a gap, each column is its own rounded block. Without one the columns
    // must read as a SINGLE rounded block, so only the outer corners round —
    // rounding each column would pinch the seams and break the spectrum.
    const seamless = gap < 0.5;
    const cornersOf = (index: number): number | number[] => {
      const r = track.radius;
      if (!seamless || zones.length === 1) return r;
      if (index === 0) return [r, 0, 0, r];
      if (index === zones.length - 1) return [0, r, r, 0];
      return 0;
    };

    return {
      type: "group",
      children: zones.map((key, index) => ({
        type: "rect" as const,
        shape: {
          x: left + index * column + gap / 2,
          y: top,
          width: Math.max(1, column - gap),
          height,
          r: cornersOf(index),
        },
        style: { fill: withAlpha(zoneColor(resolved, key), SPECTRUM_BAND_OPACITY) },
        silent: true,
        name: `column-${key}`,
        transition: ["shape", "style"] as const,
      })),
    };
  };

  return {
    id: "__spectrum",
    type: "custom",
    // Under the rows, which ECharts draws at the default series z of 2.
    z: 1,
    silent: true,
    renderItem,
    // A single item: the columns span every row, so they are drawn once.
    data: [[0, data[0]?.key ?? ""]],
    animation: false,
  };
}

/** One row, painted left to right: bands, tolerance, expected zone, marker. */
function buildRowSeries(ctx: OptionBuildContext): CustomSeriesOption {
  const {
    data,
    zones,
    max,
    layout,
    variant,
    track,
    trackHeight,
    showTolerance,
    alert,
    selectedKey,
    resolved,
    revealEnabled,
  } = ctx;

  const alertColor = alert?.dataKey
    ? zoneColor(resolved, alert.dataKey)
    : resolved.tokens.foreground;
  const zoneWidth = max / zones.length;
  const hasSelection = selectedKey !== null;
  const gutterCenter = EDGE_PADDING + ALERT_GUTTER / 2;

  const renderItem = (params: RenderItemParams, api: RenderItemApi): RenderItemReturn => {
    const row = data[params.dataIndex];
    if (!row) return undefined;

    const [x0, cy] = api.coord([0, params.dataIndex]);
    const [x1] = api.coord([max, params.dataIndex]);
    const scale = (value: number) => x0 + ((x1 - x0) * clampToScale(value, max)) / max;
    const top = cy - trackHeight / 2;
    const radius = Math.min(track.radius, trackHeight / 2);
    const children: RenderItemChild[] = [];

    const expected = zoneSpan(zones, row.zone, max);
    const expectedColor = zoneColor(resolved, row.zone);

    // ── The track ────────────────────────────────────────────────────────────
    if (layout === "spectrum") {
      // No per-row track at all — the zones are painted once, full height, by
      // the spectrum series underneath. A row is just a dotted rule across it.
      children.push({
        type: "line",
        shape: { x1: x0, y1: cy, x2: x1, y2: cy },
        style: {
          stroke: withAlpha(resolved.tokens.mutedForeground, SPECTRUM_RULE_OPACITY),
          lineWidth: SPECTRUM_RULE_WIDTH,
          lineDash: SPECTRUM_RULE_DASH,
          lineCap: "round",
        },
        silent: true,
        name: "rule",
      });
    } else if (variant === "gradient") {
      // One ramp across the zone colors, painted in absolute pixel space so every
      // row's gradient lines up with the zone names above. Same stop scheme as the
      // spectrum backdrop — one gradient, one implementation.
      const stops = zoneGradientStops(zones, resolved, GRADIENT_TRACK_OPACITY);
      children.push({
        type: "rect",
        shape: { x: x0, y: top, width: x1 - x0, height: trackHeight, r: radius },
        style: { fill: new echarts.graphic.LinearGradient(x0, top, x1, top, stops, true) },
        silent: true,
        name: "track",
      });
    } else {
      // Discrete bands — one per zone, each carved back by half the gap on both
      // sides so the pitch stays exactly one zone wide.
      const gap = Math.min(track.gap, zoneWidth > 0 ? (x1 - x0) / zones.length - 1 : 0);
      for (const [index, key] of zones.entries()) {
        const bandStart = scale(index * zoneWidth) + gap / 2;
        const bandEnd = scale((index + 1) * zoneWidth) - gap / 2;
        children.push({
          type: "rect",
          shape: {
            x: bandStart,
            y: top,
            width: Math.max(1, bandEnd - bandStart),
            height: trackHeight,
            r: radius,
          },
          style: { fill: withAlpha(zoneColor(resolved, key), ZONE_FAINT_OPACITY) },
          silent: true,
          name: `band-${key}`,
        });
      }
    }

    // ── The tolerance ────────────────────────────────────────────────────────
    if (showTolerance && row.tolerance && expected) {
      if (layout === "spectrum") {
        // The rule itself carries the tolerance: the margins outside the expected
        // zone switch to a wider dash in that zone's color.
        for (const margin of marginsOf(row.tolerance, expected)) {
          const start = scale(margin.start);
          const end = scale(margin.end);
          if (end <= start) continue;
          children.push({
            type: "line",
            shape: { x1: start, y1: cy, x2: end, y2: cy },
            style: {
              stroke: withAlpha(expectedColor, SPECTRUM_TOLERANCE_OPACITY),
              lineWidth: SPECTRUM_TOLERANCE_WIDTH,
              lineDash: SPECTRUM_TOLERANCE_DASH,
              lineCap: "round",
            },
            silent: true,
            name: `margin-${margin.start}`,
          });
        }
      } else if (variant === "gradient") {
        // A translucent band with an outline, covering the whole tolerated span.
        const start = scale(row.tolerance.start);
        const end = scale(row.tolerance.end);
        if (end > start) {
          children.push({
            type: "rect",
            shape: { x: start, y: top, width: end - start, height: trackHeight, r: radius },
            style: {
              fill: withAlpha(expectedColor, GRADIENT_BAND_OPACITY),
              stroke: withAlpha(expectedColor, GRADIENT_BAND_STROKE_OPACITY),
              lineWidth: GRADIENT_BAND_STROKE_WIDTH,
            },
            silent: true,
            name: "tolerance",
          });
        }
      } else {
        // Hatched margins — the tolerated drift OUTSIDE the expected zone, which
        // is where a value is allowed to sit without alerting.
        for (const margin of marginsOf(row.tolerance, expected)) {
          const start = scale(margin.start);
          const end = scale(margin.end);
          if (end <= start) continue;
          const rect = { x: start, y: top, width: end - start, height: trackHeight };
          children.push({
            type: "rect",
            shape: { ...rect, r: radius },
            style: { fill: withAlpha(expectedColor, ZONE_FAINT_OPACITY) },
            silent: true,
            name: `margin-${margin.start}`,
          });
          children.push(...hatchLines(rect, withAlpha(expectedColor, ZONE_HATCH_OPACITY)));
        }
      }
    }

    // ── The expected zone ────────────────────────────────────────────────────
    if (expected) {
      const start = scale(expected.start);
      const end = scale(expected.end);
      children.push({
        type: "rect",
        shape: {
          x: start,
          y: top,
          width: Math.max(1, end - start),
          height: trackHeight,
          // On the spectrum skin the expected zone is a pill riding the rule,
          // not a band filling a track — so it takes fully rounded caps.
          r: layout === "spectrum" ? trackHeight / 2 : radius,
        },
        style: {
          fill: withAlpha(expectedColor, expectedOpacity(layout, variant)),
        },
        silent: true,
        name: "expected",
      });
    }

    // ── The marker ───────────────────────────────────────────────────────────
    const alerting = row.tone === "alert" && alert !== null;
    // A neutral pin reads against discrete bands, and against the spectrum's
    // faint backdrop. A saturated ramp directly under the marker does not, so the
    // gradient rows color it by the zone it lands in instead.
    const onRamp = layout === "rows" && variant === "gradient";
    const markerFill = alerting
      ? alertColor
      : onRamp
        ? zoneColor(resolved, zoneAt(zones, row.value, max))
        : resolved.tokens.foreground;
    children.push(
      ...markerElement(
        scale(row.value),
        cy,
        ctx,
        markerFill,
        alerting ? withAlpha(alertColor, ALERT_HALO_OPACITY) : null,
      ),
    );

    // ── The leading alert glyph ──────────────────────────────────────────────
    if (alerting) {
      children.push(...alertGlyph(gutterCenter, cy, alertColor));
    }

    // The intro fades each row in where it stands; the stagger below runs the
    // reveal down the list. Later pushes update these elements in place.
    const entrance = revealEnabled ? { enterFrom: { style: { opacity: 0 } } } : {};
    for (const child of children) {
      Object.assign(child, entrance, { transition: ["shape", "style"] });
    }
    if (revealEnabled) {
      const pin = children[children.length - (alerting ? 4 : 1)];
      if (pin) {
        Object.assign(pin, {
          originX: scale(row.value),
          originY: cy,
          enterFrom: {
            style: { opacity: 0 },
            scaleX: INTRO_MARKER_SCALE_FROM,
            scaleY: INTRO_MARKER_SCALE_FROM,
          },
        });
      }
    }

    return {
      type: "group",
      // Selection softens every other row so the chosen one carries the eye.
      ...(hasSelection && row.key !== selectedKey ? { style: { opacity: ROW_DIM_OPACITY } } : {}),
      children,
    };
  };

  return {
    id: "__rows",
    type: "custom",
    // The alert glyph sits in the leading gutter, left of the grid rect.
    clip: false,
    renderItem,
    // The value rides along so `params.value` is meaningful to the tooltip.
    data: data.map((row) => [clampToScale(row.value, max), row.key]),
    animation: revealEnabled,
    animationDuration: INTRO_DURATION,
    animationEasing: "cubicOut",
    animationDelay: (dataIndex: number) => dataIndex * INTRO_ROW_STAGGER,
    animationDurationUpdate: UPDATE_DURATION,
    animationEasingUpdate: "cubicOut",
    animationDelayUpdate: 0,
  };
}

// Tooltip HTML builder, closed over the build context. A hovered row shows its
// name as the title, the zone its value landed in, and — when it has one — the
// zone it was expected to land in.
function createTooltipFormatter(ctx: OptionBuildContext) {
  const { config, data, zones, max, tooltipSlot, alert } = ctx;

  const labelOf = (key: string | null) => {
    if (!key) return "—";
    const raw = config[key]?.label;
    return typeof raw === "string" ? raw : key;
  };
  const swatchOf = (key: string | null) => {
    if (!key || !config[key]) {
      return `<div class="bg-foreground/20 h-2.5 w-2.5 shrink-0 rounded-[2px]"></div>`;
    }
    return tooltipIndicatorHtml(key, getColorsCount(config[key]));
  };

  return (params: unknown): string => {
    const p = params as { dataIndex?: number };
    const row = data[p.dataIndex ?? -1];
    if (!row) return "";

    const actual = zoneAt(zones, row.value, max);
    const valueText = row.valueLabel ?? tooltipSlot.valueFormatter(row.value, row);
    const alerting = row.tone === "alert" && alert !== null;

    const body = [
      tooltipRow({
        indicatorHtml: swatchOf(actual),
        labelText: `${tooltipSlot.actualLabel} · ${labelOf(actual)}`,
        valueText,
        dimmed: "",
      }),
      row.zone
        ? tooltipRow({
            indicatorHtml: swatchOf(row.zone),
            labelText: tooltipSlot.expectedLabel,
            valueText: labelOf(row.zone),
            // An alerting row dims its expected line, so the miss reads at a glance.
            dimmed: alerting ? " opacity-60" : "",
          })
        : "",
    ].join("");

    return tooltipShell({
      label: row.label,
      body,
      roundness: tooltipSlot.roundness,
      variant: tooltipSlot.variant,
    });
  };
}

function buildTooltipOption(ctx: OptionBuildContext): TooltipComponentOption {
  const { tooltipSlot, isLoading } = ctx;
  return {
    show: tooltipSlot.present && !isLoading,
    trigger: "item",
    confine: true,
    backgroundColor: "transparent",
    borderWidth: 0,
    padding: 0,
    extraCssText: "box-shadow:none;",
    displayTransition: false,
    // Item-triggered (rows, no axis pointer), so the position wires straight
    // through resolveTooltipPosition rather than tooltipBaseOption (axis only).
    position: resolveTooltipPosition(tooltipSlot.position),
    formatter: createTooltipFormatter(ctx),
  };
}

// Either a flat color or the shimmer gradient the rAF loop sweeps across the rows.
type SkeletonFill = string | echarts.graphic.LinearGradient;

// Loading skeleton — the same rows in transparent foreground (label pill, track,
// value pill), invisible until the first shimmer tick tints them, so there is no
// flash before the rAF loop positions the sweep.
function skeletonRenderItem(ctx: OptionBuildContext, fill: SkeletonFill) {
  return (params: RenderItemParams, api: RenderItemApi): RenderItemReturn => {
    const { max, trackHeight, track, rowLabel, valueLabel } = ctx;
    const [x0, cy] = api.coord([0, params.dataIndex]);
    const [x1] = api.coord([max, params.dataIndex]);
    const top = cy - trackHeight / 2;
    const radius = Math.min(track.radius, trackHeight / 2);
    const pill = Math.min(trackHeight, 10);
    const children: RenderItemChild[] = [
      {
        type: "rect",
        shape: { x: x0, y: top, width: Math.max(1, x1 - x0), height: trackHeight, r: radius },
        style: { fill },
        silent: true,
      },
    ];

    if (rowLabel) {
      const width = rowLabel.width * LOADING_LABEL_FILL;
      children.push({
        type: "rect",
        shape: {
          x: x0 - LABEL_MARGIN - width,
          y: cy - pill / 2,
          width,
          height: pill,
          r: pill / 2,
        },
        style: { fill },
        silent: true,
      });
    }
    if (valueLabel) {
      const width = valueLabel.width * LOADING_LABEL_FILL;
      children.push({
        type: "rect",
        shape: { x: x1 + LABEL_MARGIN, y: cy - pill / 2, width, height: pill, r: pill / 2 },
        style: { fill },
        silent: true,
      });
    }

    return { type: "group", children };
  };
}

function buildLoadingOption(ctx: OptionBuildContext): EChartsOption {
  const { data, resolved } = ctx;
  const transparent = withAlpha(resolved.tokens.foreground, 0);
  const [rows, values] = buildYAxes(ctx);

  return {
    animation: false,
    tooltip: { show: false },
    grid: gridOf(ctx),
    xAxis: buildXAxis(ctx),
    yAxis: [rows, values],
    series: [
      {
        id: "__loading",
        type: "custom",
        clip: false,
        silent: true,
        renderItem: skeletonRenderItem(ctx, transparent),
        data: data.map((row) => [0, row.key]),
        animation: false,
      },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Live imperative state — everything the ECharts event handlers, the shimmer
// rAF, and the theme repush read or write OUTSIDE the React render cycle,
// grouped in one ref-stable object. None of it is render output, which is why
// it is not React state.
// ─────────────────────────────────────────────────────────────────────────────

type LiveState = {
  resolved: ResolvedColors | null; // colors read off the live DOM — feeds builds and the shimmer
  selectedKey: string | null; // current selection, kept in step with the React state
  hasRevealed: boolean; // the intro reveal already played on this chart instance
  revealEnabled: boolean; // the current push should create rows with the entrance
  // Latest callbacks/flags for the imperative ECharts click handler.
  handlers: {
    onSelectionChange?: (selection: ZoneChartSelection | null) => void;
    isRowClickable: boolean;
    rows: ZoneChartRow[];
    zones: string[];
    max: number;
  };
  // Update-style re-push for paths that bypass React entirely (theme flips,
  // resizes) — set by the sync effect.
  repush: () => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Zone chart rendered with Apache ECharts — one horizontal track per row, split
 * into equal zones, with a marker at the row's value. Built for "declared vs
 * observed" readings: each row names the zone its value was expected to land in,
 * that zone is painted solid, the tolerated drift around it is hatched, and a
 * row that misses both opens with an alert glyph.
 *
 * The root owns the scale, the zone math, selection state, the loading skeleton,
 * and the intro reveal; the visual parts — `<Track>`, `<Marker>`, `<Tolerance>`,
 * `<ZoneLabel>`, `<RowLabel>`, `<ValueLabel>`, `<Alert>`, `<Tooltip>` — are
 * composed as declarative children that render nothing. The root walks those
 * children by reference and drives a single imperative ECharts instance. Fully
 * self-contained: its only dependencies are `react`, `echarts`, and `motion`.
 */
export function EChartsZoneChart({
  data,
  config,
  zones,
  children,
  className,
  renderer = DEFAULT_ECHARTS_RENDERER,
  max = DEFAULT_MAX,
  defaultSelectedKey = null,
  onSelectionChange,
  isLoading = false,
  loadingRows = DEFAULT_LOADING_ROWS,
  animation = true,
  animationType = "default",
  chartOptions,
}: EChartsZoneChartProps) {
  const rawId = useId();
  const chartId = `chart-${rawId.replace(/:/g, "")}`;

  const containerRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const echartsRef = useRef<EChartsInstance | null>(null);

  // The single imperative surface (see LiveState). Object identity is stable
  // for the component's lifetime.
  const live = useRef<LiveState>({
    resolved: null,
    selectedKey: defaultSelectedKey,
    hasRevealed: false,
    revealEnabled: false,
    handlers: {
      onSelectionChange,
      isRowClickable: false,
      rows: [],
      zones,
      max,
    },
    repush: () => {},
  }).current;

  const shouldReduceMotion = useReducedMotion();

  const [selectedKey, setSelectedKey] = useState<string | null>(defaultSelectedKey);

  // ── Declarative config, collected from children by reference ─────────────────
  const collected = useMemo(() => collectConfig(children), [children]);
  const {
    track,
    marker,
    showTolerance,
    zoneLabel,
    rowLabel,
    valueLabel,
    alert,
    legend,
    tooltip: tooltipSlot,
  } = collected;

  const css = useMemo(() => buildChartCss(chartId, config), [chartId, config]);

  // Every zone's ramp, plus the alert key's, resolved from the live DOM.
  const seriesKeys = useMemo(
    () => (alert?.dataKey ? [...zones, alert.dataKey] : zones),
    [zones, alert?.dataKey],
  );

  // While loading, a placeholder row list keeps the skeleton's shape even when
  // the real data hasn't landed yet.
  const rows = useMemo(() => {
    if (!isLoading || data.length > 0) return data;
    return Array.from({ length: Math.max(1, loadingRows) }, (_, index) => ({
      key: `__skeleton-${index}`,
      label: "",
      value: 0,
    }));
  }, [data, isLoading, loadingRows]);

  // The skin is configured on <Track>: `layout` says where the zones live,
  // `variant` how they are painted — the same split every other chart uses.
  const layout = track.layout;
  const variant = track.variant;
  const trackHeight = track.height ?? defaultTrackHeight(layout, variant);

  // Refresh the click handler's snapshot of the latest callbacks/flags every render.
  live.handlers = {
    onSelectionChange,
    isRowClickable: track.isClickable,
    rows,
    zones,
    max,
  };

  // The next selection is derived from the ref, not inside the state updater:
  // React may run an updater more than once, and the callback must fire once.
  const toggleSelection = useCallback(
    (key: string) => {
      const next = live.selectedKey === key ? null : key;
      live.selectedKey = next;
      setSelectedKey(next);
      const { onSelectionChange: cb, rows: current, zones: keys, max: top } = live.handlers;
      if (next === null) {
        cb?.(null);
        return;
      }
      const row = current.find((candidate) => candidate.key === next);
      cb?.({
        key: next,
        value: row?.value ?? 0,
        zone: row ? zoneAt(keys, row.value, top) : null,
      });
    },
    [live],
  );

  // ── Option builder ───────────────────────────────────────────────────────────
  // Thin orchestrator over the pure builders above: snapshot the imperative
  // surface into an OptionBuildContext, then assemble.
  const buildOption = useCallback((): EChartsOption => {
    const resolved = live.resolved;
    if (!resolved || !echartsRef.current) return {};

    const ctx: OptionBuildContext = {
      config,
      zones,
      data: rows,
      max,
      layout,
      variant,
      track,
      trackHeight,
      marker,
      showTolerance,
      zoneLabel,
      rowLabel,
      valueLabel,
      alert,
      tooltipSlot,
      selectedKey,
      isLoading,
      revealEnabled: live.revealEnabled,
      resolved,
    };

    if (isLoading) return buildLoadingOption(ctx);

    return {
      animation: true,
      grid: gridOf(ctx),
      xAxis: buildXAxis(ctx),
      yAxis: buildYAxes(ctx),
      tooltip: buildTooltipOption(ctx),
      series:
        layout === "spectrum"
          ? [buildSpectrumSeries(ctx), buildRowSeries(ctx)]
          : [buildRowSeries(ctx)],
    };
  }, [
    live,
    config,
    zones,
    rows,
    max,
    layout,
    variant,
    track,
    trackHeight,
    marker,
    showTolerance,
    zoneLabel,
    rowLabel,
    valueLabel,
    alert,
    tooltipSlot,
    selectedKey,
    isLoading,
  ]);

  // ── Init + resize + theme observer (per renderer instance) ───────────────────
  useEffect(() => {
    const mount = mountRef.current;
    const container = containerRef.current;
    if (!mount || !container) return;

    const chart = echarts.init(mount, null, { renderer });
    echartsRef.current = chart;

    const resizeObserver = new ResizeObserver(() => {
      // Observers always fire once right after observe(). Only react when the
      // renderer size actually changed — the tracks are sized from it.
      if (mount.clientWidth === chart.getWidth() && mount.clientHeight === chart.getHeight()) {
        return;
      }
      chart.resize();
      live.repush();
    });
    resizeObserver.observe(mount);

    // Light/dark flips change no React state — re-resolve and push directly.
    const themeObserver = new MutationObserver(() => {
      live.repush();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    // Clicking a row toggles its selection, only when <Track isClickable> is set.
    chart.on("click", (params) => {
      const { isRowClickable, rows: current } = live.handlers;
      if (!isRowClickable) return;
      const p = params as { seriesId?: string; dataIndex?: number };
      if (p.seriesId !== "__rows") return;
      const row = current[p.dataIndex ?? -1];
      if (row) toggleSelection(row.key);
    });

    return () => {
      resizeObserver.disconnect();
      themeObserver.disconnect();
      chart.dispose();
      echartsRef.current = null;
      // The reveal guard belongs to the chart instance it guarded. Without this
      // reset, StrictMode's dev-only mount→unmount→remount plays the entrance on
      // the throwaway instance and the surviving one renders without it.
      live.hasRevealed = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderer]);

  // ── Sync ECharts with props/theme/selection — resolve, build, push ────────────
  useEffect(() => {
    const chart = echartsRef.current;
    const container = containerRef.current;
    if (!chart || !container) return;

    // Colors come from the <style> committed just before this effect ran — read
    // them here, right before the push, rather than round-tripping through state.
    live.resolved = resolveColors(container, config, seriesKeys);

    // Intro reveal, played once per chart instance: ECharts' own enter animation
    // runs on the row elements the first time they are created, staggered down
    // the list. Later pushes update those elements in place, so the entrance
    // never replays. A loading cycle re-arms it — the skeleton is a different
    // series, so leaving it creates the rows afresh and the reveal plays again.
    if (isLoading) live.hasRevealed = false;
    const shouldReveal = !live.hasRevealed && !isLoading;
    if (shouldReveal) live.hasRevealed = true;
    live.revealEnabled =
      animation && shouldReveal && animationType !== "none" && !shouldReduceMotion;

    const push = () => {
      const option = buildOption();
      const merged = chartOptions ? { ...option, ...chartOptions } : option;
      // chartOptions is an untyped escape hatch — the spread erases the option's
      // shape, so re-assert it. The only cast in the file.
      chart.setOption(merged as EChartsOption, { notMerge: true });
    };

    push();
    // The entrance belongs to the first push only; anything re-entering through
    // repush (theme, resize) updates rows that already exist.
    live.revealEnabled = false;

    // Theme flips and resizes re-enter here without touching React: re-read the
    // tokens (the .dark class changed, or the renderer resized) and push again.
    live.repush = () => {
      live.resolved = resolveColors(container, config, seriesKeys);
      push();
    };
  }, [
    live,
    buildOption,
    chartOptions,
    isLoading,
    animation,
    animationType,
    shouldReduceMotion,
    config,
    renderer,
    seriesKeys,
  ]);

  // ── Loading shimmer — rAF sweeps a bright band across the skeleton rows ──────
  useEffect(() => {
    const chart = echartsRef.current;
    if (!chart || !isLoading) return;

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const phase = ((((now - start) / LOADING_ANIMATION_DURATION) % 1) + 1) % 1;

      // Read tokens per frame, so a theme flip mid-loading retints the shimmer.
      const resolved = live.resolved;
      const foreground = resolved?.tokens.foreground ?? GRAY;
      const w = chart.getWidth();
      const h = chart.getHeight();
      if (!w || !h || !resolved) {
        raf = requestAnimationFrame(tick);
        return;
      }
      // Sweep the clip window from fully off-screen left to fully off-screen
      // right, leaned 45°. ABSOLUTE pixel coordinates (global gradient) are
      // shared by every row, so a column of the layout lights up together as
      // the band passes its x-position.
      const maxT = (w + h) / (2 * w);
      const center = phase * (maxT + 2 * LOADING_SHIMMER_BAND) - LOADING_SHIMMER_BAND;
      const fill = new echarts.graphic.LinearGradient(
        0,
        0,
        w,
        w,
        shimmerWindowStops(center, foreground, LOADING_CELL_FLOOR, LOADING_CELL_PEAK),
        true,
      );
      chart.setOption(
        {
          series: [
            {
              id: "__loading",
              renderItem: skeletonRenderItem(
                {
                  max,
                  trackHeight,
                  track,
                  rowLabel,
                  valueLabel,
                } as OptionBuildContext,
                fill,
              ),
              data: live.handlers.rows.map((row) => [0, row.key]),
            },
          ],
        },
        { silent: true, lazyUpdate: true },
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [live, isLoading, renderer, max, trackHeight, track, rowLabel, valueLabel]);

  // The zone tracks fill the grid, so the legend sits in flow above or below the
  // chart rather than floating over it — hence a plain margin, not the absolute
  // inset the cartesian charts hand LegendOverlay.
  const legendProps = {
    seriesKeys: zones,
    config,
    variant: legend?.variant ?? ("rounded-square" as const),
    align: legend?.align ?? ("right" as const),
    // Positioning is resolved in flow above; LegendOverlay carries the prop for
    // parity with the cartesian charts' slot.
    verticalAlign: "bottom" as const,
    // The zones are the scale, not toggleable series — selection is per row.
    selectedKey: null,
    hoveredKey: null,
    isClickable: false,
    onToggle: () => {},
    style: {
      marginTop: legend?.verticalAlign === "bottom" ? 8 : 0,
      marginBottom: legend?.verticalAlign === "top" ? 8 : 0,
    } satisfies CSSProperties,
  };

  return (
    <div
      ref={containerRef}
      data-chart={chartId}
      className={`relative flex flex-col text-xs ${className ?? ""}`}
    >
      <style dangerouslySetInnerHTML={{ __html: css }} />

      {legend && !isLoading && legend.verticalAlign === "top" && <LegendOverlay {...legendProps} />}

      <div className="relative min-h-0 w-full flex-1">
        <div ref={mountRef} className="h-full min-h-0 w-full" />
      </div>

      {legend && !isLoading && legend.verticalAlign === "bottom" && (
        <LegendOverlay {...legendProps} />
      )}

      {isLoading && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="text-primary bg-background flex items-center justify-center gap-2 rounded-md border px-2 py-0.5 text-sm"
          >
            <div className="border-border border-t-primary h-3 w-3 animate-spin rounded-full border" />
            <span>Loading</span>
          </motion.div>
        </div>
      )}
    </div>
  );
}

EChartsZoneChart.Track = Track;
EChartsZoneChart.Marker = Marker;
EChartsZoneChart.Tolerance = Tolerance;
EChartsZoneChart.ZoneLabel = ZoneLabel;
EChartsZoneChart.RowLabel = RowLabel;
EChartsZoneChart.ValueLabel = ValueLabel;
EChartsZoneChart.Alert = Alert;
EChartsZoneChart.Legend = Legend;
EChartsZoneChart.Tooltip = Tooltip;
