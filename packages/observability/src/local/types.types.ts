import type { ObservabilityRecord } from "../model.js";
import type { ObservabilityQueryRequest } from "../query-types.js";
import type { RedactionPolicy } from "../redaction.js";
import type { TelemetryLocalRetentionPolicy } from "../telemetry-config.js";
import type { ObservabilityQueryError } from "../query-types.js";

/** A stable origin assigned to local telemetry records. */
export type LocalLogOrigin = "application" | "relkit" | "inspector";

/**
 * Transport envelope accepted by the local worker.
 *
 * @example
 * const envelope: LocalRecord = { key: "source:1", origin: "application", record };
 */
export interface LocalRecord {
  readonly key: string;
  readonly origin: LocalLogOrigin;
  readonly record: ObservabilityRecord;
}

/** A persisted model record with its local cursor and origin. */
export type StoredLocalRecord = ObservabilityRecord & {
  readonly cursor: string;
  readonly origin: LocalLogOrigin;
};

/** Commands sent through the local worker IPC channel. */
export type LocalWorkerCommand =
  | {
      readonly type: "open";
      readonly root: string;
      readonly retention?: TelemetryLocalRetentionPolicy;
      readonly redaction?: RedactionPolicy;
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
      readonly redaction?: RedactionPolicy;
    }
  | { readonly type: "flush" | "close" };

/** A worker reply carrying a value or a safe error code and message. */
export interface LocalWorkerResponse {
  readonly id: number;
  readonly fatal?: boolean;
  readonly value?: unknown;
  readonly error?: string;
  readonly code?: ObservabilityQueryError["code"];
}
