import { FileText } from "lucide-react";

import { DocumentList } from "@/components/dashboard/document-list";
import { StatsPanel } from "@/components/dashboard/stats-panel";
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

      <StatsPanel />

      <Section title={MESSAGES.ui.section.documents}>
        <DocumentList />
      </Section>

      <Section title={MESSAGES.ui.section.reports}>
        <EmptyState icon={FileText} text={MESSAGES.empty.reports} />
      </Section>
    </>
  );
}
