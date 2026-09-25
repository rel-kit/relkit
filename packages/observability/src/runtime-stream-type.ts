import { Effect } from "effect";
import type { ObservabilityRecord } from "./model.js";
import type { ObservabilityStreamEventType } from "./stream.js";

/**
 * Maps a record to its stream event type when the stream supports its signal.
 *
 * @param record - Admitted observability record.
 * @returns An Effect with the corresponding event type, if supported.
 * @example
 * Effect.runSync(streamTypeEffect(logRecord));
 */
export const streamTypeEffect = Effect.fn("ObservabilityRuntime.streamType")(function* (
  record: ObservabilityRecord,
) {
  if (record.signal === "request")
    return record.phase === "started" ? "request.started" : "request.completed";
  if (record.signal === "log") return "log.emitted";
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
  return record.signal === "diagnostic" ? "diagnostic.changed" : undefined;
});

/**
 * Synchronous compatibility adapter for stream event selection.
 *
 * @param record - Admitted observability record.
 * @returns The corresponding event type, if supported.
 * @example
 * streamType(logRecord);
 */
export function streamType(record: ObservabilityRecord): ObservabilityStreamEventType | undefined {
  return Effect.runSync(streamTypeEffect(record));
}
