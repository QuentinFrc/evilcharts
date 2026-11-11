"use client";

import { withAlpha, type ResolvedColors } from "@/registry/ui/echarts-chart";
import { MarkAreaComponent, MarkLineComponent } from "echarts/components";
import { type LineSeriesOption } from "echarts/charts";
import * as echarts from "echarts/core";
import { type FC } from "react";

// Importing this module registers what <Tolerance> paints with. Modular ECharts
// does not complain about an unregistered component — it simply draws nothing —
// so the registration lives beside the code that needs it rather than in each
// chart's own `echarts.use([...])`, where it is easy to forget.
echarts.use([MarkAreaComponent, MarkLineComponent]);

// The band stays faint on purpose: the BOUNDS are what delimit, and the series
// has to stay readable through the region. Same numbers as the Recharts twin —
// one evaluative vocabulary across the registry.
export const TOLERANCE_BAND_OPACITY = 0.1; // the accepted region itself
export const TOLERANCE_LINE_OPACITY = 0.8; // its bounds
export const TOLERANCE_LINE_WIDTH = 1.25;
export const TOLERANCE_TARGET_OPACITY = 0.55; // the aim line, quieter than the bounds
export const TOLERANCE_BREACH_WIDTH = 2.6; // the runs that left, thickened
export const TOLERANCE_BREACH_SYMBOL = 7; // breach point diameter — the second channel
export const TOLERANCE_BREACH_RING = 1.6; // background ring lifting a breach point off the line
export const TOLERANCE_HEADROOM = 0.04; // slack past a bound, as a fraction of the data span
export const TOLERANCE_MAX_SHARE = 0.6; // the most of the axis a two-sided band may take up
// A markArea corner is CLIPPED to the axis extent and does not stretch it, so an
// out-of-range sentinel lands exactly on the plot edge. `"max"` would stop at the
// series' own maximum instead and leave a gap above the band. It stands in for an
// infinite bound at PAINT time only — the model itself keeps the infinity.
const TOLERANCE_EXTENT = 1e12;
export const BREACH_PREFIX = "__out-";

export interface ToleranceProps {
  min?: number; // lower bound of what is accepted, in y-axis units; omitted means unbounded below
  max?: number; // upper bound; omitted means unbounded above
  target?: number; // optional aim line — the value aimed at, not necessarily the middle
  dataKey?: string; // config key whose color paints the band and its bounds
  breachKey?: string; // config key whose color paints the runs outside it
  label?: string; // text set on the outer bound
  highlightBreaches?: boolean; // repaints the runs that left (default true)
}

/**
 * Presence draws what the series is expected to hold to: a faint band over the
 * accepted region, its bounds, an optional `target` line, and — unless
 * `highlightBreaches` is false — the runs that left it.
 *
 * ONE part covers a ceiling, a floor and a corridor, because they are one shape
 * with a bound at infinity: `max` alone accepts everything below it, `min` alone
 * everything above it, both together the interval between. There is no `side`
 * to pass — which bound you give IS the side — and no variant to pick, so the
 * part never has to decide whether a region is good or bad. You declare what is
 * accepted; the band paints it; the overlay marks what leaves it. What that
 * means is yours, and lives in the config keys you hand it.
 *
 * Shared across every ECharts chart that accepts one, so the SAME component
 * reference identifies the part everywhere. A per-chart copy would make
 * `<EChartsLineChart.Tolerance>` inside an area chart draw nothing at all,
 * silently, since the roots match their children by reference.
 */
export const Tolerance: FC<ToleranceProps> = () => null;

export type ToleranceSlot = {
  present: boolean;
  min: number; // -Infinity when unbounded below
  max: number; // +Infinity when unbounded above
  target: number | null;
  dataKey: string | null;
  breachKey: string | null;
  label?: string;
  highlightBreaches: boolean;
};

export const NO_TOLERANCE: ToleranceSlot = {
  present: false,
  min: Number.NEGATIVE_INFINITY,
  max: Number.POSITIVE_INFINITY,
  target: null,
  dataKey: null,
  breachKey: null,
  highlightBreaches: true,
};

/** Collects a composed <Tolerance>'s props into the slot the builders read. */
export function toleranceSlotFrom(props: ToleranceProps): ToleranceSlot {
  const low = props.min ?? Number.NEGATIVE_INFINITY;
  const high = props.max ?? Number.POSITIVE_INFINITY;

  if (!Number.isFinite(low) && !Number.isFinite(high)) {
    warnUnboundedTolerance();
    return NO_TOLERANCE;
  }

  return {
    present: true,
    // Given inverted, they still describe one interval — read it, do not drop it.
    min: Math.min(low, high),
    max: Math.max(low, high),
    target: props.target ?? null,
    dataKey: props.dataKey ?? null,
    breachKey: props.breachKey ?? null,
    label: props.label,
    highlightBreaches: props.highlightBreaches ?? true,
  };
}

/**
 * Several composed <Tolerance> children collapse to the FIRST, identically on
 * both providers — a chart that silently kept a different one per renderer is
 * the worst kind of divergence, since nothing in the output says which.
 *
 * It warns rather than drawing the rest because several bands is not one norm:
 * the runs outside each would repaint the series one on top of the other, and
 * the colors would come from unrelated config keys instead of a severity ramp.
 * An ordered ladder of levels is a different part.
 */
let warnedExtraTolerances = false;
export function warnExtraTolerances(count: number): void {
  if (count < 2 || warnedExtraTolerances) return;
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "production") return;
  warnedExtraTolerances = true;
  console.warn(
    `[evilcharts] ${count} <Tolerance> children composed on one chart; only the first is drawn. ` +
      "A chart is read against a single norm.",
  );
}

/** A <Tolerance> with neither bound accepts everything, so it draws nothing. */
let warnedUnbounded = false;
function warnUnboundedTolerance(): void {
  if (warnedUnbounded) return;
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "production") return;
  warnedUnbounded = true;
  console.warn(
    "[evilcharts] <Tolerance> composed without `min` or `max`; nothing is drawn. " +
      "Give at least one bound.",
  );
}

/** The band's paint, from the config via `dataKey` — never a hard-coded hue. */
export function toleranceColor(slot: ToleranceSlot, resolved: ResolvedColors): string {
  const slots = slot.dataKey ? resolved.series[slot.dataKey] : undefined;
  return slots && slots.length > 0 ? slots[slots.length - 1] : resolved.tokens.mutedForeground;
}

/**
 * The paint of the runs outside it. It defaults to the FOREGROUND against the
 * band's muted default, because the two carry opposite meanings: a band that
 * reads as loudly as the departures from it reads as nothing at all. It never
 * falls back to `dataKey` for the same reason.
 */
export function toleranceBreachColor(slot: ToleranceSlot, resolved: ResolvedColors): string {
  const slots = slot.breachKey ? resolved.series[slot.breachKey] : undefined;
  return slots && slots.length > 0 ? slots[slots.length - 1] : resolved.tokens.foreground;
}

/**
 * The y-axis bounds a composed tolerance imposes. A bound the axis never reaches
 * paints NOTHING — ECharts clips markArea to the axis extent — so every FINITE
 * bound joins the scale. An infinite one imposes nothing, which is what leaves a
 * ceiling chart's lower half exactly as the data drew it.
 *
 * Both are `undefined` when nothing is composed.
 */
export function toleranceAxisBounds(slot: ToleranceSlot): {
  min?: (extent: { min: number; max: number }) => number;
  max?: (extent: { min: number; max: number }) => number;
} {
  if (!slot.present) return {};

  return {
    ...(Number.isFinite(slot.min)
      ? {
          min: (extent: { min: number; max: number }) => {
            const { low, pad } = toleranceExtent(slot, extent);
            return low - pad;
          },
        }
      : {}),
    ...(Number.isFinite(slot.max)
      ? {
          max: (extent: { min: number; max: number }) => {
            const { high, pad } = toleranceExtent(slot, extent);
            return high + pad;
          },
        }
      : {}),
  };
}

/**
 * The axis the band needs: wide enough to contain both the data and every finite
 * bound, then padded until a two-sided band takes up no more than its share.
 *
 * The share is the point. A series that holds its range would otherwise set an
 * extent equal to the band, and a band that fills the plot reads as the plot,
 * not as a band. When the data already reaches well past the bounds the
 * shortfall is negative and nothing is added beyond the usual headroom, so a
 * chart whose series roams keeps its own scale. A one-sided band has no width to
 * take a share OF, so it only ever gets that headroom — the same slack the plot
 * edge always owed its outermost line.
 */
function toleranceExtent(
  slot: ToleranceSlot,
  extent: { min: number; max: number },
): { low: number; high: number; pad: number } {
  const low = Math.min(extent.min, Number.isFinite(slot.min) ? slot.min : extent.min);
  const high = Math.max(extent.max, Number.isFinite(slot.max) ? slot.max : extent.max);
  const span = high - low;
  // A flat series, or a lone bound sitting on it, still owes the plot edge slack.
  const headroom = (span || Math.abs(high) || 1) * TOLERANCE_HEADROOM;
  const twoSided = Number.isFinite(slot.min) && Number.isFinite(slot.max);
  const shortfall = twoSided ? (slot.max - slot.min) / TOLERANCE_MAX_SHARE - span : 0;

  return { low, high, pad: Math.max(shortfall / 2, headroom) };
}

/** An infinite bound, as the painter has to spell it. */
function paintBound(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * The band + its bounds + the target, as marks for ONE series — they annotate
 * the axis, so a chart attaches them to a single series rather than to each one,
 * which would stack the band on itself.
 *
 * The band carries NO border: where it is bounded its own fill edge already
 * delimits it, and a border would additionally stroke the plot's left and right
 * edges — and, on an open side, trace the frame itself. The bound lines are what
 * make those edges crisp at a tenth of an opacity, and what carry the label.
 * Only FINITE bounds get one: there is no line to draw at infinity.
 */
export function buildToleranceMarks(
  slot: ToleranceSlot,
  resolved: ResolvedColors,
): Pick<LineSeriesOption, "markArea" | "markLine"> {
  if (!slot.present) return {};

  const color = toleranceColor(slot, resolved);
  const boundStyle = {
    color: withAlpha(color, TOLERANCE_LINE_OPACITY),
    width: TOLERANCE_LINE_WIDTH,
    type: "solid" as const,
  };
  // The label rides the outer bound — the upper one when there is one, since
  // that is where a reader looks first, and the lower one on a floor.
  const labelled = Number.isFinite(slot.max) ? slot.max : slot.min;
  const labelFor = (bound: number) =>
    slot.label && bound === labelled
      ? {
          show: true,
          formatter: slot.label,
          position: (bound === slot.max ? "insideStartTop" : "insideStartBottom") as
            | "insideStartTop"
            | "insideStartBottom",
          color,
          fontSize: 10,
        }
      : { show: false as const };

  const bounds = [slot.min, slot.max].filter((bound) => Number.isFinite(bound));

  return {
    markArea: {
      silent: true,
      itemStyle: { color: withAlpha(color, TOLERANCE_BAND_OPACITY) },
      data: [
        [
          { yAxis: paintBound(slot.min, -TOLERANCE_EXTENT) },
          { yAxis: paintBound(slot.max, TOLERANCE_EXTENT) },
        ],
      ],
    },
    markLine: {
      silent: true,
      symbol: "none",
      label: { show: false },
      emphasis: { disabled: true },
      data: [
        ...bounds.map((bound) => ({
          yAxis: bound,
          lineStyle: boundStyle,
          label: labelFor(bound),
        })),
        ...(slot.target !== null
          ? [
              {
                yAxis: slot.target,
                lineStyle: {
                  color: withAlpha(color, TOLERANCE_TARGET_OPACITY),
                  width: 1,
                  type: "dashed" as const,
                },
              },
            ]
          : []),
      ],
    },
  };
}

/** One composed series, as the breach overlay needs to see it. */
export type ToleranceSeries = {
  key: string;
  curve: { smooth: boolean; step: "middle" | false };
  z: number; // the main series' z — the overlay rides just above it
};

/**
 * The breach overlay: each series again, with every in-band point nulled, so
 * only the runs that left paint. A run keeps its immediate neighbours so it
 * joins the line it left, while only the points actually outside carry a symbol.
 * The comparison needs no special case for an open side — nothing is ever below
 * -Infinity.
 *
 * Those symbols are not decoration. The band color and the breach color are one
 * config apart, and a theme can easily pick two that a red-green-blind reader
 * cannot separate — this repo's own dark `--chart-2` and `--destructive` sit at
 * an identical lightness. So a breach carries a second channel, shape, and never
 * leans on color alone.
 *
 * `allowBreaches` is the CHART's call, not this module's: on a stacked chart a
 * series' own value is not its plotted height, so a per-series breach would
 * point at the wrong place. The band and its bounds still read there.
 */
export function buildToleranceBreachSeries({
  slot,
  resolved,
  series,
  valuesFor,
  allowBreaches = true,
}: {
  slot: ToleranceSlot;
  resolved: ResolvedColors;
  series: ToleranceSeries[];
  valuesFor: (key: string) => (number | null)[];
  allowBreaches?: boolean;
}): LineSeriesOption[] {
  if (!slot.present || !slot.highlightBreaches || !allowBreaches) return [];

  const color = toleranceBreachColor(slot, resolved);
  const { min, max } = slot;

  return series.flatMap(({ key, curve, z }): LineSeriesOption[] => {
    const values = valuesFor(key);
    const left = values.map((v) => v !== null && (v < min || v > max));
    if (!left.some(Boolean)) return [];

    const points = values.map((v, i) => {
      if (v === null || !(left[i] || left[i - 1] || left[i + 1])) return null;
      return { value: v, symbolSize: left[i] ? TOLERANCE_BREACH_SYMBOL : 0 };
    });

    return [
      {
        id: `${BREACH_PREFIX}${key}`,
        type: "line",
        data: points,
        smooth: curve.smooth,
        step: curve.step,
        connectNulls: false,
        silent: true,
        showSymbol: true,
        symbol: "circle",
        z: z + 1,
        lineStyle: { color, width: TOLERANCE_BREACH_WIDTH, cap: "round", join: "round" },
        itemStyle: {
          color,
          borderColor: resolved.tokens.background,
          borderWidth: TOLERANCE_BREACH_RING,
        },
        emphasis: { disabled: true },
        blur: { lineStyle: { opacity: 0.1 } },
        tooltip: { show: false },
      },
    ];
  });
}
