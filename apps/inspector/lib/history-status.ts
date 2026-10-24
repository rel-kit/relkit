/** Projects collection status without treating memory acceptance as durable history. */
import type { InspectorObject } from "./api-types";

export function historyStatusMessage(value: InspectorObject | undefined): string {
  if (!value || value.state === "unavailable") return "History status unavailable.";
  if (value.error === "history.writer-conflict")
    return "History unavailable: another Inspector writer owns this directory. Stop that writer before retrying; preserve the database.";
  if (value.state === "degraded")
    return "History collection unavailable. Check the history directory. Restart the Inspector. Existing data is preserved; the app continues running.";
  const connection =
    value.connection === "ambiguous"
      ? "Select a connection file explicitly. Retained history remains readable."
      : value.connection === "disconnected"
        ? "Inspector disconnected. Retained history remains readable; app buffering is bounded."
        : "History collection connected; app buffering and retention are bounded.";
  if (value.incomplete !== true) return connection;
  return `${connection} Incomplete history: ${count(value.dropped)} capture drops, ${count(value.producerFailed)} producer failures, ${count(value.producerDropped)} producer drops. Missing records cannot be reconstructed.`;
}

function count(value: InspectorObject[string]): string {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? String(value)
    : "unavailable";
}
