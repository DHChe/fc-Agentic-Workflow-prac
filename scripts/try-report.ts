import { randomUUID } from "node:crypto";

import Anthropic from "@anthropic-ai/sdk";

import {
  REPORT_SECTION_TITLES,
  buildReportInput,
  streamReport,
  type ReportRow,
} from "../lib/claude/report";
import { monthRange } from "../lib/stats/aggregate";
import { SEED_DOCUMENTS } from "./seed-data";

process.loadEnvFile(".env.local");

const REPORT_MONTH = "2026-08";
const EXPECTED_COUNT = 9;
const EXPECTED_TOTAL = 787_900;

function buildSeedRows(): ReportRow[] {
  const { start, end } = monthRange(REPORT_MONTH);

  return SEED_DOCUMENTS.flatMap((document) => document.transactions)
    .map((transaction) => ({
      transactedAt: new Date(transaction.transactedAt),
      merchantName: transaction.merchantName,
      totalAmount: transaction.totalAmount,
      category: transaction.category,
      cardLast4: transaction.cardLast4,
    }))
    .filter(
      (row) => row.transactedAt >= start && row.transactedAt < end,
    )
    .sort(
      (left, right) =>
        left.transactedAt.getTime() - right.transactedAt.getTime(),
    );
}

function assertSeedSummary(input: ReturnType<typeof buildReportInput>): void {
  const summary = JSON.parse(input.summaryJson) as {
    total: number;
    count: number;
  };

  if (summary.count !== EXPECTED_COUNT || summary.total !== EXPECTED_TOTAL) {
    throw new Error(
      `8월 시드 집계 불일치: expected=${EXPECTED_COUNT}건/${EXPECTED_TOTAL}원, actual=${summary.count}건/${summary.total}원`,
    );
  }
}

function assertReport(text: string, stopReason: string | null): void {
  if (stopReason !== "end_turn") {
    throw new Error(`보고서 종료 사유가 end_turn이 아닙니다: ${stopReason}`);
  }

  const positions = REPORT_SECTION_TITLES.map((title) =>
    text.indexOf(`## ${title}`),
  );
  if (
    positions.some((position) => position < 0) ||
    positions.some(
      (position, index) => index > 0 && position <= positions[index - 1],
    )
  ) {
    throw new Error("보고서의 고정 섹션 제목이 없거나 순서가 다릅니다.");
  }
  if (text.includes("](")) {
    throw new Error("보고서에 링크 문법이 포함되어 있습니다.");
  }
  if (text.includes("|---")) {
    throw new Error("보고서에 표 문법이 포함되어 있습니다.");
  }
}

async function main(): Promise<void> {
  if (process.env.SLIPSCAN_TEST_MODE === "1") {
    throw new Error(
      "SLIPSCAN_TEST_MODE=1에서는 실제 Claude 호출 확인을 실행할 수 없습니다.",
    );
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY가 필요합니다.");
  }

  const input = buildReportInput(REPORT_MONTH, buildSeedRows());
  assertSeedSummary(input);

  const startedAt = performance.now();
  const report = await streamReport(input, {
    jobId: randomUUID(),
    onText: (chunk) => process.stdout.write(chunk),
  });
  const elapsedSeconds = (performance.now() - startedAt) / 1_000;

  assertReport(report.text, report.stopReason);
  console.log(
    JSON.stringify({
      elapsedSeconds: Number(elapsedSeconds.toFixed(3)),
      model: report.model,
    }),
  );
}

main().catch((error: unknown) => {
  if (error instanceof Anthropic.APIError) {
    console.error(JSON.stringify({ error: error.name, status: error.status }));
  } else {
    console.error(error instanceof Error ? error.message : "보고서 확인 실패");
  }
  process.exitCode = 1;
});
