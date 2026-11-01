/** Display formatting shared by the redesigned lists; pure so it is unit-testable. */

/** "2.4 ms", "184 ms", "1.32 s", "2m 05s". Undefined or invalid input reads as "—". */
export function formatDuration(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 10) return `${ms.toFixed(1)} ms`;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

/** "just now", "42s ago", "3m ago", "5h ago", "2d ago"; future times read as "just now". */
export function relativeTime(iso: string | undefined, now = Date.now()): string {
  const at = iso === undefined ? Number.NaN : Date.parse(iso);
  if (!Number.isFinite(at)) return "—";
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** "14:05:01.206" in local time, for dense log and event rows. */
export function clockTime(iso: string | undefined): string {
  const at = iso === undefined ? Number.NaN : Date.parse(iso);
  if (!Number.isFinite(at)) return "—";
  return new Date(at).toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}

/**
 * Width of a duration bar as a share of the slowest visible item, floored so even the fastest
 * item stays visible. Returns 0 when there is nothing to compare.
 */
export function durationShare(ms: number | undefined, slowest: number, floor = 2): number {
  if (ms === undefined || !Number.isFinite(ms) || ms <= 0 || slowest <= 0) return 0;
  return Math.max(floor, Math.min(100, (ms / slowest) * 100));
}

/** Shortens long identifiers for chips: keeps the head and tail around an ellipsis. */
export function middleTruncate(value: string, max = 28): string {
  if (value.length <= max) return value;
  const head = Math.ceil((max - 1) * 0.6);
  return `${value.slice(0, head)}…${value.slice(value.length - (max - 1 - head))}`;
}
