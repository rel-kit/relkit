import type { ObservabilityRecord, ObservabilityStreamEventType } from "@relkit/observability";

/**
 * Maps admitted records onto the existing public stream event names.
 * @param record - Producer/model-owned admitted record.
 * @returns Existing event name, or undefined for signals without a stream projection.
 */
export function streamTypeForRecord(
  record: ObservabilityRecord,
): ObservabilityStreamEventType | undefined {
  if (record.signal === "log") return "log.emitted";
  if (record.signal === "request")
    return record.phase === "started" ? "request.started" : "request.completed";
  if (record.signal === "span")
    return record.status === "started"
      ? "span.started"
      : record.status === "updated"
        ? "span.updated"
        : "span.completed";
  if (record.signal === "job") return "job.changed";
  if (record.signal === "event")
    return record.kind === "publication" ? "event.published" : "event.delivery.changed";
  if (record.signal === "generation") return "generation.changed";
  if (record.signal === "diagnostic") return "diagnostic.changed";
  return undefined;
}
