import { cn } from "../../lib/utils";

/**
 * Neon LogsViewer's streaming indicator: a breathing dot while live updates apply, a still dot
 * while the view is paused, scrolled, paged or inspecting a line.
 */
export function StreamState({
  blocked,
  live,
}: {
  readonly blocked: boolean;
  readonly live: string;
}) {
  const streaming = !blocked && live === "connected";
  const label = blocked
    ? "Paused"
    : streaming
      ? "Streaming"
      : live.charAt(0).toUpperCase() + live.slice(1);
  return (
    <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-[1px]",
          streaming
            ? "neon-status-breathe bg-live text-live"
            : blocked
              ? "bg-muted-foreground/50"
              : "bg-warning",
        )}
      />
      {label}
    </span>
  );
}
