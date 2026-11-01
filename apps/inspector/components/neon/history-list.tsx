/*
 * Adapted from Neon UI QueryHistory (https://ui.neon.com/database/query-history), MIT.
 * See public/THIRD_PARTY_NOTICES.txt. Generalized from SQL history to any recorded run:
 * requests, job runs, invocations. Filtering and fetching stay with the caller.
 */
"use client";

import { CircleAlert, CircleCheck, CircleDashed, CircleX, Loader } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { durationShare, formatDuration, relativeTime } from "@/lib/format";
import type { StatusTone } from "./status-badge";

export interface HistoryEntry {
  readonly id: string;
  readonly tone: StatusTone;
  /** Screen-reader word for the tone, e.g. "Failed" or "200 OK". */
  readonly statusLabel: string;
  /** Primary mono line: a path, a run id, a statement. */
  readonly title: ReactNode;
  /** Short leading token such as an HTTP method or job name. */
  readonly lead?: ReactNode;
  /** Secondary chips on the metadata line. */
  readonly meta?: readonly ReactNode[];
  readonly at?: string;
  readonly durationMs?: number;
  readonly href?: string;
  readonly selected?: boolean;
  readonly attributes?: Readonly<Record<`data-${string}`, string>>;
}

const ICON: Record<StatusTone, { icon: typeof CircleCheck; className: string }> = {
  success: { icon: CircleCheck, className: "text-success" },
  warning: { icon: CircleAlert, className: "text-warning" },
  danger: { icon: CircleX, className: "text-danger" },
  info: { icon: CircleDashed, className: "text-info" },
  neutral: { icon: CircleDashed, className: "text-muted-foreground" },
  live: { icon: Loader, className: "text-live motion-safe:animate-[spin_2.4s_linear_infinite]" },
};

export function HistoryList({
  label,
  entries,
  onSelect,
  actions,
  showDurationBars = true,
  className,
}: {
  readonly label: string;
  readonly entries: readonly HistoryEntry[];
  readonly onSelect?: (entry: HistoryEntry) => void;
  readonly actions?: (entry: HistoryEntry) => ReactNode;
  readonly showDurationBars?: boolean;
  readonly className?: string;
}) {
  const slowest = Math.max(0, ...entries.map((entry) => entry.durationMs ?? 0));
  return (
    <ul aria-label={label} className={cn("m-0 min-w-0 list-none p-0", className)}>
      {entries.map((entry) => {
        const status = ICON[entry.tone];
        const Icon = status.icon;
        const share = showDurationBars ? durationShare(entry.durationMs, slowest) : 0;
        const head = (
          <span className="flex min-w-0 items-center gap-2">
            <Icon aria-hidden="true" className={cn("size-3.5 shrink-0", status.className)} />
            <span className="sr-only">{entry.statusLabel}.</span>
            {entry.lead ? (
              <span className="shrink-0 font-mono text-[11px] font-semibold text-foreground/85">
                {entry.lead}
              </span>
            ) : null}
            <span className="min-w-0 truncate font-mono text-xs leading-5 text-foreground">
              {entry.title}
            </span>
          </span>
        );
        const body = (
          <>
            {head}
            <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pl-[22px] text-[11px] text-muted-foreground tabular-nums">
              {entry.meta?.map((item, index) => (
                <span
                  key={index}
                  className="inline-flex min-w-0 max-w-64 items-center truncate rounded-sm bg-muted/60 px-1.5 py-px font-mono text-[10.5px]"
                >
                  {item}
                </span>
              ))}
              {entry.durationMs !== undefined ? (
                <span className="inline-flex items-center gap-1.5">
                  {share > 0 ? (
                    <span
                      aria-hidden="true"
                      className="h-1 w-14 overflow-hidden rounded-full bg-muted"
                    >
                      <span
                        className={cn(
                          "block h-full rounded-full",
                          entry.tone === "danger" ? "bg-danger/80" : "bg-chart-2/80",
                        )}
                        style={{ width: `${share}%` }}
                      />
                    </span>
                  ) : null}
                  {formatDuration(entry.durationMs)}
                </span>
              ) : null}
              {entry.at ? (
                <time className="text-muted-foreground/70" dateTime={entry.at} title={entry.at}>
                  {relativeTime(entry.at)}
                </time>
              ) : null}
            </span>
          </>
        );
        const rowClass = cn(
          "group/history block min-w-0 rounded-sm px-3 py-2 text-left no-underline outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50",
          entry.selected && "bg-muted/60",
        );
        return (
          <li
            key={entry.id}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border/60 last:border-b-0"
            data-selected={entry.selected ? "true" : undefined}
            {...entry.attributes}
          >
            {entry.href ? (
              <Link
                href={entry.href}
                className={rowClass}
                aria-current={entry.selected || undefined}
              >
                {body}
              </Link>
            ) : onSelect ? (
              <button
                type="button"
                className={cn(rowClass, "w-full")}
                aria-pressed={entry.selected ?? false}
                onClick={() => onSelect(entry)}
              >
                {body}
              </button>
            ) : (
              <div className={rowClass}>{body}</div>
            )}
            {actions ? (
              <div className="flex items-center gap-0.5 pr-2">{actions(entry)}</div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Segmented control from QueryHistory's filter, e.g. All / Failed / Slow. */
export function SegmentedFilter<Value extends string>({
  label,
  options,
  value,
  onChange,
}: {
  readonly label: string;
  readonly options: readonly {
    readonly value: Value;
    readonly label: string;
    readonly count?: number;
  }[];
  readonly value: Value;
  readonly onChange: (value: Value) => void;
}) {
  return (
    <fieldset className="m-0 flex h-8 shrink-0 items-center rounded-md border border-border bg-background p-0.5">
      <legend className="sr-only">{label}</legend>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex h-6 items-center gap-1 rounded-sm px-2 text-[11px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              active ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
            {option.count !== undefined ? (
              <span className="tabular-nums text-muted-foreground">{option.count}</span>
            ) : null}
          </button>
        );
      })}
    </fieldset>
  );
}
