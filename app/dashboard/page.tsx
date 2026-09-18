import { ChartPie, FileText, Upload } from "lucide-react";

import { DocumentList } from "@/components/dashboard/document-list";
import { EmptyState } from "@/components/empty-state";
import { Section } from "@/components/section";
import { MESSAGES } from "@/lib/messages";

export default function DashboardPage(): React.JSX.Element {
  return (
    <>
      <Section title={MESSAGES.ui.section.upload}>
        <div className="flex items-center gap-3 rounded-[7px] bg-sunken p-4 text-body text-muted-foreground">
          <Upload
            aria-hidden="true"
            className="size-6 shrink-0 text-primary"
            strokeWidth={2}
          />
          <span>{MESSAGES.ui.uploadPrompt}</span>
        </div>
        <p className="mt-2 text-caption text-muted-foreground">
          {MESSAGES.ui.uploadLimits}
        </p>
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
