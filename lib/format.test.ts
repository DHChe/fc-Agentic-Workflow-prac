import { describe, expect, it } from "vitest";

import {
  formatAmount,
  formatDate,
  formatDateTime,
  formatMonthLabel,
  formatRatio,
} from "./format";

describe("표시 형식", () => {
  it.each([
    [1_126_600, "1,126,600원"],
    [-8_900, "-8,900원"],
    [0, "0원"],
  ])("금액 %s를 %s로 표시한다", (amount, expected) => {
    expect(formatAmount(amount)).toBe(expected);
  });

  it("비율을 소수 첫째 자리까지 표시하고 null은 미정 칸으로 표시한다", () => {
    expect(formatRatio(0.366)).toBe("36.6%");
    expect(formatRatio(null)).toBe("—");
  });

  it("월을 한국어 기간 라벨로 표시한다", () => {
    expect(formatMonthLabel("2026-09")).toBe("2026년 9월");
  });

  it("UTC 시각을 서울 날짜와 시각으로 표시한다", () => {
    const date = "2026-09-02T15:30:00Z";

    expect(formatDateTime(date)).toBe("2026.09.03 00:30");
    expect(formatDate(date)).toBe("2026.09.03");
  });
});
