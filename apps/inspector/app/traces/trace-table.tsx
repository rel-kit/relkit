"use client";

/*
 * Trace rows in the Neon UI QueryHistory style (MIT; see public/THIRD_PARTY_NOTICES.txt): a
 * status icon, the mono trace name, quiet chips, a duration bar against the slowest visible
 * trace and a relative time. Each row is one button so arrow keys walk the list.
 */
import { CircleAlert, CircleCheck, CircleX, Loader } from "lucide-react";
import { durationShare, formatDuration, middleTruncate, relativeTime } from "../../lib/format";
import type { TraceGroup } from "../../lib/observability-model";
import { cn } from "../../lib/utils";

export function TraceTable({
  groups,
  selected,
  onSelect,
}: {
  readonly groups: readonly TraceGroup[];
  readonly selected: string;
  readonly onSelect: (traceId: string) => void;
}) {
  const slowest = Math.max(0, ...groups.map((group) => group.durationMs ?? 0));
  return (
    <ul
      className="trace-table"
      aria-label="Trace results. Use arrow keys to inspect adjacent traces."
    >
      {groups.map((group, index) => {
        const status = traceStatus(group.outcome);
        const Icon = status.icon;
        const share = durationShare(group.durationMs, slowest);
        const isSelected = selected === group.traceId;
        return (
          <li key={group.traceId} data-selected={isSelected}>
            <button
              type="button"
              data-trace-id={group.traceId}
              title={group.name}
              aria-pressed={isSelected}
              onClick={() => onSelect(group.traceId)}
              onKeyDown={(event) => {
                if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? groups.length - 1
                      : index + (event.key === "ArrowDown" ? 1 : -1);
                const id = groups[next]?.traceId;
                if (!id) return;
                onSelect(id);
                event.currentTarget
                  .closest("ul")
                  ?.querySelector<HTMLButtonElement>(`[data-trace-id="${CSS.escape(id)}"]`)
                  ?.focus();
              }}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Icon aria-hidden="true" className={cn("size-3.5 shrink-0", status.className)} />
                <span className="min-w-0 truncate font-mono text-xs leading-5 text-foreground">
                  {group.name}
                </span>
                <span className="sr-only">. {status.label}.</span>
              </span>
              <span className="trace-row-meta">
                <span className="trace-chip">{group.outcome || "in progress"}</span>
                {group.spans.length > 0 ? (
                  <span className="trace-chip">
                    {group.spans.length} {group.spans.length === 1 ? "span" : "spans"}
                  </span>
                ) : null}
                <span className="trace-chip" title={group.traceId}>
                  {middleTruncate(group.traceId, 14)}
                </span>
                {group.durationMs !== undefined ? (
                  <span className="inline-flex items-center gap-1.5">
                    {share > 0 ? (
                      <span aria-hidden="true" className="trace-bar-track">
                        <span
                          className={cn(
                            "block h-full rounded-full",
                            status.tone === "danger" ? "bg-danger/80" : "bg-chart-2/80",
                          )}
                          style={{ width: `${share}%` }}
                        />
                      </span>
                    ) : null}
                    {formatDuration(group.durationMs)}
                  </span>
                ) : null}
                {group.startedAt ? (
                  <time
                    className="text-muted-foreground/70"
                    dateTime={group.startedAt}
                    title={group.startedAt}
                  >
                    {relativeTime(group.startedAt)}
                  </time>
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function traceStatus(outcome: string | undefined) {
  if (!outcome)
    return {
      icon: Loader,
      tone: "live",
      label: "In progress",
      className: "text-live motion-safe:animate-[spin_2.4s_linear_infinite]",
    } as const;
  if (outcome === "success")
    return {
      icon: CircleCheck,
      tone: "success",
      label: "Succeeded",
      className: "text-success",
    } as const;
  if (outcome === "timeout" || outcome === "cancelled")
    return {
      icon: CircleAlert,
      tone: "warning",
      label: outcome,
      className: "text-warning",
    } as const;
  return { icon: CircleX, tone: "danger", label: outcome, className: "text-danger" } as const;
}
