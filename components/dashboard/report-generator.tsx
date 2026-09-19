"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useDashboardData } from "@/components/dashboard/dashboard-data";
import { NoticeLine } from "@/components/notice-line";
import { ReportMarkdown } from "@/components/reports/report-markdown";
import { Button } from "@/components/ui/button";
import { MESSAGES } from "@/lib/messages";

export function reportButtonState(args: {
  count: number;
  limitReached: boolean;
  generating: boolean;
  pending?: boolean;
}): { disabled: boolean; reason: string | null } {
  if (args.generating) {
    return { disabled: true, reason: null };
  }

  // 아직 그 달의 숫자를 못 받았다. 0건이라고 단언하지 않는다.
  if (args.pending) {
    return { disabled: true, reason: null };
  }

  if (args.limitReached) {
    return { disabled: true, reason: MESSAGES.api.limitReached };
  }

  if (args.count === 0) {
    return { disabled: true, reason: MESSAGES.report.noTransactions };
  }

  return { disabled: false, reason: null };
}

export type ReportGeneration = {
  phase: "idle" | "streaming" | "saved" | "interrupted" | "failed";
  text: string;
  reportId: string | null;
  message: string | null;
};

const INITIAL_REPORT_GENERATION: ReportGeneration = {
  phase: "idle",
  text: "",
  reportId: null,
  message: null,
};

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

function scrollToReportStream(): void {
  window.requestAnimationFrame(() => {
    document
      .querySelector('[data-testid="report-stream"]')
      ?.scrollIntoView({ block: "start" });
  });
}

export function useReportGeneration(opts: { onFinished: () => void }): {
  state: ReportGeneration;
  start: (month: string) => Promise<void>;
} {
  const { refresh } = useDashboardData();
  const { onFinished } = opts;
  const [state, setState] = useState<ReportGeneration>(
    INITIAL_REPORT_GENERATION,
  );

  useEffect(() => {
    if (state.phase !== "streaming") {
      return;
    }

    function warnBeforeLeaving(event: BeforeUnloadEvent): string {
      event.preventDefault();
      event.returnValue = MESSAGES.report.leaveWarning;
      return MESSAGES.report.leaveWarning;
    }

    window.addEventListener("beforeunload", warnBeforeLeaving);

    return () => {
      window.removeEventListener("beforeunload", warnBeforeLeaving);
    };
  }, [state.phase]);

  const start = useCallback(
    async (month: string): Promise<void> => {
      setState({
        phase: "streaming",
        text: "",
        reportId: null,
        message: null,
      });
      scrollToReportStream();

      let response: Response;

      try {
        response = await fetch("/api/reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ month }),
        });
      } catch {
        setState({
          phase: "failed",
          text: "",
          reportId: null,
          message: MESSAGES.api.internal,
        });
        await refresh();
        return;
      }

      if (response.status === 401) {
        redirectToSignIn();
        return;
      }

      if (!response.ok) {
        const message = await responseErrorMessage(response);
        setState({
          phase: "failed",
          text: "",
          reportId: null,
          message,
        });
        await refresh();
        return;
      }

      const reportId = response.headers.get("X-Report-Id");
      setState((current) => ({ ...current, reportId }));

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              const tail = decoder.decode();

              if (tail) {
                setState((current) => ({
                  ...current,
                  text: current.text + tail,
                }));
              }

              break;
            }

            const chunk = decoder.decode(value, { stream: true });

            if (chunk) {
              setState((current) => ({
                ...current,
                text: current.text + chunk,
              }));
            }
          }
        } catch {
          // The status endpoint is the single source of truth after any ending.
        } finally {
          reader.releaseLock();
        }
      }

      let completed = false;

      if (reportId) {
        try {
          const statusResponse = await fetch(`/api/reports/${reportId}`, {
            cache: "no-store",
          });

          if (statusResponse.status === 401) {
            redirectToSignIn();
            return;
          }

          if (statusResponse.ok) {
            const detail = (await statusResponse.json()) as {
              status?: unknown;
            };
            completed = detail.status === "completed";
          }
        } catch {
          completed = false;
        }
      }

      if (completed) {
        setState((current) => ({
          ...current,
          phase: "saved",
          message: MESSAGES.report.saved,
        }));
        onFinished();
      } else {
        setState((current) => ({
          ...current,
          phase: "interrupted",
          message: MESSAGES.report.interrupted,
        }));
      }

      await refresh();
    },
    [onFinished, refresh],
  );

  return { state, start };
}

export function ReportCreateButton(props: {
  count: number;
  limitReached: boolean;
  generating: boolean;
  pending: boolean;
  onCreate: () => void;
}): React.JSX.Element {
  const buttonState = reportButtonState(props);

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
      {buttonState.reason ? (
        <span className="text-caption text-warn">{buttonState.reason}</span>
      ) : null}
      <Button
        data-testid="report-create"
        disabled={buttonState.disabled}
        onClick={props.onCreate}
        type="button"
      >
        {MESSAGES.label.button.createReport}
      </Button>
    </div>
  );
}

export function ReportStreamArea(props: {
  state: ReportGeneration;
}): React.JSX.Element | null {
  if (props.state.phase === "idle") {
    return null;
  }

  const isStreaming = props.state.phase === "streaming";
  const isSaved = props.state.phase === "saved";
  const noticeTone = isSaved
    ? "info"
    : props.state.phase === "interrupted"
      ? "warn"
      : "error";

  return (
    <div
      className="mb-5 border-b border-border-soft pb-5"
      data-testid="report-stream"
    >
      {isStreaming ? (
        <h3 className="mb-4 text-h3 text-strong">
          {MESSAGES.ui.reportGenerating}
        </h3>
      ) : null}
      {props.state.text || isStreaming ? (
        <ReportMarkdown
          markdown={props.state.text}
          streaming={isStreaming}
        />
      ) : null}
      {props.state.message ? (
        <NoticeLine
          className={props.state.text ? "mt-5" : undefined}
          data-testid="report-status"
          tone={noticeTone}
        >
          {props.state.message}
          {isSaved && props.state.reportId ? (
            <>
              {" "}
              <Link
                className="font-medium text-primary underline-offset-4 hover:underline"
                href={`/dashboard/reports/${props.state.reportId}`}
              >
                {MESSAGES.ui.open}
              </Link>
            </>
          ) : null}
        </NoticeLine>
      ) : null}
    </div>
  );
}
