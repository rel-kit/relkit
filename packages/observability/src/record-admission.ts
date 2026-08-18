import { OBSERVABILITY_MODEL_VERSION, type ObservabilityRecord } from "./model.js";
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
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as { readonly version?: unknown }).version === OBSERVABILITY_MODEL_VERSION &&
    typeof (value as { readonly signal?: unknown }).signal === "string"
  );
}
