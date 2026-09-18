import { auth } from "@clerk/nextjs/server";
import { desc, eq } from "drizzle-orm";

import type { DashboardResponse } from "@/lib/api-types";
import { getDb } from "@/lib/db/client";
import { documents, transactions } from "@/lib/db/schema";
import { MESSAGES } from "@/lib/messages";
import { expireStaleDocuments } from "@/lib/pipeline/process-document";
import {
  getDefaultMonth,
  getMonthStats,
  isValidMonth,
} from "@/lib/stats/aggregate";
import { summarizeDocument } from "@/lib/stats/document-summary";
import { countTodayUsage, DAILY_LIMIT } from "@/lib/usage/limit";

export async function GET(request: Request): Promise<Response> {
  try {
    const { userId } = await auth();

    if (!userId) {
      return Response.json(
        { error: MESSAGES.api.unauthorized },
        { status: 401 },
      );
    }

    const requestedMonth = new URL(request.url).searchParams.get("month");

    if (requestedMonth !== null && !isValidMonth(requestedMonth)) {
      return Response.json(
        { error: MESSAGES.api.badRequest },
        { status: 400 },
      );
    }

    const now = new Date();
    await expireStaleDocuments(userId, now);

    const month = requestedMonth ?? (await getDefaultMonth(userId, now));
    const db = getDb();
    const [used, stats, documentRows, transactionRows] = await Promise.all([
      countTodayUsage(userId, now),
      getMonthStats(userId, month),
      db
        .select({
          id: documents.id,
          docType: documents.docType,
          status: documents.status,
          failureReason: documents.failureReason,
          uploadedAt: documents.uploadedAt,
        })
        .from(documents)
        .where(eq(documents.userId, userId))
        .orderBy(desc(documents.uploadedAt), desc(documents.id)),
      db
        .select({
          documentId: transactions.documentId,
          totalAmount: transactions.totalAmount,
        })
        .from(transactions)
        .where(eq(transactions.userId, userId)),
    ]);
    const amountsByDocument = new Map<string, Array<number | null>>();

    for (const transaction of transactionRows) {
      const amounts = amountsByDocument.get(transaction.documentId) ?? [];
      amounts.push(transaction.totalAmount);
      amountsByDocument.set(transaction.documentId, amounts);
    }

    const response: DashboardResponse = {
      month,
      usage: { used, limit: DAILY_LIMIT },
      stats,
      documents: documentRows.map((document) => ({
        id: document.id,
        docType: document.docType,
        status: document.status,
        failureReason: document.failureReason,
        ...summarizeDocument(
          document.status,
          amountsByDocument.get(document.id) ?? [],
        ),
        uploadedAt: document.uploadedAt.toISOString(),
      })),
    };

    return Response.json(response);
  } catch (error) {
    console.error("dashboard-get", { step: "get-dashboard", error });

    return Response.json(
      { error: MESSAGES.api.internal },
      { status: 500 },
    );
  }
}
