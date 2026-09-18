import { CATEGORY_LABELS, type CategoryKey } from "@/lib/categories";
import { formatAmount, formatDateTime } from "@/lib/format";
import { MESSAGES } from "@/lib/messages";
import {
  aggregateMonth,
  monthRange,
  seoulDateKey,
} from "@/lib/stats/aggregate";

import { getClaudeClient, getModel, isTestMode } from "./client";
import { REPORT_OK_CHUNKS } from "./fixtures";
import { REPORT_SYSTEM_PROMPT } from "./prompts/report";

const TEST_CHUNK_DELAY_MS = 50;
const STALE_REPORT_MILLISECONDS = 10 * 60 * 1_000;

export const REPORT_SECTION_TITLES = [
  "1. 기간 총 지출액과 거래 건수",
  "2. 카테고리별 금액·비율",
  "3. 큰 지출 상위 5건",
  "4. 눈에 띄는 점",
  "5. 한 문단 총평",
] as const;

export type ReportRow = {
  transactedAt: Date;
  merchantName: string | null;
  totalAmount: number;
  category: CategoryKey;
  cardLast4: string | null;
};

type ReportInput = {
  summaryJson: string;
  transactionsBlock: string;
};

export function buildReportInput(
  month: string,
  rows: ReportRow[],
): ReportInput {
  const stats = aggregateMonth(
    rows.map((row) => ({
      totalAmount: row.totalAmount,
      isDuplicate: false,
      category: row.category,
    })),
  );
  const categories = stats.categories.map((category) => ({
    ...category,
    label: CATEGORY_LABELS[category.key],
  }));
  const top5 = [...rows]
    .sort(
      (left, right) =>
        right.totalAmount - left.totalAmount ||
        left.transactedAt.getTime() - right.transactedAt.getTime(),
    )
    .slice(0, 5)
    .map((row) => ({
      date: seoulDateKey(row.transactedAt),
      merchant: row.merchantName ?? MESSAGES.label.placeholder,
      amount: row.totalAmount,
      category: CATEGORY_LABELS[row.category],
    }));
  const summaryJson = JSON.stringify({
    month,
    total: stats.total,
    count: stats.count,
    categories,
    top5,
  });
  const transactionLines = rows.map((row) =>
    [
      `날짜·시각: ${formatDateTime(row.transactedAt)}`,
      `가맹점: ${row.merchantName ?? MESSAGES.label.placeholder}`,
      `금액: ${formatAmount(row.totalAmount)}`,
      `카테고리: ${CATEGORY_LABELS[row.category]}`,
      `카드 끝4: ${row.cardLast4 ?? MESSAGES.label.placeholder}`,
    ].join("; "),
  );

  return {
    summaryJson,
    transactionsBlock: [
      "<transactions>",
      ...transactionLines,
      "</transactions>",
    ].join("\n"),
  };
}

async function waitForNextTestChunk(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, TEST_CHUNK_DELAY_MS));
}

export async function streamReport(
  input: ReturnType<typeof buildReportInput>,
  opts: { jobId: string; onText: (chunk: string) => void },
): Promise<{ text: string; stopReason: string | null; model: string }> {
  if (isTestMode()) {
    for (const [index, chunk] of REPORT_OK_CHUNKS.entries()) {
      opts.onText(chunk);
      if (index < REPORT_OK_CHUNKS.length - 1) {
        await waitForNextTestChunk();
      }
    }

    return {
      text: REPORT_OK_CHUNKS.join(""),
      stopReason: "end_turn",
      model: "test-fixture",
    };
  }

  const model = getModel();
  const stream = getClaudeClient().messages.stream({
    model,
    max_tokens: 64_000,
    system: REPORT_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          "집계 요약 JSON:",
          input.summaryJson,
          "",
          "거래 목록:",
          input.transactionsBlock,
          "",
          "위 입력만 사용해 지정된 다섯 섹션의 월간 보고서를 작성하세요.",
        ].join("\n"),
      },
    ],
  });
  const chunks: string[] = [];

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      chunks.push(event.delta.text);
      opts.onText(event.delta.text);
    }
  }

  const final = await stream.finalMessage();

  console.log(
    JSON.stringify({
      jobId: opts.jobId,
      step: "report",
      stop_reason: final.stop_reason,
      usage: final.usage,
    }),
  );

  return {
    text: chunks.join(""),
    stopReason: final.stop_reason,
    model,
  };
}

export async function getReportRows(
  userId: string,
  month: string,
): Promise<ReportRow[]> {
  const [
    { and, asc, eq, gte, isNotNull, lt },
    { getDb },
    { transactions },
  ] = await Promise.all([
    import("drizzle-orm"),
    import("@/lib/db/client"),
    import("@/lib/db/schema"),
  ]);
  const { start, end } = monthRange(month);
  const rows = await getDb()
    .select({
      transactedAt: transactions.transactedAt,
      merchantName: transactions.merchantName,
      totalAmount: transactions.totalAmount,
      category: transactions.category,
      cardLast4: transactions.cardLast4,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        gte(transactions.transactedAt, start),
        lt(transactions.transactedAt, end),
        eq(transactions.isDuplicate, false),
        isNotNull(transactions.totalAmount),
      ),
    )
    .orderBy(asc(transactions.transactedAt));

  return rows.map((row) => ({
    ...row,
    totalAmount: row.totalAmount as number,
  }));
}

export async function expireStaleReports(
  userId: string,
  now: Date,
): Promise<void> {
  const [{ and, eq, lt }, { getDb }, { reports }] = await Promise.all([
    import("drizzle-orm"),
    import("@/lib/db/client"),
    import("@/lib/db/schema"),
  ]);
  const cutoff = new Date(now.getTime() - STALE_REPORT_MILLISECONDS);

  await getDb()
    .update(reports)
    .set({ status: "abandoned" })
    .where(
      and(
        eq(reports.userId, userId),
        eq(reports.status, "generating"),
        lt(reports.createdAt, cutoff),
      ),
    );
}
