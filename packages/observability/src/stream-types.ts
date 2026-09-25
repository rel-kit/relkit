import { PROTOCOL_VERSION } from "@relkit/contracts";
import type { ObservabilityStreamErrorCode } from "./stream.types.js";
export type * from "./stream.types.js";

export const OBSERVABILITY_STREAM_PROTOCOL = "relkit.observability.stream" as const;
export const OBSERVABILITY_STREAM_VERSION = PROTOCOL_VERSION;
export const DEFAULT_STREAM_MAX_EVENTS = 1_024;
export const DEFAULT_STREAM_QUEUE_SIZE = 64;
export const DEFAULT_STREAM_MAX_QUEUE_SIZE = 256;
export const DEFAULT_STREAM_MAX_SUBSCRIBERS = 256;
export const OBSERVABILITY_STREAM_EVENT_TYPES = [
  "request.started",
  "request.completed",
  "log.emitted",
  "span.started",
  "span.updated",
  "span.completed",
  "job.changed",
  "event.published",
  "event.delivery.changed",
  "generation.changed",
  "diagnostic.changed",
] as const;
/**
 * Compatibility error for invalid, expired, or closed stream operations.
 * Effect stream utilities return `StreamValidationError` for input failures.
 * @example
 * if (error instanceof ObservabilityStreamError) console.error(error.code);
 */
export class ObservabilityStreamError extends TypeError {
  /**
   * Creates a stream error with a stable public code.
   * @param code - Invalid, expired, future, or closed operation code.
   * @param message - Human-readable explanation.
   * @example
   * throw new ObservabilityStreamError("RELKIT_OBSERVABILITY_STREAM_INVALID", "Invalid cursor");
   */
  constructor(
    readonly code: ObservabilityStreamErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ObservabilityStreamError";
  }
}
