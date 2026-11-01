/*
 * Key/value property list, following the dashboardblocks record-detail properties pattern
 * (MIT, via OpenDesigns). See public/THIRD_PARTY_NOTICES.txt.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";

export interface DetailItem {
  readonly label: string;
  readonly value: ReactNode;
  /** Render the value in mono (ids, hashes, paths). */
  readonly mono?: boolean;
  /** Plain-text value offered on a copy button. */
  readonly copy?: string;
}

export function DetailList({
  items,
  columns = 1,
  className,
}: {
  readonly items: readonly DetailItem[];
  readonly columns?: 1 | 2 | 3;
  readonly className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-3",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 flex-col gap-1">
          <dt className="m-0 font-sans text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {item.label}
          </dt>
          <dd className="m-0 flex min-w-0 items-center gap-1 font-sans text-[13px] text-foreground">
            <span className={cn("min-w-0 break-words", item.mono && "font-mono text-xs")}>
              {item.value === undefined || item.value === null || item.value === ""
                ? "—"
                : item.value}
            </span>
            {item.copy ? <CopyButton value={item.copy} label={`Copy ${item.label}`} /> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
