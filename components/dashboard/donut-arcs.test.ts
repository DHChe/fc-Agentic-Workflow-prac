import { describe, expect, it } from "vitest";

import { donutArcs } from "@/components/dashboard/donut-arcs";
import type { CategoryKey } from "@/lib/categories";

function category(key: CategoryKey, amount: number) {
  return { key, amount };
}

describe("donutArcs", () => {
  it("divides the drawable angle in proportion to positive amounts", () => {
    const arcs = donutArcs(
      [category("food_welfare", 300), category("transport_travel", 100)],
      { gapDeg: 4 },
    );
    const sweeps = arcs.map((arc) => arc.endAngle - arc.startAngle);

    expect(sweeps[0] / sweeps[1]).toBeCloseTo(3);
    expect(sweeps[0] + sweeps[1]).toBeCloseTo(360 - 4 * 2);
  });

  it("omits zero and negative amounts without shifting color indexes", () => {
    const arcs = donutArcs([
      category("food_welfare", 0),
      category("transport_travel", -10),
      category("entertainment_client", 50),
    ]);

    expect(arcs).toEqual([
      {
        key: "entertainment_client",
        colorIndex: 2,
        startAngle: 0,
        endAngle: 360,
      },
    ]);
  });

  it("draws a single positive category as a complete ring", () => {
    expect(
      donutArcs([category("office_equipment", 25)], { gapDeg: 8 }),
    ).toEqual([
      {
        key: "office_equipment",
        colorIndex: 0,
        startAngle: 0,
        endAngle: 360,
      },
    ]);
  });

  it("returns no arcs when every amount is zero or negative", () => {
    expect(
      donutArcs([
        category("food_welfare", 0),
        category("transport_travel", -1),
      ]),
    ).toEqual([]);
  });

  it("starts at twelve o'clock and increases angles monotonically", () => {
    const arcs = donutArcs(
      [
        category("food_welfare", 4),
        category("transport_travel", 3),
        category("entertainment_client", 2),
      ],
      { gapDeg: 2 },
    );

    expect(arcs[0].startAngle).toBe(0);
    for (let index = 1; index < arcs.length; index += 1) {
      expect(arcs[index].startAngle).toBeGreaterThan(
        arcs[index - 1].endAngle,
      );
      expect(arcs[index].endAngle).toBeGreaterThan(
        arcs[index].startAngle,
      );
    }
  });
});
