/*
 * Loading / failed-in-place states, following the dashboardblocks BlockState pattern
 * (MIT, via OpenDesigns). See public/THIRD_PARTY_NOTICES.txt.
 */
import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";

/** Skeleton rows shaped like the list they stand in for, so content does not jump. */
export function LoadingRows({
  rows = 6,
  label,
  className,
}: {
  readonly rows?: number;
  readonly label: string;
  readonly className?: string;
}) {
  return (
    <div role="status" aria-label={label} className={cn("grid gap-2 p-3", className)}>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="h-7 rounded-sm bg-muted [animation:neon-skeleton-pulse_1.6s_ease-in-out_infinite] motion-reduce:animate-none"
          style={{ width: `${62 + ((index * 23) % 36)}%` }}
        />
      ))}
    </div>
  );
}

/** A failure shown where the content would be, with what to do next. */
export function FailedState({
  title,
  description,
  onRetry,
  className,
}: {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly onRetry?: () => void;
  readonly className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "route-state flex flex-col items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-[13px]",
        className,
      )}
    >
      <p className="m-0 flex items-center gap-2 font-medium text-danger">
        <AlertTriangle aria-hidden="true" className="size-4" />
        {title}
      </p>
      {description ? <p className="m-0 text-xs text-muted-foreground">{description}</p> : null}
      {onRetry ? (
        <Button variant="secondary" size="sm" onPress={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}
