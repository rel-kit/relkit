import type { JobUnknownOutcome } from "@relkit/contracts/jobs";

export class JobSubmissionError extends Error {
  readonly code = "RELKIT_JOB_SUBMISSION_FAILED" as const;

  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "JobSubmissionError";
  }
}

export class JobSubmissionCancelledError extends Error {
  readonly code = "RELKIT_JOB_SUBMISSION_CANCELLED" as const;

  constructor() {
    super("Job submission was cancelled before native acceptance");
    this.name = "JobSubmissionCancelledError";
  }
}

export class JobReceiptError extends TypeError {
  readonly code = "RELKIT_JOB_RECEIPT_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "JobReceiptError";
  }
}

export class JobSubmissionUnknownError extends Error {
  readonly code = "RELKIT_JOB_SUBMISSION_UNKNOWN" as const;
  readonly outcome = "unknown" as const;
  readonly recovery: JobUnknownOutcome["recovery"];

  constructor(
    readonly operationId: string,
    readonly idempotencyKey: string | undefined,
    recovery: JobUnknownOutcome["recovery"] = { action: "inspect-native" },
  ) {
    super("Native job acceptance is unknown; retry with the same idempotency key or inspect the run");
    this.name = "JobSubmissionUnknownError";
    this.recovery = Object.freeze({ ...recovery });
  }

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
