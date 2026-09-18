import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";

import { expireStaleReports } from "@/lib/claude/report";
import { getDb } from "@/lib/db/client";
import { reports } from "@/lib/db/schema";
import { MESSAGES } from "@/lib/messages";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function reportNotFound(): Response {
  return Response.json(
    { error: MESSAGES.api.reportNotFound },
    { status: 404 },
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { userId } = await auth();

    if (!userId) {
      return Response.json(
        { error: MESSAGES.api.unauthorized },
        { status: 401 },
      );
    }

    const { id } = await context.params;

    if (!UUID_PATTERN.test(id)) {
      return reportNotFound();
    }

    await expireStaleReports(userId, new Date());

    const [report] = await getDb()
      .select({
        id: reports.id,
        month: reports.month,
        status: reports.status,
        contentMd: reports.contentMd,
        modelUsed: reports.modelUsed,
        createdAt: reports.createdAt,
        completedAt: reports.completedAt,
      })
      .from(reports)
      .where(and(eq(reports.id, id), eq(reports.userId, userId)))
      .limit(1);

    if (!report) {
      return reportNotFound();
    }

    return Response.json({
      id: report.id,
      month: report.month,
      status: report.status,
      contentMd: report.status === "completed" ? report.contentMd : null,
      modelUsed: report.modelUsed,
      createdAt: report.createdAt.toISOString(),
      completedAt: report.completedAt?.toISOString() ?? null,
    });
  } catch (error) {
    console.error("report-get", { step: "get-report", error });

    return Response.json(
      { error: MESSAGES.api.internal },
      { status: 500 },
    );
  }
}
