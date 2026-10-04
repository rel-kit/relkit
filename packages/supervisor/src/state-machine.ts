import { Effect, Layer, ManagedRuntime, Metric } from "effect";
import { runExecutionSync } from "@relkit/contracts/operation";
import { createLoggerLayer } from "@relkit/runtime-effect/logger";
import { createActivationLayer, SupervisorActivation } from "./activation.js";
import { ActivationTransitionError } from "./state-machine.schemas.js";
import type { ActivationService } from "./activation.types.js";
import type {
  SupervisorCandidateToken,
  SupervisorState,
  SupervisorStateMachineOptions,
  SupervisorStateSnapshot,
  SupervisorTelemetry,
  SupervisorTelemetryListener,
} from "./state-machine.types.js";

export type * from "./state-machine.types.js";
export { SUPERVISOR_STATES } from "./state-machine.schemas.js";
export { SUPERVISOR_CANDIDATE_STEPS } from "./state-machine-data.js";

/** Synchronous compatibility edge for one activation service; owns no native handles. */
export class SupervisorStateMachine {
  private readonly owner;
  private readonly service: ActivationService;

  /**
   * Acquires atomic state and configured operation sinks synchronously once.
   * @param options - Initial active identity and lifecycle/operation observers.
   */
  constructor(options: SupervisorStateMachineOptions = {}) {
    this.owner = ManagedRuntime.make(
      Layer.mergeAll(
        createActivationLayer(options),
        createLoggerLayer({ component: "supervisor", ...options.logger }),
        Layer.succeed(Metric.MetricRegistry, new Map()),
      ),
    );
    this.service = runExecutionSync(this.owner, SupervisorActivation);
  }

  /** Current lifecycle state; reading never schedules asynchronous work. */
  get state(): SupervisorState {
    return this.snapshot().state;
  }

  /** Latest accepted source sequence. */
  get sourceToken(): number {
    return this.snapshot().sourceToken;
  }

  /** Latest candidate generation sequence. */
  get generationToken(): number {
    return this.snapshot().generationToken;
  }

  /** Copy of committed lifecycle evidence. */
  get telemetry(): readonly SupervisorTelemetry[] {
    return this.run(this.service.telemetry);
  }

  /** Reads atomic lifecycle state. @returns An immutable public snapshot. */
  snapshot(): SupervisorStateSnapshot {
    return this.run(this.service.snapshot);
  }

  /** Borrows lifecycle evidence. @param listener - Native evidence consumer.
   * @returns An idempotent synchronous unsubscribe function.
   */
  subscribe(listener: SupervisorTelemetryListener): () => void {
    this.run(this.service.subscribe(listener));
    return () => this.run(this.service.unsubscribe(listener));
  }

  /** Accepts a new source change. @returns Its monotonic candidate identity. */
  requestSourceChange(): SupervisorCandidateToken {
    return this.run(this.service.sourceChanged());
  }

  /** Completes compile. @param token - Owning candidate. @returns False for stale identity. */
  compileSucceeded(token: SupervisorCandidateToken): boolean {
    return this.run(this.service.complete("compile", token, true));
  }

  /** Rejects compile. @param token - Owning candidate. @param reason - Existing failure detail.
   * @returns False for stale identity; the active generation remains available.
   */
  compileFailed(token: SupervisorCandidateToken, reason: unknown): boolean {
    return this.run(this.service.complete("compile", token, false, reason));
  }

  /** Completes start. @param token - Owning candidate. @returns False for stale identity. */
  startSucceeded(token: SupervisorCandidateToken): boolean {
    return this.run(this.service.complete("start", token, true));
  }

  /** Rejects start. @param token - Owning candidate. @param reason - Existing failure detail.
   * @returns False for stale identity; the active generation remains available.
   */
  startFailed(token: SupervisorCandidateToken, reason: unknown): boolean {
    return this.run(this.service.complete("start", token, false, reason));
  }

  /** Completes verification. @param token - Owning candidate. @returns False for stale identity. */
  verificationSucceeded(token: SupervisorCandidateToken): boolean {
    return this.run(this.service.complete("verification", token, true));
  }

  /** Rejects verification. @param token - Owning candidate. @param reason - Existing failure detail.
   * @returns False for stale identity; the active generation remains available.
   */
  verificationFailed(token: SupervisorCandidateToken, reason: unknown): boolean {
    return this.run(this.service.complete("verification", token, false, reason));
  }

  /** Switches verified state atomically. @param token - Verified candidate.
   * @returns False for a stale candidate; no yield can separate comparison and switch.
   */
  switchSucceeded(token: SupervisorCandidateToken): boolean {
    return this.run(this.service.activate(token));
  }

  /** Rejects activation. @param token - Candidate identity. @param reason - Existing failure.
   * @returns False for stale identity; active traffic remains on the previous generation.
   */
  switchFailed(token: SupervisorCandidateToken, reason: unknown): boolean {
    return this.run(this.service.complete("switch", token, false, reason));
  }

  /** Completes retirement. @param token - Active identity. @returns False for stale identity. */
  drainSucceeded(token: SupervisorCandidateToken): boolean {
    return this.run(this.service.drained(token, "drain-succeeded"));
  }

  /** Records retirement failure. @param token - Active identity. @param reason - Failure detail.
   * @returns False for stale identity; the active generation remains available.
   */
  drainFailed(token: SupervisorCandidateToken, reason: unknown): boolean {
    return this.run(this.service.drained(token, "drain-failed", reason));
  }

  /** Translates internal errors at the existing synchronous edge.
   * @typeParam A - Original public result. @typeParam E - Internal failure.
   * @param effect - Synchronously completable service operation. @returns Its original result.
   * @throws Existing Error/TypeError shapes without Effect's FiberFailure wrapper.
   */
  private run<A, E>(effect: Effect.Effect<A, E>): A {
    return runExecutionSync(
      this.owner,
      effect.pipe(
        Effect.mapError((error) =>
          error instanceof ActivationTransitionError ? new Error(error.message) : error,
        ),
      ),
    );
  }
}

/** Constructs a synchronously ready activation facade.
 * @param options - Initial active state and observers. @returns One reusable state owner.
 * @example
 * ```ts
 * import { createSupervisorStateMachine } from "@relkit/supervisor";
 * export function activateGeneration(): void {
 * const machine = createSupervisorStateMachine({ logger: { human: false, json: false } });
 * const token = machine.requestSourceChange();
 * machine.compileSucceeded(token);
 * machine.startSucceeded(token);
 * machine.verificationSucceeded(token);
 * machine.switchSucceeded(token);
 * }
 * ```
 */
export function createSupervisorStateMachine(
  options?: SupervisorStateMachineOptions,
): SupervisorStateMachine {
  return new SupervisorStateMachine(options);
}
