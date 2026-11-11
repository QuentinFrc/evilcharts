"use client";

import { type ComponentProps, type FC, type Key, type ReactElement, useMemo } from "react";
import { type Area as RechartsArea, ReferenceArea, ReferenceLine } from "recharts";
import { getColorsCount, type ChartConfig } from "@/registry/ui/recharts-chart";

/**
 * The interpolation an overlay has to follow. Taken off Recharts' own prop
 * rather than copied as a second union, so it cannot drift from it.
 */
export type ToleranceCurve = ComponentProps<typeof RechartsArea>["type"];

// The band stays faint on purpose: the BOUNDS are what delimit, and the series
// has to stay readable through the region. Same numbers as the ECharts twin —
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
// How far past the data an open side reaches, as a multiple of the span, before
// `hidden` clips it to the plot. It stands in for an infinite bound at PAINT
// time only — the model itself keeps the infinity. A flat 1e12 does NOT work
// here: Recharts maps the corner through the scale before clipping, and such a
// number comes back as a rect several hundred billion pixels tall that the
// browser then declines to paint. A multiple of the span is always far enough
// to clear the chart's own domain and always small enough to survive the scale.
const TOLERANCE_OPEN_REACH = 1000;

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
 * Config-only: a root reads these props and injects the primitives itself, so
 * no part ever returns several elements — Recharts identifies its children by
 * type and does not reliably look inside a fragment.
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

/** Collects a composed <Tolerance>'s props into the slot the hook reads. */
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

/** The `--color-*` expression a config key resolves to, last ramp slot first. */
function colorVar(key: string | null, config: ChartConfig, fallback: string): string {
  if (!key || !config[key]) return fallback;
  const count = getColorsCount(config[key]);
  return `var(--color-${key}-${count - 1}, var(--color-${key}-0))`;
}

/**
 * The axis the band needs: wide enough to contain both the data and every
 * finite bound, then padded until a two-sided band takes up no more than its
 * share.
 *
 * The share is the point. A series that holds its range would otherwise set an
 * extent equal to the band, and a band that fills the plot reads as the plot,
 * not as a band. When the data already reaches well past the bounds the
 * shortfall is negative and nothing is added beyond the usual headroom, so a
 * chart whose series roams keeps its own scale. A one-sided band has no width
 * to take a share OF, so it only ever gets that headroom — the same slack the
 * plot edge always owed its outermost line.
 */
function toleranceExtent(
  slot: ToleranceSlot,
  plotted: number[],
): { low: number; high: number; pad: number } {
  // At least one bound is finite — `toleranceSlotFrom` refuses the other case —
  // so this is never empty even on a chart with no data at all.
  const anchors = [...plotted, slot.min, slot.max].filter((v) => Number.isFinite(v));
  const low = Math.min(...anchors);
  const high = Math.max(...anchors);
  const span = high - low;
  const twoSided = Number.isFinite(slot.min) && Number.isFinite(slot.max);
  const shortfall = twoSided ? (slot.max - slot.min) / TOLERANCE_MAX_SHARE - span : 0;
  // A flat series, or a lone bound sitting on it, still owes the plot edge slack.
  const headroom = (span || Math.abs(high) || 1) * TOLERANCE_HEADROOM;
  return { low, high, pad: Math.max(shortfall / 2, headroom) };
}
/**
 * The nearest readable number outward from a computed axis edge.
 *
 * A bound the part imposes is printed on the axis verbatim, and `low - pad` is
 * an arithmetic result, not a number anyone wrote: a floor of 99.5 under data
 * topping out at 99.99 used to label the axis `99.14760000000001`. Snapping to
 * a round step of the span's own magnitude keeps every guarantee — the edge
 * only ever moves further out — while giving the renderer something it can
 * divide into legible ticks.
 */
function toleranceNice(value: number, span: number, direction: -1 | 1): number {
  if (!Number.isFinite(value) || !(span > 0)) return value;
  const target = span / 5; // aim for roughly five intervals, as both renderers do
  const magnitude = Math.pow(10, Math.floor(Math.log10(target)));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * magnitude >= target) ?? 10) * magnitude;
  const snapped = direction < 0 ? Math.floor(value / step) * step : Math.ceil(value / step) * step;
  // Binary floats make 87.60000000000001 out of 87.6; the step's own precision
  // is the most the result can legitimately carry.
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  return Number(snapped.toFixed(decimals));
}

export type ToleranceOverlayProps = {
  key: Key;
  // The shadowed series' own interpolation. The root falls back to the chart
  // default when a series did not declare one.
  type: ToleranceCurve | undefined;
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

export type ToleranceParts = {
  band: ReactElement | null;
  lines: ReactElement[];
  overlays: ToleranceOverlayProps[];
};

const EMPTY: ToleranceParts = { band: null, lines: [], overlays: [] };

/**
 * The band, its bounds, the optional target, and the overlays for the runs that
 * left it. The root injects them around its own children: the band under the
 * series, the lines and overlays over it.
 */
export function useToleranceParts({
  slot,
  config,
  data,
  seriesKeys,
  seriesCurves,
  isLoading,
  allowBreaches = true,
}: {
  slot: ToleranceSlot;
  config: ChartConfig;
  data: Record<string, unknown>[];
  seriesKeys: string[];
  // Per-series interpolation, keyed by dataKey. A series missing from it
  // took the chart default, which the root supplies.
  seriesCurves?: Record<string, ToleranceCurve>;
  isLoading: boolean;
  allowBreaches?: boolean;
}): ToleranceParts {
  return useMemo(() => {
    if (!slot.present || isLoading) return EMPTY;

    const color = colorVar(slot.dataKey, config, "var(--color-muted-foreground)");
    const breachColor = colorVar(slot.breachKey, config, "var(--color-foreground)");

    const plotted = seriesKeys.flatMap((key) =>
      data.map((row) => Number(row[key])).filter((v) => Number.isFinite(v)),
    );
    const { low, high, pad } = toleranceExtent(slot, plotted);
    const breadth = high - low + pad * 2;
    const floor = toleranceNice(low - pad, breadth, -1);
    const ceiling = toleranceNice(high + pad, breadth, 1);
    const reach = Math.max(high - low, Math.abs(high) || 1) * TOLERANCE_OPEN_REACH;

    // Unpainted, and the reason an open side works at all: it fixes the axis
    // where the band is allowed to end. A ReferenceArea cannot take an infinite
    // corner — `extendDomain` would chase it — so an open side paints to the
    // plot edge instead, and this is what puts that edge at a known value.
    const breathing = (
      <ReferenceArea
        key="__tolerance-breathing"
        y1={floor}
        y2={ceiling}
        ifOverflow="extendDomain"
        fill="none"
        stroke="none"
      />
    );

    // An open side paints to the plot EDGE, and `hidden` is what puts it there:
    // the corner goes far out of range and Recharts clips it, the way ECharts
    // clips a markArea. `extendDomain` would chase the sentinel instead, and
    // stopping at `floor`/`ceiling` would leave the band short wherever the
    // chart's own domain reaches further — a 0-based area chart being the usual
    // case. `breathing` above has already brought every finite bound in range.
    const band = (
      <ReferenceArea
        key="__tolerance-band"
        y1={Number.isFinite(slot.min) ? slot.min : low - reach}
        y2={Number.isFinite(slot.max) ? slot.max : high + reach}
        ifOverflow="hidden"
        fill={color}
        fillOpacity={TOLERANCE_BAND_OPACITY}
        stroke="none"
      />
    );

    // There is no line to draw at infinity, and the label rides the outer bound
    // — the upper one when there is one, since that is where a reader looks
    // first, and the lower one on a floor.
    const labelled = Number.isFinite(slot.max) ? slot.max : slot.min;
    const bound = (y: number, which: "min" | "max") => (
      <ReferenceLine
        key={`__tolerance-${which}`}
        y={y}
        ifOverflow="extendDomain"
        stroke={color}
        strokeOpacity={TOLERANCE_LINE_OPACITY}
        strokeWidth={TOLERANCE_LINE_WIDTH}
        label={
          slot.label && y === labelled
            ? {
                value: slot.label,
                position: which === "max" ? "insideTopLeft" : "insideBottomLeft",
                fill: color,
                fontSize: 10,
              }
            : undefined
        }
      />
    );

    const lines: ReactElement[] = [breathing];
    if (Number.isFinite(slot.min)) lines.push(bound(slot.min, "min"));
    if (Number.isFinite(slot.max)) lines.push(bound(slot.max, "max"));
    if (slot.target !== null) {
      lines.push(
        <ReferenceLine
          key="__tolerance-target"
          y={slot.target}
          ifOverflow="extendDomain"
          stroke={color}
          strokeOpacity={TOLERANCE_TARGET_OPACITY}
          strokeWidth={1}
          strokeDasharray="4 4"
        />,
      );
    }

    if (!slot.highlightBreaches || !allowBreaches) return { band, lines, overlays: [] };

    const overlays = seriesKeys.flatMap((key): ToleranceOverlayProps[] => {
      const values = data.map((row) => (row[key] == null ? null : Number(row[key]) || 0));
      // No special case for an open side: nothing is ever below -Infinity.
      const left = values.map((v) => v !== null && (v < slot.min || v > slot.max));
      if (!left.some(Boolean)) return [];

      const masked = new Map<unknown, number | null>();
      const outside = new Map<unknown, boolean>();
      data.forEach((row, i) => {
        masked.set(row, left[i] || left[i - 1] || left[i + 1] ? values[i] : null);
        outside.set(row, left[i]);
      });

      return [
        {
          key: `__out-${key}`,
          // A departure that cut the corner where its series stepped would
          // trace a path the series never took.
          type: seriesCurves?.[key],
          dataKey: (row: unknown) => masked.get(row) ?? null,
          stroke: breachColor,
          strokeWidth: TOLERANCE_BREACH_WIDTH,
          strokeLinecap: "round",
          fill: "none",
          connectNulls: false,
          isAnimationActive: false,
          activeDot: false,
          legendType: "none",
          tooltipType: "none",
          dot: ({ cx, cy, payload, key: dotKey }) => {
            if (cx == null || cy == null || !outside.get(payload)) return <g key={dotKey} />;
            return (
              <circle
                key={dotKey}
                cx={cx}
                cy={cy}
                r={TOLERANCE_BREACH_SYMBOL / 2}
                fill={breachColor}
                stroke="var(--color-background)"
                strokeWidth={TOLERANCE_BREACH_RING}
              />
            );
          },
        },
      ];
    });

    return { band, lines, overlays };
  }, [slot, config, data, seriesKeys, seriesCurves, isLoading, allowBreaches]);
}
