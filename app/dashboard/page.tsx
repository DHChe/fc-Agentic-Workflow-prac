"use client";

import { useCallback, useState } from "react";

import { useDashboardData } from "@/components/dashboard/dashboard-data";
import { DocumentList } from "@/components/dashboard/document-list";
import {
  ReportCreateButton,
  ReportStreamArea,
  useReportGeneration,
} from "@/components/dashboard/report-generator";
import { ReportList } from "@/components/dashboard/report-list";
import { StatsPanel } from "@/components/dashboard/stats-panel";
import { UploadPanel } from "@/components/dashboard/upload-panel";
import { Section } from "@/components/section";
import { MESSAGES } from "@/lib/messages";

export default function DashboardPage(): React.JSX.Element {
  const { data, month, limitReached, pending } = useDashboardData();
  const [reportsReloadKey, setReportsReloadKey] = useState(0);
  const markReportsForReload = useCallback((): void => {
    setReportsReloadKey((current) => current + 1);
  }, []);
  const { state, start } = useReportGeneration({
    onFinished: markReportsForReload,
  });
  const generating = state.phase === "streaming";
  const transactionCount = data?.stats.count ?? 0;

  function createReport(): void {
    if (month) {
      void start(month);
    }
  }

  return (
    <>
      <Section title={MESSAGES.ui.section.upload}>
        <UploadPanel />
      </Section>

      <StatsPanel
        titleAside={
          <ReportCreateButton
            count={transactionCount}
            generating={generating}
            limitReached={limitReached}
            onCreate={createReport}
            pending={pending}
          />
        }
      />

      <Section title={MESSAGES.ui.section.documents}>
        <DocumentList />
      </Section>

      <Section title={MESSAGES.ui.section.reports}>
        <ReportStreamArea state={state} />
        <ReportList reloadKey={reportsReloadKey} />
      </Section>
    </>
  );
}
