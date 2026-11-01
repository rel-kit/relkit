/** Absolute timestamp formatting shared by the trace views. */
export function formatTraceTimestamp(value: string | undefined): string {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed)
    ? new Date(parsed).toISOString().replace("T", " ").replace("Z", " UTC")
    : "Time unavailable";
}
