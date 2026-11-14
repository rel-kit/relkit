import { formatTimestamp } from "./format";

/** Absolute timestamp formatting shared by the trace views: local time with its zone. */
export function formatTraceTimestamp(value: string | undefined): string {
  const formatted = formatTimestamp(value);
  return formatted === "—" ? "Time unavailable" : formatted;
}
