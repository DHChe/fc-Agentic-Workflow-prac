import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { describe, expect, it } from "vitest";

import { ExtractionError } from "@/lib/claude/extract";
import { throwFailApi } from "@/lib/claude/fixtures";
import type { ExtractionResult } from "@/lib/claude/schemas";
import { MESSAGES, type FailureCode } from "@/lib/messages";

import {
  isTimedOut,
  toFailureCode,
  toTransactionRows,
} from "./process-document";

function makeApiError(
  status: number,
): ReturnType<typeof Anthropic.APIError.generate> {
  return Anthropic.APIError.generate(
    status,
    {
      type: "error",
      error: { type: "api_error", message: "test error" },
    },
    "test error",
    new Headers(),
  );
}

describe("toFailureCode", () => {
  const failureMessages: Record<FailureCode, string> = {
    unreadable: "파일을 읽을 수 없습니다.",
    unparsable: "분석 결과를 해석하지 못했습니다.",
    upstream: "분석 서비스가 일시적으로 응답하지 않습니다.",
    tooManyPages: "PDF는 20페이지까지 처리할 수 있습니다.",
    encryptedPdf:
      "암호가 걸린 PDF는 처리할 수 없습니다. 암호를 풀어 저장한 뒤 올려 주세요.",
    timedOut: "처리 시간을 초과했습니다.",
    unknown: "알 수 없는 오류가 발생했습니다.",
  };

  it.each(Object.entries(failureMessages) as [FailureCode, string][])(
    "ExtractionError(%s)를 그대로 분류하고 고정 문구를 유지한다",
    (code, message) => {
      expect(toFailureCode(new ExtractionError(code))).toBe(code);
      expect(MESSAGES.failure[code]).toBe(message);
    },
  );

  it("Anthropic 400을 읽기 실패로 분류한다", () => {
    expect(makeApiError(400)).toBeInstanceOf(Anthropic.BadRequestError);
    expect(toFailureCode(makeApiError(400))).toBe("unreadable");
  });

  it("Anthropic 429를 외부 서비스 장애로 분류한다", () => {
    expect(makeApiError(429)).toBeInstanceOf(Anthropic.RateLimitError);
    expect(toFailureCode(makeApiError(429))).toBe("upstream");
  });

  it.each([500, 503, 529])(
    "Anthropic %i를 외부 서비스 장애로 분류한다",
    (status) => {
      expect(toFailureCode(makeApiError(status))).toBe("upstream");
    },
  );

  it("Anthropic 연결 오류와 연결 시간 초과를 외부 서비스 장애로 분류한다", () => {
    expect(
      toFailureCode(
        new Anthropic.APIConnectionError({
          message: "connection failed",
          cause: new Error("socket closed"),
        }),
      ),
    ).toBe("upstream");
    expect(
      toFailureCode(
        new Anthropic.APIConnectionTimeoutError({ message: "timed out" }),
      ),
    ).toBe("upstream");
  });

  it("fail-api fixture 오류를 외부 서비스 장애로 분류한다", () => {
    let error: unknown;

    try {
      throwFailApi();
    } catch (caught) {
      error = caught;
    }

    expect(toFailureCode(error)).toBe("upstream");
  });

  it("ZodError를 해석 실패로 분류한다", () => {
    let error: unknown;

    try {
      z.string().parse(42);
    } catch (caught) {
      error = caught;
    }

    expect(toFailureCode(error)).toBe("unparsable");
  });

  it.each([
    new Error("db down"),
    "plain string",
    null,
    undefined,
  ])("그 밖의 오류 %p를 알 수 없는 오류로 분류한다", (error) => {
    expect(toFailureCode(error)).toBe("unknown");
  });
});

describe("isTimedOut", () => {
  const uploadedAt = new Date("2026-09-18T00:00:00.000Z");

  it.each([
    [599_000, false],
    [600_000, false],
    [600_001, true],
  ])("업로드 후 %i ms 경과 시 만료 여부는 %s다", (elapsed, expected) => {
    const now = new Date(uploadedAt.getTime() + elapsed);

    expect(isTimedOut(uploadedAt, now)).toBe(expected);
  });
});

describe("toTransactionRows", () => {
  const context = {
    documentId: "00000000-0000-4000-8000-000000000001",
    userId: "user_test",
    uploadedAt: new Date("2026-09-10T08:30:00.000Z"),
  };

  it("여러 거래의 날짜와 카드 끝4를 정리하고 문맥과 원래 값을 보존한다", () => {
    const result: ExtractionResult = {
      docType: "statement",
      transactions: [
        {
          transactedAt: null,
          merchantName: null,
          totalAmount: null,
          cardLast4: "****-1234",
          category: "other",
        },
        {
          transactedAt: "2026-09-03",
          merchantName: "무료 샘플",
          totalAmount: 0,
          cardLast4: "12345",
          category: "food_welfare",
        },
        {
          transactedAt: "2026-09-04T12:30:00",
          merchantName: "결제 취소",
          totalAmount: -8_900,
          cardLast4: null,
          category: "office_equipment",
        },
      ],
    };

    const rows = toTransactionRows(result, context);

    expect(rows).toHaveLength(3);
    expect(
      rows.every(
        ({ documentId, userId }) =>
          documentId === context.documentId && userId === context.userId,
      ),
    ).toBe(true);
    expect(rows[0]).toEqual({
      documentId: context.documentId,
      userId: context.userId,
      transactedAt: context.uploadedAt,
      dateEstimated: true,
      merchantName: null,
      totalAmount: null,
      cardLast4: "1234",
      category: "other",
    });
    expect(rows[1]).toMatchObject({
      transactedAt: new Date("2026-09-02T15:00:00.000Z"),
      dateEstimated: false,
      merchantName: "무료 샘플",
      totalAmount: 0,
      cardLast4: null,
    });
    expect(rows[2]).toMatchObject({
      transactedAt: new Date("2026-09-04T03:30:00.000Z"),
      dateEstimated: false,
      merchantName: "결제 취소",
      totalAmount: -8_900,
      cardLast4: null,
    });
  });

  it("기타 문서는 거래 행을 만들지 않는다", () => {
    const result: ExtractionResult = {
      docType: "other",
      transactions: [
        {
          transactedAt: "2026-09-04T12:30:00",
          merchantName: "결제 취소",
          totalAmount: -8_900,
          cardLast4: null,
          category: "office_equipment",
        },
      ],
    };

    expect(toTransactionRows(result, context)).toEqual([]);
  });
});
