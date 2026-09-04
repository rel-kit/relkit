import { OBSERVABILITY_MODEL_VERSION, type ObservabilityRecord } from "./model.js";
import { isSpanId, isTraceId } from "@relkit/contracts";
import { redactRecord, type RedactionPolicy } from "./redaction.js";

declare const redactedRecordBrand: unique symbol;

/** A record that has crossed the observability redaction boundary. */
export type RedactedObservabilityRecord = ObservabilityRecord & {
  readonly [redactedRecordBrand]: true;
};

const admittedRecords = new WeakSet<object>();

/** Redacts and brands one model record before a collector-owned sink sees it. */
export function admitObservabilityRecord(
  record: ObservabilityRecord,
  policy?: RedactionPolicy,
): RedactedObservabilityRecord | undefined {
  const value = redactRecord(record, policy);
  if (!isModelRecord(value)) return undefined;
  const normalized =
    value.signal === "log" && !("fields" in value)
      ? Object.freeze({ ...value, fields: {} })
      : value;
  admittedRecords.add(normalized);
  return normalized as RedactedObservabilityRecord;
}

/** Returns true only for the in-memory object produced by admission. */
export function isRedactedObservabilityRecord(
  value: unknown,
): value is RedactedObservabilityRecord {
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
  if (record.signal === "span") {
    if (
      !isTraceId(record.traceId) ||
      !isSpanId(record.spanId) ||
      typeof record.name !== "string" ||
      !["internal", "server", "client", "producer", "consumer"].includes(String(record.kind)) ||
      !["started", "updated", "completed"].includes(String(record.status)) ||
      !Number.isSafeInteger(record.revision) ||
      (record.revision as number) < 0
    )
      return false;
  }
  if (
    record.signal === "request" &&
    (!["started", "completed"].includes(String(record.phase)) ||
      typeof record.requestId !== "string" ||
      typeof record.startedAt !== "string")
  )
    return false;
  return true;
}
