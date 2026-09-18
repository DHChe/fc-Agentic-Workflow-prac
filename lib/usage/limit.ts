import { and, count, eq, gte, isNull, lt } from "drizzle-orm";

import type { Tx } from "@/lib/db/client";
import { getDb } from "@/lib/db/client";
import { usageLog, type UsageKind } from "@/lib/db/schema";
import { seoulDayStart } from "@/lib/stats/aggregate";

export const DAILY_LIMIT = 50;

const DAY_MILLISECONDS = 24 * 60 * 60 * 1_000;

export function usageWindow(now: Date): { start: Date; end: Date } {
  const start = seoulDayStart(now);

  return {
    start,
    end: new Date(start.getTime() + DAY_MILLISECONDS),
  };
}

export async function countTodayUsage(
  userId: string,
  now: Date,
): Promise<number> {
  const { start, end } = usageWindow(now);
  const [result] = await getDb()
    .select({ value: count() })
    .from(usageLog)
    .where(
      and(
        eq(usageLog.userId, userId),
        gte(usageLog.createdAt, start),
        lt(usageLog.createdAt, end),
      ),
    );

  return result?.value ?? 0;
}

export async function recordUsage(entry: {
  id: string;
  userId: string;
  kind: UsageKind;
}): Promise<boolean> {
  const inserted = await getDb()
    .insert(usageLog)
    .values(entry)
    .onConflictDoNothing({ target: usageLog.id })
    .returning({ id: usageLog.id });

  return inserted.length === 1;
}

export async function claimUpload(
  tx: Tx,
  args: { uploadId: string; userId: string; documentId: string },
): Promise<boolean> {
  const claimed = await tx
    .update(usageLog)
    .set({ documentId: args.documentId })
    .where(
      and(
        eq(usageLog.id, args.uploadId),
        eq(usageLog.userId, args.userId),
        eq(usageLog.kind, "document"),
        isNull(usageLog.documentId),
      ),
    )
    .returning({ id: usageLog.id });

  return claimed.length === 1;
}
