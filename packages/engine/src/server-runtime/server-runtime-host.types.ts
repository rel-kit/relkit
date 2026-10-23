/** Native host callbacks preserve their result types while the lifecycle observes only completion. */
import type { RuntimeArea, RuntimeSnapshot } from "./server-runtime.types.js";
/** Promise/synchronous compatibility adapter used only by emitted application hosts.
 * @see ServerRuntimeOperations for lifecycle operation contracts.
 * @see createServerRuntimeHost for the checked provisioning example.
 */
export interface ServerRuntimeHost {
  /** The owning generation's cancellation signal. */
  readonly signal: AbortSignal;
  /**
   * @returns Current health and evidence without asynchronous scheduling.
   */
  readonly snapshot: () => RuntimeSnapshot;
  /**
   * @param area - Health dimension.
   * @param ready - Readiness to publish before stopping.
   */
  readonly setReady: (area: RuntimeArea, ready: boolean) => void;
  /**
   * @param area - Health dimension.
   * @returns The owned one-shot readiness wait.
   */
  readonly awaitReady: (area: RuntimeArea) => Promise<void>;
  /** Acquires one native handle and registers bounded release before initialization.
   * @typeParam A - Native handle type.
   * @param operation - Fixed startup identity.
   * @param acquire - Native acquisition receiving the generation signal.
   * @param release - Exactly-once physical release, including late acquisition.
   * @param initialize - Materialization that completes before publishing the handle.
   * @param phase - Release stage; telemetry outlives application producers.
   * @param successLogs - Whether native acquisition emits successful operation logs; background providers disable these while retaining metrics and failures.
   * @returns The initialized handle or its original native failure.
   */
  readonly resource: <A, Released = void, Initialized = void>(
    operation: string,
    acquire: (signal: AbortSignal) => Promise<A>,
    release: (value: A) => Promise<Released> | void,
    initialize?: (value: A) => Promise<Initialized> | void,
    phase?: "worker" | "application" | "telemetry",
    successLogs?: boolean,
  ) => Promise<A>;
  /**
   * @typeParam A - Native result.
   * @param task - Physical work.
   * @returns Its native completion.
   */
  readonly track: <A>(task: Promise<A>) => Promise<A>;
  /**
   * @typeParam A - Item type.
   * @param values - Independent work.
   * @param task - Native callback.
   * @returns Settled bounded work, preserving the first failure.
   */
  readonly each: <A, Result>(
    values: readonly A[],
    task: (value: A) => Promise<Result>,
  ) => Promise<void>;
  /**
   * @param operation - Worker identity.
   * @param pass - Serial polling pass.
   * @returns After scoped worker registration.
   */
  readonly worker: <Result>(operation: string, pass: () => Promise<Result>) => Promise<void>;
  /**
   * @param operation - Registration identity.
   * @param action - Idempotent native readiness.
   * @returns Readiness or owning-generation cancellation.
   */
  readonly retry: <Result>(operation: string, action: () => Promise<Result>) => Promise<void>;
  /**
   * @returns The configured interruptible startup delay.
   */
  readonly providerDelay: () => Promise<void>;
  /**
   * @param operation - Evidence identity.
   * @param cause - Native failure.
   * @param cleanup - Selects cleanup evidence; defaults to primary failure.
   */
  readonly failure: <Cause>(operation: string, cause: Cause, cleanup?: boolean) => void;
  /**
   * @param operation - Cleanup identity.
   * @param task - Native finalizer.
   * @returns After bounded cleanup, retaining failure evidence.
   */
  readonly cleanup: <Result>(operation: string, task: () => Promise<Result>) => Promise<void>;
  /**
   * @param beforeRelease - Ordered span and persistence cleanup before application release.
   * @param beforeTelemetry - Optional flush after application producers have stopped.
   * @returns One shared generation shutdown result.
   */
  readonly shutdown: <BeforeRelease, BeforeTelemetry = void>(
    beforeRelease: () => Promise<BeforeRelease>,
    beforeTelemetry?: () => Promise<BeforeTelemetry>,
  ) => Promise<RuntimeSnapshot>;
}
