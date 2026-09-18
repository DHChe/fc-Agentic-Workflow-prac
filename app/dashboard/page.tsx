import { ChartPie, FileText } from "lucide-react";

import { DocumentList } from "@/components/dashboard/document-list";
import { UploadPanel } from "@/components/dashboard/upload-panel";
import { EmptyState } from "@/components/empty-state";
import { Section } from "@/components/section";
import { MESSAGES } from "@/lib/messages";

export default function DashboardPage(): React.JSX.Element {
  return (
    <>
      <Section title={MESSAGES.ui.section.upload}>
        <UploadPanel />
      </Section>

      <Section title={MESSAGES.ui.section.stats}>
        <EmptyState icon={ChartPie} text={MESSAGES.empty.stats} />
      </Section>

      <Section title={MESSAGES.ui.section.documents}>
        <DocumentList />
      </Section>

      <Section title={MESSAGES.ui.section.reports}>
        <EmptyState icon={FileText} text={MESSAGES.empty.reports} />
      </Section>
    </>
  );
}
