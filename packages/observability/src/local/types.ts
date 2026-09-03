import type { ObservabilityRecord } from "../model.js";
import type { ObservabilityQueryRequest } from "../query-types.js";
import type { TelemetryLocalRetentionPolicy } from "../telemetry-config.js";

export type LocalLogOrigin = "application" | "relkit" | "inspector";
export interface LocalRecord {
  readonly key: string;
  readonly origin: LocalLogOrigin;
  readonly record: ObservabilityRecord;
}
export type StoredLocalRecord = ObservabilityRecord & {
  readonly cursor: string;
  readonly origin: LocalLogOrigin;
};
export type LocalWorkerCommand =
  | {
      readonly type: "open";
      readonly root: string;
      readonly retention?: TelemetryLocalRetentionPolicy;
      readonly redaction?: import("../redaction.js").RedactionPolicy;
    }
  | { readonly type: "append"; readonly records: readonly LocalRecord[] }
  | {
      readonly type: "query";
      readonly kind: "logs" | "requests" | "traces";
      readonly query: ObservabilityQueryRequest;
    }
  | { readonly type: "detail"; readonly kind: "log" | "request" | "trace"; readonly id: string }
  | {
      readonly type: "retention";
      readonly retention: TelemetryLocalRetentionPolicy;
      readonly redaction?: import("../redaction.js").RedactionPolicy;
    }
  | { readonly type: "flush" | "close" };

export interface LocalWorkerResponse {
  readonly id: number;
  readonly fatal?: boolean;
  readonly value?: unknown;
  readonly error?: string;
  readonly code?: import("../query-types.js").ObservabilityQueryError["code"];
}

const signals = new Set([
  "log",
  "request",
  "span",
  "trace",
  "invocation",
  "job",
  "event",
  "resource",
  "tool",
  "agent",
  "diagnostic",
  "generation",
]);

/** Validate the transport envelope before it crosses the persistent storage boundary. */
export function validateLocalRecord(value: unknown): asserts value is LocalRecord {
  if (value === null || typeof value !== "object")
    throw new TypeError("Invalid telemetry envelope");
  const item = value as LocalRecord;
  if (
    typeof item.key !== "string" ||
    item.key.length === 0 ||
    item.key.length > 1024 ||
    !["application", "relkit", "inspector"].includes(item.origin)
  )
    throw new TypeError("Invalid telemetry identity");
  const record = item.record;
  if (
    record === null ||
    typeof record !== "object" ||
    record.version !== 1 ||
    !signals.has(record.signal)
  )
    throw new TypeError("Invalid telemetry record");
  if (!Number.isFinite(recordTime(record))) throw new TypeError("Invalid telemetry timestamp");
  if (
    record.signal === "log" &&
    (typeof record.message !== "string" ||
      typeof record.component !== "string" ||
      !["trace", "debug", "info", "warn", "error", "fatal"].includes(record.level))
  )
    throw new TypeError("Invalid log record");
}

export function recordTime(record: ObservabilityRecord): number {
  const value = record as unknown as Record<string, unknown>;
  return Date.parse(
    String(value.timestamp ?? value.startedAt ?? value.occurredAt ?? value.acceptedAt),
  );
}
