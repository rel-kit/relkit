import type { JobUnknownOutcome } from "@relkit/contracts/jobs";

/** A canonical job submission could not be accepted.
 * @example new JobSubmissionError("Input hash mismatch");
 */
export class JobSubmissionError extends Error {
  readonly code = "RELKIT_JOB_SUBMISSION_FAILED" as const;

  /** @param message - Human-readable failure reason.
   * @param cause - Optional native or validation cause.
   */
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "JobSubmissionError";
  }
}

/** Caller cancellation happened before native acceptance began.
 * @example new JobSubmissionCancelledError();
 */
export class JobSubmissionCancelledError extends Error {
  readonly code = "RELKIT_JOB_SUBMISSION_CANCELLED" as const;

  constructor() {
    super("Job submission was cancelled before native acceptance");
    this.name = "JobSubmissionCancelledError";
  }
}

/** A native accepted receipt failed durable identity validation.
 * @example new JobReceiptError("Receipt is missing run ID");
 */
export class JobReceiptError extends TypeError {
  readonly code = "RELKIT_JOB_RECEIPT_INVALID" as const;

  /** @param message - Receipt validation failure. */
  constructor(message: string) {
    super(message);
    this.name = "JobReceiptError";
  }
}

/** Native acceptance may have committed and needs idempotent recovery.
 * @example new JobSubmissionUnknownError("submit-1", "same-key");
 */
export class JobSubmissionUnknownError extends Error {
  readonly code = "RELKIT_JOB_SUBMISSION_UNKNOWN" as const;
  readonly outcome = "unknown" as const;
  readonly recovery: JobUnknownOutcome["recovery"];

  /** @param operationId - Stable submission identity.
   * @param idempotencyKey - Optional native deduplication key.
   * @param recovery - Native recovery action.
   */
  constructor(
    readonly operationId: string,
    readonly idempotencyKey: string | undefined,
    recovery: JobUnknownOutcome["recovery"] = { action: "inspect-native" },
  ) {
    super(
      "Native job acceptance is unknown; retry with the same idempotency key or inspect the run",
    );
    this.name = "JobSubmissionUnknownError";
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
