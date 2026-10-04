import { Cause, Effect, Exit, Layer, ManagedRuntime, Metric } from "effect";
import { runExecutionSync } from "@relkit/contracts/operation";
import { createLoggerLayer } from "@relkit/runtime-effect/logger";
import { createDrainLayer, SupervisorDrainOwner } from "./drain-service.js";
import { validateDrainOptions } from "./drain-validation.js";
import { validateSupervisorToken } from "./state-machine-telemetry.js";
import type { SupervisorCandidateToken } from "./state-machine.types.js";
import type { DrainService } from "./drain-service.types.js";
import type {
  SupervisorDrainOptions,
  SupervisorDrainReport,
  SupervisorDrainWorkOptions,
} from "./drain.types.js";
export * from "./drain.types.js";
export { SupervisorDrainError } from "./drain-errors.js";
export { drainPreviousGeneration } from "./drain-state.js";
export const DEFAULT_SUPERVISOR_DRAIN_TIMEOUT_MS = 60_000;

/** Once-owned admission and bounded cleanup for one retired generation. */
export class SupervisorGenerationDrain {
  readonly token: SupervisorCandidateToken;
  readonly deadlineMs: number;
  private readonly owner;
  private readonly service: DrainService;
  private shutdown: Promise<SupervisorDrainReport> | undefined;
  private closing: Promise<void> | undefined;

  /** Validates and acquires without draining. @param options - Token, native owners and timing policy. */
  constructor(options: SupervisorDrainOptions) {
    this.deadlineMs = validateDrainOptions(options, DEFAULT_SUPERVISOR_DRAIN_TIMEOUT_MS);
    this.token = Object.freeze({ ...options.token });
    this.owner = ManagedRuntime.make(
      Layer.mergeAll(
        createDrainLayer({ ...options, token: this.token }, this.deadlineMs),
        createLoggerLayer({ component: "supervisor", ...options.logger }),
        Layer.succeed(Metric.MetricRegistry, new Map()),
      ),
    );
    this.service = runExecutionSync(this.owner, SupervisorDrainOwner);
  }

  /** Authoritative outstanding leases, including acknowledgments after report completion. */
  get inFlight(): number {
    return Effect.runSync(this.service.inFlight);
  }
  /** Whether synchronous new-work admission is open. */
  get acceptingWork(): boolean {
    return Effect.runSync(this.service.accepting);
  }

  /** Borrows the retained generation. @param token - Exact generation identity.
   * @param options - Optional native interruption callback. @returns Its lease, or undefined after admission closes.
   */
  track(token: SupervisorCandidateToken, options: SupervisorDrainWorkOptions = {}) {
    validateSupervisorToken(token);
    if (this.shutdown !== undefined || this.closing !== undefined) return undefined;
    return runExecutionSync(this.owner, this.service.track(token, options));
  }

  /** Shares one bounded shutdown and joins service finalizers. @returns Immutable native cleanup evidence. */
  drain(): Promise<SupervisorDrainReport> {
    this.shutdown ??= this.owner
      .runPromiseExit(this.service.drain)
      .then((exit) => {
        if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
        return exit.value;
      })
      .finally(() => this.close());
    return this.shutdown;
  }

  /** Stops admission and joins scope cleanup, also before drain starts. @returns Shared close completion. */
  close(): Promise<void> {
    this.closing ??= this.owner.dispose();
    return this.closing;
  }
}

/**
 * Creates a synchronously ready generation drain.
 * @param options - Native candidate/provider owners and shared deadline policy.
 * @returns An isolated lease owner; drain joins its effect workers and returns truthful native settlement evidence.
 * @example
 * ```ts
 * import { createSupervisorDrain } from "@relkit/supervisor";
 * export async function drainGeneration(): Promise<void> {
 * const drain = createSupervisorDrain({ token: { sourceToken: 1, generationToken: 1 },
 *   logger: { human: false, json: false } });
 * const lease = drain.track(drain.token);
 * lease?.release();
 * const report = await drain.drain();
 * }
 * ```
 */
export function createSupervisorDrain(options: SupervisorDrainOptions): SupervisorGenerationDrain {
  return new SupervisorGenerationDrain(options);
}
