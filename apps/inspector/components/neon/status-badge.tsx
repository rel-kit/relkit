/*
 * Adapted from Neon UI StatusBadge (https://ui.neon.com/base-components/status-badge), MIT.
 * See public/THIRD_PARTY_NOTICES.txt. Generalized from app lifecycle states to inspector tones.
 */
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral" | "live";

export type StatusBadgeProps = Omit<ComponentProps<"span">, "children"> & {
  readonly tone: StatusTone;
  readonly label: string;
};

/*
 * A square dot and a quiet mono word. Colour lives only in the dot so a wall of badges reads
 * calmly; "live" breathes slowly (and holds steady under reduced motion).
 */
const DOT: Record<StatusTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  neutral: "bg-muted-foreground/50",
  live: "neon-status-breathe bg-live text-live",
};

export function StatusBadge({ className, label, tone, ...props }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border border-border/70 bg-card px-1.5 py-0.5 font-mono text-[11px] leading-4 text-muted-foreground whitespace-nowrap",
        className,
      )}
      data-slot="status-badge"
      data-tone={tone}
      {...props}
    >
      <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-[1px]", DOT[tone])} />
      {label}
    </span>
  );
}

/** Maps the loose status words the API reports onto a tone. Failures win over success words. */
export function statusTone(value: string | undefined): StatusTone {
  const word = (value ?? "").toLowerCase();
  if (
    /(error|fail|dead|rejected|invalid|offline|timed-out|cancelled|unhealthy|\b5\d\d\b)/.test(word)
  )
    return "danger";
  if (/(warn|retry|delayed|degraded|draining|stale|reconnecting|partial|\b4\d\d\b)/.test(word))
    return "warning";
  if (
    /^(ok|success|succeeded|completed|healthy|ready|connected|active|available|valid|pass)\b/.test(
      word,
    )
  )
    return "success";
  if (/(running|leased|streaming|connecting|pending|queued|accepted|sleeping|live)/.test(word))
    return "live";
  if (/(info|debug|trace)/.test(word)) return "info";
  return "neutral";
}
