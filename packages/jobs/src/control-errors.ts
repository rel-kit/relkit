import type { JobUnknownOutcome } from "@relkit/contracts/jobs";

export class JobControlUnknownError extends Error {
  readonly code = "RELKIT_JOB_CONTROL_UNKNOWN" as const;
  readonly outcome = "unknown" as const;
  readonly recovery: JobUnknownOutcome["recovery"];

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

export class JobResultUnavailableError extends Error {
  readonly code = "RELKIT_JOB_RESULT_UNAVAILABLE" as const;

  constructor(
    readonly availability: string,
    message = "The requested job result is unavailable",
  ) {
    super(message);
    this.name = "JobResultUnavailableError";
  }
}

export class TaskBlockingWaitError extends Error {
  readonly code = "RELKIT_TASK_BLOCKING_WAIT_UNSUPPORTED" as const;

  constructor() {
    super("A task cannot synchronously wait for another task result");
    this.name = "TaskBlockingWaitError";
  }
}

export class JobObservationTimeoutError extends Error {
  readonly code = "RELKIT_JOB_OBSERVATION_TIMEOUT" as const;

  constructor(readonly timeoutMs: number) {
    super(`Native job observation exceeded its ${timeoutMs}ms read timeout`);
    this.name = "JobObservationTimeoutError";
  }
}
