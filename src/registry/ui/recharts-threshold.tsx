"use client";

import { getColorsCount, type ChartConfig } from "@/registry/ui/recharts-chart";
import { type FC, type Key, type ReactElement, useMemo } from "react";
import { ReferenceArea, ReferenceLine } from "recharts";

// The band stays faint on purpose: the LINE is what delimits, and the series has
// to stay readable through the region. Same numbers as the zone chart's tolerance
// band and as the ECharts twin — one evaluative vocabulary across the registry.
export const THRESHOLD_BAND_OPACITY = 0.1; // the region past the threshold
export const THRESHOLD_LINE_OPACITY = 0.8; // the threshold itself
export const THRESHOLD_LINE_WIDTH = 1.25;
export const THRESHOLD_BREACH_WIDTH = 2.6; // the runs that crossed, thickened
export const THRESHOLD_BREACH_SYMBOL = 7; // breach point diameter — the second channel
export const THRESHOLD_BREACH_RING = 1.6; // background ring lifting a breach point off the line
export const THRESHOLD_HEADROOM = 0.04; // slack past the threshold, as a fraction of the data span

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
 * interval, this one a single bound plus a direction.
 *
 * Config-only, unlike the other Recharts parts: a root reads these props and
 * injects the primitives itself, so no part ever returns several elements —
 * Recharts identifies its children by type and does not reliably look inside a
 * fragment. Shared across every chart that accepts a threshold, so the SAME
 * reference identifies the part everywhere; a per-chart copy would make one
 * chart's <Threshold> silently inert inside another's.
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

/** Collects a composed <Threshold>'s props into the slot the hook reads. */
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

/**
 * The props of one breach overlay. The CHART spreads these onto its own series
 * primitive — <Area> in an area chart, <Line> in a line chart — so this module
 * never has to assume which graphical children a given Recharts chart accepts.
 */
export type ThresholdOverlayProps = {
  key: string;
  dataKey: (row: unknown) => number | null;
  stroke: string;
  strokeWidth: number;
  strokeLinecap: "round";
  fill: "none";
  connectNulls: false;
  isAnimationActive: false;
  activeDot: false;
  legendType: "none";
  tooltipType: "none";
  dot: (dotProps: {
    cx?: number;
    cy?: number;
    payload?: unknown;
    key?: Key | null;
  }) => ReactElement;
};

export type ThresholdParts = {
  band: ReactElement | null;
  line: ReactElement | null;
  overlays: ThresholdOverlayProps[];
};

const EMPTY: ThresholdParts = { band: null, line: null, overlays: [] };

/**
 * Builds everything a composed <Threshold> paints.
 *
 * `allowBreaches` is the CHART's call, not this hook's: on a stacked chart a
 * series' own value is not its plotted height, so a per-series breach would
 * point at the wrong place. The band and the line still read there.
 */
export function useThresholdParts({
  slot,
  config,
  data,
  seriesKeys,
  isLoading,
  allowBreaches = true,
}: {
  slot: ThresholdSlot;
  config: ChartConfig;
  data: Record<string, unknown>[];
  seriesKeys: string[];
  isLoading: boolean;
  allowBreaches?: boolean;
}): ThresholdParts {
  return useMemo(() => {
    if (!slot.present || isLoading) return EMPTY;

    const count = slot.dataKey && config[slot.dataKey] ? getColorsCount(config[slot.dataKey]) : 1;
    const color = slot.dataKey
      ? `var(--color-${slot.dataKey}-${count - 1}, var(--color-${slot.dataKey}-0))`
      : "var(--color-foreground)";
    const above = slot.side === "above";

    // A ReferenceArea given only ONE bound extends toward the axis MINIMUM, so
    // `side="above"` would draw the band UNDER the threshold. Both bounds are
    // explicit, and `extendDomain` makes the axis end exactly on the far one —
    // which is what lets the band reach the plot edge without overshooting the
    // scale, and what keeps a threshold outside the data range visible at all.
    const plotted = seriesKeys.flatMap((key) =>
      data.map((row) => Number(row[key])).filter((v) => Number.isFinite(v)),
    );
    const dataMin = plotted.length ? Math.min(...plotted) : slot.value;
    const dataMax = plotted.length ? Math.max(...plotted) : slot.value;
    const slack = Math.max(dataMax - dataMin, Math.abs(slot.value) || 1) * THRESHOLD_HEADROOM;
    const far = above
      ? Math.max(dataMax, slot.value) + slack
      : Math.min(dataMin, slot.value) - slack;

    const band = (
      <ReferenceArea
        key="__threshold-band"
        y1={above ? slot.value : far}
        y2={above ? far : slot.value}
        ifOverflow="extendDomain"
        fill={color}
        fillOpacity={THRESHOLD_BAND_OPACITY}
        stroke="none"
      />
    );

    const line = (
      <ReferenceLine
        key="__threshold-line"
        y={slot.value}
        ifOverflow="extendDomain"
        stroke={color}
        strokeOpacity={THRESHOLD_LINE_OPACITY}
        strokeWidth={THRESHOLD_LINE_WIDTH}
        label={
          slot.label
            ? {
                value: slot.label,
                position: above ? "insideTopLeft" : "insideBottomLeft",
                fill: color,
                fontSize: 10,
              }
            : undefined
        }
      />
    );

    if (!slot.highlightBreaches || !allowBreaches) return { band, line, overlays: [] };

    const overlays = seriesKeys.flatMap((key): ThresholdOverlayProps[] => {
      const values = data.map((row) => (row[key] == null ? null : Number(row[key]) || 0));
      const crossed = values.map(
        (v) => v !== null && (above ? v > slot.value : v < slot.value),
      );
      if (!crossed.some(Boolean)) return [];

      // Keyed by ROW IDENTITY: Recharts hands both the dataKey function and the
      // dot renderer the row object, which is how the mask stays index-aware —
      // each run keeps its immediate neighbours so it joins the line it left,
      // while only the points actually past the threshold carry a symbol.
      //
      // Those symbols are not decoration. The breach color and the series color
      // are one config apart, and a theme can easily pick two that a red-green
      // -blind reader cannot separate — this repo's own dark `--chart-2` and
      // `--destructive` sit at an identical lightness.
      const masked = new Map<unknown, number | null>();
      const breaching = new Map<unknown, boolean>();
      data.forEach((row, i) => {
        masked.set(row, crossed[i] || crossed[i - 1] || crossed[i + 1] ? values[i] : null);
        breaching.set(row, crossed[i]);
      });

      return [
        {
          key: `__breach-${key}`,
          dataKey: (row: unknown) => masked.get(row) ?? null,
          stroke: color,
          strokeWidth: THRESHOLD_BREACH_WIDTH,
          strokeLinecap: "round",
          fill: "none",
          connectNulls: false,
          isAnimationActive: false,
          activeDot: false,
          legendType: "none",
          tooltipType: "none",
          dot: ({ cx, cy, payload, key: dotKey }) => {
            if (cx == null || cy == null || !breaching.get(payload)) return <g key={dotKey} />;
            return (
              <circle
                key={dotKey}
                cx={cx}
                cy={cy}
                r={THRESHOLD_BREACH_SYMBOL / 2}
                fill={color}
                stroke="var(--color-background)"
                strokeWidth={THRESHOLD_BREACH_RING}
              />
            );
          },
        },
      ];
    });

    return { band, line, overlays };
  }, [slot, config, data, seriesKeys, isLoading, allowBreaches]);
}
