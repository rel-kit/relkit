import type { ReactNode } from "react";
import { StatusBadge, statusTone } from "../../components/neon/status-badge";
import type { InspectorObject } from "../../lib/api-types";

/** Small shared helpers for the jobs views; display only, no data access. */

export function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function record(value: unknown): InspectorObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as InspectorObject)
    : undefined;
}

/** Elapsed milliseconds between two ISO stamps, when both are present and ordered. */
export function elapsed(start: unknown, end: unknown): number | undefined {
  const from = typeof start === "string" ? Date.parse(start) : Number.NaN;
  const to = typeof end === "string" ? Date.parse(end) : Number.NaN;
  return Number.isFinite(from) && Number.isFinite(to) && to >= from ? to - from : undefined;
}

/** "Nov 1, 14:05:01" for absolute stamps; "—" when missing or invalid. */
export function stamp(value: unknown): string {
  if (typeof value !== "number" && typeof value !== "string") return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** Non-zero state counts as quiet status badges; a muted dash when everything is zero. */
export function StateCounts({
  counts,
  empty = "No runs",
}: {
  readonly counts: Readonly<Record<string, number>>;
  readonly empty?: ReactNode;
}) {
  const entries = Object.entries(counts).filter(([, count]) => count > 0);
  if (entries.length === 0) return <span className="text-xs text-muted-foreground">{empty}</span>;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {entries.map(([state, count]) => (
        <StatusBadge
          key={state}
          tone={statusTone(state)}
          label={`${count.toLocaleString("en-US")} ${state}`}
        />
      ))}
    </span>
  );
}

/** Inline notice for partial or stale pages; status role so it is announced once. */
export function Notice({ children }: { readonly children: ReactNode }) {
  return (
    <p
      className="m-0 flex items-center gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning"
      role="status"
    >
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-[1px] bg-warning" />
      {children}
    </p>
  );
}

/** Mono count chip for section headers. */
export function Count({ value }: { readonly value: number }) {
  return (
    <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">
      {value}
    </span>
  );
}
