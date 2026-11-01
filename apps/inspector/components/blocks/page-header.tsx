/*
 * Compact page header, following the dashboardblocks PageHeader layout (MIT, via OpenDesigns).
 * See public/THIRD_PARTY_NOTICES.txt.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  /** Small context line above the title, e.g. the resource kind of a detail page. */
  readonly kicker?: ReactNode;
  /** Badges beside the title (count, status, exposure). */
  readonly badges?: ReactNode;
  /** Right-aligned controls. */
  readonly actions?: ReactNode;
  /** Mono identity line under the title (ids, hashes, source). */
  readonly meta?: ReactNode;
  readonly icon?: ReactNode;
  readonly className?: string;
}

export function PageHeader({
  actions,
  badges,
  className,
  description,
  icon,
  kicker,
  meta,
  title,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "page-heading flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <span
            aria-hidden="true"
            className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground [&_svg]:size-4"
          >
            {icon}
          </span>
        ) : null}
        <div className="flex min-w-0 flex-col gap-1">
          {kicker ? (
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              {kicker}
            </p>
          ) : null}
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
              {title}
            </h1>
            {badges}
          </div>
          {description ? (
            <p className="max-w-2xl text-[13px] leading-5 text-muted-foreground">{description}</p>
          ) : null}
          {meta ? (
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
              {meta}
            </div>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
