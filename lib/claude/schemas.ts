import { z } from "zod";

import { CATEGORY_KEYS } from "@/lib/categories";

const transactionSchema = z
  .object({
    transactedAt: z.string().nullable(),
    merchantName: z.string().max(100).nullable(),
    totalAmount: z.number().int().nullable(),
    cardLast4: z.string().nullable(),
    category: z.enum(CATEGORY_KEYS),
  })
  .strict();

export const extractionSchema = z
  .object({
    docType: z.enum(["receipt", "statement", "other"]),
    transactions: z.array(transactionSchema),
  })
  .strict()
  .refine(
    ({ docType, transactions }) =>
      docType !== "other" || transactions.length === 0,
    {
      message: "기타 문서는 거래를 포함할 수 없습니다.",
      path: ["transactions"],
    },
  );

export type ExtractionResult = z.infer<typeof extractionSchema>;

export function cleanCardLast4(raw: string | null): string | null {
  if (raw === null) {
    return null;
  }

  const digits = raw.replace(/\D/g, "");
  return digits.length === 4 ? digits : null;
}
