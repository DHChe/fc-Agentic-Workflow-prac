import { cva } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[5px] border font-medium transition-colors duration-100 ease-linear disabled:pointer-events-none disabled:border-border disabled:bg-muted disabled:text-disabled [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary:
          "border-primary bg-primary text-primary-foreground hover:border-primary/90 hover:bg-primary/90 active:border-primary-press active:bg-primary-press",
        secondary:
          "border-border bg-card text-strong hover:bg-sunken active:bg-muted",
        ghost:
          "border-transparent bg-transparent text-primary hover:bg-accent/60 active:bg-accent",
        danger:
          "border-border bg-card text-destructive hover:bg-destructive-weak/50 active:bg-destructive-weak",
      },
      size: {
        md: "h-[38px] px-5 text-[14px]",
        sm: "h-[30px] px-3 text-[13px]",
        xs: "h-6 px-2 text-[11px]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export type ButtonProps = React.ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "sm" | "xs";
  asChild?: boolean;
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  asChild = false,
  ...rest
}: ButtonProps): React.JSX.Element {
  const Component = asChild ? Slot.Root : "button";

  return (
    <Component
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size }), className)}
      {...rest}
    />
  );
}
