import type { ObservabilityRecord, ObservabilityStreamEventType } from "@relkit/observability";

export function streamTypeForRecord(
  record: ObservabilityRecord,
): ObservabilityStreamEventType | undefined {
  if (record.signal === "log") return "log.emitted";
  if (record.signal === "request") return "request.completed";
  if (record.signal === "span")
    return record.status === "started" ? "span.started" : "span.completed";
  if (record.signal === "job") return "job.changed";
  if (record.signal === "event")
    return record.kind === "publication" ? "event.published" : "event.delivery.changed";
  if (record.signal === "generation") return "generation.changed";
  if (record.signal === "diagnostic") return "diagnostic.changed";
  return undefined;
}
