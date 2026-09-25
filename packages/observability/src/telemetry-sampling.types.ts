import type { RedactedObservabilityRecord } from "./record-admission.js";

/** The reason a record was selected or suppressed for remote export. */
export type TelemetryExportDecision = "export" | "sampled-out" | "severity-filtered";

/** Bounded labels for deterministic sampling metrics. */
export type SamplingOperation = "traceIsSampled" | "telemetryExportDecision" | "isTelemetryError";

/** An optional export callback receiving a redacted record and its decision. */
export type TelemetryExportRecord = (
  record: RedactedObservabilityRecord,
  decision: TelemetryExportDecision,
  signal?: AbortSignal,
) => void | Promise<void>;
