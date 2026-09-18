import type { CategoryKey } from "@/lib/categories";

export type DonutArc = {
  key: CategoryKey;
  colorIndex: number;
  startAngle: number;
  endAngle: number;
};

export function donutArcs(
  categories: Array<{ key: CategoryKey; amount: number }>,
  opts?: { gapDeg?: number },
): DonutArc[] {
  const positiveCategories = categories
    .map((category, colorIndex) => ({ ...category, colorIndex }))
    .filter((category) => category.amount > 0);

  if (positiveCategories.length === 0) {
    return [];
  }

  if (positiveCategories.length === 1) {
    const [category] = positiveCategories;
    return [
      {
        key: category.key,
        colorIndex: category.colorIndex,
        startAngle: 0,
        endAngle: 360,
      },
    ];
  }

  const gapDeg = opts?.gapDeg ?? 0;
  const drawableAngle = 360 - gapDeg * positiveCategories.length;
  const positiveTotal = positiveCategories.reduce(
    (total, category) => total + category.amount,
    0,
  );
  let cursor = 0;

  return positiveCategories.map((category) => {
    const startAngle = cursor;
    const sweep = drawableAngle * (category.amount / positiveTotal);
    const endAngle = startAngle + sweep;
    cursor = endAngle + gapDeg;

    return {
      key: category.key,
      colorIndex: category.colorIndex,
      startAngle,
      endAngle,
    };
  });
}
