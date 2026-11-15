/** Projects collection status without treating memory acceptance as durable history. */
import { InspectorApiError, type InspectorObject } from "./api-types";

/** What a page shows where history content would be while history cannot be read. */
export const HISTORY_UNAVAILABLE_TEXT = "History is unavailable; restart the Inspector.";

/**
 * Whether a failed request failed because history cannot be read (the tool answers a history
 * query with 503 `History unavailable`). It stays unavailable until the Inspector restarts, so
 * asking again only keeps a page waiting.
 */
export function isHistoryUnavailable(error: unknown): boolean {
  return (
    error instanceof InspectorApiError &&
    error.status === 503 &&
    /^history[ .]unavailable$/i.test(error.code)
  );
}

export function historyStatusMessage(value: InspectorObject | undefined): string {
  if (!value || value.state === "unavailable") return "History status unavailable.";
  if (value.error === "history.writer-conflict")
    return "History unavailable: another Inspector writer owns this directory. Stop that writer before retrying; preserve the database.";
  if (historyFailed(value))
    return "History collection unavailable. Check the history directory. Restart the Inspector. Existing data is preserved; the app continues running.";
  // The application session has its own status; this line is about history only.
  const collection = collectionSentence(value);
  if (!historyIncomplete(value)) return collection;
  const lost = recordsLost(value);
  const sentence = lost === undefined ? undefined : recordsLostSentence(lost);
  return `${collection} ${sentence ?? "Some records from this session are missing from history."} Missing records cannot be reconstructed.`;
}

/**
 * Whether history itself failed. A tool that sends `collection` says so with `history-unavailable`
 * and reports `error` only for history; an older tool sends `error` for an unreachable
 * application too, so there any `error` or a degraded state counts.
 */
export function historyFailed(value: InspectorObject | undefined): boolean {
  if (value === undefined) return false;
  if (typeof value.collection === "string") return value.collection === "history-unavailable";
  return value.state === "degraded" || value.error !== undefined;
}

function collectionSentence(value: InspectorObject): string {
  switch (value.collection) {
    case "application-unreachable":
      return "The application is unreachable. Retained history is intact.";
    case "waiting-for-application":
      return "Waiting for the application to connect. Retained history is readable.";
    case "application-invalid":
      return "The application sent records the Inspector could not accept. Retained history is intact.";
    default:
      return value.connection === "ambiguous" || value.connection === "disconnected"
        ? "Retained history remains readable; new records arrive when the application connects."
        : "History collection connected; app buffering and retention are bounded.";
  }
}

/**
 * Whether records are missing from history. The tool's `incomplete` flag also covers a session
 * that has not been collected yet; when it reports that no record was lost, nothing is missing.
 */
export function historyIncomplete(value: InspectorObject | undefined): boolean {
  if (value?.incomplete !== true) return false;
  return recordsLost(value)?.total !== 0;
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
  const parts = [
    ...(lost.byApplicationProducer === 0
      ? []
      : [
          `the application could not hand ${number(lost.byApplicationProducer)} records to its inspection buffer`,
        ]),
    ...(lost.byInspectionBuffer === 0
      ? []
      : [`the buffer dropped ${number(lost.byInspectionBuffer)} before the Inspector stored them`]),
  ];
  return `Some requests, logs or spans from this session are missing from history: ${parts.join(", and ")}.`;
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
