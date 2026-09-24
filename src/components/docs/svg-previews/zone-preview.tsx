import React from "react";

const ROWS = 5;
const ZONES = 4;
const TRACK_LEFT = 120;
const TRACK_RIGHT = 780;
const TRACK_WIDTH = TRACK_RIGHT - TRACK_LEFT;
const ZONE_WIDTH = TRACK_WIDTH / ZONES;
const GAP = 8;
const TRACK_HEIGHT = 34;
const PITCH = 76;
const TOP = 240 - (ROWS * PITCH - (PITCH - TRACK_HEIGHT)) / 2;

// [expected zone, marker position as a fraction of the scale]
const ROWS_DATA: [number, number][] = [
  [0, 0.14],
  [1, 0.33],
  [1, 0.62],
  [2, 0.58],
  [3, 0.79],
];

export const ZonePreview = () => {
  return (
    <svg
      className="text-primary relative z-10 h-full w-full"
      viewBox="0 0 900 480"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {ROWS_DATA.map(([expected, position], row) => {
        const y = TOP + row * PITCH;
        const markerX = TRACK_LEFT + position * TRACK_WIDTH;
        const inZone = Math.floor(position * ZONES) === expected;
        return (
          <g key={row}>
            <rect
              x={20}
              y={y + TRACK_HEIGHT / 2 - 6}
              width={72}
              height={12}
              rx="6"
              fill="currentColor"
              fillOpacity={0.14}
            />
            {Array.from({ length: ZONES }, (_, zone) => (
              <rect
                key={zone}
                x={TRACK_LEFT + zone * ZONE_WIDTH + GAP / 2}
                y={y}
                width={ZONE_WIDTH - GAP}
                height={TRACK_HEIGHT}
                rx="7"
                fill="currentColor"
                fillOpacity={zone === expected ? 0.42 : 0.1}
              />
            ))}
            <circle
              cx={markerX}
              cy={y + TRACK_HEIGHT / 2}
              r={13}
              fill={inZone ? "currentColor" : "var(--color-vesper-type)"}
            />
          </g>
        );
      })}
    </svg>
  );
};
