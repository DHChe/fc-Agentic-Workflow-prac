export type TransactionBadge =
  | "amountMissing"
  | "dateEstimated"
  | "duplicate";

export function badgesFor(tx: {
  totalAmount: number | null;
  dateEstimated: boolean;
  isDuplicate: boolean;
}): TransactionBadge[] {
  const badges: TransactionBadge[] = [];

  if (tx.dateEstimated) {
    badges.push("dateEstimated");
  }

  if (tx.isDuplicate) {
    badges.push("duplicate");
  }

  if (tx.totalAmount === null) {
    badges.push("amountMissing");
  }

  return badges;
}
