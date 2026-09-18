import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { seoulDayStart } from "@/lib/stats/aggregate";

import { DAILY_LIMIT, usageWindow } from "./limit";

describe("usage limit", () => {
  it("하루 한도는 코드에 고정된 50이다", () => {
    expect(DAILY_LIMIT).toBe(50);
  });

  it("서울 자정 전후를 서로 다른 24시간 창으로 계산한다", () => {
    const beforeMidnight = new Date("2026-09-17T14:59:59Z");
    const atMidnight = new Date("2026-09-17T15:00:00Z");
    const beforeWindow = usageWindow(beforeMidnight);
    const afterWindow = usageWindow(atMidnight);

    expect(beforeWindow).toEqual({
      start: new Date("2026-09-16T15:00:00.000Z"),
      end: new Date("2026-09-17T15:00:00.000Z"),
    });
    expect(afterWindow).toEqual({
      start: new Date("2026-09-17T15:00:00.000Z"),
      end: new Date("2026-09-18T15:00:00.000Z"),
    });
    expect(beforeWindow.end.getTime() - beforeWindow.start.getTime()).toBe(
      24 * 60 * 60 * 1_000,
    );
    expect(afterWindow.start).toEqual(seoulDayStart(atMidnight));
  });

  it("문서나 보고서 행이 아니라 usage_log만 사용한다", () => {
    const source = readFileSync(new URL("./limit.ts", import.meta.url), "utf8");

    expect(source).not.toMatch(/\b(?:documents|reports)\b/);
  });
});
