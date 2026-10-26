/** Coalesces UI invalidations without retaining another copy of committed records. */
import type { ObservabilityRecord, ObservabilityStreamEventType } from "@relkit/observability";

/** Uses existing event names so current graph/history/job views refresh after commits. */
export function collectionChange(record: ObservabilityRecord): ObservabilityStreamEventType {
  switch (record.signal) {
    case "log":
      return "log.emitted";
    case "request":
      return record.phase === "started" ? "request.started" : "request.completed";
    case "job":
      return "job.changed";
    case "event":
      return record.kind === "delivery" ? "event.delivery.changed" : "event.published";
    case "generation":
      return "generation.changed";
    case "diagnostic":
      return "diagnostic.changed";
    default:
      return "span.updated";
  }
}
