"use client";

import type { ReactElement } from "react";
import { Tooltip as AriaTooltip, TooltipTrigger } from "react-aria-components";

export function Tooltip({
  trigger,
  children,
}: {
  readonly trigger: ReactElement;
  readonly children: string;
}) {
  return (
    <TooltipTrigger delay={400} closeDelay={0}>
      {trigger}
      <AriaTooltip className="z-50 rounded-md bg-[var(--ink)] px-2.5 py-1.5 text-xs text-[var(--paper)] shadow-lg">
        {children}
      </AriaTooltip>
    </TooltipTrigger>
  );
}
