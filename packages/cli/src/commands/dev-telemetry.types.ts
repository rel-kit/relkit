import type { Effect, Ref } from "effect";
import type {
  ObservabilityQuery,
  ObservabilityRecord,
  TelemetryConfiguration,
} from "@relkit/observability";
import type { LocalLogOrigin, makeLocalBatchQueueEffect } from "@relkit/observability/local";
import type { CliAdapterError } from "../cli-errors.js";

/** Queue authority captured from the public native Effect factory. */
export type TelemetryQueue = Effect.Success<ReturnType<typeof makeLocalBatchQueueEffect>>;
/** Session-local telemetry state; native callbacks update these same private Refs. */
export interface TelemetryState {
  readonly configuration: Ref.Ref<TelemetryConfiguration>;
  readonly error: Ref.Ref<string | undefined>;
  readonly committed: Ref.Ref<number>;
  readonly sequence: Ref.Ref<number>;
  readonly streamClosed: Ref.Ref<boolean>;
}
/** Existing synchronous storage status without private cleanup evidence. */
export interface TelemetryStatus {
  readonly protocol: "relkit.observability.query";
  readonly version: 1;
  readonly state: "degraded" | "ready";
  readonly error: string | undefined;
  readonly persisted: number;
  readonly failed: number;
  readonly dropped: number;
  readonly root: string;
}
/** Native session handle whose caller scope remains the sole lifetime owner. */
export interface DevTelemetryEffects {
  readonly imported: { readonly records: number; readonly malformed: number };
  readonly root: string;
  readonly query: ObservabilityQuery;
  /** Reads the existing synchronous status projection. @returns Current storage counts. */
  readonly status: () => TelemetryStatus;
  /** Closes live consumers before worker shutdown. @returns No value; repeated calls are safe. */
  readonly closeStream: () => void;
  readonly environment: {
    readonly RELKIT_TELEMETRY_URL: string;
    readonly RELKIT_TELEMETRY_TOKEN: string;
  };
  /** Admits a record to the owned bounded queue. @param record - Model record. @param origin - Existing source label. @returns No value after synchronous admission. */
  readonly append: (record: ObservabilityRecord, origin?: LocalLogOrigin) => void;
  /** Reconfigures this worker. @param configuration - Owner-validated settings. @returns Native configuration receipt. */
  readonly configureEffect: (
    configuration: TelemetryConfiguration,
  ) => Effect.Effect<void, CliAdapterError>;
  /** Reconfigures through the existing Promise edge. @param configuration - New settings. @returns Physical IPC receipt. */
  readonly configure: (configuration: TelemetryConfiguration) => Promise<void>;
  /** Handles an existing Inspector path. @param request - Native HTTP request. @returns Response Promise or undefined for other routes. */
  readonly handle: (request: Request) => Promise<Response> | undefined;
  readonly closeEffect: Effect.Effect<void>;
  /** Closes the same owned scope. @returns Completion after every release receipt. */
  readonly close: () => Promise<void>;
}
