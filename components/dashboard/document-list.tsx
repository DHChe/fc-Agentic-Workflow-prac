"use client";

import { Inbox } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { useDashboardData } from "@/components/dashboard/dashboard-data";
import { EmptyState } from "@/components/empty-state";
import { NoticeLine } from "@/components/notice-line";
import { Badge } from "@/components/ui/badge";
import type { DashboardDocument } from "@/lib/api-types";
import { formatAmount, formatDateTime } from "@/lib/format";
import { MESSAGES } from "@/lib/messages";
import { cn } from "@/lib/utils";

const gridClasses =
  "grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-3 md:grid-cols-[88px_minmax(100px,1fr)_80px_120px_140px]";

function documentType(document: DashboardDocument): string {
  return document.docType === "unknown"
    ? MESSAGES.label.placeholder
    : MESSAGES.ui.documentType[document.docType];
}

function DocumentRows(): React.JSX.Element {
  const { data } = useDashboardData();

  if (!data) {
    return <div data-testid="document-list" />;
  }

  if (data.documents.length === 0) {
    return (
      <div data-testid="document-list">
        <EmptyState icon={Inbox} text={MESSAGES.empty.documents} />
      </div>
    );
  }

  return (
    <div className="divide-y divide-border-soft" data-testid="document-list">
      <div
        className={cn(
          gridClasses,
          "pb-2 text-caption text-muted-foreground",
        )}
      >
        <span>{MESSAGES.ui.documentColumn.status}</span>
        <span>{MESSAGES.ui.documentColumn.type}</span>
        <span className="hidden text-right md:block">
          {MESSAGES.ui.documentColumn.transactions}
        </span>
        <span className="text-right">{MESSAGES.ui.documentColumn.total}</span>
        <span className="text-right">
          {MESSAGES.ui.documentColumn.uploadedAt}
        </span>
      </div>

      {data.documents.map((document) => (
        <Link
          className={cn(
            gridClasses,
            "min-h-[38px] py-2.5 text-cell text-strong transition-colors duration-100 ease-linear hover:bg-sunken",
          )}
          data-status={document.status}
          data-testid="document-row"
          href={`/dashboard/documents/${document.id}`}
          key={document.id}
        >
          <span>
            <Badge
              data-testid="document-status-badge"
              tone={document.status}
            >
              {MESSAGES.label.status[document.status]}
            </Badge>
          </span>
          <span>{documentType(document)}</span>
          <span className="hidden text-right tabular-nums md:block">
            {document.transactionCount ?? MESSAGES.label.placeholder}
          </span>
          <span
            className={cn(
              "whitespace-nowrap text-right font-medium tabular-nums",
              document.totalAmount !== null && document.totalAmount < 0
                ? "text-destructive"
                : "text-strong",
            )}
          >
            {document.totalAmount === null
              ? MESSAGES.label.placeholder
              : formatAmount(document.totalAmount)}
          </span>
          <time
            className="whitespace-nowrap text-right tabular-nums text-muted-foreground"
            dateTime={document.uploadedAt}
          >
            {formatDateTime(document.uploadedAt)}
          </time>
          {document.status === "failed" && document.failureReason ? (
            <span
              className="col-span-full pt-2 text-caption text-destructive"
              data-testid="document-failure-reason"
            >
              {document.failureReason}
            </span>
          ) : null}
        </Link>
      ))}
    </div>
  );
}

function DocumentListWithDeletedNotice(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showDeletedNotice] = useState(
    () => searchParams.get("deleted") === "1",
  );

  useEffect(() => {
    if (showDeletedNotice) {
      router.replace("/dashboard", { scroll: false });
    }
  }, [router, showDeletedNotice]);

  return (
    <div className="space-y-4">
      {showDeletedNotice ? (
        <NoticeLine tone="info">{MESSAGES.remove.done}</NoticeLine>
      ) : null}
      <DocumentRows />
    </div>
  );
}

export function DocumentList(): React.JSX.Element {
  return (
    <Suspense fallback={<DocumentRows />}>
      <DocumentListWithDeletedNotice />
    </Suspense>
  );
}
