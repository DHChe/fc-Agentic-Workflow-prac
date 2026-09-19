import { describe, expect, it } from "vitest";

import {
  findDuplicateOf,
  findDuplicatesToRevert,
  findUnusedDuplicateOf,
  type DupCandidate,
  type DupSubject,
  type RevertCandidate,
} from "./duplicates";

function makeSubject(overrides: Partial<DupSubject> = {}): DupSubject {
  return {
    documentId: "document-new",
    transactedAt: new Date("2026-09-03T03:00:00.000Z"),
    dateEstimated: false,
    totalAmount: 23_000,
    cardLast4: "1234",
    merchantName: "스타벅스 선릉로점",
    ...overrides,
  };
}

function makeCandidate(
  overrides: Partial<DupCandidate> = {},
): DupCandidate {
  return {
    id: "transaction-old",
    documentId: "document-old",
    transactedAt: new Date("2026-09-03T04:00:00.000Z"),
    dateEstimated: false,
    totalAmount: 23_000,
    cardLast4: "1234",
    merchantName: "스타벅스 선릉로점",
    isDuplicate: false,
    createdAt: new Date("2026-09-03T05:00:00.000Z"),
    ...overrides,
  };
}

describe("findDuplicateOf", () => {
  it("matches equal card last-four values when both sides have them", () => {
    expect(findDuplicateOf(makeSubject(), [makeCandidate()])).toBe(
      "transaction-old",
    );
  });

  it("does not fall back to merchant name when both card values exist but differ", () => {
    const candidate = makeCandidate({ cardLast4: "5678" });

    expect(findDuplicateOf(makeSubject(), [candidate])).toBeNull();
  });

  it("falls back to an exact merchant match when one card value is absent", () => {
    const subject = makeSubject({ cardLast4: null });

    expect(findDuplicateOf(subject, [makeCandidate()])).toBe("transaction-old");
    expect(
      findDuplicateOf(subject, [
        makeCandidate({ merchantName: "스타벅스코리아" }),
      ]),
    ).toBeNull();
  });

  it("does not compare transactions without either identity value", () => {
    const subject = makeSubject({ cardLast4: null, merchantName: null });
    const candidate = makeCandidate({ cardLast4: null, merchantName: null });

    expect(findDuplicateOf(subject, [candidate])).toBeNull();
  });

  it("excludes estimated dates on either side", () => {
    expect(
      findDuplicateOf(makeSubject({ dateEstimated: true }), [makeCandidate()]),
    ).toBeNull();
    expect(
      findDuplicateOf(makeSubject(), [
        makeCandidate({ dateEstimated: true }),
      ]),
    ).toBeNull();
  });

  it("excludes the same document and candidates already marked duplicate", () => {
    expect(
      findDuplicateOf(makeSubject(), [
        makeCandidate({ documentId: "document-new" }),
      ]),
    ).toBeNull();
    expect(
      findDuplicateOf(makeSubject(), [makeCandidate({ isDuplicate: true })]),
    ).toBeNull();
  });

  it("excludes null or unequal amounts", () => {
    expect(
      findDuplicateOf(makeSubject({ totalAmount: null }), [makeCandidate()]),
    ).toBeNull();
    expect(
      findDuplicateOf(makeSubject(), [makeCandidate({ totalAmount: null })]),
    ).toBeNull();
    expect(
      findDuplicateOf(makeSubject(), [makeCandidate({ totalAmount: 24_000 })]),
    ).toBeNull();
  });

  it("compares dates by their Seoul calendar day", () => {
    const sameSeoulDay = findDuplicateOf(
      makeSubject({
        transactedAt: new Date("2026-09-02T15:30:00.000Z"),
      }),
      [
        makeCandidate({
          transactedAt: new Date("2026-09-03T14:00:00.000Z"),
        }),
      ],
    );
    const differentSeoulDay = findDuplicateOf(
      makeSubject({
        transactedAt: new Date("2026-09-03T14:59:00.000Z"),
      }),
      [
        makeCandidate({
          transactedAt: new Date("2026-09-03T15:01:00.000Z"),
        }),
      ],
    );

    expect(sameSeoulDay).toBe("transaction-old");
    expect(differentSeoulDay).toBeNull();
  });

  it("chooses the earliest-created matching candidate", () => {
    const later = makeCandidate({
      id: "later",
      createdAt: new Date("2026-09-03T08:00:00.000Z"),
    });
    const earlier = makeCandidate({
      id: "earlier",
      createdAt: new Date("2026-09-03T01:00:00.000Z"),
    });

    expect(findDuplicateOf(makeSubject(), [later, earlier])).toBe("earlier");
  });

  it("matches equal zero and negative amounts", () => {
    expect(
      findDuplicateOf(makeSubject({ totalAmount: 0 }), [
        makeCandidate({ totalAmount: 0 }),
      ]),
    ).toBe("transaction-old");
    expect(
      findDuplicateOf(makeSubject({ totalAmount: -8_900 }), [
        makeCandidate({ totalAmount: -8_900 }),
      ]),
    ).toBe("transaction-old");
  });
});

describe("findUnusedDuplicateOf", () => {
  it("이번 실행에서 이미 원본으로 쓴 거래는 다시 고르지 않는다", () => {
    const candidate = makeCandidate();
    const usedOriginalIds = new Set<string>();

    expect(
      findUnusedDuplicateOf(makeSubject(), [candidate], usedOriginalIds),
    ).toBe("transaction-old");

    usedOriginalIds.add("transaction-old");

    expect(
      findUnusedDuplicateOf(makeSubject(), [candidate], usedOriginalIds),
    ).toBeNull();
  });

  it("원본이 두 건이면 거래마다 다른 원본을 고른다", () => {
    const earlier = makeCandidate({
      id: "earlier",
      createdAt: new Date("2026-09-03T01:00:00.000Z"),
    });
    const later = makeCandidate({
      id: "later",
      createdAt: new Date("2026-09-03T08:00:00.000Z"),
    });
    const candidates = [earlier, later];
    const usedOriginalIds = new Set<string>();

    expect(
      findUnusedDuplicateOf(makeSubject(), candidates, usedOriginalIds),
    ).toBe("earlier");

    usedOriginalIds.add("earlier");

    expect(
      findUnusedDuplicateOf(makeSubject(), candidates, usedOriginalIds),
    ).toBe("later");
  });
});

describe("findDuplicatesToRevert", () => {
  const deleted = {
    documentId: "document-deleted",
    transactionIds: ["deleted-1", "deleted-2"],
  };

  function makeRevertCandidate(
    overrides: Partial<RevertCandidate> = {},
  ): RevertCandidate {
    return {
      id: "transaction-copy",
      documentId: "document-other",
      duplicateOf: "deleted-1",
      ...overrides,
    };
  }

  it("지워질 거래를 가리키는 다른 문서의 거래를 되돌린다", () => {
    expect(findDuplicatesToRevert(deleted, [makeRevertCandidate()])).toEqual([
      "transaction-copy",
    ]);
  });

  it("지워질 문서 안의 거래는 되돌리지 않는다", () => {
    expect(
      findDuplicatesToRevert(deleted, [
        makeRevertCandidate({ documentId: "document-deleted" }),
      ]),
    ).toEqual([]);
  });

  it("원본이 없거나 다른 거래를 가리키면 그대로 둔다", () => {
    expect(
      findDuplicatesToRevert(deleted, [
        makeRevertCandidate({ duplicateOf: null }),
        makeRevertCandidate({ duplicateOf: "transaction-elsewhere" }),
      ]),
    ).toEqual([]);
  });

  it("지워질 거래가 없으면 되돌릴 거래도 없다", () => {
    expect(
      findDuplicatesToRevert(
        { documentId: "document-deleted", transactionIds: [] },
        [makeRevertCandidate()],
      ),
    ).toEqual([]);
  });

  it("여러 거래가 가리키면 전부 되돌린다", () => {
    expect(
      findDuplicatesToRevert(deleted, [
        makeRevertCandidate({ id: "copy-1", duplicateOf: "deleted-1" }),
        makeRevertCandidate({
          id: "copy-2",
          documentId: "document-another",
          duplicateOf: "deleted-2",
        }),
        makeRevertCandidate({ id: "copy-3", duplicateOf: null }),
      ]),
    ).toEqual(["copy-1", "copy-2"]);
  });
});
