import type { HTMLAttributes } from "react";
import { cx } from "../../lib/cx";

export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cx(
        "rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 shadow-[var(--shadow)]",
        className,
      )}
      {...props}
    />
  );
}
