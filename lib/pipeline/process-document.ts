import Anthropic from "@anthropic-ai/sdk";
import { and, eq, inArray, lt } from "drizzle-orm";
import { ZodError } from "zod";

import type { CategoryKey } from "@/lib/categories";
import {
  extractDocument,
  ExtractionError,
  type ExtractInput,
} from "@/lib/claude/extract";
import { isTestMode } from "@/lib/claude/client";
import {
  cleanCardLast4,
  type ExtractionResult,
} from "@/lib/claude/schemas";
import { getDb } from "@/lib/db/client";
import { documents, transactions } from "@/lib/db/schema";
import { MESSAGES, type FailureCode } from "@/lib/messages";
import { parseTransactedAt, seoulDateKey } from "@/lib/stats/aggregate";

import { markDuplicates } from "./duplicates";
import { toAnalysisJpeg } from "./image";
import { inspectPdf, MAX_PDF_PAGES } from "./pdf";

export const PROCESSING_TIMEOUT_MS = 600_000;

type TransactionRow = {
  documentId: string;
  userId: string;
  transactedAt: Date;
  dateEstimated: boolean;
  merchantName: string | null;
  totalAmount: number | null;
  cardLast4: string | null;
  category: CategoryKey;
};

const FAILURE_CODES = new Set<FailureCode>(
  Object.keys(MESSAGES.failure) as FailureCode[],
);

function isFailureCode(value: unknown): value is FailureCode {
  return typeof value === "string" && FAILURE_CODES.has(value as FailureCode);
}

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

function logPipelineEvent(
  documentId: string,
  step: string,
  externalStatus?: number,
): void {
  console.error(
    JSON.stringify({
      jobId: documentId,
      step,
      ...(externalStatus === undefined ? {} : { external_status: externalStatus }),
    }),
  );
}

function isPdf(originalMime: string, originalUrl: string): boolean {
  if (originalMime === "application/pdf") {
    return true;
  }

  if (originalMime.startsWith("image/")) {
    return false;
  }

  return new URL(originalUrl).pathname.toLowerCase().endsWith(".pdf");
}

export function isTimedOut(uploadedAt: Date, now: Date): boolean {
  return now.getTime() - uploadedAt.getTime() > PROCESSING_TIMEOUT_MS;
}

export function toFailureCode(error: unknown): FailureCode {
  if (error instanceof ExtractionError) {
    return error.code;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    isFailureCode(error.code)
  ) {
    return error.code;
  }

  if (
    error instanceof Anthropic.BadRequestError ||
    errorStatus(error) === 400
  ) {
    return "unreadable";
  }

  const status = errorStatus(error);
  if (
    error instanceof Anthropic.RateLimitError ||
    error instanceof Anthropic.APIConnectionError ||
    error instanceof Anthropic.APIConnectionTimeoutError ||
    status === 429 ||
    (status !== undefined && status >= 500)
  ) {
    return "upstream";
  }

  if (error instanceof ZodError) {
    return "unparsable";
  }

  return "unknown";
}

export function toTransactionRows(
  result: ExtractionResult,
  context: { documentId: string; userId: string; uploadedAt: Date },
): TransactionRow[] {
  if (result.docType === "other") {
    return [];
  }

  return result.transactions.map((transaction) => {
    const parsedDate = parseTransactedAt(
      transaction.transactedAt,
      context.uploadedAt,
    );

    return {
      documentId: context.documentId,
      userId: context.userId,
      transactedAt: parsedDate.transactedAt,
      dateEstimated: parsedDate.dateEstimated,
      merchantName: transaction.merchantName,
      totalAmount: transaction.totalAmount,
      cardLast4: cleanCardLast4(transaction.cardLast4),
      category: transaction.category,
    };
  });
}

export async function expireStaleDocuments(
  userId: string,
  now: Date,
): Promise<void> {
  const cutoff = new Date(now.getTime() - PROCESSING_TIMEOUT_MS);

  await getDb().transaction(async (tx) => {
    const staleDocuments = await tx
      .update(documents)
      .set({
        status: "failed",
        failureReason: MESSAGES.failure.timedOut,
        processedAt: now,
      })
      .where(
        and(
          eq(documents.userId, userId),
          eq(documents.status, "processing"),
          lt(documents.uploadedAt, cutoff),
        ),
      )
      .returning({ id: documents.id });

    if (staleDocuments.length === 0) {
      return;
    }

    await tx.delete(transactions).where(
      and(
        eq(transactions.userId, userId),
        inArray(
          transactions.documentId,
          staleDocuments.map(({ id }) => id),
        ),
      ),
    );
  });
}

export async function processDocument(
  documentId: string,
  opts: { fileName: string },
): Promise<void> {
  // 전제: documentId는 서버가 방금 만든 값이고 호출자는
  // app/api/documents/route.ts 한 곳뿐이다. 그래서 아래 조회에만
  // user_id 조건이 없다. 다른 곳에서 부르게 되면 user_id 조건을 먼저 넣어라.

  let userId: string | null = null;
  let pageCount: number | null = null;

  try {
    const db = getDb();
    const [document] = await db
      .select({
        id: documents.id,
        userId: documents.userId,
        status: documents.status,
        originalUrl: documents.originalUrl,
        originalMime: documents.originalMime,
        uploadedAt: documents.uploadedAt,
      })
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);

    if (!document || document.status !== "processing") {
      return;
    }

    userId = document.userId;
    let input: ExtractInput | null = null;

    if (!isTestMode()) {
      let response: Response;

      try {
        response = await fetch(document.originalUrl);
      } catch {
        throw new ExtractionError("unreadable");
      }

      if (!response.ok) {
        logPipelineEvent(documentId, "download", response.status);
        throw new ExtractionError("unreadable");
      }

      let original: Buffer;

      try {
        original = Buffer.from(await response.arrayBuffer());
      } catch {
        throw new ExtractionError("unreadable");
      }

      if (isPdf(document.originalMime, document.originalUrl)) {
        const inspection = await inspectPdf(original);

        if (!inspection.ok) {
          throw new ExtractionError(inspection.code);
        }

        pageCount = inspection.pageCount;
        if (pageCount > MAX_PDF_PAGES) {
          throw new ExtractionError("tooManyPages");
        }

        input = { kind: "pdf", pdf: original };
      } else {
        try {
          input = { kind: "image", jpeg: await toAnalysisJpeg(original) };
        } catch {
          throw new ExtractionError("unreadable");
        }
      }
    }

    const extracted = await extractDocument(input, {
      fileName: opts.fileName,
      today: seoulDateKey(new Date()),
      jobId: documentId,
    });
    const rows = toTransactionRows(extracted.result, {
      documentId,
      userId: document.userId,
      uploadedAt: document.uploadedAt,
    });
    const processedAt = new Date();

    await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ id: documents.id })
        .from(documents)
        .where(
          and(
            eq(documents.id, documentId),
            eq(documents.userId, document.userId),
            eq(documents.status, "processing"),
          ),
        )
        .for("update");

      if (!current) {
        logPipelineEvent(documentId, "complete_skipped");
        return;
      }

      await tx
        .delete(transactions)
        .where(
          and(
            eq(transactions.documentId, documentId),
            eq(transactions.userId, document.userId),
          ),
        );

      if (rows.length > 0) {
        await tx.insert(transactions).values(rows);
      }

      await markDuplicates(tx, document.userId, documentId);

      await tx
        .update(documents)
        .set({
          status: "completed",
          failureReason: null,
          docType: extracted.result.docType,
          pageCount,
          modelUsed: extracted.model,
          processedAt,
        })
        .where(
          and(
            eq(documents.id, documentId),
            eq(documents.userId, document.userId),
            eq(documents.status, "processing"),
          ),
        );
    });
  } catch (error) {
    logPipelineEvent(documentId, "process_failed", errorStatus(error));

    if (userId === null) {
      return;
    }

    try {
      const code = toFailureCode(error);
      const ownerId = userId;

      await getDb().transaction(async (tx) => {
        const failedDocuments = await tx
          .update(documents)
          .set({
            status: "failed",
            failureReason: MESSAGES.failure[code],
            pageCount,
            processedAt: new Date(),
          })
          .where(
            and(
              eq(documents.id, documentId),
              eq(documents.userId, ownerId),
              eq(documents.status, "processing"),
            ),
          )
          .returning({ id: documents.id });

        if (failedDocuments.length === 0) {
          return;
        }

        await tx
          .delete(transactions)
          .where(
            and(
              eq(transactions.documentId, documentId),
              eq(transactions.userId, ownerId),
            ),
          );
      });
    } catch {
      logPipelineEvent(documentId, "record_failure");
    }
  }
}
