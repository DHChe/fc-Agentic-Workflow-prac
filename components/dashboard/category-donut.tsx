import { donutArcs } from "@/components/dashboard/donut-arcs";
import type { MonthStats } from "@/lib/stats/aggregate";

const SIZE = 200;
const STROKE_WIDTH = 26;
const CENTER = SIZE / 2;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const GAP_DEGREES = (2 / RADIUS) * (180 / Math.PI);

function pointAt(angle: number): { x: number; y: number } {
  const radians = (angle * Math.PI) / 180;
  return {
    x: CENTER + RADIUS * Math.sin(radians),
    y: CENTER - RADIUS * Math.cos(radians),
  };
}

function arcPath(startAngle: number, endAngle: number): string {
  const start = pointAt(startAngle);
  const end = pointAt(endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${start.x} ${start.y}`,
    `A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${end.x} ${end.y}`,
  ].join(" ");
}

export function CategoryDonut(props: {
  categories: MonthStats["categories"];
}): React.JSX.Element {
  const arcs = donutArcs(props.categories, { gapDeg: GAP_DEGREES });

  return (
    <svg
      aria-hidden="true"
      className="size-[200px] max-w-full shrink-0"
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      width={SIZE}
    >
      {arcs.length === 0 ? (
        <circle
          cx={CENTER}
          cy={CENTER}
          fill="none"
          r={RADIUS}
          stroke="var(--border)"
          strokeWidth={STROKE_WIDTH}
        />
      ) : arcs.length === 1 ? (
        <circle
          cx={CENTER}
          cy={CENTER}
          fill="none"
          r={RADIUS}
          stroke={`var(--chart-${arcs[0].colorIndex + 1})`}
          strokeWidth={STROKE_WIDTH}
        />
      ) : (
        arcs.map((arc) => (
          <path
            d={arcPath(arc.startAngle, arc.endAngle)}
            fill="none"
            key={arc.key}
            stroke={`var(--chart-${arc.colorIndex + 1})`}
            strokeWidth={STROKE_WIDTH}
          />
        ))
      )}
    </svg>
  );
}
