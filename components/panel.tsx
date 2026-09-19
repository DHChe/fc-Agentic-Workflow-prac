import type * as React from "react";

import { cn } from "@/lib/utils";

export type PanelProps = {
  children: React.ReactNode;
} & React.ComponentProps<"div">;

export function Panel({
  children,
  className,
  ...rest
}: PanelProps): React.JSX.Element {
  return (
    <div
      className={cn(
        "rounded-[10px] border border-border bg-card px-[22px] py-5",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
