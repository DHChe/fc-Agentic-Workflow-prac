import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";

import { extractionSchema } from "../schemas";
import {
  pickFixtureName,
  RECEIPT_OK,
  REPORT_OK_CHUNKS,
  throwFailApi,
} from ".";

const REPORT_HEADINGS = [
  "## 1. 기간 총 지출액과 거래 건수",
  "## 2. 카테고리별 금액·비율",
  "## 3. 큰 지출 상위 5건",
  "## 4. 눈에 띄는 점",
  "## 5. 한 문단 총평",
];

describe("fixture 선택", () => {
  it("fail-api 파일만 실패 fixture로 고른다", () => {
    expect(pickFixtureName("fail-api.jpg")).toBe("fail-api");
  });

  it.each(["receipt-sample.jpg", "무엇이든.pdf", ""])(
    "%j는 기본 영수증 fixture로 고른다",
    (fileName) => {
      expect(pickFixtureName(fileName)).toBe("receipt-ok");
    },
  );
});

describe("receipt-ok", () => {
  it("엄격한 추출 스키마를 통과한다", () => {
    expect(extractionSchema.parse(RECEIPT_OK)).toEqual(RECEIPT_OK);
  });
});

describe("report-ok", () => {
  it("고정 제목 다섯 개를 순서대로 가진 20조각 보고서다", () => {
    const report = REPORT_OK_CHUNKS.join("");

    expect(REPORT_OK_CHUNKS).toHaveLength(20);

    let previousIndex = -1;
    for (const heading of REPORT_HEADINGS) {
      const headingIndex = report.indexOf(heading);
      expect(headingIndex).toBeGreaterThan(previousIndex);
      previousIndex = headingIndex;
    }

    expect(report).not.toContain("](");
    expect(report).not.toContain("|");
  });
});

describe("fail-api", () => {
  it("상태 500 이상의 Anthropic APIError를 던진다", () => {
    try {
      throwFailApi();
      throw new Error("throwFailApi가 오류를 던지지 않았습니다.");
    } catch (error) {
      expect(error).toBeInstanceOf(Anthropic.APIError);
      if (!(error instanceof Anthropic.APIError)) {
        throw error;
      }
      expect(error.status).toBeGreaterThanOrEqual(500);
    }
  });
});
