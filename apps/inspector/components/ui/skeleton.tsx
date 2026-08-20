import type { HTMLAttributes } from "react";
import { cx } from "../../lib/cx";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        "animate-pulse rounded-lg bg-[var(--panel-muted)] motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}
