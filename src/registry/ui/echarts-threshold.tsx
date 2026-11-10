"use client";

import { type LineSeriesOption } from "echarts/charts";
import { MarkAreaComponent, MarkLineComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { withAlpha, type ResolvedColors } from "@/registry/ui/echarts-chart";
import { type FC } from "react";

// Importing this module registers what <Threshold> paints with. Modular ECharts
// does not complain about an unregistered component — it simply draws nothing —
// so the registration lives beside the code that needs it rather than in each
// chart's own `echarts.use([...])`, where it is easy to forget.
echarts.use([MarkAreaComponent, MarkLineComponent]);

// The band stays faint on purpose: the LINE is what delimits, and the series has
// to stay readable through the region. Same numbers as the zone chart's tolerance
// band and as the Recharts twin — one evaluative vocabulary across the registry.
export const THRESHOLD_BAND_OPACITY = 0.1; // the region past the threshold
export const THRESHOLD_LINE_OPACITY = 0.8; // the threshold itself
export const THRESHOLD_LINE_WIDTH = 1.25;
export const THRESHOLD_BREACH_WIDTH = 2.6; // the runs that crossed, thickened
export const THRESHOLD_BREACH_SYMBOL = 7; // breach point diameter — the second channel
export const THRESHOLD_BREACH_RING = 1.6; // background ring lifting a breach point off the line
export const THRESHOLD_HEADROOM = 0.04; // slack past the threshold, as a fraction of the data span
// A markArea corner is CLIPPED to the axis extent and does not stretch it, so an
// out-of-range sentinel lands exactly on the plot edge. `"max"` would stop at the
// series' own maximum instead and leave a gap above the band.
const THRESHOLD_EXTENT = 1e12;
export const BREACH_PREFIX = "__breach-";

export type ThresholdSide = "above" | "below";

export interface ThresholdProps {
  value: number; // the threshold, in y-axis units
  dataKey?: string; // config key whose color paints the band, the line and the breaches
  side?: ThresholdSide; // which side of the threshold is the breach (default "above")
  label?: string; // text set on the threshold line
  highlightBreaches?: boolean; // repaints the runs that crossed (default true)
}

/**
 * Presence draws the threshold: a faint band over the region past `value`, the
 * threshold line itself, and — unless `highlightBreaches` is false — the series
 * runs that crossed it. `dataKey` names the config entry supplying the color, so
 * nothing here is hard-coded; without one the threshold paints in the foreground.
 *
 * The sibling of the zone chart's <Tolerance>: that part declares a two-sided
 * interval, this one a single bound plus a direction. Renders nothing.
 *
 * Shared across every ECharts chart that accepts a threshold, so the SAME
 * component reference identifies the part everywhere. A per-chart copy would
 * make `<EChartsLineChart.Threshold>` inside an area chart draw nothing at all,
 * silently, since the roots match their children by reference.
 */
export const Threshold: FC<ThresholdProps> = () => null;

export type ThresholdSlot = {
  present: boolean;
  value: number;
  dataKey: string | null;
  side: ThresholdSide;
  label?: string;
  highlightBreaches: boolean;
};

export const NO_THRESHOLD: ThresholdSlot = {
  present: false,
  value: 0,
  dataKey: null,
  side: "above",
  highlightBreaches: true,
};

/** Collects a composed <Threshold>'s props into the slot the builders read. */
export function thresholdSlotFrom(props: ThresholdProps): ThresholdSlot {
  return {
    present: true,
    value: props.value,
    dataKey: props.dataKey ?? null,
    side: props.side ?? "above",
    label: props.label,
    highlightBreaches: props.highlightBreaches ?? true,
  };
}

/** The threshold's paint, from the config via `dataKey` — never a hard-coded hue. */
export function thresholdColor(slot: ThresholdSlot, resolved: ResolvedColors): string {
  const slots = slot.dataKey ? resolved.series[slot.dataKey] : undefined;
  return slots && slots.length > 0 ? slots[slots.length - 1] : resolved.tokens.foreground;
}

/**
 * The y-axis bounds a composed threshold imposes. A threshold the axis never
 * reaches paints NOTHING — ECharts clips markArea to the axis extent — so it
 * joins the scale, with a little slack so the line never sits flush against the
 * plot edge. Both are `undefined` when no threshold is composed, which leaves
 * the axis exactly as it was.
 */
export function thresholdAxisBounds(slot: ThresholdSlot): {
  min?: (extent: { min: number; max: number }) => number;
  max?: (extent: { min: number; max: number }) => number;
} {
  if (!slot.present) return {};
  const slack = (extent: { min: number; max: number }) =>
    (extent.max - extent.min) * THRESHOLD_HEADROOM;

  return slot.side === "above"
    ? { max: (extent) => Math.max(extent.max, slot.value + slack(extent)) }
    : { min: (extent) => Math.min(extent.min, slot.value - slack(extent)) };
}

/**
 * The band + the line, as marks for ONE series — they annotate the axis, so a
 * chart attaches them to a single series rather than to each one, which would
 * stack the band on itself.
 */
export function buildThresholdMarks(
  slot: ThresholdSlot,
  resolved: ResolvedColors,
): Pick<LineSeriesOption, "markArea" | "markLine"> {
  if (!slot.present) return {};

  const color = thresholdColor(slot, resolved);
  const above = slot.side === "above";
  const edge = { yAxis: above ? THRESHOLD_EXTENT : -THRESHOLD_EXTENT };
  const bound = { yAxis: slot.value };

  return {
    markArea: {
      silent: true,
      itemStyle: { color: withAlpha(color, THRESHOLD_BAND_OPACITY) },
      data: [above ? [bound, edge] : [edge, bound]],
    },
    markLine: {
      silent: true,
      symbol: "none",
      label: slot.label
        ? {
            show: true,
            formatter: slot.label,
            position: above ? "insideStartTop" : "insideStartBottom",
            color,
            fontSize: 10,
          }
        : { show: false },
      lineStyle: {
        color: withAlpha(color, THRESHOLD_LINE_OPACITY),
        width: THRESHOLD_LINE_WIDTH,
        type: "solid",
      },
      emphasis: { disabled: true },
      data: [{ yAxis: slot.value }],
    },
  };
}

/** One composed series, as the breach overlay needs to see it. */
export type ThresholdSeries = {
  key: string;
  curve: { smooth: boolean; step: "middle" | false };
  z: number; // the main series' z — the overlay rides just above it
};

/**
 * The breach overlay: each series again, with every in-budget point nulled, so
 * only the crossing runs paint. A run keeps its immediate neighbours so it joins
 * the line it left, while only the points actually past the threshold carry a
 * symbol.
 *
 * Those symbols are not decoration. The breach color and the series color are
 * one config apart, and a theme can easily pick two that a red-green-blind
 * reader cannot separate — this repo's own dark `--chart-2` and `--destructive`
 * sit at an identical lightness. So a breach carries a second channel, shape,
 * and never leans on color alone.
 *
 * `allowBreaches` is the CHART's call, not this module's: on a stacked chart a
 * series' own value is not its plotted height, so a per-series breach would
 * point at the wrong place. The band and the line still read there.
 */
export function buildBreachSeries({
  slot,
  resolved,
  series,
  valuesFor,
  allowBreaches = true,
}: {
  slot: ThresholdSlot;
  resolved: ResolvedColors;
  series: ThresholdSeries[];
  valuesFor: (key: string) => (number | null)[];
  allowBreaches?: boolean;
}): LineSeriesOption[] {
  if (!slot.present || !slot.highlightBreaches || !allowBreaches) return [];

  const color = thresholdColor(slot, resolved);
  const { value, side } = slot;

  return series.flatMap(({ key, curve, z }): LineSeriesOption[] => {
    const values = valuesFor(key);
    const crossed = values.map((v) => v !== null && (side === "above" ? v > value : v < value));
    if (!crossed.some(Boolean)) return [];

    const points = values.map((v, i) => {
      if (v === null || !(crossed[i] || crossed[i - 1] || crossed[i + 1])) return null;
      return { value: v, symbolSize: crossed[i] ? THRESHOLD_BREACH_SYMBOL : 0 };
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
        lineStyle: { color, width: THRESHOLD_BREACH_WIDTH, cap: "round", join: "round" },
        itemStyle: {
          color,
          borderColor: resolved.tokens.background,
          borderWidth: THRESHOLD_BREACH_RING,
        },
        emphasis: { disabled: true },
        blur: { lineStyle: { opacity: 0.1 } },
        tooltip: { show: false },
      },
    ];
  });
}
