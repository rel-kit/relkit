import type { Deferred, Effect } from "effect";
import type { ObservabilityRecord } from "@relkit/observability";
import type { SupervisorTelemetry } from "./state-machine.types.js";

/** FIFO persistence item already admitted by the shared redaction policy. */
export interface SupervisorAppend {
  readonly record: ObservabilityRecord;
  readonly done: Deferred.Deferred<void>;
}

/** Latest persisted-record barrier and finite worker admission. */
export interface SupervisorAppendState {
  readonly accepting: boolean;
  readonly running: boolean;
  readonly tail: Deferred.Deferred<void>;
}

/** Lifecycle projection and persistence owned by one supervisor instance. */
export interface SupervisorObservabilityService {
  /** Projects committed lifecycle evidence. @param event - Immutable telemetry. @returns After synchronous redacted delivery and append admission. */
  readonly emit: (event: SupervisorTelemetry) => Effect.Effect<void, Error>;
  /** Captures the current tail and joins it. @returns Completion of appends admitted before this execution. */
  readonly flush: Effect.Effect<void>;
}
