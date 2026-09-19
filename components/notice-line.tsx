import { CircleAlert, Info, TriangleAlert } from "lucide-react";
import type * as React from "react";

import { cn } from "@/lib/utils";

const toneConfig = {
  info: { icon: Info, className: "text-muted-foreground" },
  warn: { icon: TriangleAlert, className: "text-warn" },
  error: { icon: CircleAlert, className: "text-destructive" },
} as const;

export type NoticeLineProps = {
  tone: "info" | "warn" | "error";
  children: React.ReactNode;
} & React.ComponentProps<"div">;

export function NoticeLine({
  tone,
  children,
  className,
  ...rest
}: NoticeLineProps): React.JSX.Element {
  const { icon: Icon, className: toneClassName } = toneConfig[tone];

  return (
    <div
      className={cn(
        "flex items-start gap-2 text-caption",
        toneClassName,
        className,
      )}
      {...rest}
    >
      <Icon
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0"
        strokeWidth={2}
      />
      <span>{children}</span>
    </div>
  );
}
