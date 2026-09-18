import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CATEGORY_KEYS } from "@/lib/categories";

import { RECEIPT_OK } from "./fixtures";
import {
  ExtractionError,
  checkStopReason,
  extractDocument,
  readExtraction,
} from "./extract";
import {
  EXTRACT_SYSTEM_PROMPT,
  buildExtractUserText,
} from "./prompts/extract";

const originalTestMode = process.env.SLIPSCAN_TEST_MODE;
const originalVercelEnv = process.env.VERCEL_ENV;

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe("checkStopReason", () => {
  it("end_turn만 정상으로 판정한다", () => {
    expect(checkStopReason("end_turn")).toBeNull();
  });

  it("refusal은 읽을 수 없음으로 판정한다", () => {
    expect(checkStopReason("refusal")).toBe("unreadable");
  });

  it.each(["max_tokens", "pause_turn", "tool_use", "stop_sequence", null])(
    "%s는 해석할 수 없음으로 판정한다",
    (stopReason) => {
      expect(checkStopReason(stopReason)).toBe("unparsable");
    },
  );
});

describe("readExtraction", () => {
  const VALID_EXTRACTION = {
    docType: "receipt",
    transactions: [
      {
        transactedAt: "2026-09-09T12:24:00",
        merchantName: "파리바게뜨 역삼점",
        totalAmount: 17_300,
        cardLast4: "****-9012",
        category: "food_welfare",
      },
    ],
  };
  const VALID_JSON = JSON.stringify(VALID_EXTRACTION);

  type FinalMessage = Parameters<typeof readExtraction>[0];

  function finalMessage(
    stopReason: string | null,
    text?: string,
  ): FinalMessage {
    return {
      stop_reason: stopReason,
      content: text === undefined ? [] : [{ type: "text", text }],
    };
  }

  function failureCodeOf(final: FinalMessage): string {
    try {
      readExtraction(final);
    } catch (error) {
      expect(error).toBeInstanceOf(ExtractionError);
      return (error as ExtractionError).code;
    }

    throw new Error("readExtraction이 오류를 던지지 않았다");
  }

  it("max_tokens로 잘린 JSON은 해석 실패다", () => {
    const truncated = VALID_JSON.slice(0, Math.floor(VALID_JSON.length / 2));

    expect(failureCodeOf(finalMessage("max_tokens", truncated))).toBe(
      "unparsable",
    );
  });

  it("max_tokens는 본문이 올바른 JSON이어도 해석 실패다", () => {
    expect(failureCodeOf(finalMessage("max_tokens", VALID_JSON))).toBe(
      "unparsable",
    );
  });

  it("refusal은 본문이 JSON이 아니어도 읽기 실패다", () => {
    expect(
      failureCodeOf(finalMessage("refusal", "죄송하지만 도와드릴 수 없습니다.")),
    ).toBe("unreadable");
  });

  it("refusal은 텍스트 블록이 없어도 읽기 실패다", () => {
    expect(failureCodeOf(finalMessage("refusal"))).toBe("unreadable");
  });

  it("end_turn인데 JSON 문법이 깨졌으면 해석 실패다", () => {
    expect(failureCodeOf(finalMessage("end_turn", "{ docType: "))).toBe(
      "unparsable",
    );
  });

  it("목록에 없는 카테고리는 해석 실패다", () => {
    const text = JSON.stringify({
      ...VALID_EXTRACTION,
      transactions: [
        { ...VALID_EXTRACTION.transactions[0], category: "travel_mileage" },
      ],
    });

    expect(failureCodeOf(finalMessage("end_turn", text))).toBe("unparsable");
  });

  it("상호명이 101자면 해석 실패다", () => {
    const text = JSON.stringify({
      ...VALID_EXTRACTION,
      transactions: [
        { ...VALID_EXTRACTION.transactions[0], merchantName: "가".repeat(101) },
      ],
    });

    expect(failureCodeOf(finalMessage("end_turn", text))).toBe("unparsable");
  });

  it("기타 문서인데 거래가 있으면 해석 실패다", () => {
    const text = JSON.stringify({ ...VALID_EXTRACTION, docType: "other" });

    expect(failureCodeOf(finalMessage("end_turn", text))).toBe("unparsable");
  });

  it("텍스트 블록이 하나도 없으면 해석 실패다", () => {
    expect(failureCodeOf(finalMessage("end_turn"))).toBe("unparsable");
  });

  it("정상 응답은 카드 끝 4자리를 정리해 돌려준다", () => {
    expect(readExtraction(finalMessage("end_turn", VALID_JSON))).toEqual({
      docType: "receipt",
      transactions: [
        {
          transactedAt: "2026-09-09T12:24:00",
          merchantName: "파리바게뜨 역삼점",
          totalAmount: 17_300,
          cardLast4: "9012",
          category: "food_welfare",
        },
      ],
    });
  });
});

describe("extractDocument 테스트 모드", () => {
  beforeEach(() => {
    process.env.SLIPSCAN_TEST_MODE = "1";
    delete process.env.VERCEL_ENV;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    restoreEnv("SLIPSCAN_TEST_MODE", originalTestMode);
    restoreEnv("VERCEL_ENV", originalVercelEnv);
  });

  it("1.5초 뒤 영수증 fixture를 돌려준다", async () => {
    const extraction = extractDocument(null, {
      fileName: "receipt-sample.jpg",
      today: "2026-09-18",
      jobId: "test-job",
    });
    let settled = false;
    void extraction.then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(1_499);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(extraction).resolves.toEqual({
      result: RECEIPT_OK,
      model: "test-fixture",
    });
  });

  it("fail-api fixture는 1.5초 뒤 SDK APIError를 던진다", async () => {
    const extraction = extractDocument(null, {
      fileName: "fail-api.jpg",
      today: "2026-09-18",
      jobId: "test-job",
    });
    const rejection = expect(extraction).rejects.toBeInstanceOf(
      Anthropic.APIError,
    );

    await vi.advanceTimersByTimeAsync(1_499);
    await vi.advanceTimersByTimeAsync(1);

    await rejection;
  });
});

describe("추출 프롬프트", () => {
  it("8개 카테고리 키를 모두 포함한다", () => {
    for (const key of CATEGORY_KEYS) {
      expect(EXTRACT_SYSTEM_PROMPT).toContain(key);
    }
  });

  it.each(["null", "정수", "끝 4자리", "각각", "미래", "음수"])(
    "필수 규칙 낱말 %s을 포함한다",
    (keyword) => {
      expect(EXTRACT_SYSTEM_PROMPT).toContain(keyword);
    },
  );

  it("시스템 프롬프트에는 요청마다 달라지는 날짜가 없다", () => {
    expect(EXTRACT_SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(EXTRACT_SYSTEM_PROMPT).not.toMatch(/20\d{2}년/);
  });

  it("사용자 지시문에 서울 기준 오늘 날짜를 넣는다", () => {
    expect(buildExtractUserText("2026-09-18")).toContain("2026-09-18");
  });
});

describe("ExtractionError", () => {
  it("FailureCode를 보존하는 Error다", () => {
    const error = new ExtractionError("unparsable");

    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("unparsable");
  });
});
