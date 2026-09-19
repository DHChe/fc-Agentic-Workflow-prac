import type { LucideIcon } from "lucide-react";
import type * as React from "react";

import { cn } from "@/lib/utils";

export type EmptyStateProps = {
  icon: LucideIcon;
  text: string;
} & React.ComponentProps<"div">;

export function EmptyState({
  icon: Icon,
  text,
  className,
  ...rest
}: EmptyStateProps): React.JSX.Element {
  return (
    <div
      className={cn(
        "flex items-center gap-3 text-body text-muted-foreground",
        className,
      )}
      {...rest}
    >
      <Icon aria-hidden="true" className="size-6 shrink-0" strokeWidth={2} />
      <span>{text}</span>
    </div>
  );
}
