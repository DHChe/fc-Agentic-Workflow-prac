import type { ExtractionResult } from "../schemas";

export const RECEIPT_OK: ExtractionResult = {
  docType: "receipt",
  transactions: [
    {
      transactedAt: "2026-09-09T12:24:00",
      merchantName: "파리바게뜨 역삼점",
      totalAmount: 17_300,
      cardLast4: "9012",
      category: "food_welfare",
    },
  ],
};
