"use client";

import { useDashboardData } from "@/components/dashboard/dashboard-data";
import { MESSAGES } from "@/lib/messages";

export function UsageCounter(): React.JSX.Element | null {
  const { data } = useDashboardData();

  if (!data) {
    return null;
  }

  return (
    <span
      className="whitespace-nowrap text-caption tabular-nums text-muted-foreground"
      data-testid="usage-counter"
    >
      {MESSAGES.label.usage(data.usage.used)}
    </span>
  );
}
