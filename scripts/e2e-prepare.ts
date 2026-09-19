import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { getDb } from "../lib/db/client";
import { currentSeoulMonth } from "../lib/stats/aggregate";
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

/**
 * 이번 달 집계 대상 거래 1건을 만들고 그 거래가 들어간 달을 돌려준다. 한도 초과 시나리오가
 * `POST /api/reports`의 "거래 ≥ 1건" 검사를 통과해 429 분기까지 닿게 하려는 용도다(ARCHITECTURE 5.3).
 * 달을 돌려주는 이유: 스펙이 따로 계산하면 서울 시간 월말 경계에서 다른 달을 요청할 수 있다.
 */
export async function seedTransaction(userId: string): Promise<string> {
  announceTarget(userId);

  const documentId = randomUUID();
  const now = new Date();

  await getDb().transaction(async (tx) => {
    await tx.insert(documents).values({
      id: documentId,
      userId,
      docType: "receipt",
      status: "completed",
      originalUrl: "https://e2e.invalid/seed.jpg",
      originalMime: "image/jpeg",
      uploadedAt: now,
      processedAt: now,
    });
    await tx.insert(transactions).values({
      id: randomUUID(),
      documentId,
      userId,
      transactedAt: now,
      merchantName: "한도 확인용 거래",
      totalAmount: 1_000,
      category: "food_welfare",
    });
  });

  return currentSeoulMonth(now);
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
