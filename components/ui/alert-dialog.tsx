"use client";

import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import type * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AlertDialog(
  props: React.ComponentProps<typeof AlertDialogPrimitive.Root>,
): React.JSX.Element {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

export function AlertDialogTrigger(
  props: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>,
): React.JSX.Element {
  return (
    <AlertDialogPrimitive.Trigger
      data-slot="alert-dialog-trigger"
      {...props}
    />
  );
}

export function AlertDialogPortal(
  props: React.ComponentProps<typeof AlertDialogPrimitive.Portal>,
): React.JSX.Element {
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
  );
}

export function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>): React.JSX.Element {
  return (
    <AlertDialogPrimitive.Overlay
      className={cn("fixed inset-0 z-50 bg-strong/20", className)}
      data-slot="alert-dialog-overlay"
      {...props}
    />
  );
}

export function AlertDialogContent({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content>): React.JSX.Element {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-40px)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 gap-5 rounded-[10px] border border-border bg-popover px-[22px] py-5 text-popover-foreground shadow-[0_8px_24px_rgb(20_32_31_/_10%)] outline-none",
          className,
        )}
        data-slot="alert-dialog-content"
        {...props}
      />
    </AlertDialogPortal>
  );
}

export function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">): React.JSX.Element {
  return (
    <div
      className={cn("grid gap-2 text-left", className)}
      data-slot="alert-dialog-header"
      {...props}
    />
  );
}

export function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">): React.JSX.Element {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      data-slot="alert-dialog-footer"
      {...props}
    />
  );
}

export function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>): React.JSX.Element {
  return (
    <AlertDialogPrimitive.Title
      className={cn("text-h2 text-strong", className)}
      data-slot="alert-dialog-title"
      {...props}
    />
  );
}

export function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<
  typeof AlertDialogPrimitive.Description
>): React.JSX.Element {
  return (
    <AlertDialogPrimitive.Description
      className={cn("text-body text-muted-foreground", className)}
      data-slot="alert-dialog-description"
      {...props}
    />
  );
}

export function AlertDialogAction({
  className,
  variant = "danger",
  size = "md",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action> &
  Pick<React.ComponentProps<typeof Button>, "variant" | "size">): React.JSX.Element {
  return (
    <Button asChild size={size} variant={variant}>
      <AlertDialogPrimitive.Action
        className={cn(className)}
        data-slot="alert-dialog-action"
        {...props}
      />
    </Button>
  );
}

export function AlertDialogCancel({
  className,
  variant = "secondary",
  size = "md",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel> &
  Pick<React.ComponentProps<typeof Button>, "variant" | "size">): React.JSX.Element {
  return (
    <Button asChild size={size} variant={variant}>
      <AlertDialogPrimitive.Cancel
        className={cn(className)}
        data-slot="alert-dialog-cancel"
        {...props}
      />
    </Button>
  );
}
