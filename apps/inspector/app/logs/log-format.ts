/** Display helpers shared by the log list, detail pane and correlated log sections. */
import type { InspectorObject } from "../../lib/api-types";
import { formatTimestamp, utcTimestamp } from "../../lib/format";
import { text } from "../../lib/observability-model";

/** Level chips offered in the toolbar, in severity order (Neon LogsViewer's set). */
export const LOG_LEVELS = [
  { value: "debug", label: "Debug" },
  { value: "info", label: "Info" },
  { value: "warn", label: "Warn" },
  { value: "error", label: "Error" },
] as const;

/** Token colour for a level word; unknown levels stay muted. */
export function levelClass(level: string): string {
  switch (level.toLowerCase()) {
    case "info":
      return "text-info";
    case "warn":
    case "warning":
      return "text-warning";
    case "error":
    case "fatal":
      return "text-danger";
    default:
      return "text-muted-foreground";
  }
}

/**
 * "14:05:01.206" for today's lines; older lines trade milliseconds for the day, "10-31 14:05:01",
 * so the column stays one width.
 */
export function logClock(value: string): {
  readonly time: string;
  readonly day?: string;
  /** Local time with the date and zone, for the detail pane (IN-35). */
  readonly full: string;
  /** The same moment in UTC, for tooltips. */
  readonly utc: string;
} {
  const date = new Date(value);
  const full = formatTimestamp(value);
  const utc = utcTimestamp(value);
  if (!Number.isFinite(date.getTime())) return { time: "—", full, utc };
  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  const time = date.toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    ...(sameDay ? { fractionalSecondDigits: 3 as const } : {}),
  });
  if (sameDay) return { time, full, utc };
  const pad = (part: number) => String(part).padStart(2, "0");
  return { time, day: `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`, full, utc };
}

/**
 * The viewer's zone name ("CET", "GMT+3") for the time column's heading, so dense rows stay
 * short and still say their zone. Call it in the browser only: the server's zone differs.
 */
export function logTimeZone(at: string = new Date().toISOString(), timeZone?: string): string {
  return (
    new Intl.DateTimeFormat(undefined, {
      ...(timeZone === undefined ? {} : { timeZone }),
      timeZoneName: "short",
    })
      .formatToParts(new Date(at))
      .find((part) => part.type === "timeZoneName")?.value ?? ""
  );
}

/** `key=value` preview of structured fields for a dense row; empty when there are none. */
export function fieldsPreview(item: InspectorObject): string {
  const fields = item.fields;
  if (fields === null || typeof fields !== "object" || Array.isArray(fields)) return "";
  return Object.entries(fields)
    .map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join(" ");
}

/** The entity a log line belongs to: its function, else its component. */
export function logEntity(item: InspectorObject): string {
  return text(item.functionId) || text(item.component);
}
