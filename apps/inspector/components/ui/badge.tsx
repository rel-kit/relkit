import type { HTMLAttributes } from "react";
import { cx } from "../../lib/cx";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  readonly variant?: "default" | "success" | "warning" | "error";
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      data-variant={variant}
      className={cx(
        "status-badge inline-flex w-fit items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--panel-muted)] px-2.5 py-1 text-[0.7rem] font-semibold text-[var(--muted)]",
        className,
      )}
      {...props}
    />
  );
}
