import { randomUUID } from "node:crypto";

import { auth } from "@clerk/nextjs/server";
import { and, desc, eq } from "drizzle-orm";

import { getModel } from "@/lib/claude/client";
import {
  buildReportInput,
  expireStaleReports,
  getReportRows,
  parseReportRequest,
  streamReport,
  toReportErrorResponse,
} from "@/lib/claude/report";
import { getDb } from "@/lib/db/client";
import { reports } from "@/lib/db/schema";
import { MESSAGES } from "@/lib/messages";
import { countReportableTransactions } from "@/lib/stats/aggregate";
import {
  countTodayUsage,
  DAILY_LIMIT,
  recordUsage,
} from "@/lib/usage/limit";

export const maxDuration = 300;

class EmptyReportStreamError extends Error {
  readonly status = 502;
}

function unauthorized(): Response {
  return Response.json(
    { error: MESSAGES.api.unauthorized },
    { status: 401 },
  );
}

function badRequest(): Response {
  return Response.json(
    { error: MESSAGES.api.badRequest },
    { status: 400 },
  );
}

export async function POST(request: Request): Promise<Response> {
  try {
    const { userId } = await auth();

    if (!userId) {
      return unauthorized();
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return badRequest();
    }

    const parsed = parseReportRequest(body);

    if (!parsed) {
      return badRequest();
    }

    const reportableCount = await countReportableTransactions(
      userId,
      parsed.month,
    );

    if (reportableCount < 1) {
      return badRequest();
    }

    const now = new Date();
    const used = await countTodayUsage(userId, now);

    if (used >= DAILY_LIMIT) {
      return Response.json(
        { error: MESSAGES.api.limitReached },
        { status: 429 },
      );
    }

    const reportId = randomUUID();
    const usageRecorded = await recordUsage({
      id: randomUUID(),
      userId,
      kind: "report",
    });

    if (!usageRecorded) {
      throw new Error("Report usage could not be recorded");
    }

    const db = getDb();
    await db.insert(reports).values({
      id: reportId,
      userId,
      month: parsed.month,
      status: "generating",
      modelUsed: getModel(),
    });

    const rows = await getReportRows(userId, parsed.month);
    const input = buildReportInput(parsed.month, rows);
    const encoder = new TextEncoder();
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    let firstChunkReceived = false;
    let resolveFirstChunk!: () => void;
    let rejectFirstChunk!: (error: unknown) => void;
    const firstChunk = new Promise<void>((resolve, reject) => {
      resolveFirstChunk = resolve;
      rejectFirstChunk = reject;
    });
    const responseBody = new ReadableStream<Uint8Array>({
      start(streamController) {
        controller = streamController;
      },
    });

    void (async () => {
      try {
        const result = await streamReport(input, {
          jobId: reportId,
          onText(chunk) {
            if (chunk.length === 0) {
              return;
            }

            try {
              controller?.enqueue(encoder.encode(chunk));
            } catch {
              // The browser may have left. Keep collecting so completion can
              // still be saved if the upstream stream reaches end_turn.
            }

            if (!firstChunkReceived) {
              firstChunkReceived = true;
              resolveFirstChunk();
            }
          },
        });

        if (!firstChunkReceived) {
          throw new EmptyReportStreamError("Report stream ended without text");
        }

        if (result.stopReason === "end_turn") {
          await db
            .update(reports)
            .set({
              contentMd: result.text,
              status: "completed",
              completedAt: new Date(),
            })
            .where(
              and(
                eq(reports.id, reportId),
                eq(reports.userId, userId),
                eq(reports.status, "generating"),
              ),
            );
        }
      } catch (error) {
        console.error("reports-generate", {
          jobId: reportId,
          step: "stream-report",
          error,
        });

        if (!firstChunkReceived) {
          rejectFirstChunk(error);
        }
      } finally {
        try {
          controller?.close();
        } catch {
          // The response stream may already be canceled by the browser.
        }
      }
    })();

    try {
      await firstChunk;
    } catch (error) {
      const response = toReportErrorResponse(error);

      return Response.json(
        { error: response.error },
        { status: response.status },
      );
    }

    return new Response(responseBody, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
        "X-Report-Id": reportId,
      },
    });
  } catch (error) {
    console.error("reports-post", { step: "create-report", error });

    return Response.json(
      { error: MESSAGES.api.internal },
      { status: 500 },
    );
  }
}

export async function GET(): Promise<Response> {
  try {
    const { userId } = await auth();

    if (!userId) {
      return unauthorized();
    }

    await expireStaleReports(userId, new Date());

    const rows = await getDb()
      .select({
        id: reports.id,
        month: reports.month,
        createdAt: reports.createdAt,
        completedAt: reports.completedAt,
      })
      .from(reports)
      .where(
        and(eq(reports.userId, userId), eq(reports.status, "completed")),
      )
      .orderBy(desc(reports.createdAt));

    return Response.json({
      reports: rows.map((report) => ({
        id: report.id,
        month: report.month,
        createdAt: report.createdAt.toISOString(),
        completedAt: report.completedAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    console.error("reports-get", { step: "list-reports", error });

    return Response.json(
      { error: MESSAGES.api.internal },
      { status: 500 },
    );
  }
}
