import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { del, put } from "@vercel/blob";
import { and, count, eq } from "drizzle-orm";

import { REPORT_SECTION_TITLES } from "@/lib/claude/report";
import { CATEGORY_LABELS, type CategoryKey } from "@/lib/categories";
import { getDb } from "@/lib/db/client";
import {
  documents,
  reports,
  transactions,
  usageLog,
} from "@/lib/db/schema";
import { formatAmount, formatDate, formatRatio } from "@/lib/format";
import { aggregateMonth, monthRange } from "@/lib/stats/aggregate";

import { SEED_DOCUMENTS } from "./seed-data";

const MODEL = "claude-opus-5";
const REPORT_ID = "30000000-0000-4000-8000-000000000001";
const REPORT_MONTH = "2026-08" as const;
const REPORT_CREATED_AT = new Date("2026-09-01T09:00:00+09:00");
const REPORT_COMPLETED_AT = new Date(
  REPORT_CREATED_AT.getTime() + 20_000,
);

export type SeedPlan = {
  documents: Array<{
    id: string;
    userId: string;
    docType: "receipt" | "statement";
    blobPathname: string;
    assetFile: string;
    uploadedAt: Date;
    processedAt: Date;
  }>;
  transactions: Array<{
    id: string;
    documentId: string;
    userId: string;
    transactedAt: Date;
    dateEstimated: boolean;
    merchantName: string | null;
    totalAmount: number | null;
    cardLast4: string | null;
    category: CategoryKey;
    isDuplicate: boolean;
    duplicateOf: string | null;
    createdAt: Date;
  }>;
  report: {
    id: string;
    userId: string;
    month: "2026-08";
    contentMd: string;
    createdAt: Date;
    completedAt: Date;
  };
};

type SeedReportRow = {
  transactedAt: Date;
  merchantName: string | null;
  totalAmount: number;
  category: CategoryKey;
};

export function buildSeedReport(augustRows: SeedReportRow[]): string {
  const stats = aggregateMonth(
    augustRows.map((row) => ({
      totalAmount: row.totalAmount,
      isDuplicate: false,
      category: row.category,
    })),
  );
  const categories = stats.categories.filter(
    (category) => category.amount !== 0,
  );
  const top5 = [...augustRows]
    .sort(
      (left, right) =>
        right.totalAmount - left.totalAmount ||
        left.transactedAt.getTime() - right.transactedAt.getTime(),
    )
    .slice(0, 5);
  const largestCategory = categories[0];
  const largestTransaction = top5[0];
  const refunds = augustRows.filter((row) => row.totalAmount < 0);
  const refundTotal = refunds.reduce(
    (total, transaction) => total + transaction.totalAmount,
    0,
  );

  const categoryLines = categories.map(
    (category) =>
      `- ${CATEGORY_LABELS[category.key]}: ${formatAmount(category.amount)}, ${formatRatio(category.ratio)}`,
  );
  const top5Lines = top5.map(
    (transaction) =>
      `- ${formatDate(transaction.transactedAt)} ${transaction.merchantName ?? "가맹점 미인식"}: ${formatAmount(transaction.totalAmount)} · ${CATEGORY_LABELS[transaction.category]}`,
  );
  const observations = [
    largestCategory
      ? `- 가장 큰 카테고리는 ${CATEGORY_LABELS[largestCategory.key]}이며 ${formatAmount(largestCategory.amount)}으로 전체의 ${formatRatio(largestCategory.ratio)}입니다.`
      : "- 집계된 카테고리가 없습니다.",
    largestTransaction
      ? `- 가장 큰 지출은 ${largestTransaction.merchantName ?? "가맹점 미인식"}의 ${formatAmount(largestTransaction.totalAmount)}입니다.`
      : "- 집계된 거래가 없습니다.",
    refunds.length > 0
      ? `- 취소·환불 ${refunds.length}건, ${formatAmount(refundTotal)}이 순지출에 반영되었습니다.`
      : "- 취소·환불 거래는 없습니다.",
  ];

  return [
    `## ${REPORT_SECTION_TITLES[0]}`,
    "",
    `2026년 8월 총 지출액은 ${formatAmount(stats.total)}이며 거래는 ${stats.count}건입니다.`,
    "집계 대상 거래만 반영했습니다.",
    "",
    `## ${REPORT_SECTION_TITLES[1]}`,
    "",
    ...categoryLines,
    "",
    `## ${REPORT_SECTION_TITLES[2]}`,
    "",
    ...top5Lines,
    "",
    `## ${REPORT_SECTION_TITLES[3]}`,
    "",
    ...observations,
    "",
    `## ${REPORT_SECTION_TITLES[4]}`,
    "",
    largestCategory
      ? `2026년 8월에는 ${stats.count}건, 총 ${formatAmount(stats.total)}이 집계되었습니다. ${CATEGORY_LABELS[largestCategory.key]} 지출이 가장 큰 비중을 차지했으며, 취소·환불을 포함한 순지출 기준입니다.`
      : "2026년 8월에는 집계할 거래가 없습니다.",
    "",
  ].join("\n");
}

export function planSeed(
  seedDocuments: typeof SEED_DOCUMENTS,
  demoUserId: string,
): SeedPlan {
  const duplicateSource = seedDocuments[6]?.transactions.find(
    (transaction) =>
      transaction.merchantName === "스타벅스 선릉로점" &&
      transaction.totalAmount === 23_000,
  );

  if (!duplicateSource) {
    throw new Error("시드 중복 원본 거래를 찾을 수 없습니다.");
  }

  const plannedDocuments = seedDocuments.map((document) => {
    const uploadedAt = new Date(document.uploadedAt);

    return {
      id: document.id,
      userId: demoUserId,
      docType: document.docType,
      blobPathname: `${demoUserId}/${document.id}.jpg`,
      assetFile: document.assetFile,
      uploadedAt,
      processedAt: new Date(uploadedAt.getTime() + 60_000),
    };
  });
  const plannedTransactions = seedDocuments.flatMap(
    (document, documentIndex) => {
      const uploadedAt = new Date(document.uploadedAt);

      return document.transactions.map((transaction, transactionIndex) => {
        const isDuplicate =
          documentIndex === 7 && transactionIndex === 0;

        return {
          id: transaction.id,
          documentId: document.id,
          userId: demoUserId,
          transactedAt: new Date(transaction.transactedAt),
          dateEstimated: transaction.dateEstimated,
          merchantName: transaction.merchantName,
          totalAmount: transaction.totalAmount,
          cardLast4: transaction.cardLast4,
          category: transaction.category,
          isDuplicate,
          duplicateOf: isDuplicate ? duplicateSource.id : null,
          createdAt: new Date(
            uploadedAt.getTime() + (transactionIndex + 1) * 1_000,
          ),
        };
      });
    },
  );
  const { start, end } = monthRange(REPORT_MONTH);
  const augustRows = plannedTransactions
    .filter(
      (transaction) =>
        transaction.transactedAt >= start &&
        transaction.transactedAt < end &&
        !transaction.isDuplicate &&
        transaction.totalAmount !== null,
    )
    .map((transaction) => ({
      transactedAt: transaction.transactedAt,
      merchantName: transaction.merchantName,
      totalAmount: transaction.totalAmount as number,
      category: transaction.category,
    }));

  return {
    documents: plannedDocuments,
    transactions: plannedTransactions,
    report: {
      id: REPORT_ID,
      userId: demoUserId,
      month: REPORT_MONTH,
      contentMd: buildSeedReport(augustRows),
      createdAt: new Date(REPORT_CREATED_AT),
      completedAt: new Date(REPORT_COMPLETED_AT),
    },
  };
}

function loadEnvironment(): void {
  const demoUserIdWasProvided = Object.hasOwn(process.env, "DEMO_USER_ID");
  const providedDemoUserId = process.env.DEMO_USER_ID;

  if (existsSync(".env.local")) {
    process.loadEnvFile(".env.local");
  }

  if (demoUserIdWasProvided) {
    process.env.DEMO_USER_ID = providedDemoUserId ?? "";
  }
}

function requireEnvironment(): {
  demoUserId: string;
  databaseUrl: string;
} {
  const demoUserId = process.env.DEMO_USER_ID;
  if (!demoUserId) {
    throw new Error("DEMO_USER_ID가 비어 있습니다.");
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL이 비어 있습니다.");
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN이 비어 있습니다.");
  }

  return { demoUserId, databaseUrl };
}

async function countUsage(demoUserId: string): Promise<number> {
  const [result] = await getDb()
    .select({ value: count() })
    .from(usageLog)
    .where(eq(usageLog.userId, demoUserId));

  return result?.value ?? 0;
}

async function verifySeed(demoUserId: string): Promise<void> {
  const db = getDb();
  const [documentCount, transactionCount, duplicateCount, estimatedCount, reportCount] =
    await Promise.all([
      db
        .select({ value: count() })
        .from(documents)
        .where(eq(documents.userId, demoUserId)),
      db
        .select({ value: count() })
        .from(transactions)
        .where(eq(transactions.userId, demoUserId)),
      db
        .select({ value: count() })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, demoUserId),
            eq(transactions.isDuplicate, true),
          ),
        ),
      db
        .select({ value: count() })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, demoUserId),
            eq(transactions.dateEstimated, true),
          ),
        ),
      db
        .select({ value: count() })
        .from(reports)
        .where(
          and(
            eq(reports.userId, demoUserId),
            eq(reports.month, REPORT_MONTH),
            eq(reports.status, "completed"),
          ),
        ),
    ]);
  const actual = {
    documents: documentCount[0]?.value ?? 0,
    transactions: transactionCount[0]?.value ?? 0,
    duplicates: duplicateCount[0]?.value ?? 0,
    estimated: estimatedCount[0]?.value ?? 0,
    reports: reportCount[0]?.value ?? 0,
  };
  const expected = {
    documents: 10,
    transactions: 14,
    duplicates: 1,
    estimated: 1,
    reports: 1,
  };

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`시드 검증 실패: ${JSON.stringify(actual)}`);
  }

  console.log("시드 검증을 통과했습니다.");
}

async function seedDemo(demoUserId: string, databaseUrl: string): Promise<void> {
  const dbHost = new URL(databaseUrl).hostname;
  console.log(`대상 DB 호스트: ${dbHost}`);
  console.log(`대상 user id 끝 6자: ${demoUserId.slice(-6)}`);

  const db = getDb();
  const oldDocuments = await db
    .select({ originalUrl: documents.originalUrl })
    .from(documents)
    .where(eq(documents.userId, demoUserId));

  await db.transaction(async (tx) => {
    await tx.delete(documents).where(eq(documents.userId, demoUserId));
    await tx.delete(reports).where(eq(reports.userId, demoUserId));
  });

  if (oldDocuments.length > 0) {
    try {
      await del(oldDocuments.map((document) => document.originalUrl));
    } catch {
      console.error("기존 시연 계정 Blob 삭제에 실패했습니다.");
    }
  }

  const plan = planSeed(SEED_DOCUMENTS, demoUserId);
  const uploadedUrls = new Map<string, string>();

  for (const document of plan.documents) {
    const body = await readFile(resolve(document.assetFile));
    const blob = await put(document.blobPathname, body, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "image/jpeg",
    });
    uploadedUrls.set(document.id, blob.url);
  }

  await db.transaction(async (tx) => {
    await tx.insert(documents).values(
      plan.documents.map((document) => ({
        id: document.id,
        userId: document.userId,
        docType: document.docType,
        status: "completed" as const,
        failureReason: null,
        originalUrl: uploadedUrls.get(document.id)!,
        originalMime: "image/jpeg",
        pageCount: null,
        modelUsed: MODEL,
        uploadedAt: document.uploadedAt,
        processedAt: document.processedAt,
      })),
    );
    await tx.insert(transactions).values(plan.transactions);
    await tx.insert(reports).values({
      id: plan.report.id,
      userId: plan.report.userId,
      month: plan.report.month,
      status: "completed",
      contentMd: plan.report.contentMd,
      modelUsed: MODEL,
      createdAt: plan.report.createdAt,
      completedAt: plan.report.completedAt,
    });
  });

  console.log("시연 데이터 시드를 완료했습니다.");
}

async function main(): Promise<void> {
  loadEnvironment();
  const { demoUserId, databaseUrl } = requireEnvironment();
  const [mode, ...extraArgs] = process.argv.slice(2);

  if (extraArgs.length > 0 || (mode && !["--verify", "--usage-count"].includes(mode))) {
    throw new Error(
      "사용법: npx tsx scripts/seed-demo.ts [--verify|--usage-count]",
    );
  }

  if (mode === "--usage-count") {
    console.log(await countUsage(demoUserId));
    return;
  }
  if (mode === "--verify") {
    await verifySeed(demoUserId);
    return;
  }

  await seedDemo(demoUserId, databaseUrl);
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isDirectExecution) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "시드 실행에 실패했습니다.");
    process.exitCode = 1;
  });
}
