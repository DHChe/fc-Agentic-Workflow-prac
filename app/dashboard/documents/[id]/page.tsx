"use client";

import { ChevronLeft, FileQuestion, FileText } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import { useDashboardData } from "@/components/dashboard/dashboard-data";
import { TransactionTable } from "@/components/documents/transaction-table";
import { EmptyState } from "@/components/empty-state";
import { NoticeLine } from "@/components/notice-line";
import { Panel } from "@/components/panel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DocumentDetailResponse } from "@/lib/api-types";
import { formatAmount, formatDateTime } from "@/lib/format";
import { MESSAGES } from "@/lib/messages";
import { cn } from "@/lib/utils";

type DetailState =
  | { kind: "loading" }
  | { kind: "ready"; document: DocumentDetailResponse }
  | { kind: "notFound" }
  | { kind: "error" };

function redirectToSignIn(id: string): void {
  const currentPath = `/dashboard/documents/${id}`;
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(
    `/sign-in?redirect_url=${encodeURIComponent(currentPath)}`,
  );
}

function NotFoundBlock(): React.JSX.Element {
  return (
    <Panel className="grid gap-5">
      <EmptyState icon={FileQuestion} text={MESSAGES.api.documentNotFound} />
      <div>
        <Button asChild variant="secondary">
          <Link href="/dashboard">{MESSAGES.ui.dashboardLink}</Link>
        </Button>
      </div>
    </Panel>
  );
}

export default function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): React.JSX.Element {
  const { id } = use(params);
  const router = useRouter();
  const { refresh } = useDashboardData();
  const [state, setState] = useState<DetailState>({ kind: "loading" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch(`/api/documents/${encodeURIComponent(id)}`, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (response.status === 401) {
          redirectToSignIn(id);
          return;
        }

        if (response.status === 404) {
          setState({ kind: "notFound" });
          return;
        }

        if (!response.ok) {
          setState({ kind: "error" });
          return;
        }

        const document = (await response.json()) as DocumentDetailResponse;
        setState({ kind: "ready", document });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setState({ kind: "error" });
        }
      }
    })();

    return () => controller.abort();
  }, [id]);

  async function deleteDocument(
    event: React.MouseEvent<HTMLButtonElement>,
  ): Promise<void> {
    event.preventDefault();

    if (deleting) {
      return;
    }

    setDeleting(true);
    setDeleteFailed(false);

    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });

      if (response.status === 401) {
        redirectToSignIn(id);
        return;
      }

      if (response.status === 404) {
        setDialogOpen(false);
        setState({ kind: "notFound" });
        return;
      }

      if (!response.ok) {
        setDialogOpen(false);
        setDeleteFailed(true);
        return;
      }

      await refresh();
      router.push("/dashboard?deleted=1");
    } catch {
      setDialogOpen(false);
      setDeleteFailed(true);
    } finally {
      setDeleting(false);
    }
  }

  if (state.kind === "notFound") {
    return <NotFoundBlock />;
  }

  if (state.kind === "loading") {
    return <div aria-busy="true" className="min-h-40" />;
  }

  if (state.kind === "error") {
    return (
      <Panel className="grid gap-5">
        <NoticeLine tone="error">{MESSAGES.api.internal}</NoticeLine>
        <div>
          <Button asChild variant="secondary">
            <Link href="/dashboard">{MESSAGES.ui.dashboardLink}</Link>
          </Button>
        </div>
      </Panel>
    );
  }

  const document = state.document;
  const processing = document.status === "processing";
  const completed = document.status === "completed";
  const imageOriginal = document.originalMime.startsWith("image/");
  const documentType =
    document.docType === "unknown"
      ? MESSAGES.label.placeholder
      : MESSAGES.ui.documentType[document.docType];

  return (
    <div>
      <Link
        className="mb-5 inline-flex min-h-[38px] items-center gap-2 text-body font-medium text-primary"
        href="/dashboard"
      >
        <ChevronLeft aria-hidden="true" className="size-4" strokeWidth={2} />
        {MESSAGES.ui.dashboard}
      </Link>

      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-h1 text-strong">{documentType}</h1>
          <p className="mt-1 text-caption text-muted-foreground">
            <time dateTime={document.uploadedAt}>
              {formatDateTime(document.uploadedAt)}
            </time>
            <span aria-hidden="true"> · </span>
            {MESSAGES.ui.modelUsed} {document.modelUsed ?? MESSAGES.label.placeholder}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 md:justify-end">
          <AlertDialog
            onOpenChange={(open) => {
              if (!deleting) {
                setDialogOpen(open);
              }
            }}
            open={dialogOpen}
          >
            <AlertDialogTrigger asChild>
              <Button
                data-testid="document-delete"
                disabled={processing}
                type="button"
                variant="danger"
              >
                {MESSAGES.ui.delete}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{MESSAGES.ui.delete}</AlertDialogTitle>
                <AlertDialogDescription>
                  {MESSAGES.remove.confirm}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>
                  {MESSAGES.ui.cancel}
                </AlertDialogCancel>
                <AlertDialogAction
                  disabled={deleting}
                  onClick={deleteDocument}
                >
                  {MESSAGES.ui.delete}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {processing ? (
            <p className="text-caption text-muted-foreground">
              {MESSAGES.remove.processingDisabled}
            </p>
          ) : null}
        </div>
      </div>

      {deleteFailed ? (
        <NoticeLine className="mb-5" tone="error">
          {MESSAGES.api.internal}
        </NoticeLine>
      ) : null}

      {document.status === "failed" && document.failureReason ? (
        <NoticeLine
          className="mb-5"
          data-testid="document-failure-reason"
          tone="error"
        >
          {document.failureReason}
        </NoticeLine>
      ) : null}

      <div className="grid gap-7 md:grid-cols-[280px_minmax(0,1fr)]">
        <Panel className="min-w-0">
          <Badge data-testid="document-status-badge" tone={document.status}>
            {MESSAGES.label.status[document.status]}
          </Badge>

          <div className="mt-4 flex aspect-[3/4] items-center justify-center overflow-hidden rounded-[7px] bg-sunken">
            {imageOriginal ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={documentType}
                className="h-full w-full object-contain"
                src={document.originalUrl}
              />
            ) : (
              <a
                className="flex min-h-[38px] items-center gap-2 font-medium text-primary"
                href={document.originalUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                <FileText aria-hidden="true" className="size-6" strokeWidth={2} />
                {MESSAGES.label.button.openOriginal}
              </a>
            )}
          </div>

          <div className="mt-5">
            <p className="text-caption text-muted-foreground">
              {MESSAGES.ui.documentTotal}
            </p>
            <p
              className={cn(
                "mt-1 text-amount-md",
                document.totalAmount !== null && document.totalAmount < 0
                  ? "text-destructive"
                  : "text-strong",
              )}
            >
              {document.totalAmount === null
                ? MESSAGES.label.placeholder
                : formatAmount(document.totalAmount)}
            </p>
            <p className="mt-2 text-caption text-muted-foreground">
              {MESSAGES.ui.documentTotalDescription}
            </p>
          </div>

          {imageOriginal ? (
            <a
              className="mt-4 inline-flex min-h-[38px] items-center font-medium text-primary"
              href={document.originalUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              {MESSAGES.label.button.openOriginal}
            </a>
          ) : null}
        </Panel>

        <Panel className="min-w-0">
          {processing ? (
            <EmptyState icon={FileText} text={MESSAGES.empty.detailProcessing} />
          ) : document.transactions.length === 0 ? (
            completed ? (
              <EmptyState
                icon={FileQuestion}
                text={MESSAGES.empty.detailNoTransactions}
              />
            ) : null
          ) : (
            <TransactionTable transactions={document.transactions} />
          )}
        </Panel>
      </div>
    </div>
  );
}
