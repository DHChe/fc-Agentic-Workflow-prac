import { describe, expect, it } from "vitest";

import { badgesFor } from "./badges";

describe("거래 배지", () => {
  it("정상 거래에는 배지가 없다", () => {
    expect(
      badgesFor({
        totalAmount: 12_000,
        dateEstimated: false,
        isDuplicate: false,
      }),
    ).toEqual([]);
  });

  it("금액이 null일 때만 금액 미인식 배지를 돌려준다", () => {
    expect(
      badgesFor({
        totalAmount: null,
        dateEstimated: false,
        isDuplicate: false,
      }),
    ).toEqual(["amountMissing"]);
  });

  it("0원은 금액 미인식이 아니다", () => {
    expect(
      badgesFor({
        totalAmount: 0,
        dateEstimated: false,
        isDuplicate: false,
      }),
    ).toEqual([]);
  });

  it("음수 금액에는 취소 배지를 만들지 않는다", () => {
    expect(
      badgesFor({
        totalAmount: -8_900,
        dateEstimated: false,
        isDuplicate: false,
      }),
    ).toEqual([]);
  });

  it("날짜 추정 배지를 돌려준다", () => {
    expect(
      badgesFor({
        totalAmount: 12_000,
        dateEstimated: true,
        isDuplicate: false,
      }),
    ).toEqual(["dateEstimated"]);
  });

  it("중복 배지를 돌려준다", () => {
    expect(
      badgesFor({
        totalAmount: 12_000,
        dateEstimated: false,
        isDuplicate: true,
      }),
    ).toEqual(["duplicate"]);
  });

  it("겹친 배지를 날짜 추정, 중복, 금액 미인식 순서로 돌려준다", () => {
    expect(
      badgesFor({
        totalAmount: null,
        dateEstimated: true,
        isDuplicate: true,
      }),
    ).toEqual(["dateEstimated", "duplicate", "amountMissing"]);
  });
});
