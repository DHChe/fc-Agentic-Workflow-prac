import { and, asc, eq, gte, isNotNull, lt, ne } from "drizzle-orm";

import type { Tx } from "@/lib/db/client";
import { transactions } from "@/lib/db/schema";
import { seoulDateKey, seoulDayStart } from "@/lib/stats/aggregate";

const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

export type DupCandidate = {
  id: string;
  documentId: string;
  transactedAt: Date;
  dateEstimated: boolean;
  totalAmount: number | null;
  cardLast4: string | null;
  merchantName: string | null;
  isDuplicate: boolean;
  createdAt: Date;
};

export type DupSubject = Omit<
  DupCandidate,
  "id" | "isDuplicate" | "createdAt"
>;

function hasMatchingIdentity(
  subject: DupSubject,
  candidate: DupCandidate,
): boolean {
  if (subject.cardLast4 !== null && candidate.cardLast4 !== null) {
    return subject.cardLast4 === candidate.cardLast4;
  }

  return (
    subject.merchantName !== null &&
    candidate.merchantName !== null &&
    subject.merchantName === candidate.merchantName
  );
}

export function findDuplicateOf(
  subject: DupSubject,
  candidates: DupCandidate[],
): string | null {
  if (subject.dateEstimated || subject.totalAmount === null) {
    return null;
  }

  const subjectDate = seoulDateKey(subject.transactedAt);
  let earliest: DupCandidate | null = null;

  for (const candidate of candidates) {
    if (
      candidate.documentId === subject.documentId ||
      candidate.isDuplicate ||
      candidate.dateEstimated ||
      candidate.totalAmount === null ||
      candidate.totalAmount !== subject.totalAmount ||
      seoulDateKey(candidate.transactedAt) !== subjectDate ||
      !hasMatchingIdentity(subject, candidate)
    ) {
      continue;
    }

    if (!earliest || candidate.createdAt < earliest.createdAt) {
      earliest = candidate;
    }
  }

  return earliest?.id ?? null;
}

// 한 원본을 여러 거래가 나눠 가지면 실제 결제가 통계에서 사라진다.
// 이번 실행에서 이미 원본으로 쓴 거래는 후보에서 뺀다.
export function findUnusedDuplicateOf(
  subject: DupSubject,
  candidates: DupCandidate[],
  usedOriginalIds: ReadonlySet<string>,
): string | null {
  return findDuplicateOf(
    subject,
    candidates.filter((candidate) => !usedOriginalIds.has(candidate.id)),
  );
}

export type RevertCandidate = {
  id: string;
  documentId: string;
  duplicateOf: string | null;
};

// 문서를 지우면 그 문서의 거래를 원본으로 삼던 거래는 더 이상 중복이 아니다.
export function findDuplicatesToRevert(
  deleted: { documentId: string; transactionIds: string[] },
  candidates: RevertCandidate[],
): string[] {
  const originalIds = new Set(deleted.transactionIds);

  return candidates
    .filter(
      (candidate) =>
        candidate.documentId !== deleted.documentId &&
        candidate.duplicateOf !== null &&
        originalIds.has(candidate.duplicateOf),
    )
    .map(({ id }) => id);
}

export async function markDuplicates(
  tx: Tx,
  userId: string,
  documentId: string,
): Promise<void> {
  const subjects = await tx
    .select({
      id: transactions.id,
      documentId: transactions.documentId,
      transactedAt: transactions.transactedAt,
      dateEstimated: transactions.dateEstimated,
      totalAmount: transactions.totalAmount,
      cardLast4: transactions.cardLast4,
      merchantName: transactions.merchantName,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.documentId, documentId),
      ),
    )
    .orderBy(asc(transactions.createdAt), asc(transactions.id));
  const usedOriginalIds = new Set<string>();

  for (const subject of subjects) {
    if (subject.dateEstimated || subject.totalAmount === null) {
      continue;
    }

    const dayStart = seoulDayStart(subject.transactedAt);
    const nextDayStart = new Date(dayStart.getTime() + DAY_MILLISECONDS);
    const candidates: DupCandidate[] = await tx
      .select({
        id: transactions.id,
        documentId: transactions.documentId,
        transactedAt: transactions.transactedAt,
        dateEstimated: transactions.dateEstimated,
        totalAmount: transactions.totalAmount,
        cardLast4: transactions.cardLast4,
        merchantName: transactions.merchantName,
        isDuplicate: transactions.isDuplicate,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          ne(transactions.documentId, documentId),
          eq(transactions.isDuplicate, false),
          isNotNull(transactions.totalAmount),
          eq(transactions.dateEstimated, false),
          eq(transactions.totalAmount, subject.totalAmount),
          gte(transactions.transactedAt, dayStart),
          lt(transactions.transactedAt, nextDayStart),
        ),
      )
      .orderBy(asc(transactions.createdAt), asc(transactions.id));

    const duplicateOf = findUnusedDuplicateOf(
      {
        documentId: subject.documentId,
        transactedAt: subject.transactedAt,
        dateEstimated: subject.dateEstimated,
        totalAmount: subject.totalAmount,
        cardLast4: subject.cardLast4,
        merchantName: subject.merchantName,
      },
      candidates,
      usedOriginalIds,
    );

    if (!duplicateOf) {
      continue;
    }

    usedOriginalIds.add(duplicateOf);

    await tx
      .update(transactions)
      .set({ isDuplicate: true, duplicateOf })
      .where(
        and(
          eq(transactions.id, subject.id),
          eq(transactions.userId, userId),
          eq(transactions.documentId, documentId),
        ),
      );
  }
}
