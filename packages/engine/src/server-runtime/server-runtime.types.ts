/**
 * Declares environment authority, ordered release scopes and typed lifecycle
 * operations. Native host callbacks live in their separate compatibility contract.
 */
import type { Deferred, Effect, Ref, Schema, Scope } from "effect";
import type { RuntimeCompletionReceipt } from "./runtime-completion.types.js";
import type { LoggerOptions } from "@relkit/runtime-effect";
import type * as Models from "./server-runtime.schemas.js";
import type { ServerRuntimeFailure } from "./server-runtime.schemas.js";

/** Health dimensions and the one-shot server binding readiness gate. */
export type RuntimeArea = typeof Models.RuntimeAreaSchema.Type;

/** Schema-derived published lifecycle state. */
export interface RuntimeSnapshot extends Schema.Schema.Type<typeof Models.RuntimeSnapshotSchema> {}

/** Framework callbacks are provided explicitly by the generated server boundary. */
export interface RuntimeEnvironmentOptions {
  readonly ready?: Partial<Record<RuntimeArea, boolean>>;
  readonly report: (failure: ServerRuntimeFailure, cleanup: boolean) => void;
  readonly logger?: LoggerOptions;
  /** JSON metadata such as generation/graph identities inherited by native operation logs. */
  readonly annotations?: Readonly<Record<string, Schema.Json>>;
}

/** Acquired generation environment; tests replace this authority with a test layer. */
export interface RuntimeEnvironmentOperations {
  readonly controller: AbortController;
  readonly initialReady: Record<RuntimeArea, boolean>;
  readonly drainTimeoutMs: number;
  readonly telemetryTimeoutMs: number;
  readonly providerDelayMs: number;
  readonly workerIntervalMs: number;
  readonly report: (failure: ServerRuntimeFailure, cleanup: boolean) => Effect.Effect<void>;
}

/** Opaque state and child scopes belonging to one generation's layer lifetime. */
export interface RuntimeGenerationOwner {
  readonly environment: RuntimeEnvironmentOperations;
  readonly state: Ref.Ref<RuntimeSnapshot>;
  readonly active: Ref.Ref<ReadonlySet<RuntimeCompletionReceipt>>;
  readonly workers: Scope.Closeable;
  readonly resources: Scope.Closeable;
  readonly workerResources: Scope.Closeable;
  readonly telemetryResources: Scope.Closeable;
  readonly completion: Deferred.Deferred<RuntimeSnapshot>;
}

/** One generation owns resources, retries, workers, and external Promise completion. */
export interface ServerRuntimeOperations {
  /** Reads current state without starting work.
   * @returns A synchronous observed snapshot, including physical pending completion count.
   */
  readonly snapshot: () => Effect.Effect<RuntimeSnapshot>;
  /** Publishes readiness only while this generation admits work.
   * @param area - Readiness dimension.
   * @param ready - Current readiness result.
   * @returns A lazy atomic publication; stopping state cannot be revived.
   */
  readonly setReady: (area: RuntimeArea, ready: boolean) => Effect.Effect<void>;
  /** Waits for one successful startup publication without polling state.
   * @param area - Readiness dimension.
   * @returns An interruptible one-shot wait owned by the generation.
   */
  readonly awaitReady: (area: RuntimeArea) => Effect.Effect<void>;
  /** Registers release before initialization; operational failures close the child scope.
   * @typeParam A - Integration handle.
   * @param operation - Fixed startup identity.
   * @param acquire - Acquisition requiring Scope; releases must use bounded cleanup.
   * @param initialize - Materialization after release registration.
   * @param phase - Worker handles close first, application handles after persistence, telemetry last.
   * @returns A handle or primary failure; interruption defers release until physical drain.
   */
  readonly resource: <A>(
    operation: string,
    acquire: Effect.Effect<A, ServerRuntimeFailure, Scope.Scope>,
    initialize: (value: A) => Effect.Effect<void, ServerRuntimeFailure>,
    phase?: "worker" | "application" | "telemetry",
  ) => Effect.Effect<A, ServerRuntimeFailure>;
  /** Tracks physical Promise completion so interruption cannot falsely finish a drain.
   * @typeParam A - Native result.
   * @param task - Already-started native work.
   * @returns An interruptible wait; an owned receipt tracks subsequent physical settlement.
   */
  readonly track: <A>(task: Promise<A>) => Effect.Effect<A, ServerRuntimeFailure>;
  /** Executes independent native callbacks with bounded concurrency and settled sibling results.
   * @typeParam A - Callback input.
   * @param values - Work items.
   * @param task - Callback effect; it cannot require undeclared application services.
   * @returns After all items settle, preserving the first primary failure.
   */
  readonly each: <A>(
    values: readonly A[],
    task: (value: A) => Effect.Effect<void, ServerRuntimeFailure>,
  ) => Effect.Effect<void, ServerRuntimeFailure>;
  /** Starts one serial polling pass loop in the generation worker scope.
   * @param operation - Fixed worker identity.
   * @param pass - One pass; recoverable failures are reported and defects stop the loop.
   * @returns After scoped registration; fails when admission already closed.
   */
  readonly worker: (
    operation: string,
    pass: Effect.Effect<void, ServerRuntimeFailure>,
  ) => Effect.Effect<void, ServerRuntimeFailure>;
  /** Retries idempotent registration until readiness or generation interruption.
   * @param operation - Fixed registration identity.
   * @param action - Idempotent readiness and schedule reconciliation callback.
   * @returns Once ready; owning-scope interruption cancels capped backoff.
   */
  readonly retry: (
    operation: string,
    action: Effect.Effect<void, ServerRuntimeFailure>,
  ) => Effect.Effect<void, ServerRuntimeFailure>;
  /** Waits for the existing optional provider-readiness delay.
   * @returns An observed interruptible delay using the provided clock.
   */
  readonly providerDelay: () => Effect.Effect<void>;
  /** Publishes primary or cleanup evidence through the supplied runtime log adapter.
   * @param failure - Native evidence and fixed operation identity.
   * @param cleanup - Selects cleanup evidence; defaults to primary failure.
   * @returns Non-failing bounded evidence publication; the sink cannot own the result.
   */
  readonly failure: (failure: ServerRuntimeFailure, cleanup?: boolean) => Effect.Effect<void>;
  /** Bounds individual finalizers so a stalled SDK cannot hold its owner's closure.
   * @param operation - Fixed cleanup identity; telemetry uses its shorter configured budget.
   * @param task - Native release that can restore interruptibility.
   * @returns Non-failing cleanup, retaining failure and timeout evidence.
   */
  readonly cleanup: <Result>(
    operation: string,
    task: Effect.Effect<Result, ServerRuntimeFailure>,
  ) => Effect.Effect<void>;
  /** Stops admission, interrupts loops, drains physical work, and releases resources once.
   * @param beforeRelease - Span and agent persistence cleanup before application release.
   * @param beforeTelemetry - Optional final flush after application producers have stopped.
   * @returns Shared completion preserving primary errors alongside cleanup evidence.
   */
  readonly shutdown: (
    beforeRelease: Effect.Effect<void, ServerRuntimeFailure>,
    beforeTelemetry?: Effect.Effect<void, ServerRuntimeFailure>,
  ) => Effect.Effect<RuntimeSnapshot>;
}

export type { ServerRuntimeHost } from "./server-runtime-host.types.js";
