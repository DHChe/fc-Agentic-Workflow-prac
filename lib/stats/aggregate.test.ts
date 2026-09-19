import { describe, expect, it } from "vitest";

import { CATEGORY_KEYS } from "@/lib/categories";

import {
  aggregateMonth,
  currentSeoulMonth,
  defaultMonthCutoff,
  isValidMonth,
  monthRange,
  parseTransactedAt,
  pickDefaultMonth,
  seoulDateKey,
  seoulDayStart,
  shiftMonth,
} from "./aggregate";

describe("서울 날짜 경계", () => {
  it("UTC+9 월 경계로 현재 달과 월 범위를 계산한다", () => {
    expect(currentSeoulMonth(new Date("2026-08-31T15:00:00Z"))).toBe(
      "2026-09",
    );
    expect(currentSeoulMonth(new Date("2026-09-30T14:59:59Z"))).toBe(
      "2026-09",
    );
    expect(currentSeoulMonth(new Date("2026-09-30T15:00:00Z"))).toBe(
      "2026-10",
    );

    const range = monthRange("2026-09");
    expect(range.start.toISOString()).toBe("2026-08-31T15:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-09-30T15:00:00.000Z");
  });

  it("서울 자정 전후를 서로 다른 날짜 시작과 날짜 키로 계산한다", () => {
    const beforeMidnight = new Date("2026-09-30T14:59:59Z");
    const atMidnight = new Date("2026-09-30T15:00:00Z");

    expect(seoulDayStart(beforeMidnight).toISOString()).toBe(
      "2026-09-29T15:00:00.000Z",
    );
    expect(seoulDayStart(atMidnight).toISOString()).toBe(
      "2026-09-30T15:00:00.000Z",
    );
    expect(seoulDateKey(beforeMidnight)).toBe("2026-09-30");
    expect(seoulDateKey(atMidnight)).toBe("2026-10-01");
  });

  it("연도 경계를 넘어 월을 이동한다", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });

  it.each([
    ["2026-09", true],
    ["2026-13", false],
    ["2026-9", false],
    ["abcd-ef", false],
    ["", false],
  ])("월 문자열 %s의 유효성은 %s다", (month, expected) => {
    expect(isValidMonth(month)).toBe(expected);
  });
});

describe("거래 시각 파싱", () => {
  const uploadedAt = new Date("2026-09-10T08:30:00Z");

  it.each([null, "not-a-date"])(
    "%s는 업로드 시각으로 대체하고 날짜 추정으로 표시한다",
    (raw) => {
      expect(parseTransactedAt(raw, uploadedAt)).toEqual({
        transactedAt: uploadedAt,
        dateEstimated: true,
      });
    },
  );

  it("날짜만 있으면 그 날 서울 자정으로 해석한다", () => {
    const result = parseTransactedAt("2026-09-03", uploadedAt);

    expect(result.transactedAt.toISOString()).toBe(
      "2026-09-02T15:00:00.000Z",
    );
    expect(result.dateEstimated).toBe(false);
  });

  it("오프셋 없는 시각은 서울 시각으로 해석한다", () => {
    const result = parseTransactedAt("2026-09-03T12:41:00", uploadedAt);

    expect(result.transactedAt.toISOString()).toBe(
      "2026-09-03T03:41:00.000Z",
    );
    expect(result.dateEstimated).toBe(false);
  });

  it.each([
    ["2026-09-03T12:41:00+09:00", "2026-09-03T03:41:00.000Z"],
    ["2026-09-03T12:41:00Z", "2026-09-03T12:41:00.000Z"],
  ])("오프셋이 있는 %s는 적힌 시각대로 해석한다", (raw, expected) => {
    const result = parseTransactedAt(raw, uploadedAt);

    expect(result.transactedAt.toISOString()).toBe(expected);
    expect(result.dateEstimated).toBe(false);
  });

  it.each([
    ["2026-09-09 12:24", "2026-09-09T03:24:00.000Z"],
    ["2026-09-03 12:41:00", "2026-09-03T03:41:00.000Z"],
    ["2026-09-03 12:41:00+09:00", "2026-09-03T03:41:00.000Z"],
  ])("T 대신 공백으로 구분한 %s도 같은 시각으로 읽는다", (raw, expected) => {
    const result = parseTransactedAt(raw, uploadedAt);

    expect(result.transactedAt.toISOString()).toBe(expected);
    expect(result.dateEstimated).toBe(false);
  });

  it("콜론 없는 오프셋도 콜론 있는 오프셋과 같은 순간으로 읽는다", () => {
    const basic = parseTransactedAt("2026-09-09T12:24:00+0900", uploadedAt);
    const extended = parseTransactedAt("2026-09-09T12:24:00+09:00", uploadedAt);

    expect(basic.transactedAt.toISOString()).toBe("2026-09-09T03:24:00.000Z");
    expect(basic.transactedAt.getTime()).toBe(extended.transactedAt.getTime());
    expect(basic.dateEstimated).toBe(false);
    expect(extended.dateEstimated).toBe(false);
  });

  it.each([
    "2026-09-09T12:24:00+09:0",
    "2026-09-09T12:24:00+0:900",
    "2026-09-09T12:24:00+090",
  ])("오프셋이 망가진 %s는 업로드 시각으로 대체한다", (raw) => {
    expect(parseTransactedAt(raw, uploadedAt)).toEqual({
      transactedAt: uploadedAt,
      dateEstimated: true,
    });
  });

  it("미래 날짜를 코드에서 보정하지 않는다", () => {
    const result = parseTransactedAt("2099-01-02", uploadedAt);

    expect(result.transactedAt.toISOString()).toBe(
      "2099-01-01T15:00:00.000Z",
    );
    expect(result.dateEstimated).toBe(false);
  });
});

describe("월 통계 집계", () => {
  it("중복과 미인식은 빼고 0원과 음수를 포함해 8개 카테고리를 정렬한다", () => {
    const stats = aggregateMonth([
      {
        totalAmount: 100,
        isDuplicate: false,
        category: "food_welfare",
      },
      {
        totalAmount: 999,
        isDuplicate: true,
        category: "entertainment_client",
      },
      {
        totalAmount: null,
        isDuplicate: false,
        category: "it_telecom",
      },
      {
        totalAmount: 0,
        isDuplicate: false,
        category: "transport_travel",
      },
      {
        totalAmount: -20,
        isDuplicate: false,
        category: "office_equipment",
      },
    ]);

    expect(stats.total).toBe(80);
    expect(stats.count).toBe(3);
    expect(stats.categories).toHaveLength(8);
    expect(stats.categories.map(({ key }) => key)).toEqual([
      "food_welfare",
      "transport_travel",
      "entertainment_client",
      "it_telecom",
      "ads_outsourcing_education",
      "rent_utilities_vehicle",
      "other",
      "office_equipment",
    ]);
    expect(stats.categories.find(({ key }) => key === "food_welfare")).toEqual(
      {
        key: "food_welfare",
        amount: 100,
        ratio: 1.25,
      },
    );
    expect(
      stats.categories.find(({ key }) => key === "office_equipment"),
    ).toEqual({
      key: "office_equipment",
      amount: -20,
      ratio: -0.25,
    });
  });

  it("금액 동률이면 CATEGORY_KEYS 순서를 유지한다", () => {
    const stats = aggregateMonth(
      CATEGORY_KEYS.map((category) => ({
        totalAmount: 10,
        isDuplicate: false,
        category,
      })),
    );

    expect(stats.categories.map(({ key }) => key)).toEqual(CATEGORY_KEYS);
  });

  it("총액이 0 이하이면 모든 카테고리 비율을 null로 둔다", () => {
    const stats = aggregateMonth([
      {
        totalAmount: 0,
        isDuplicate: false,
        category: "food_welfare",
      },
      {
        totalAmount: -10,
        isDuplicate: false,
        category: "transport_travel",
      },
    ]);

    expect(stats.total).toBe(-10);
    expect(stats.count).toBe(2);
    expect(stats.categories.every(({ ratio }) => ratio === null)).toBe(true);
  });

  it("빈 배열은 합계와 건수가 0이고 8개 비율이 모두 null이다", () => {
    const stats = aggregateMonth([]);

    expect(stats.total).toBe(0);
    expect(stats.count).toBe(0);
    expect(stats.categories).toHaveLength(8);
    expect(stats.categories.every(({ ratio }) => ratio === null)).toBe(true);
  });
});

describe("기본 통계 달", () => {
  it("최근 거래 시각의 서울 달을 고른다", () => {
    expect(
      pickDefaultMonth(new Date("2026-08-31T15:00:00Z"), new Date()),
    ).toBe("2026-09");
  });

  it("최근 거래가 없으면 현재 서울 달을 고른다", () => {
    expect(
      pickDefaultMonth(null, new Date("2026-01-31T15:00:00Z")),
    ).toBe("2026-02");
  });

  // getDefaultMonth는 이 기준 시각에 lt(미만) 조건을 걸어 미래 거래를 제외한다.
  it("오늘 서울 마지막 순간은 남기고 내일 서울 자정은 자른다", () => {
    const cutoff = defaultMonthCutoff(new Date("2026-09-19T05:00:00Z"));
    const todayLastMoment = new Date("2026-09-19T14:59:59.999Z");
    const tomorrowStart = new Date("2026-09-19T15:00:00Z");

    expect(cutoff.toISOString()).toBe("2026-09-19T15:00:00.000Z");
    expect(todayLastMoment < cutoff).toBe(true);
    expect(tomorrowStart < cutoff).toBe(false);
  });

  it("서울 자정 전후의 기준 시각은 정확히 하루 차이다", () => {
    const beforeMidnight = defaultMonthCutoff(
      new Date("2026-09-30T14:59:59Z"),
    );
    const atMidnight = defaultMonthCutoff(new Date("2026-09-30T15:00:00Z"));

    expect(beforeMidnight.toISOString()).toBe("2026-09-30T15:00:00.000Z");
    expect(atMidnight.getTime() - beforeMidnight.getTime()).toBe(
      24 * 60 * 60 * 1_000,
    );
  });
});
