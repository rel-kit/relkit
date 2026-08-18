import type { FileHandle } from "node:fs/promises";
import {
  OBSERVABILITY_MODEL_VERSION,
  type ObservabilityRecord,
  type ObservabilitySignal,
} from "../model.js";

export interface SegmentState {
  readonly directory: string;
  readonly activePath: string;
  handle: FileHandle;
  bytes: number;
  records: number;
}

export function positive(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError("Segment bound must be positive");
  }
  return value;
}

export function isRecordForSignal(
  value: unknown,
  signal: ObservabilitySignal,
): value is ObservabilityRecord {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as { readonly version?: unknown }).version === OBSERVABILITY_MODEL_VERSION &&
    (value as { readonly signal?: unknown }).signal === signal
  );
}

export function dayFor(record: ObservabilityRecord): string {
  const time = Date.parse(timestampFor(record));
  if (!Number.isFinite(time)) throw new TypeError("Observability record timestamp is invalid");
  return new Date(time).toISOString().slice(0, 10);
}

function timestampFor(record: ObservabilityRecord): string {
  const value = record as unknown as Record<string, unknown>;
  const timestamp = value.timestamp ?? value.startedAt ?? value.occurredAt ?? value.acceptedAt;
  if (typeof timestamp === "string" && timestamp.trim() !== "") return timestamp;
  throw new TypeError("Observability record timestamp is required");
}
