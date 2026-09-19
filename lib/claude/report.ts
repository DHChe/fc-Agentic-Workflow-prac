import Anthropic from "@anthropic-ai/sdk";

import { CATEGORY_LABELS, type CategoryKey } from "@/lib/categories";
import { formatAmount, formatDateTime, formatRatio } from "@/lib/format";
import { MESSAGES } from "@/lib/messages";
import {
  aggregateMonth,
  isValidMonth,
  monthRange,
  seoulDateKey,
} from "@/lib/stats/aggregate";

import { getClaudeClient, getModel, isTestMode } from "./client";
import { REPORT_OK_CHUNKS } from "./fixtures";
import { REPORT_SYSTEM_PROMPT } from "./prompts/report";

export { REPORT_SECTION_TITLES } from "./report-sections";

const TEST_CHUNK_DELAY_MS = 50;
const STALE_REPORT_MILLISECONDS = 10 * 60 * 1_000;

export const UNKNOWN_MERCHANT = "가맹점 미인식";

export type ReportRow = {
  transactedAt: Date;
  merchantName: string | null;
  totalAmount: number;
  category: CategoryKey;
  cardLast4: string | null;
};

function errorStatus(error: unknown): number | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }

  return undefined;
}

export function parseReportRequest(
  body: unknown,
): { month: string } | null {
  if (typeof body !== "object" || body === null || !("month" in body)) {
    return null;
  }

  const { month } = body;

  return typeof month === "string" && isValidMonth(month) ? { month } : null;
}

export function toReportErrorResponse(
  error: unknown,
): { status: 502 | 500; error: string } {
  const status = errorStatus(error);

  if (
    error instanceof Anthropic.RateLimitError ||
    error instanceof Anthropic.APIConnectionError ||
    error instanceof Anthropic.APIConnectionTimeoutError ||
    status === 429 ||
    (status !== undefined && status >= 500)
  ) {
    return { status: 502, error: MESSAGES.api.upstream };
  }

  return { status: 500, error: MESSAGES.api.internal };
}

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
  const categories = stats.categories
    .filter((category) => category.amount !== 0)
    .map((category) => ({
      ...category,
      label: CATEGORY_LABELS[category.key],
      // 프롬프트가 숫자를 그대로 인용하라고 하므로 화면과 같은 표시 문자열로 넘긴다.
      ratio: formatRatio(category.ratio),
    }));
  // 아래 거래 목록은 rows의 거래일 오름차순을 그대로 쓰므로 정렬이 원본을 건드리면 안 된다.
  const top5 = [...rows]
    // 취소·환불(음수)은 지출이 아니므로 "큰 지출 상위 5건"에서 뺀다. 합계·건수에는 남는다(ADR-20).
    .filter((row) => row.totalAmount > 0)
    .sort(
      (left, right) =>
        right.totalAmount - left.totalAmount ||
        left.transactedAt.getTime() - right.transactedAt.getTime(),
    )
    .slice(0, 5)
    .map((row) => ({
      date: seoulDateKey(row.transactedAt),
      merchant: row.merchantName ?? UNKNOWN_MERCHANT,
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
      `가맹점: ${row.merchantName ?? UNKNOWN_MERCHANT}`,
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

// 잘린 반쪽 보고서를 completed로 저장하지 않는다(5.3). end_turn이 아니면 generating으로
// 남고 expireStaleReports가 abandoned로 바꾼다.
export function shouldSaveReport(
  stopReason: string | null | undefined,
): boolean {
  return stopReason === "end_turn";
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
  // 스트림이 중간에 던져도 usage를 남긴다(7.1 비용 추적). message_delta의 누적 토큰 수는
  // 해당 없는 항목이 null로 오므로 직접 합치지 않고 SDK가 모아 둔 스냅샷을 받아 쓴다.
  let usage: Anthropic.Usage | undefined;
  let stopReason: Anthropic.StopReason | null = null;

  stream.on("streamEvent", (_event, snapshot) => {
    usage = snapshot.usage;
    stopReason = snapshot.stop_reason;
  });

  try {
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
    usage = final.usage;
    stopReason = final.stop_reason;

    return {
      text: chunks.join(""),
      stopReason,
      model,
    };
  } finally {
    console.log(
      JSON.stringify({
        jobId: opts.jobId,
        step: "report",
        stop_reason: stopReason,
        usage: usage ?? null,
      }),
    );
  }
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
