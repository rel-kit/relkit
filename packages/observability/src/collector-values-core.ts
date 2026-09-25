import { OBSERVABILITY_MODEL_VERSION } from "./model.js";
import type { RecordLike } from "./collector-values.types.js";
export const INVOCATION_OUTCOMES = new Set([
  "success",
  "validation-error",
  "declared-error",
  "provider-failure",
  "cancelled",
  "timeout",
  "defect",
]);
function isModelRecord(value: RecordLike): boolean {
  return (
    value.version === OBSERVABILITY_MODEL_VERSION &&
    typeof value.signal === "string" &&
    [
      "request",
      "invocation",
      "job",
      "event",
      "operation",
      "tool",
      "agent",
      "log",
      "span",
      "trace",
      "diagnostic",
      "generation",
    ].includes(value.signal)
  );
}
function isInvocation(value: RecordLike): boolean {
  return (
    text(value.id) !== undefined &&
    text(value.functionId) !== undefined &&
    text(value.traceId) !== undefined &&
    text(value.startedAt) !== undefined &&
    text(value.source) !== undefined
  );
}
function isRuntimeLog(value: RecordLike): boolean {
  return (
    text(value.timestamp) !== undefined &&
    text(value.component) !== undefined &&
    text(value.message) !== undefined
  );
}
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
function isRecord(value: unknown): value is RecordLike {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
/** Internal pure guards executed by observed Effect operations. */
export const collectorValuesCore = { isModelRecord, isInvocation, isRuntimeLog, text, isRecord };
