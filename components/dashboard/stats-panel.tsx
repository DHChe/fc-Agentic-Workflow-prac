"use client";

import { ChartPie, ChevronLeft, ChevronRight } from "lucide-react";
import type * as React from "react";

import { CategoryDonut } from "@/components/dashboard/category-donut";
import { useDashboardData } from "@/components/dashboard/dashboard-data";
import { EmptyState } from "@/components/empty-state";
import { Section } from "@/components/section";
import { Button } from "@/components/ui/button";
import { CATEGORY_LABELS } from "@/lib/categories";
import { formatAmount, formatMonthLabel, formatRatio } from "@/lib/format";
import { MESSAGES } from "@/lib/messages";
import { shiftMonth } from "@/lib/stats/aggregate";
import { cn } from "@/lib/utils";

const EMPTY_STATS = {
  total: 0,
  count: 0,
  categories: [],
};

export function StatsPanel(props: {
  titleAside?: React.ReactNode;
}): React.JSX.Element {
  const { data, month, pending, setMonth } = useDashboardData();
  // 답을 기다리는 동안에는 0원·빈 상태 대신 "—"를 둔다(pending은 dashboard-data.tsx).
  const stats = pending ? null : (data?.stats ?? EMPTY_STATS);
  const donutCategories = !stats || stats.count === 0 ? [] : stats.categories;

  function moveMonth(delta: number): void {
    if (month) {
      setMonth(shiftMonth(month, delta));
    }
  }

  const monthControls = (
    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-3">
      <div className="flex items-center gap-1">
        <Button
          aria-label={MESSAGES.ui.previousMonth}
          data-testid="stats-prev"
          disabled={!month}
          onClick={() => moveMonth(-1)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <span
          className="min-w-[84px] whitespace-nowrap text-center text-body font-medium text-strong tabular-nums"
          data-testid="stats-month-label"
        >
          {month ? formatMonthLabel(month) : MESSAGES.label.placeholder}
        </span>
        <Button
          aria-label={MESSAGES.ui.nextMonth}
          data-testid="stats-next"
          disabled={!month}
          onClick={() => moveMonth(1)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
      {props.titleAside}
    </div>
  );

  return (
    <Section aside={monthControls} title={MESSAGES.ui.section.stats}>
      <div className="grid gap-7 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col">
          <p
            className={cn(
              "text-amount-lg",
              stats && stats.total < 0 ? "text-destructive" : "text-strong",
            )}
            data-testid="stats-total"
          >
            {stats ? formatAmount(stats.total) : MESSAGES.label.placeholder}
          </p>
          <p
            className="mt-1 whitespace-nowrap text-body text-strong tabular-nums"
            data-testid="stats-count"
          >
            {stats
              ? MESSAGES.ui.transactionCount(stats.count)
              : MESSAGES.label.placeholder}
          </p>
          <p className="mt-1 text-caption text-muted-foreground">
            {MESSAGES.ui.statsDescription}
          </p>
          <div className="mt-5 flex justify-center lg:justify-start">
            <CategoryDonut categories={donutCategories} />
          </div>
        </div>

        {!stats ? null : stats.count === 0 ? (
          <EmptyState
            className="min-h-[200px]"
            data-testid="stats-empty"
            icon={ChartPie}
            text={MESSAGES.empty.stats}
          />
        ) : (
          <div className="min-w-0 overflow-hidden">
            <table className="w-full table-fixed text-cell">
              <colgroup>
                <col />
                <col className="w-[108px] sm:w-[132px]" />
                <col className="w-16 sm:w-20" />
              </colgroup>
              <thead className="text-caption text-muted-foreground">
                <tr className="border-b border-border-soft">
                  <th className="pb-2 text-left font-normal">
                    {MESSAGES.ui.statsColumn.category}
                  </th>
                  <th className="pb-2 text-right font-normal">
                    {MESSAGES.ui.statsColumn.amount}
                  </th>
                  <th className="pb-2 text-right font-normal">
                    {MESSAGES.ui.statsColumn.ratio}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {stats.categories.map((category, index) => (
                  <tr
                    className={index >= 5 ? "hidden md:table-row" : undefined}
                    key={category.key}
                  >
                    <td className="py-2.5 pr-2 text-strong">
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="size-2 shrink-0 rounded-full"
                          style={{
                            backgroundColor: `var(--chart-${index + 1})`,
                          }}
                        />
                        <span className="truncate">
                          {CATEGORY_LABELS[category.key]}
                        </span>
                      </span>
                    </td>
                    <td
                      className={cn(
                        "whitespace-nowrap py-2.5 text-right font-medium tabular-nums",
                        category.amount < 0
                          ? "text-destructive"
                          : "text-strong",
                      )}
                    >
                      {formatAmount(category.amount)}
                    </td>
                    <td className="whitespace-nowrap py-2.5 text-right tabular-nums text-muted-foreground">
                      {formatRatio(category.ratio)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Section>
  );
}
