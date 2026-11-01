import type {
  HTMLAttributes,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from "react";
import { cn } from "../../lib/utils";

export function DataTable({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="neon-scroll-fade overflow-x-auto rounded-lg border border-border bg-card">
      <table className={cn("w-full border-collapse text-left text-[13px]", className)} {...props} />
    </div>
  );
}

export function DataTableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "sticky top-0 z-[1] h-8 border-b border-border bg-muted/60 px-3 text-[11px] font-medium tracking-wide text-muted-foreground uppercase backdrop-blur",
        className,
      )}
      scope="col"
      {...props}
    />
  );
}

export function DataTableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn("border-b border-border/70 px-3 py-2 align-middle", className)} {...props} />
  );
}

export function DataTableEmpty({ children }: HTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className="px-4 py-12 text-center text-[13px] text-muted-foreground" colSpan={99}>
      {children}
    </td>
  );
}
