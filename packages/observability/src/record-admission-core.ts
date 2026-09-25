import { isSpanId, isTraceId } from "@relkit/contracts";
import { OBSERVABILITY_MODEL_VERSION } from "./model.js";
import type { RedactedObservabilityRecord } from "./record-admission.types.js";
const admittedRecords = new WeakSet<object>();
function admitRedacted(value: unknown): RedactedObservabilityRecord | undefined {
  if (!isModelRecord(value)) return undefined;
  const normalized =
    value.signal === "log" && !("fields" in value)
      ? Object.freeze({ ...value, fields: {} })
      : value;
  admittedRecords.add(normalized);
  return normalized as RedactedObservabilityRecord;
}
function isRedactedRecord(value: unknown): value is RedactedObservabilityRecord {
  return isModelRecord(value) && admittedRecords.has(value);
}
function isModelRecord(
  value: unknown,
): value is object & { readonly version: number; readonly signal: string } {
  if (!(
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as { readonly version?: unknown }).version === OBSERVABILITY_MODEL_VERSION &&
    typeof (value as { readonly signal?: unknown }).signal === "string"
  ))
    return false;
  const record = value as Record<string, unknown>;
  if (
    !new Set([
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
    ]).has(String(record.signal))
  )
    return false;
  if (record.traceId !== undefined && !isTraceId(record.traceId)) return false;
  if (record.spanId !== undefined && !isSpanId(record.spanId)) return false;
  if (
    record.signal === "span" &&
    (!isTraceId(record.traceId) ||
      !isSpanId(record.spanId) ||
      typeof record.name !== "string" ||
      !["internal", "server", "client", "producer", "consumer"].includes(String(record.kind)) ||
      !["started", "updated", "completed"].includes(String(record.status)) ||
      !Number.isSafeInteger(record.revision) ||
      (record.revision as number) < 0)
  )
    return false;
  if (
    record.signal === "request" &&
    (!["started", "completed"].includes(String(record.phase)) ||
      typeof record.requestId !== "string" ||
      typeof record.startedAt !== "string")
  )
    return false;
  return true;
}
export const recordAdmissionCore = { admitRedacted, isRedactedRecord };
