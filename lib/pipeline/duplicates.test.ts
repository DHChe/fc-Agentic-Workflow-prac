import { describe, expect, it } from "vitest";

import {
  findDuplicateOf,
  type DupCandidate,
  type DupSubject,
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
