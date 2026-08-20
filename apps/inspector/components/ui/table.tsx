import type {
  HTMLAttributes,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from "react";
import { cx } from "../../lib/cx";

export function DataTable({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--panel)]">
      <table className={cx("w-full border-collapse text-left text-sm", className)} {...props} />
    </div>
  );
}

export function DataTableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cx(
        "border-b border-[var(--line)] bg-[var(--panel-muted)] px-4 py-3 text-xs font-semibold text-[var(--muted)]",
        className,
      )}
      scope="col"
      {...props}
    />
  );
}

export function DataTableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cx("border-b border-[var(--line)] px-4 py-3 align-top", className)} {...props} />
  );
}

export function DataTableEmpty({ children }: HTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className="px-4 py-10 text-center text-sm text-[var(--muted)]" colSpan={99}>
      {children}
    </td>
  );
}
