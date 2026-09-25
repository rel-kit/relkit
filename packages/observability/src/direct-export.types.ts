import type { Effect } from "effect";
import type { RedactedObservabilityRecord } from "./record-admission.js";
import type { TelemetryExportDecision } from "./telemetry-sampling.types.js";
import type { DirectExportError } from "./direct-export.js";

/** A record accepted for direct export with its sampling decision. */
export interface DirectExportItem {
  readonly record: RedactedObservabilityRecord;
  readonly decision: TelemetryExportDecision;
}

/** Bounded exporter operations owned by one runtime. */
export interface DirectExportOperations {
  readonly enqueue: (item: DirectExportItem) => Effect.Effect<boolean>;
  readonly flush: () => Effect.Effect<void, DirectExportError>;
  readonly close: () => Effect.Effect<void, DirectExportError>;
  readonly shutdown: () => Effect.Effect<void>;
}
