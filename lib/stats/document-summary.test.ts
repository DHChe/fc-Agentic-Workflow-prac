import { describe, expect, it } from "vitest";

import { summarizeDocument } from "./document-summary";

describe("문서 합계", () => {
  it("완료 문서에 거래가 없으면 건수와 합계가 0이다", () => {
    expect(summarizeDocument("completed", [])).toEqual({
      transactionCount: 0,
      totalAmount: 0,
    });
  });

  it("금액 미인식 거래는 건수에 포함하고 합계에서는 뺀다", () => {
    expect(summarizeDocument("completed", [12_000, null, 8_000])).toEqual({
      transactionCount: 3,
      totalAmount: 20_000,
    });
  });

  it("호출자가 넘긴 중복 거래 금액도 합계에 포함한다", () => {
    expect(summarizeDocument("completed", [23_000, 23_000])).toEqual({
      transactionCount: 2,
      totalAmount: 46_000,
    });
  });

  it("음수와 0원을 정상 금액으로 더한다", () => {
    expect(summarizeDocument("completed", [10_000, -8_900, 0])).toEqual({
      transactionCount: 3,
      totalAmount: 1_100,
    });
  });

  it.each(["processing", "failed"] as const)(
    "%s 문서는 건수와 합계를 노출하지 않는다",
    (status) => {
      expect(summarizeDocument(status, [10_000])).toEqual({
        transactionCount: null,
        totalAmount: null,
      });
    },
  );
});
