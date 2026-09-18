import Link from "next/link";

import { badgesFor } from "@/components/documents/badges";
import { Badge } from "@/components/ui/badge";
import type { TransactionItem } from "@/lib/api-types";
import { CATEGORY_LABELS } from "@/lib/categories";
import { formatAmount, formatDateTime } from "@/lib/format";
import { MESSAGES } from "@/lib/messages";
import { cn } from "@/lib/utils";

export function TransactionTable(props: {
  transactions: TransactionItem[];
}): React.JSX.Element {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-cell">
        <thead>
          <tr className="border-b border-border-soft text-left text-caption text-muted-foreground">
            <th className="pb-2 pr-3 font-normal">
              {MESSAGES.ui.transactionColumn.date}
            </th>
            <th className="pb-2 pr-3 font-normal">
              {MESSAGES.ui.transactionColumn.merchant}
            </th>
            <th className="pb-2 text-right font-normal">
              {MESSAGES.ui.transactionColumn.amount}
            </th>
            <th className="hidden pb-2 pl-3 font-normal md:table-cell">
              {MESSAGES.ui.transactionColumn.category}
            </th>
            <th className="hidden pb-2 pl-3 font-normal md:table-cell">
              {MESSAGES.ui.transactionColumn.card}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-soft">
          {props.transactions.map((transaction) => {
            const badges = badgesFor(transaction);
            const amountMissing = badges.includes("amountMissing");
            const dateEstimated = badges.includes("dateEstimated");
            const duplicate = badges.includes("duplicate");

            return (
              <tr data-testid="transaction-row" key={transaction.id}>
                <td className="py-2.5 pr-3 align-top text-strong">
                  <time
                    className="whitespace-nowrap tabular-nums"
                    dateTime={transaction.transactedAt}
                  >
                    {formatDateTime(transaction.transactedAt)}
                  </time>
                  {dateEstimated ? (
                    <div className="mt-1">
                      <Badge tone="warn">
                        {MESSAGES.label.badge.dateEstimated}
                      </Badge>
                    </div>
                  ) : null}
                </td>
                <td className="py-2.5 pr-3 align-top text-strong">
                  <span>
                    {transaction.merchantName ?? MESSAGES.label.placeholder}
                  </span>
                  {duplicate ? (
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge tone="duplicate">
                        {MESSAGES.label.badge.duplicate}
                      </Badge>
                      {transaction.duplicateOfDocumentId ? (
                        <Link
                          className="whitespace-nowrap text-caption font-medium text-primary hover:underline"
                          href={`/dashboard/documents/${transaction.duplicateOfDocumentId}`}
                        >
                          {MESSAGES.label.button.viewOriginal}
                        </Link>
                      ) : null}
                    </div>
                  ) : null}
                </td>
                <td
                  className={cn(
                    "py-2.5 text-right align-top text-amount-sm",
                    transaction.totalAmount !== null &&
                      transaction.totalAmount < 0
                      ? "text-destructive"
                      : "text-strong",
                  )}
                >
                  <span>
                    {amountMissing
                      ? MESSAGES.label.placeholder
                      : formatAmount(transaction.totalAmount as number)}
                  </span>
                  {amountMissing ? (
                    <div className="mt-1">
                      <Badge tone="warn">
                        {MESSAGES.label.badge.amountMissing}
                      </Badge>
                    </div>
                  ) : null}
                </td>
                <td className="hidden py-2.5 pl-3 align-top text-strong md:table-cell">
                  {CATEGORY_LABELS[transaction.category]}
                </td>
                <td className="hidden py-2.5 pl-3 align-top text-strong md:table-cell">
                  <span className="whitespace-nowrap tabular-nums">
                    {transaction.cardLast4 ?? MESSAGES.label.placeholder}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
