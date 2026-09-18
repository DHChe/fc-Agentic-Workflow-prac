"use client";

import { FileText } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { NoticeLine } from "@/components/notice-line";
import { formatDateTime, formatMonthLabel } from "@/lib/format";
import { MESSAGES } from "@/lib/messages";

type ReportSummary = {
  id: string;
  month: string;
  createdAt: string;
  completedAt: string | null;
};

type ReportListState =
  | { kind: "loading" }
  | { kind: "ready"; reports: ReportSummary[] }
  | { kind: "error"; message: string };

const gridClasses =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3";

function redirectToSignIn(): void {
  // API calls must redirect explicitly because protected API routes return JSON.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/sign-in?redirect_url=/dashboard");
}

async function responseErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };

    return typeof body.error === "string" ? body.error : MESSAGES.api.internal;
  } catch {
    return MESSAGES.api.internal;
  }
}

export function ReportList(props: {
  reloadKey: number;
}): React.JSX.Element {
  const [state, setState] = useState<ReportListState>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch("/api/reports", {
          cache: "no-store",
          signal: controller.signal,
        });

        if (response.status === 401) {
          redirectToSignIn();
          return;
        }

        if (!response.ok) {
          setState({
            kind: "error",
            message: await responseErrorMessage(response),
          });
          return;
        }

        const body = (await response.json()) as { reports: ReportSummary[] };
        setState({ kind: "ready", reports: body.reports });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setState({ kind: "error", message: MESSAGES.api.internal });
        }
      }
    })();

    return () => controller.abort();
  }, [props.reloadKey]);

  if (state.kind === "loading") {
    return <div aria-busy="true" data-testid="report-list" />;
  }

  if (state.kind === "error") {
    return (
      <div data-testid="report-list">
        <NoticeLine tone="error">{state.message}</NoticeLine>
      </div>
    );
  }

  if (state.reports.length === 0) {
    return (
      <div data-testid="report-list">
        <EmptyState icon={FileText} text={MESSAGES.empty.reports} />
      </div>
    );
  }

  return (
    <div className="divide-y divide-border-soft" data-testid="report-list">
      <div className={`${gridClasses} pb-2 text-caption text-muted-foreground`}>
        <span>{MESSAGES.ui.reportColumn.period}</span>
        <span className="text-right">
          {MESSAGES.ui.reportColumn.createdAt}
        </span>
      </div>

      {state.reports.map((report) => (
        <Link
          className={`${gridClasses} min-h-[38px] py-2.5 text-cell text-strong transition-colors duration-100 ease-linear hover:bg-sunken`}
          data-testid="report-row"
          href={`/dashboard/reports/${report.id}`}
          key={report.id}
        >
          <span className="font-medium">{formatMonthLabel(report.month)}</span>
          <time
            className="whitespace-nowrap text-right tabular-nums text-muted-foreground"
            dateTime={report.createdAt}
          >
            {formatDateTime(report.createdAt)}
          </time>
        </Link>
      ))}
    </div>
  );
}
