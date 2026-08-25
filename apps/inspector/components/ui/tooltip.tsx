"use client";

import * as React from "react";
import type { ReactElement, ReactNode } from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { cn } from "../../lib/utils";

export function TooltipProvider({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider {...props} />;
}

export function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger {...props} />;
}

export function TooltipContent({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 rounded-md bg-[var(--ink)] px-2.5 py-1.5 text-xs text-[var(--paper)] shadow-lg",
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}

export function Tooltip(
  props:
    | { readonly trigger: ReactElement; readonly children: string }
    | React.ComponentProps<typeof TooltipPrimitive.Root>,
) {
  if ("trigger" in props) {
    return (
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{props.trigger}</TooltipPrimitive.Trigger>
        <TooltipContent>{props.children}</TooltipContent>
      </TooltipPrimitive.Root>
    );
  }
  return <TooltipPrimitive.Root {...props}>{props.children as ReactNode}</TooltipPrimitive.Root>;
}
