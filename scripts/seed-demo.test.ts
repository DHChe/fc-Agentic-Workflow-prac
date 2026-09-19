import { describe, expect, it } from "vitest";

import { REPORT_SECTION_TITLES } from "@/lib/claude/report";
import { formatAmount } from "@/lib/format";
import { aggregateMonth, monthRange } from "@/lib/stats/aggregate";
import { validateUploadPath } from "@/lib/upload/validate";

import { SEED_DOCUMENTS } from "./seed-data";
import { buildSeedReport, planSeed } from "./seed-demo";

const DEMO_USER_ID = "user_demo.seed";

function createPlan() {
  return planSeed(SEED_DOCUMENTS, DEMO_USER_ID);
}

describe("planSeed", () => {
  it("고정된 문서 10건과 거래 14건을 모두 대상 사용자 범위로 계획한다", () => {
    const plan = createPlan();

    expect(plan.documents).toHaveLength(10);
    expect(plan.transactions).toHaveLength(14);
    expect(
      [...plan.documents, ...plan.transactions, plan.report].every(
        (row) => row.userId === DEMO_USER_ID,
      ),
    ).toBe(true);
  });

  it("7번 명세서의 스타벅스 거래보다 늦게 만들어진 8번 영수증만 중복으로 표시한다", () => {
    const plan = createPlan();
    const sourceDocument = plan.documents[6];
    const duplicateDocument = plan.documents[7];
    const source = plan.transactions.find(
      (transaction) =>
        transaction.documentId === sourceDocument.id &&
        transaction.merchantName === "스타벅스 선릉로점" &&
        transaction.totalAmount === 23_000,
    );
    const duplicates = plan.transactions.filter(
      (transaction) => transaction.isDuplicate,
    );

    expect(source).toBeDefined();
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]).toMatchObject({
      documentId: duplicateDocument.id,
      merchantName: "스타벅스 선릉로점",
      totalAmount: 23_000,
      duplicateOf: source?.id,
    });
    expect(source!.createdAt.getTime()).toBeLessThan(
      duplicates[0].createdAt.getTime(),
    );
  });

  it("날짜 추정 거래는 1건뿐이고 모든 Blob 경로가 대상 사용자 경로 검증을 통과한다", () => {
    const plan = createPlan();

    expect(
      plan.transactions.filter((transaction) => transaction.dateEstimated),
    ).toHaveLength(1);
    for (const document of plan.documents) {
      expect(
        validateUploadPath(document.blobPathname, DEMO_USER_ID),
      ).toMatchObject({ ok: true, uploadId: document.id, ext: "jpg" });
    }
  });

  it("모든 id가 서로 다르고 여러 번 계획해도 같은 결과를 만든다", () => {
    const first = createPlan();
    const second = createPlan();
    const ids = [
      ...first.documents.map((document) => document.id),
      ...first.transactions.map((transaction) => transaction.id),
      first.report.id,
    ];

    expect(new Set(ids).size).toBe(ids.length);
    expect(second).toEqual(first);
  });
});

describe("buildSeedReport", () => {
  it("8월 집계 숫자로 링크와 표가 없는 5개 섹션 보고서를 만든다", () => {
    const plan = createPlan();
    const { start, end } = monthRange("2026-08");
    const augustTransactions = plan.transactions.filter(
      (transaction) =>
        transaction.transactedAt >= start &&
        transaction.transactedAt < end &&
        !transaction.isDuplicate &&
        transaction.totalAmount !== null,
    );
    const rows = augustTransactions.map((transaction) => ({
      transactedAt: transaction.transactedAt,
      merchantName: transaction.merchantName,
      totalAmount: transaction.totalAmount!,
      category: transaction.category,
    }));
    const expected = aggregateMonth(
      augustTransactions.map((transaction) => ({
        totalAmount: transaction.totalAmount,
        isDuplicate: transaction.isDuplicate,
        category: transaction.category,
      })),
    );
    const report = buildSeedReport(rows);

    expect(expected).toMatchObject({ total: 787_900, count: 9 });
    let previousTitleIndex = -1;
    for (const title of REPORT_SECTION_TITLES) {
      const titleIndex = report.indexOf(`## ${title}`);
      expect(titleIndex).toBeGreaterThan(previousTitleIndex);
      previousTitleIndex = titleIndex;
    }
    expect(report).toContain(formatAmount(expected.total));
    expect(report).not.toContain("](");
    expect(report).not.toContain("|---");
  });
});
