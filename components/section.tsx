import type * as React from "react";

import { Panel } from "@/components/panel";
import { cn } from "@/lib/utils";

export type SectionProps = {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
} & Omit<React.ComponentProps<"section">, "title">;

export function Section({
  title,
  aside,
  children,
  className,
  ...rest
}: SectionProps): React.JSX.Element {
  return (
    <section className={cn("mb-7", className)} {...rest}>
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="text-h2 text-strong">{title}</h2>
        {aside}
      </div>
      <Panel>{children}</Panel>
    </section>
  );
}
