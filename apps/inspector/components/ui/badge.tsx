import type { HTMLAttributes } from "react";
import { cx } from "../../lib/cx";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cx(
        "inline-flex w-fit items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--panel-muted)] px-2.5 py-1 text-[0.7rem] font-semibold text-[var(--muted)]",
        className,
      )}
      {...props}
    />
  );
}
