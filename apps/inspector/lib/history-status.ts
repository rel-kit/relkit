/** Projects collection status without treating memory acceptance as durable history. */
import type { InspectorObject } from "./api-types";

export function historyStatusMessage(value: InspectorObject | undefined): string {
  if (!value || value.state === "unavailable") return "History status unavailable.";
  if (value.error === "history.writer-conflict")
    return "History unavailable: another Inspector writer owns this directory. Stop that writer before retrying; preserve the database.";
  if (value.state === "degraded")
    return "History collection unavailable. Check the history directory. Restart the Inspector. Existing data is preserved; the app continues running.";
  // The application session has its own status; this line is about history only.
  const collection =
    value.connection === "ambiguous" || value.connection === "disconnected"
      ? "Retained history remains readable; new records arrive when the application connects."
      : "History collection connected; app buffering and retention are bounded.";
  if (value.incomplete !== true) return collection;
  const lost = recordsLost(value);
  const sentence = lost === undefined ? undefined : recordsLostSentence(lost);
  return `${collection} ${sentence ?? "Some records from this session are missing from history."} Missing records cannot be reconstructed.`;
}

/** Records that never reached history (IN-17), in the two places they can be lost. */
export interface RecordsLost {
  readonly total: number;
  /** The application's producer could not hand them to its inspection buffer. */
  readonly byApplicationProducer: number;
  /** The inspection buffer evicted them before the Inspector stored them. */
  readonly byInspectionBuffer: number;
}

/** Reads `recordsLostBeforeHistory`, or the deprecated counters of an older Inspector. */
export function recordsLost(value: InspectorObject | undefined): RecordsLost | undefined {
  if (value === undefined) return undefined;
  const named = record(value.recordsLostBeforeHistory);
  const byApplicationProducer = count(named?.byApplicationProducer ?? value.producerDropped);
  const byInspectionBuffer = count(named?.byInspectionBuffer ?? value.dropped);
  if (byApplicationProducer === undefined && byInspectionBuffer === undefined) return undefined;
  const producer = byApplicationProducer ?? 0;
  const buffer = byInspectionBuffer ?? 0;
  return { total: producer + buffer, byApplicationProducer: producer, byInspectionBuffer: buffer };
}

export function recordsLostSentence(lost: RecordsLost): string | undefined {
  if (lost.total === 0) return undefined;
  return `Some requests, logs or spans from this session are missing from history: the application could not hand ${number(lost.byApplicationProducer)} records to its inspection buffer, and the buffer dropped ${number(lost.byInspectionBuffer)} before the Inspector stored them.`;
}

/** Gaps in the live stream only delay the page, which then refreshes; nothing is lost. */
export function missedLiveUpdatesNote(missed: number | undefined): string | undefined {
  return missed !== undefined && missed > 0
    ? "Live updates were missed; the page refreshed. No record is lost."
    : undefined;
}

function number(value: number): string {
  return value.toLocaleString("en-US");
}

function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function record(value: unknown): InspectorObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as InspectorObject)
    : undefined;
}
