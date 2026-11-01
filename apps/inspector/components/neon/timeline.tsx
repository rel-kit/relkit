/*
 * Adapted from Neon UI CheckpointTimeline and ActivityFeed
 * (https://ui.neon.com/platform/checkpoint-timeline, /platform/activity-feed), MIT.
 * See public/THIRD_PARTY_NOTICES.txt. One rail, square markers coloured by tone, newest first.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/format";
import { EmptyState } from "./empty-state";
import type { StatusTone } from "./status-badge";

export interface TimelineItem {
  readonly id: string;
  readonly title: ReactNode;
  readonly tone?: StatusTone;
  /** Mono metadata parts joined with dots, e.g. ids and counts. */
  readonly meta?: readonly ReactNode[];
  readonly at?: string;
  /** Short word beside the title, e.g. "current" for the active generation. */
  readonly tag?: ReactNode;
  readonly detail?: ReactNode;
  readonly href?: string;
}

const MARKER: Record<StatusTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  neutral: "bg-muted-foreground/50",
  live: "neon-status-breathe bg-live text-live",
};

export function Timeline({
  items,
  label,
  empty,
  className,
}: {
  readonly items: readonly TimelineItem[];
  readonly label: string;
  readonly empty?: ReactNode;
  readonly className?: string;
}) {
  if (items.length === 0)
    return <>{empty ?? <EmptyState size="sm" title="Nothing recorded yet" />}</>;
  return (
    <ol aria-label={label} className={cn("relative m-0 flex list-none flex-col p-0", className)}>
      <span aria-hidden="true" className="absolute top-2 bottom-3 left-0 w-px bg-border" />
      {items.map((item) => {
        const title = (
          <span className="truncate text-[13px] font-medium text-foreground">{item.title}</span>
        );
        return (
          <li key={item.id} className="relative flex items-start gap-3 pb-5 pl-5 last:pb-0">
            <span
              aria-hidden="true"
              className={cn(
                "absolute top-[7px] left-[-2.5px] size-1.5 rounded-[1px]",
                MARKER[item.tone ?? "neutral"],
              )}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex min-w-0 items-baseline gap-2.5">
                {item.href ? (
                  <Link href={item.href} className="min-w-0 truncate no-underline hover:underline">
                    {title}
                  </Link>
                ) : (
                  title
                )}
                {item.tag ? (
                  <span className="shrink-0 font-mono text-[10.5px] text-live">{item.tag}</span>
                ) : null}
                {item.at ? (
                  <time
                    dateTime={item.at}
                    title={item.at}
                    className="ml-auto shrink-0 font-mono text-[10.5px] text-muted-foreground/80 tabular-nums"
                  >
                    {relativeTime(item.at)}
                  </time>
                ) : null}
              </div>
              {item.meta && item.meta.length > 0 ? (
                <p className="m-0 flex min-w-0 flex-wrap items-center gap-x-2 font-mono text-[10.5px] text-muted-foreground">
                  {item.meta.map((part, index) => (
                    <span key={index} className="flex min-w-0 items-center gap-2">
                      {index > 0 ? <span aria-hidden="true">·</span> : null}
                      <span className="truncate">{part}</span>
                    </span>
                  ))}
                </p>
              ) : null}
              {item.detail ? (
                <div className="text-xs text-muted-foreground">{item.detail}</div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
