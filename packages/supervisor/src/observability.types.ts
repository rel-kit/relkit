import type { MaybePromise, RuntimeActivationFingerprint } from "@relkit/contracts";
import type { LoggerOptions } from "@relkit/runtime-effect/logger";
import type {
  ObservabilityCollector,
  ObservabilityRecord,
  ObservabilityStream,
  RedactionPolicy,
} from "@relkit/observability";
import type {
  SupervisorCandidateToken,
  SupervisorTelemetry,
  SupervisorTelemetryListener,
} from "./state-machine.types.js";

/** Owned fingerprint or native resolver. Function inputs are the selected token and lifecycle event. */
export type SupervisorActivationFingerprint =
  | RuntimeActivationFingerprint
  | ((
      token: SupervisorCandidateToken,
      event: SupervisorTelemetry,
    ) => RuntimeActivationFingerprint | undefined);

/** Existing native redacted sinks and explicit timestamp/logging overrides. */
export interface SupervisorObservabilityOptions {
  readonly logger?: LoggerOptions;
  readonly activationFingerprint: SupervisorActivationFingerprint;
  readonly collector?: Pick<ObservabilityCollector, "collect">;
  readonly stream?: Pick<ObservabilityStream, "publishRecord">;
  /** Persists an admitted redacted record. @param record - Safe lifecycle projection. @returns Native persistence settlement. */
  readonly append?: (record: ObservabilityRecord) => MaybePromise<unknown>;
  readonly redaction?: RedactionPolicy;
  /** Overrides the injected clock. @returns Native milliseconds used by both records in one outcome. */
  readonly now?: () => number;
}

/** Synchronous lifecycle emission with snapshot flush and optional owner cleanup. */
export interface SupervisorObservability {
  /** Joins pending appends and releases the owner. @returns Shared cleanup completion. */
  readonly close?: () => Promise<void>;
  /** Receives committed lifecycle evidence. @param event - Ordered immutable telemetry. */
  readonly onTelemetry: SupervisorTelemetryListener;
  /** Emits one outcome synchronously. @param event - Lifecycle evidence. */
  readonly emit: (event: SupervisorTelemetry) => void;
  /** Joins the tail captured when called. @returns Settlement of previously admitted persistence. */
  readonly flush: () => Promise<void>;
}
