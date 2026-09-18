"use client";

import { ChevronLeft, Copy, FileQuestion } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { NoticeLine } from "@/components/notice-line";
import { Panel } from "@/components/panel";
import { ReportMarkdown } from "@/components/reports/report-markdown";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatMonthLabel } from "@/lib/format";
import { MESSAGES } from "@/lib/messages";

type ReportDetail = {
  id: string;
  month: string;
  status: "generating" | "completed" | "abandoned";
  contentMd: string | null;
  modelUsed: string | null;
  createdAt: string;
  completedAt: string | null;
};

type DetailState =
  | { kind: "loading" }
  | { kind: "ready"; report: ReportDetail }
  | { kind: "notFound" }
  | { kind: "error"; message: string };

type CopyState = "idle" | "copied" | "failed";

function redirectToSignIn(id: string): void {
  const currentPath = `/dashboard/reports/${id}`;
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(
    `/sign-in?redirect_url=${encodeURIComponent(currentPath)}`,
  );
}

async function responseErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };

    return typeof body.error === "string" ? body.error : MESSAGES.api.internal;
  } catch {
    return MESSAGES.api.internal;
  }
}

function DashboardLinkBlock(props: {
  message: string;
  error?: boolean;
}): React.JSX.Element {
  return (
    <Panel className="grid gap-5">
      {props.error ? (
        <NoticeLine tone="error">{props.message}</NoticeLine>
      ) : (
        <EmptyState icon={FileQuestion} text={props.message} />
      )}
      <div>
        <Button asChild variant="secondary">
          <Link href="/dashboard">{MESSAGES.ui.dashboardLink}</Link>
        </Button>
      </div>
    </Panel>
  );
}

export default function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): React.JSX.Element {
  const { id } = use(params);
  const [state, setState] = useState<DetailState>({ kind: "loading" });
  const [copyState, setCopyState] = useState<CopyState>("idle");

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch(`/api/reports/${encodeURIComponent(id)}`, {
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
          setState({
            kind: "error",
            message: await responseErrorMessage(response),
          });
          return;
        }

        const report = (await response.json()) as ReportDetail;

        if (report.status !== "completed") {
          setState({ kind: "notFound" });
          return;
        }

        setState({ kind: "ready", report });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setState({ kind: "error", message: MESSAGES.api.internal });
        }
      }
    })();

    return () => controller.abort();
  }, [id]);

  if (state.kind === "notFound") {
    return <DashboardLinkBlock message={MESSAGES.api.reportNotFound} />;
  }

  if (state.kind === "loading") {
    return <div aria-busy="true" className="min-h-40" />;
  }

  if (state.kind === "error") {
    return <DashboardLinkBlock error message={state.message} />;
  }

  const report = state.report;
  const contentMd = report.contentMd ?? "";

  async function copyReport(): Promise<void> {
    try {
      await navigator.clipboard.writeText(contentMd);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <div className="mx-auto max-w-[720px]">
      <Link
        className="mb-5 inline-flex min-h-[38px] items-center gap-2 text-body font-medium text-primary"
        href="/dashboard"
      >
        <ChevronLeft aria-hidden="true" className="size-4" strokeWidth={2} />
        {MESSAGES.ui.dashboard}
      </Link>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-h1 text-strong">
            {formatMonthLabel(report.month)}
          </h1>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted-foreground">
            <span>
              {MESSAGES.ui.reportColumn.createdAt}{" "}
              <time className="tabular-nums" dateTime={report.createdAt}>
                {formatDateTime(report.createdAt)}
              </time>
            </span>
            <span>
              {MESSAGES.ui.modelUsed}{" "}
              {report.modelUsed ?? MESSAGES.label.placeholder}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
          {copyState === "copied" ? (
            <span
              aria-live="polite"
              className="text-caption text-muted-foreground"
              role="status"
            >
              {MESSAGES.ui.copied}
            </span>
          ) : copyState === "failed" ? (
            <span
              aria-live="polite"
              className="text-caption text-destructive"
              role="status"
            >
              {MESSAGES.api.internal}
            </span>
          ) : null}
          <Button
            data-testid="report-copy"
            onClick={() => void copyReport()}
            type="button"
            variant="secondary"
          >
            <Copy aria-hidden="true" className="size-4" strokeWidth={2} />
            {MESSAGES.label.button.copy}
          </Button>
        </div>
      </div>

      <Panel>
        <ReportMarkdown markdown={contentMd} />
      </Panel>
    </div>
  );
}
