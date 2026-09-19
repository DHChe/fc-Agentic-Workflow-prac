import { auth } from "@clerk/nextjs/server";
import { del } from "@vercel/blob";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { DocumentDetailResponse } from "@/lib/api-types";
import { isTestMode } from "@/lib/claude/client";
import { getDb } from "@/lib/db/client";
import { documents, transactions } from "@/lib/db/schema";
import { MESSAGES } from "@/lib/messages";
import { findDuplicatesToRevert } from "@/lib/pipeline/duplicates";
import { expireStaleDocuments } from "@/lib/pipeline/process-document";
import { summarizeDocument } from "@/lib/stats/document-summary";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const originalTransactions = alias(transactions, "original_transactions");

class DocumentNotFoundError extends Error {}

function documentNotFound(): Response {
  return Response.json(
    { error: MESSAGES.api.documentNotFound },
    { status: 404 },
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { userId } = await auth();

    if (!userId) {
      return Response.json(
        { error: MESSAGES.api.unauthorized },
        { status: 401 },
      );
    }

    const { id } = await params;

    if (!UUID_PATTERN.test(id)) {
      return documentNotFound();
    }

    await expireStaleDocuments(userId, new Date());

    const db = getDb();
    const [document] = await db
      .select({
        id: documents.id,
        docType: documents.docType,
        status: documents.status,
        failureReason: documents.failureReason,
        originalUrl: documents.originalUrl,
        originalMime: documents.originalMime,
        modelUsed: documents.modelUsed,
        uploadedAt: documents.uploadedAt,
        processedAt: documents.processedAt,
      })
      .from(documents)
      .where(and(eq(documents.id, id), eq(documents.userId, userId)))
      .limit(1);

    if (!document) {
      return documentNotFound();
    }

    const transactionRows = await db
      .select({
        id: transactions.id,
        transactedAt: transactions.transactedAt,
        dateEstimated: transactions.dateEstimated,
        merchantName: transactions.merchantName,
        totalAmount: transactions.totalAmount,
        cardLast4: transactions.cardLast4,
        category: transactions.category,
        isDuplicate: transactions.isDuplicate,
        duplicateOfDocumentId: originalTransactions.documentId,
      })
      .from(transactions)
      .leftJoin(
        originalTransactions,
        and(
          eq(transactions.duplicateOf, originalTransactions.id),
          eq(originalTransactions.userId, userId),
        ),
      )
      .where(
        and(
          eq(transactions.documentId, id),
          eq(transactions.userId, userId),
        ),
      )
      .orderBy(asc(transactions.transactedAt), asc(transactions.id));
    const summary = summarizeDocument(
      document.status,
      transactionRows.map(({ totalAmount }) => totalAmount),
    );
    const response: DocumentDetailResponse = {
      id: document.id,
      docType: document.docType,
      status: document.status,
      failureReason: document.failureReason,
      originalUrl: document.originalUrl,
      originalMime: document.originalMime,
      modelUsed: document.modelUsed,
      uploadedAt: document.uploadedAt.toISOString(),
      processedAt: document.processedAt?.toISOString() ?? null,
      totalAmount: summary.totalAmount,
      transactions: transactionRows.map((transaction) => ({
        ...transaction,
        transactedAt: transaction.transactedAt.toISOString(),
      })),
    };

    return Response.json(response);
  } catch (error) {
    console.error("document-get", { step: "get-document", error });

    return Response.json(
      { error: MESSAGES.api.internal },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { userId } = await auth();

    if (!userId) {
      return Response.json(
        { error: MESSAGES.api.unauthorized },
        { status: 401 },
      );
    }

    const { id } = await params;

    if (!UUID_PATTERN.test(id)) {
      return documentNotFound();
    }

    let originalUrl: string;

    try {
      originalUrl = await getDb().transaction(async (tx) => {
        const [document] = await tx
          .select({ originalUrl: documents.originalUrl })
          .from(documents)
          .where(and(eq(documents.id, id), eq(documents.userId, userId)))
          .limit(1);

        if (!document) {
          throw new DocumentNotFoundError();
        }

        const documentTransactions = await tx
          .select({ id: transactions.id })
          .from(transactions)
          .where(
            and(
              eq(transactions.documentId, id),
              eq(transactions.userId, userId),
            ),
          );
        const transactionIds = documentTransactions.map(({ id }) => id);

        if (transactionIds.length > 0) {
          const markedDuplicates = await tx
            .select({
              id: transactions.id,
              documentId: transactions.documentId,
              duplicateOf: transactions.duplicateOf,
            })
            .from(transactions)
            .where(
              and(
                eq(transactions.userId, userId),
                ne(transactions.documentId, id),
                inArray(transactions.duplicateOf, transactionIds),
              ),
            );
          const revertIds = findDuplicatesToRevert(
            { documentId: id, transactionIds },
            markedDuplicates,
          );

          if (revertIds.length > 0) {
            await tx
              .update(transactions)
              .set({ isDuplicate: false, duplicateOf: null })
              .where(
                and(
                  eq(transactions.userId, userId),
                  inArray(transactions.id, revertIds),
                ),
              );
          }
        }

        await tx
          .delete(transactions)
          .where(
            and(
              eq(transactions.documentId, id),
              eq(transactions.userId, userId),
            ),
          );
        const deleted = await tx
          .delete(documents)
          .where(and(eq(documents.id, id), eq(documents.userId, userId)))
          .returning({ id: documents.id });

        if (deleted.length !== 1) {
          throw new DocumentNotFoundError();
        }

        return document.originalUrl;
      });
    } catch (error) {
      if (error instanceof DocumentNotFoundError) {
        return documentNotFound();
      }

      throw error;
    }

    if (!isTestMode()) {
      try {
        await del(originalUrl);
      } catch {
        console.error("document-delete-blob", {
          documentId: id,
          step: "delete-blob",
        });
      }
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("document-delete", { step: "delete-document", error });

    return Response.json(
      { error: MESSAGES.api.internal },
      { status: 500 },
    );
  }
}
