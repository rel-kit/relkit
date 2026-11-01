import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  readonly variant?: "default" | "success" | "warning" | "error" | "info";
}

const tones = {
  default: "border-border bg-muted text-muted-foreground",
  success: "border-success/30 bg-success-soft text-success",
  warning: "border-warning/30 bg-warning-soft text-warning",
  error: "border-danger/30 bg-danger-soft text-danger",
  info: "border-info/30 bg-info-soft text-info",
} as const;

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      data-variant={variant}
      className={cn(
        "status-badge inline-flex w-fit items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap [&_svg]:size-3",
        tones[variant],
        className,
      )}
      {...props}
    />
  );
}
