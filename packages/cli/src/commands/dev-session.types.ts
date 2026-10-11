/**
 * Defines state and native operations owned by one development session.
 * Stop reasons remain precise generic values at compatibility edges; queued
 * activation and scoped workers preserve their original typed failure contracts.
 */
import type { RuntimeActivationFingerprint } from "@relkit/contracts";
import type { StartedCandidate, SupervisorGenerationDrain } from "@relkit/supervisor";
import type { Deferred, Effect, Fiber, Queue, Scope } from "effect";
import type { CliAdapterError } from "../cli-errors.js";
import type { EffectDevInspector } from "./dev-process.types.js";
import type { EffectDevSourceWatcher } from "./dev-watch.types.js";
import type { CleanupCapabilities } from "../services/cleanup.types.js";
import type { SupervisorCandidateToken } from "@relkit/supervisor";

/** One caller waiting for an admitted source version. */
export interface DevActivationRequest {
  readonly version: number;
  readonly changedFiles: readonly string[];
  readonly result: Deferred.Deferred<boolean, CliAdapterError>;
}
/** Session-only state; changes are published before dependent fibers can run. */
export interface DevSessionState {
  readonly latestVersion: number;
  readonly started: boolean;
  readonly stopping: boolean;
  readonly active: StartedCandidate | undefined;
  readonly fingerprint: RuntimeActivationFingerprint | undefined;
  readonly inspector: EffectDevInspector | undefined;
  readonly signals: (() => void) | undefined;
  readonly fingerprints: Map<number, RuntimeActivationFingerprint>;
  readonly drains: Map<string, SupervisorGenerationDrain>;
  readonly controllers: Set<AbortController>;
  readonly pending: readonly DevActivationRequest[];
}
/** Captured native session operations, without hidden environment requirements. */
export interface DevSessionEngine {
  readonly scope: Scope.Scope;
  readonly cleanup: CleanupCapabilities;
  readonly queue: Queue.Queue<DevActivationRequest>;
  readonly worker: Fiber.Fiber<void, never>;
  /** Starts once, joining listener/candidate readiness before admitting traffic. */
  readonly start: Effect.Effect<void, CliAdapterError>;
  /**
   * Atomically admits one source version to the serialized activation worker.
   * @param version - Source version or the next committed version when omitted.
   * @param files - Bounded changed-file evidence.
   * @returns Joined activation acceptance, false after stale or stopped admission.
   */
  readonly activate: (
    version?: number,
    files?: readonly string[],
  ) => Effect.Effect<boolean, CliAdapterError>;
  /**
   * Closes admission, cancels startup and joins every generation owner once.
   * @param reason - Original shutdown reason retained for callbacks and receipts.
   * @returns Shared shutdown completion with secondary failures recorded separately.
   */
  readonly stop: <Reason>(reason?: Reason) => Effect.Effect<void>;
  /** Awaits the shared shutdown receipt without acquiring another resource owner. */
  readonly wait: Effect.Effect<void>;
  /** Acquires source watchers and their debounced worker in the session Scope. */
  readonly watch: Effect.Effect<EffectDevSourceWatcher, CliAdapterError>;
  /**
   * Native callbacks request shutdown without executing a nested runtime.
   * @param reason - Native signal, watcher or child-exit failure.
   * @returns No value; the owned shutdown fiber consumes this request.
   */
  readonly requestStop: <Reason>(reason: Reason) => void;
  /**
   * Completes the retained synchronous shutdown-latch compatibility edge.
   * @returns No value; native session callers use the joined stop operation.
   */
  readonly finish: () => void;
  /**
   * Drains a retired generation after a newer candidate is committed.
   * @param previous - Retired candidate whose resources remain owned.
   * @param active - State-machine witness of the new active generation.
   * @returns Joined bounded drain after terminal ownership evidence is released.
   */
  readonly drain: (
    previous: StartedCandidate,
    active: SupervisorCandidateToken,
  ) => Effect.Effect<void, CliAdapterError>;
}
