import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { CATEGORY_KEYS, CATEGORY_LABELS } from "./categories";

describe("카테고리 상수", () => {
  it("ARCHITECTURE 6절의 8개 키와 표시명을 그대로 제공한다", () => {
    const architecture = readFileSync(
      resolve(process.cwd(), "docs/ARCHITECTURE.md"),
      "utf8",
    );
    const tableStart = architecture.indexOf("### 카테고리 키");
    const tableEnd = architecture.indexOf("\n모르면 `other`.", tableStart);

    if (tableStart === -1 || tableEnd === -1) {
      throw new Error("ARCHITECTURE 6절에서 카테고리 표를 찾을 수 없습니다.");
    }

    const rows = architecture
      .slice(tableStart, tableEnd)
      .split("\n")
      .filter((line) => /^\| `[^`]+` \| .+ \|$/.test(line))
      .map((line) => {
        const [, key, label] = line.split("|").map((cell) => cell.trim());
        return [key.replaceAll("`", ""), label] as const;
      });

    expect(CATEGORY_KEYS).toHaveLength(8);
    expect([...CATEGORY_KEYS]).toEqual(rows.map(([key]) => key));
    expect(CATEGORY_LABELS).toEqual(Object.fromEntries(rows));
  });
});
