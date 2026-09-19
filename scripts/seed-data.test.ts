import { describe, expect, it } from "vitest";

import { CATEGORY_KEYS } from "@/lib/categories";
import { RECEIPT_OK } from "@/lib/claude/fixtures/receipt-ok";
import { seoulDateKey } from "@/lib/stats/aggregate";

import { SAMPLE_RECEIPT, SEED_DOCUMENTS } from "./seed-data";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FIRST_SEED_DATE = "2026-08-01";
const LAST_SEED_DATE = "2026-09-15";

function transactionKey(transaction: {
  transactedAt: string;
  totalAmount: number;
  cardLast4: string;
}): string {
  return [
    seoulDateKey(new Date(transaction.transactedAt)),
    transaction.totalAmount,
    transaction.cardLast4,
  ].join("|");
}

function flattenedTransactions() {
  return SEED_DOCUMENTS.flatMap((document, documentIndex) =>
    document.transactions.map((transaction) => ({
      documentIndex,
      transaction,
    })),
  );
}

describe("시연 시드 구성", () => {
  it("영수증 9건과 거래 5건짜리 카드명세서 1건을 표 순서대로 제공한다", () => {
    expect(SEED_DOCUMENTS).toHaveLength(10);
    expect(
      SEED_DOCUMENTS.filter((document) => document.docType === "receipt"),
    ).toHaveLength(9);

    const statements = SEED_DOCUMENTS.filter(
      (document) => document.docType === "statement",
    );
    expect(statements).toHaveLength(1);
    expect(statements[0].transactions).toHaveLength(5);

    for (const document of SEED_DOCUMENTS.filter(
      (candidate) => candidate.docType === "receipt",
    )) {
      expect(document.transactions).toHaveLength(1);
    }

    expect(SEED_DOCUMENTS.map((document) => document.assetFile)).toEqual(
      Array.from(
        { length: 10 },
        (_, index) =>
          `scripts/seed-assets/${String(index + 1).padStart(2, "0")}.jpg`,
      ),
    );
  });

  it("모든 업로드일과 거래일을 고정된 서울 날짜 범위 안에 둔다", () => {
    for (const document of SEED_DOCUMENTS) {
      expect(document.uploadedAt).toMatch(/\+09:00$/);

      const uploadedDate = seoulDateKey(new Date(document.uploadedAt));
      expect(uploadedDate >= FIRST_SEED_DATE).toBe(true);
      expect(uploadedDate <= LAST_SEED_DATE).toBe(true);

      for (const transaction of document.transactions) {
        expect(transaction.transactedAt).toMatch(/\+09:00$/);

        const transactedDate = seoulDateKey(
          new Date(transaction.transactedAt),
        );
        expect(transactedDate >= FIRST_SEED_DATE).toBe(true);
        expect(transactedDate <= LAST_SEED_DATE).toBe(true);
        expect(new Date(document.uploadedAt).getTime()).toBeGreaterThanOrEqual(
          new Date(transaction.transactedAt).getTime(),
        );
      }
    }
  });

  it("서로 다른 문서 사이의 중복 쌍은 7번 명세서와 8번 영수증 한 쌍뿐이다", () => {
    const transactions = flattenedTransactions();
    const duplicatePairs: Array<[
      (typeof transactions)[number],
      (typeof transactions)[number],
    ]> = [];

    for (let left = 0; left < transactions.length; left += 1) {
      for (let right = left + 1; right < transactions.length; right += 1) {
        const first = transactions[left];
        const second = transactions[right];

        if (
          first.documentIndex !== second.documentIndex &&
          transactionKey(first.transaction) === transactionKey(second.transaction)
        ) {
          duplicatePairs.push([first, second]);
        }
      }
    }

    expect(duplicatePairs).toHaveLength(1);
    expect(
      duplicatePairs.map(([first, second]) => [
        first.documentIndex,
        second.documentIndex,
        first.transaction.merchantName,
        second.transaction.merchantName,
      ]),
    ).toEqual([
      [6, 7, "스타벅스 선릉로점", "스타벅스 선릉로점"],
    ]);
  });

  it("샘플 영수증은 시드와 겹치지 않고 receipt-ok fixture와 같은 결제다", () => {
    const sampleKey = transactionKey(SAMPLE_RECEIPT.transaction);

    expect(
      flattenedTransactions().some(
        ({ transaction }) => transactionKey(transaction) === sampleKey,
      ),
    ).toBe(false);

    const fixtureTransaction = RECEIPT_OK.transactions[0];
    expect(SAMPLE_RECEIPT).toEqual({
      assetFile: "public/samples/receipt-sample.jpg",
      transaction: {
        ...fixtureTransaction,
        transactedAt: `${fixtureTransaction.transactedAt}+09:00`,
        dateEstimated: false,
      },
    });
  });

  it("모든 UUID가 유일한 소문자 형식이고 카테고리는 고정 목록 안에 있다", () => {
    const transactions = flattenedTransactions();
    const ids = [
      ...SEED_DOCUMENTS.map((document) => document.id),
      ...transactions.map(({ transaction }) => transaction.id),
    ];

    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(UUID_PATTERN);
    }
    for (const { transaction } of transactions) {
      expect(CATEGORY_KEYS).toContain(transaction.category);
    }
  });

  it("10번만 날짜 추정이고, 음수 거래는 쿠팡 취소 -8,900원 한 건뿐이다", () => {
    const transactions = flattenedTransactions();
    const estimated = transactions.filter(
      ({ transaction }) => transaction.dateEstimated,
    );
    const negative = transactions.filter(
      ({ transaction }) => transaction.totalAmount < 0,
    );

    expect(estimated).toHaveLength(1);
    expect(estimated[0].documentIndex).toBe(9);
    expect(estimated[0].transaction.transactedAt).toBe(
      SEED_DOCUMENTS[9].uploadedAt,
    );
    expect(negative.map(({ transaction }) => transaction.totalAmount)).toEqual([
      -8_900,
    ]);
  });

  it("8월 거래 합계는 787,900원이다", () => {
    const augustTotal = flattenedTransactions()
      .filter(({ transaction }) =>
        seoulDateKey(new Date(transaction.transactedAt)).startsWith("2026-08"),
      )
      .reduce(
        (total, { transaction }) => total + transaction.totalAmount,
        0,
      );

    expect(augustTotal).toBe(
      18_500 +
        12_400 +
        64_900 +
        286_000 +
        45_000 +
        132_000 +
        88_000 +
        150_000 -
        8_900,
    );
    expect(augustTotal).toBe(787_900);
  });
});
