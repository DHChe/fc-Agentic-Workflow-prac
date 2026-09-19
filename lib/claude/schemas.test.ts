import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { describe, expect, it } from "vitest";

import { cleanCardLast4, extractionSchema } from "./schemas";

const validTransaction = {
  transactedAt: "2026-09-09T12:24:00",
  merchantName: "파리바게뜨 역삼점",
  totalAmount: 17_300,
  cardLast4: "9012",
  category: "food_welfare",
};

describe("extractionSchema", () => {
  it("정상 추출 응답을 통과시킨다", () => {
    const result = {
      docType: "receipt",
      transactions: [validTransaction],
    };

    expect(extractionSchema.parse(result)).toEqual(result);
  });

  it("고정 목록 밖의 카테고리를 거부한다", () => {
    expect(() =>
      extractionSchema.parse({
        docType: "receipt",
        transactions: [{ ...validTransaction, category: "unknown" }],
      }),
    ).toThrow();
  });

  it("기타 문서에 거래가 있으면 거부한다", () => {
    expect(() =>
      extractionSchema.parse({
        docType: "other",
        transactions: [validTransaction],
      }),
    ).toThrow();
  });

  it("기타 문서의 빈 거래 배열은 통과시킨다", () => {
    const result = { docType: "other", transactions: [] };

    expect(extractionSchema.parse(result)).toEqual(result);
  });

  it.each([0, -8_900])("정수 금액 %i원을 허용한다", (totalAmount) => {
    const result = {
      docType: "statement",
      transactions: [{ ...validTransaction, totalAmount }],
    };

    expect(extractionSchema.parse(result)).toEqual(result);
  });

  it("소수 금액을 거부한다", () => {
    expect(() =>
      extractionSchema.parse({
        docType: "receipt",
        transactions: [{ ...validTransaction, totalAmount: 17_300.5 }],
      }),
    ).toThrow();
  });

  it("영수증 한 파일의 여러 거래를 허용한다", () => {
    const result = {
      docType: "receipt",
      transactions: [
        validTransaction,
        { ...validTransaction, merchantName: "두 번째 영수증" },
      ],
    };

    expect(extractionSchema.parse(result)).toEqual(result);
  });

  it("가맹점명은 100자까지 허용하고 101자는 거부한다", () => {
    const makeResult = (merchantName: string) => ({
      docType: "receipt",
      transactions: [{ ...validTransaction, merchantName }],
    });

    expect(extractionSchema.safeParse(makeResult("가".repeat(100))).success).toBe(
      true,
    );
    expect(extractionSchema.safeParse(makeResult("가".repeat(101))).success).toBe(
      false,
    );
  });

  it("모든 nullable 필드가 null이어도 통과시킨다", () => {
    const result = {
      docType: "receipt",
      transactions: [
        {
          transactedAt: null,
          merchantName: null,
          totalAmount: null,
          cardLast4: null,
          category: "other",
        },
      ],
    };

    expect(extractionSchema.parse(result)).toEqual(result);
  });

  it("Anthropic 구조화 출력용 스키마에서 미지원 제약 키워드를 내보내지 않는다", () => {
    const format = zodOutputFormat(extractionSchema);
    const serialized = JSON.stringify(format.schema);

    expect(serialized).not.toContain('"maxLength":');
    expect(serialized).not.toContain('"minimum":');
  });
});

describe("cleanCardLast4", () => {
  it.each([
    ["1234", "1234"],
    ["****-1234", "1234"],
    ["12345", null],
    ["12a4", null],
    ["", null],
    [null, null],
  ])("%j를 %j로 정리한다", (raw, expected) => {
    expect(cleanCardLast4(raw)).toBe(expected);
  });
});
