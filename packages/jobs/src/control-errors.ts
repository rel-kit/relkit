import type { JobUnknownOutcome } from "@relkit/contracts/jobs";

/** A native control write may have committed; callers can recover by operation ID.
 * @example new JobControlUnknownError("cancel-1", "same-key");
 */
export class JobControlUnknownError extends Error {
  readonly code = "RELKIT_JOB_CONTROL_UNKNOWN" as const;
  readonly outcome = "unknown" as const;
  readonly recovery: JobUnknownOutcome["recovery"];

  /** @param operationId - Idempotent operation identity.
   * @param idempotencyKey - Optional native recovery key.
   * @param recovery - Native recovery action.
   */
  constructor(
    readonly operationId: string,
    readonly idempotencyKey?: string,
    recovery: JobUnknownOutcome["recovery"] = { action: "inspect-native" },
  ) {
    super(
      "Native job control outcome is unknown; inspect the run and retry with the same operation",
    );
    this.name = "JobControlUnknownError";
    this.recovery = Object.freeze({ ...recovery });
  }

  /** Serializes the bounded recovery contract for callers.
   * @returns A structured unknown outcome.
   * @example error.toJSON();
   */
  toJSON(): JobUnknownOutcome {
    return {
      code: this.code,
      outcome: this.outcome,
      operationId: this.operationId,
      ...(this.idempotencyKey === undefined ? {} : { idempotencyKey: this.idempotencyKey }),
      recovery: this.recovery,
    };
  }
}

/** A completed run has no result available to this caller.
 * @example new JobResultUnavailableError("expired");
 */
export class JobResultUnavailableError extends Error {
  readonly code = "RELKIT_JOB_RESULT_UNAVAILABLE" as const;

  /** @param availability - Native availability reason.
   * @param message - Optional human-readable explanation.
   */
  constructor(
    readonly availability: string,
    message = "The requested job result is unavailable",
  ) {
    super(message);
    this.name = "JobResultUnavailableError";
  }
}

/** Task execution cannot synchronously wait for another task result.
 * @example new TaskBlockingWaitError();
 */
export class TaskBlockingWaitError extends Error {
  readonly code = "RELKIT_TASK_BLOCKING_WAIT_UNSUPPORTED" as const;

  constructor() {
    super("A task cannot synchronously wait for another task result");
    this.name = "TaskBlockingWaitError";
  }
}

/** A native observation read exceeded its bounded timeout.
 * @example new JobObservationTimeoutError(5_000);
 */
export class JobObservationTimeoutError extends Error {
  readonly code = "RELKIT_JOB_OBSERVATION_TIMEOUT" as const;

  /** @param timeoutMs - Read timeout that elapsed. */
  constructor(readonly timeoutMs: number) {
    super(`Native job observation exceeded its ${timeoutMs}ms read timeout`);
    this.name = "JobObservationTimeoutError";
  }
}
