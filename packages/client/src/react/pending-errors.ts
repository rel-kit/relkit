export const MAX_JOB_INTENTS = 100;

export class PendingCapacityError extends Error {
  readonly code = "RELKIT_PENDING_CAPACITY" as const;

  constructor() {
    super(`At most ${MAX_JOB_INTENTS} unresolved job submissions may be tracked for one identity.`);
    this.name = "PendingCapacityError";
  }
}

export class PendingRequestMismatchError extends Error {
  readonly code = "RELKIT_PENDING_REQUEST_MISMATCH" as const;

  constructor() {
    super("A tracked job operationId cannot be reused with a different request digest.");
    this.name = "PendingRequestMismatchError";
  }
}

export class PendingRecoveryUnavailableError extends Error {
  readonly code = "RELKIT_PENDING_RECOVERY_UNAVAILABLE" as const;

  constructor() {
    super(
      "A tracked unknown job operation cannot be retried without an active same-key recovery window.",
    );
    this.name = "PendingRecoveryUnavailableError";
  }
}
