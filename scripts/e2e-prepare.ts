import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { getDb } from "../lib/db/client";
import {
  documents,
  reports,
  transactions,
  usageLog,
} from "../lib/db/schema";

function announceTarget(userId: string): void {
  if (!userId || !userId.startsWith("user_")) {
    throw new Error("E2E user id is required");
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const dbHost = new URL(databaseUrl).hostname;
  console.log(`대상 DB 호스트: ${dbHost}`);
  console.log(`대상 user id 끝 6자: ${userId.slice(-6)}`);
}

export async function resetUser(userId: string): Promise<null> {
  announceTarget(userId);

  await getDb().transaction(async (tx) => {
    await tx.delete(transactions).where(eq(transactions.userId, userId));
    await tx.delete(documents).where(eq(documents.userId, userId));
    await tx.delete(reports).where(eq(reports.userId, userId));
    await tx.delete(usageLog).where(eq(usageLog.userId, userId));
  });

  return null;
}

export async function fillUsage(userId: string): Promise<null> {
  announceTarget(userId);

  await getDb()
    .insert(usageLog)
    .values(
      Array.from({ length: 50 }, () => ({
        id: randomUUID(),
        userId,
        kind: "document" as const,
        createdAt: new Date(),
      })),
    );

  return null;
}
