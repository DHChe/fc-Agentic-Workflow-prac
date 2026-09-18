import type { DocumentStatus } from "@/lib/db/schema";

export function summarizeDocument(
  status: DocumentStatus,
  amounts: Array<number | null>,
): { transactionCount: number | null; totalAmount: number | null } {
  if (status !== "completed") {
    return { transactionCount: null, totalAmount: null };
  }

  return {
    transactionCount: amounts.length,
    totalAmount: amounts.reduce<number>(
      (sum, amount) => sum + (amount ?? 0),
      0,
    ),
  };
}
