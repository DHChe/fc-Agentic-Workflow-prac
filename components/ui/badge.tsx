import type * as React from "react";

import { cn } from "@/lib/utils";

const toneClasses = {
  processing: "border-accent-border bg-accent text-accent-foreground",
  completed: "border-pos-border bg-pos-weak text-pos",
  failed:
    "border-destructive-border bg-destructive-weak text-destructive",
  warn: "border-warn-border bg-warn-weak text-warn",
  duplicate: "border-border bg-sunken text-muted-foreground",
} as const;

export type BadgeProps = {
  tone: "processing" | "completed" | "failed" | "warn" | "duplicate";
  children: React.ReactNode;
} & React.ComponentProps<"span">;

export function Badge({
  tone,
  children,
  className,
  ...rest
}: BadgeProps): React.JSX.Element {
  return (
    <span
      className={cn(
        "inline-flex h-[21px] items-center whitespace-nowrap rounded-[3px] border px-1.5 text-micro",
        toneClasses[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
